import Anthropic from '@anthropic-ai/sdk';

// ── Per-IP rate limiting ─────────────────────────────────────────────────────
// In-memory store: good enough for v1 casual sharing, with two known limits —
// (1) Vercel recycles function instances, so counts reset unpredictably and
// the Map leaks entries until recycling (harmless at this scale), and
// (2) concurrent instances each keep their own counts, so the real ceiling is
// N instances x limit. The durable upgrade path once we're past casual
// sharing into Phase 3 beta traffic is Vercel KV or Upstash Redis.
const RATE_LIMIT = 10;            // requests per window per IP
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const rateStore = new Map();      // ip -> [timestamps]

export function checkRateLimit(ip) {
  const now = Date.now();
  const hits = (rateStore.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
  if (hits.length >= RATE_LIMIT) {
    rateStore.set(ip, hits);
    const retryAfterSec = Math.ceil((hits[0] + RATE_WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfterSec };
  }
  hits.push(now);
  rateStore.set(ip, hits);
  return { allowed: true };
}

function getClientIp(req) {
  // Vercel sets x-forwarded-for; first entry is the client.
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const ip = getClientIp(req);
  const limit = checkRateLimit(ip);
  if (!limit.allowed) {
    res.setHeader('Retry-After', String(limit.retryAfterSec));
    return res.status(429).json({
      error: 'Rate limit exceeded: max ' + RATE_LIMIT + ' extractions per hour. Try again later.',
      retryAfterSec: limit.retryAfterSec,
    });
  }

  try {
    const { url, caption } = req.body;
    const parsed = await runHybridExtraction({ url, caption });
    res.status(200).json(parsed);
  } catch (err) {
    console.error('Analyze error:', err);
    res.status(500).json({ error: err.message });
  }
}

// $/MTok, standard tier (ai.google.dev/gemini-api/docs/pricing, verified 2026-07-20).
// claude-sonnet-5 has a temporary intro rate ($2/$10) through 2026-08-31 —
// using the standard rate here so this stays accurate after that date.
const PRICING = {
  'claude-opus-4-8': { in: 5, out: 25 },
  'claude-sonnet-5': { in: 3, out: 15 },
  'gemini-3.5-flash': { in: 1.5, out: 9 },
  'gemini-3.1-flash-lite': { in: 0.25, out: 1.5 },
};
const usdCost = (model, inTok, outTok) => {
  const p = PRICING[model];
  if (!p || inTok == null || outTok == null) return null;
  return (inTok / 1e6) * p.in + (outTok / 1e6) * p.out;
};

// ── Hybrid extraction: both pipelines in parallel → Claude merge ─────────────
export async function runHybridExtraction({ url, caption }) {
  const metrics = { url, pipelines: {} };
  const overallStart = Date.now();

  const [textRes, geminiRes] = await Promise.allSettled([
    runTextPipeline({ url, caption }, metrics),
    runGeminiVideo({ url }, metrics),
  ]);

  const textOut = textRes.status === 'fulfilled' ? textRes.value : null;
  const geminiOut = geminiRes.status === 'fulfilled' ? geminiRes.value : null;
  if (textRes.status === 'rejected') {
    metrics.pipelines.text = { ...metrics.pipelines.text, error: textRes.reason?.message };
    console.log('Text pipeline failed:', textRes.reason?.message);
  }
  if (geminiRes.status === 'rejected') {
    metrics.pipelines.gemini = { ...metrics.pipelines.gemini, error: geminiRes.reason?.message };
    console.log('Gemini pipeline failed:', geminiRes.reason?.message);
  }

  if (!textOut && !geminiOut) {
    metrics.totalMs = Date.now() - overallStart;
    console.log('EXTRACTION_METRICS', JSON.stringify(metrics));
    throw new Error('Both extraction pipelines failed');
  }

  const platform = detectPlatform(url);
  let result;
  // Only one pipeline survived — skip the merge, map directly
  if (!geminiOut) result = finalizeWorkout(textOut, mergeFromTextOnly(textOut), url, platform);
  else if (!textOut) result = finalizeWorkout(null, mergeFromGeminiOnly(geminiOut), url, platform);
  else {
    const merged = await mergeWithClaude({ textOut, geminiOut, url, platform }, metrics);
    // Code-level guarantee, not just a prompt instruction: if the merge
    // dropped most of the exercises either source found, don't trust it —
    // fall back to whichever single source had more. Verified in testing
    // that the merge prompt alone doesn't reliably prevent this.
    const sourceMax = Math.max(geminiOut.exercises?.length ?? 0, textOut.exerciseList?.length ?? 0);
    if (sourceMax > 0 && merged.exercises.length < sourceMax * 0.6) {
      console.log(`Merge kept only ${merged.exercises.length}/${sourceMax} exercises — discarding merge, using richer single source`);
      metrics.mergeDiscarded = { mergedCount: merged.exercises.length, sourceMax };
      const richerSource = (geminiOut.exercises?.length ?? 0) >= (textOut.exerciseList?.length ?? 0)
        ? mergeFromGeminiOnly(geminiOut)
        : mergeFromTextOnly(textOut);
      result = finalizeWorkout(textOut, richerSource, url, platform);
    } else {
      result = finalizeWorkout(textOut, merged, url, platform);
    }
  }

  metrics.totalMs = Date.now() - overallStart;
  metrics.exerciseCount = result.exerciseList?.length ?? 0;
  metrics.totalKnownCostUsd = Object.values(metrics.pipelines).reduce((sum, p) => sum + (p.costUsd || 0), 0);
  console.log('EXTRACTION_METRICS', JSON.stringify(metrics));
  return result;
}

const MERGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'tag', 'duration', 'level', 'creator_handle', 'notes', 'exercises'],
  properties: {
    title: { type: 'string' },
    tag: { type: 'string', enum: ['HIIT', 'Strength', 'Cardio', 'Yoga', 'Core', 'Full Body', 'Mobility'] },
    duration: { type: 'integer' },
    level: { type: 'string', enum: ['Beginner', 'Intermediate', 'Advanced'] },
    creator_handle: { type: 'string' },
    notes: { type: 'string' },
    exercises: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['exercise_name', 'exercise_type', 'section', 'sets', 'reps', 'rest', 'notes', 'timestamp'],
        properties: {
          exercise_name: { type: 'string' },
          exercise_type: { type: 'string', enum: ['strength', 'cardio', 'core', 'mobility', 'plyometric'] },
          section: { type: 'string', enum: ['Warmup', 'Main Workout', 'Finisher', 'Cooldown'] },
          sets: { type: 'string' },
          reps: { type: 'string' },
          rest: { type: 'string' },
          notes: { type: 'string' },
          timestamp: { type: 'integer' },
        },
      },
    },
  },
};

const TEXT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'tag', 'duration', 'level', 'influencer', 'notes', 'exerciseList'],
  properties: {
    title: { type: 'string' },
    tag: { type: 'string', enum: ['HIIT', 'Strength', 'Cardio', 'Yoga', 'Core', 'Full Body', 'Mobility'] },
    duration: { type: 'integer' },
    level: { type: 'string', enum: ['Beginner', 'Intermediate', 'Advanced'] },
    influencer: { type: 'string' },
    notes: { type: 'string' },
    exerciseList: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'exercise_type', 'section', 'sets', 'reps', 'rest', 'notes', 'startSec'],
        properties: {
          name: { type: 'string' },
          exercise_type: { type: 'string', enum: ['strength', 'cardio', 'core', 'mobility', 'plyometric'] },
          section: { type: 'string', enum: ['Warmup', 'Main Workout', 'Finisher', 'Cooldown'] },
          sets: { type: 'string' },
          reps: { type: 'string' },
          rest: { type: 'string' },
          notes: { type: 'string' },
          startSec: { type: 'integer' },
        },
      },
    },
  },
};

async function mergeWithClaude({ textOut, geminiOut, url, platform }, metrics) {
  const start = Date.now();
  const anthropic = new Anthropic({ apiKey: process.env.VITE_ANTHROPIC_API_KEY });
  const model = 'claude-opus-4-8';

  const response = await anthropic.messages.create({
    model,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: { format: { type: 'json_schema', schema: MERGE_SCHEMA } },
    system:
      'You reconcile two independent extractions of the same workout video into one authoritative workout. ' +
      'Never invent exercises absent from both sources.',
    messages: [{
      role: 'user',
      content: `Two extractors analyzed the same workout video (${url}).

EXTRACTION A — video-native (Gemini watched the actual video; timestamps come from visual observation, HIGH confidence for timing and exercise order):
${JSON.stringify(geminiOut)}

EXTRACTION B — text pipeline (built from title, description, chapters, transcript, and user caption; HIGH confidence for exercise names when chapters existed, and for sets/reps stated in text):
${JSON.stringify(textOut)}
${textOut.videoDurationSec ? `\nVIDEO DURATION: ${textOut.videoDurationSec} seconds. No timestamp may exceed this.` : ''}

Reconcile them:
1. Exercise list: include EVERY exercise that appears in EITHER source. Merging means deduplicating — two entries describing the same movement at close timestamps collapse into one — it does NOT mean summarizing or shortening. Extraction A has ${geminiOut.exercises?.length ?? 0} exercises and Extraction B has ${textOut.exerciseList?.length ?? 0}. Your merged list must contain close to max(A, B) entries — only drop an entry if it is a near-duplicate of another entry you're keeping, or is clearly not a real exercise (e.g. an intro/outro segment misread as one). Do NOT stop early or truncate the list for length.
2. Timestamps: prefer A's visually-observed timestamps. Use B's only when A lacks the exercise. A timestamp must never exceed the video's duration.
3. Names: prefer the more standard/specific fitness name of the two.
4. sets/reps/rest: prefer explicitly stated values (B's chapters/caption) over inferred ones.
5. creator_handle: prefer a personal @handle over a publication/brand name when both appear. If neither source found a handle, use Extraction B's channelTitle (the actual YouTube channel name — ground truth, always trustworthy) rather than leaving this empty.
6. exercise_type: classify every exercise as exactly one of strength, cardio, core, mobility, plyometric.`,
    }],
  });

  if (metrics) {
    const inTok = response.usage?.input_tokens, outTok = response.usage?.output_tokens;
    metrics.pipelines.merge = { ms: Date.now() - start, model, inTok, outTok, costUsd: usdCost(model, inTok, outTok) };
  }

  const jsonBlock = response.content.find(b => b.type === 'text');
  return JSON.parse(jsonBlock.text);
}

// Map merged canonical form → app shape, stamping the required data-model
// fields (creator/source/timestamp) onto every exercise. Timestamps are
// clamped to the known video duration — the merge model is instructed not
// to exceed it, but a hard server-side clamp catches it when it does anyway.
function finalizeWorkout(textOut, merged, url, platform) {
  const videoId = textOut?.videoId ?? extractYouTubeVideoId(url);
  const durationSec = textOut?.videoDurationSec;
  // Code-level guarantee: channelTitle from YouTube's API is ground truth
  // and always available when the video exists — never let attribution end
  // up blank just because the model didn't find a personal @handle.
  const creatorHandle = merged.creator_handle || textOut?.channelTitle || '';
  return {
    title: merged.title,
    tag: merged.tag,
    duration: merged.duration,
    level: merged.level,
    influencer: creatorHandle,
    source: platform,
    notes: merged.notes,
    videoId,
    thumbnailUrl: textOut?.thumbnailUrl ?? null,
    exerciseList: merged.exercises.map(ex => {
      const timestamp = (durationSec && ex.timestamp > durationSec) ? Math.max(0, durationSec - 5) : ex.timestamp;
      return {
        // Existing UI fields
        name: ex.exercise_name,
        section: ex.section,
        sets: ex.sets,
        reps: ex.reps,
        rest: ex.rest,
        weight: '',
        notes: ex.notes,
        startSec: timestamp,
        demoMode: videoId != null ? 'source_video' : 'generic_demo',
        // Required data-model fields
        exercise_name: ex.exercise_name,
        exercise_type: ex.exercise_type,
        creator_handle: creatorHandle,
        creator_platform: platform,
        source_url: url ?? '',
        timestamp,
      };
    }),
  };
}

// Single-pipeline fallbacks — no Claude merge call needed
function mergeFromTextOnly(t) {
  return {
    title: t.title, tag: t.tag, duration: t.duration, level: t.level,
    creator_handle: t.influencer ?? '', notes: t.notes ?? '',
    exercises: (t.exerciseList ?? []).map(ex => ({
      // exercise_type comes from the extraction model's own classification
      // (structured-output schema-enforced) — inferType() is a last-resort
      // safety net only, in case an older cached shape lacks the field.
      exercise_name: ex.name, exercise_type: ex.exercise_type || inferType(ex.name), section: ex.section,
      sets: ex.sets, reps: ex.reps, rest: ex.rest ?? '', notes: ex.notes ?? '',
      timestamp: ex.startSec ?? 0,
    })),
  };
}

function mergeFromGeminiOnly(g) {
  return {
    title: g.title, tag: 'Full Body', duration: g.duration_min ?? 0, level: g.level ?? 'Intermediate',
    creator_handle: g.creator_handle ?? '', notes: '',
    exercises: (g.exercises ?? []).map(ex => ({
      exercise_name: ex.exercise_name, exercise_type: ex.exercise_type, section: ex.section,
      sets: ex.sets, reps: ex.reps, rest: '', notes: ex.notes ?? '',
      timestamp: ex.timestamp ?? 0,
    })),
  };
}

const TYPE_KEYWORDS = {
  plyometric: ['jump', 'burpee', 'hop', 'bound', 'skater', 'jack'],
  core: ['plank', 'crunch', 'sit-up', 'situp', 'mountain climber', 'leg raise', 'russian twist', 'bridge'],
  mobility: ['stretch', 'pose', 'circle', 'walk-out', 'walkout', 'reach', 'rotation', 'cat cow'],
  cardio: ['high knee', 'sprint', 'run', 'march', 'fast feet', 'step'],
};
function inferType(name) {
  const n = (name || '').toLowerCase();
  for (const [type, words] of Object.entries(TYPE_KEYWORDS)) {
    if (words.some(w => n.includes(w))) return type;
  }
  return 'strength';
}

// Gemini's JSON mode occasionally appends a stray trailing fragment after a
// complete, valid JSON object (e.g. a duplicated closing tail). Extract just
// the balanced top-level object instead of parsing the whole string.
function extractFirstJsonObject(text) {
  const start = text.indexOf('{');
  if (start === -1) throw new Error('No JSON object found in response');
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return text.slice(start, i + 1); }
  }
  throw new Error('Unbalanced JSON object in response');
}

function detectPlatform(url) {
  if (!url) return 'Other';
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'YouTube';
  if (url.includes('instagram.com')) return 'Instagram';
  if (url.includes('tiktok.com')) return 'TikTok';
  return 'Other';
}

// Parsed independently of both extraction pipelines, so the thumbnail and
// "watch in video" jump still work even when the text pipeline fails and
// only Gemini's output survives.
function extractYouTubeVideoId(url) {
  if (!url) return null;
  try {
    if (url.includes('youtube.com/watch')) return new URL(url).searchParams.get('v');
    if (url.includes('youtube.com/shorts/')) return url.split('youtube.com/shorts/')[1]?.split(/[/?]/)[0] || null;
    if (url.includes('youtu.be/')) return url.split('youtu.be/')[1]?.split('?')[0] || null;
  } catch {}
  return null;
}

// ── Text pipeline: metadata + chapters + transcript + caption → Claude ───────
export async function runTextPipeline({ url, caption }, metrics) {
    const pipelineStart = Date.now();
    caption = stripLoneSurrogates(caption || '');
    let videoId = null;
    let videoTitle = '';
    let videoDescription = '';
    let platform = 'Other';
    let chapters = [];
    let videoDurationSec = 0;
    let timedTranscript = []; // [{text, startSec}]
    let transcriptText = '';

    // ── Platform detection ──────────────────────────────────────────────────
    if (url) {
      if (url.includes('youtube.com') || url.includes('youtu.be')) platform = 'YouTube';
      else if (url.includes('instagram.com')) platform = 'Instagram';
      else if (url.includes('tiktok.com')) platform = 'TikTok';
    }

    // ── TikTok: caption + creator via the public oEmbed endpoint ────────────
    // No auth, no scraping — TikTok's documented oEmbed returns the caption
    // ("title"), the creator (@handle in author_url), and a thumbnail from
    // just the post URL. Gemini's video ingestion is YouTube-only, so TikTok
    // extraction is caption-first through this pipeline.
    let channelTitle = '';
    let thumbnailUrl = null;
    if (platform === 'TikTok') {
      try {
        const oeRes = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`);
        if (oeRes.ok) {
          const oe = await oeRes.json();
          // TikTok's "title" IS the caption — treat it as the workout description
          videoDescription = stripLoneSurrogates(oe.title || '');
          const handleMatch = (oe.author_url || '').match(/@[\w.]+/);
          channelTitle = handleMatch ? handleMatch[0] : stripLoneSurrogates(oe.author_name || '');
          // Note: TikTok CDN thumbnail URLs expire after a while — good enough
          // for the card right after import; a durable copy is a Phase 2 job.
          thumbnailUrl = oe.thumbnail_url || null;
          console.log(`TikTok oEmbed: creator=${channelTitle}, caption ${videoDescription.length} chars`);
        } else {
          console.log(`TikTok oEmbed failed: HTTP ${oeRes.status}`);
        }
      } catch (e) {
        console.log('TikTok oEmbed failed:', e.message);
      }
    }

    // ── YouTube: fetch all metadata ─────────────────────────────────────────
    if (platform === 'YouTube') {
      videoId = extractYouTubeVideoId(url);

      // YouTube Data API: title, description, duration, channel name
      if (videoId && process.env.YOUTUBE_API_KEY) {
        try {
          const ytRes = await fetch(
            `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoId}&key=${process.env.YOUTUBE_API_KEY}`
          );
          const ytData = await ytRes.json();
          if (ytData.items?.[0]) {
            videoTitle = stripLoneSurrogates(ytData.items[0].snippet.title || '');
            videoDescription = stripLoneSurrogates(ytData.items[0].snippet.description || '');
            // Ground truth creator identity — always present, unlike a
            // personal @handle which the model has to guess or read off
            // screen. This is what actually identifies who posted the video.
            channelTitle = stripLoneSurrogates(ytData.items[0].snippet.channelTitle || '');

            // Parse ISO 8601 duration -> seconds
            const dur = ytData.items[0].contentDetails?.duration || '';
            const durMatch = dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
            if (durMatch) {
              videoDurationSec =
                (parseInt(durMatch[1] || 0) * 3600) +
                (parseInt(durMatch[2] || 0) * 60) +
                parseInt(durMatch[3] || 0);
            }
          }
        } catch (e) {
          console.log('YouTube API error:', e.message);
        }
      }

// Parse chapters from description using broadened timestamp regex
        if (videoDescription) {
          chapters = parseTimestamps(videoDescription);
          console.log(`Chapters: ${chapters.length}`, chapters.map(c => `${c.timeStr} ${c.label}`).join(', '));
        }
// If no chapters found, try fetching timestamps from top comments
      if (chapters.length === 0 && videoId && process.env.YOUTUBE_API_KEY) {
        try {
          const commentRes = await fetch(
            `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&order=relevance&maxResults=5&key=${process.env.YOUTUBE_API_KEY}`
          );
          const commentData = await commentRes.json();
          const comments = commentData.items || [];

          for (const item of comments) {
            const text = item.snippet?.topLevelComment?.snippet?.textDisplay || '';
            // Try parsing timestamps from comment text
            const commentChapters = parseTimestamps(text);
            if (commentChapters.length >= 3) {
              chapters = commentChapters;
              console.log(`Chapters from comment: ${chapters.length}`, chapters.map(c => `${c.timeStr} ${c.label}`).join(', '));
              break;
            }
          }
        } catch (e) {
          console.log('Comment fetch failed:', e.message);
        }
      }
      // Fetch TIMED captions — preserve timing data
      if (videoId) {
        try {
          const captionRes = await fetch(
            `https://www.youtube.com/api/timedtext?lang=en&v=${videoId}&fmt=json3`
          );
          if (captionRes.ok) {
            const captionData = await captionRes.json();
            if (captionData?.events) {
              timedTranscript = captionData.events
                .filter(e => e.segs && e.tStartMs !== undefined)
                .map(e => ({
                  text: stripLoneSurrogates(e.segs.map(s => s.utf8).join('').replace(/\n/g, ' ').trim()),
                  startSec: Math.round(e.tStartMs / 1000)
                }))
                .filter(e => e.text.length > 0);

              transcriptText = timedTranscript.map(e => e.text).join(' ').trim();
              console.log(`Transcript: ${timedTranscript.length} segments, ${transcriptText.length} chars`);
            }
          }
        } catch (e) {
          console.log('Caption fetch failed:', e.message);
        }
      }
    }

    const hasChapters = chapters.length > 0;
    const hasTranscript = transcriptText.length > 100;
    const hasCaption = caption && caption.trim().length > 0;

    // ── Build source block for AI ───────────────────────────────────────────
    const chaptersBlock = hasChapters
      ? `YOUTUBE CHAPTERS (highest confidence):\n${chapters.map(c => `${c.timeStr} ${c.label}`).join('\n')}`
      : '';

    // Send condensed timed transcript so AI can reason about timing
    // Format: "[0:32] text [0:45] text..." — every 3rd segment to save tokens
    const timedTranscriptBlock = hasTranscript && !hasChapters
      ? `TIMED TRANSCRIPT (format [mm:ss] spoken words):\n${
          timedTranscript
            .slice(0, 300)
            .map(e => `[${formatTime(e.startSec)}] ${e.text}`)
            .join(' ')
        }`
      : '';

    const sourceBlock = `
PLATFORM: ${platform}
${channelTitle ? `CHANNEL / CREATOR: ${channelTitle}` : ''}
${videoTitle ? `VIDEO TITLE: ${videoTitle}` : ''}
${videoDurationSec ? `VIDEO DURATION: ${Math.round(videoDurationSec / 60)} minutes (${videoDurationSec} seconds)` : ''}
${videoDescription ? `VIDEO DESCRIPTION:\n${videoDescription.slice(0, 2000)}` : ''}
${chaptersBlock}
${timedTranscriptBlock}
${hasCaption ? `USER-PROVIDED CAPTION (high confidence exercise list):\n${caption}` : ''}
`.trim();

    // ── AI prompt ───────────────────────────────────────────────────────────
    const prompt = `You are an expert fitness coach extracting a structured workout from source material.

${sourceBlock}

EXTRACTION RULES:
1. CHAPTERS = highest confidence. If present, use as the exercise list with their exact timestamps.
2. TIMED TRANSCRIPT = second highest. Identify the timestamp when the trainer first cues or names each exercise. Use that second as startSec.
3. USER CAPTION = third. Extract exercise names from caption text. Estimate startSec from video duration and order.
4. TITLE/DESCRIPTION = last resort fallback only.
5. NEVER invent exercises not supported by the source.
6. sets/reps: extract from context. Use "30s" for timed, numbers for reps. Default "3" sets if unclear.
7. exercise_type: classify every exercise as exactly one of strength, cardio, core, mobility, plyometric — based on what the exercise actually is (e.g. a held stretch or yoga pose is mobility, never strength by default).
8. startSec: the second in the video when this exercise begins. Be precise — use transcript timestamps when available. If genuinely unknown, use 0 — a later step estimates a better position.
9. section: Warmup (first ~10%), Main Workout (middle), Finisher (last intense burst), Cooldown (final stretches).
10. influencer: prefer a personal @handle if one is stated in the title/description. Otherwise use the CHANNEL / CREATOR name above verbatim — never leave this empty when a channel name is provided.`;

    // ── Call Claude ─────────────────────────────────────────────────────────
    const textModel = 'claude-sonnet-5';
    const anthropic = new Anthropic({ apiKey: process.env.VITE_ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: textModel,
      max_tokens: 8000,
      thinking: { type: 'adaptive' },
      output_config: { format: { type: 'json_schema', schema: TEXT_SCHEMA } },
      system: 'You are a fitness workout extraction specialist. Preserve exact exercise names. Use transcript timestamps precisely.',
      messages: [{ role: 'user', content: prompt }],
    });

    if (metrics) {
      const inTok = response.usage?.input_tokens, outTok = response.usage?.output_tokens;
      metrics.pipelines.text = {
        ms: Date.now() - pipelineStart, model: textModel, inTok, outTok,
        costUsd: usdCost(textModel, inTok, outTok), hasChapters, hasTranscript, hasCaption,
        stopReason: response.stop_reason,
      };
    }
    const aiText = response.content.find(b => b.type === 'text')?.text || '';
    const parsed = JSON.parse(extractFirstJsonObject(aiText));
    parsed.source = platform;
    if (videoId) parsed.videoId = videoId;
    parsed.videoDurationSec = videoDurationSec || null;
    // Code-level guarantee, not just a prompt instruction — channelTitle is
    // always available from the YouTube API when the video exists, so never
    // let creator attribution end up empty if the model missed the rule.
    parsed.channelTitle = channelTitle || null;
    parsed.influencer = parsed.influencer || channelTitle || '';
    parsed.thumbnailUrl = thumbnailUrl;

    // ── Post-process: lock in best timestamps ───────────────────────────────
    if (parsed.exerciseList?.length > 0) {

      if (hasChapters) {
        // TIER 1: Match exercises to chapters with fuzzy matching
        parsed.exerciseList = parsed.exerciseList.map(ex => {
          const match =
            chapters.find(c => normalize(c.label) === normalize(ex.name)) ||
            chapters.find(c => normalize(c.label).includes(normalize(ex.name))) ||
            chapters.find(c => normalize(ex.name).includes(normalize(c.label))) ||
            chapters.find(c => fuzzyMatch(c.label, ex.name));
          if (match) {
            return { ...ex, startSec: match.startSec, demoMode: 'source_video' };
          }
          return ex;
        });
        // Interpolate any exercises that didn't match a chapter
        parsed.exerciseList = interpolateGaps(parsed.exerciseList, videoDurationSec);

} else if (hasTranscript) {
  // TIER 2: Trust AI timestamps — it saw the full timed transcript in context
  // Only use transcript search as fallback for exercises with no timestamp at all
  parsed.exerciseList = parsed.exerciseList.map(ex => {
    if (ex.startSec && ex.startSec > 0 && (!videoDurationSec || ex.startSec < videoDurationSec)) {
      // AI gave a valid timestamp — trust it directly
      return { ...ex, demoMode: 'source_video' };
    }
    // No timestamp from AI — try transcript search as last resort
    const found = findInTranscript(ex.name, timedTranscript);
    if (found !== null) {
      return { ...ex, startSec: found, demoMode: 'source_video' };
    }
    return { ...ex, demoMode: 'generic_demo' };
  });
  parsed.exerciseList = interpolateGaps(parsed.exerciseList, videoDurationSec);

      } else if (videoDurationSec > 0) {
// TIER 3: No chapters, no transcript — spread proportionally across the
// video's known duration instead of collapsing every exercise to 0:00.
// An estimated position (even a rough one) beats sending every exercise
// to the same instant, and this only ever runs when Gemini has ALSO
// failed to provide real visual timestamps for this pipeline's result.
          parsed.exerciseList = parsed.exerciseList.map(ex => ({ ...ex, startSec: undefined }));
          parsed.exerciseList = interpolateGaps(parsed.exerciseList, videoDurationSec);

      } else {
        // TIER 4: Nothing — trust AI or fall back to generic
        parsed.exerciseList = parsed.exerciseList.map(ex => ({
          ...ex,
          demoMode: ex.startSec ? 'source_video' : 'generic_demo'
        }));
      }
    }

    console.log('Final:', parsed.exerciseList?.map(e => `${e.name}@${e.startSec}s[${e.demoMode}]`).join(', '));
    return parsed;
}

// ── Gemini pipeline: video-native extraction (YouTube only) ──────────────────
// Gemini ingests the YouTube video directly and reports what it SEES,
// including visual timestamps — no chapters or transcript needed.
export async function runGeminiVideo({ url }, metrics) {
  const start = Date.now();
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set');
  if (!url || !(url.includes('youtube.com') || url.includes('youtu.be'))) {
    throw new Error('Gemini video extraction supports YouTube URLs only');
  }

  const prompt = `Watch this workout video and extract every exercise performed.

RULES:
1. Report only exercises you actually observe being performed or demonstrated.
2. timestamp: a SINGLE INTEGER — the second in the video when the exercise begins (when the trainer starts it, not when they mention it). Never an array or a "mm:ss" string.
3. exercise_type must be exactly one of: strength, cardio, core, mobility, plyometric.
4. sets/reps: read from on-screen text if shown, otherwise infer from what you see. Use "30s" style for timed exercises.
5. creator_handle: the creator's @handle if shown on screen or in intro, else "".
6. section: Warmup, Main Workout, Finisher, or Cooldown.
7. If the same exercise repeats across multiple rounds, report it once per round with that round's own timestamp — do not group repeats into one entry.

Return ONLY valid JSON:
{
  "title": "workout title",
  "creator_handle": "@handle or empty string",
  "duration_min": 30,
  "level": "Beginner|Intermediate|Advanced",
  "exercises": [
    {
      "exercise_name": "Exact Exercise Name",
      "exercise_type": "strength|cardio|core|mobility|plyometric",
      "section": "Warmup|Main Workout|Finisher|Cooldown",
      "sets": "3",
      "reps": "12",
      "timestamp": 40,
      "notes": "form tip or empty string"
    }
  ]
}`;

  // Transient overload/rate-limit errors are common on video-analysis calls.
  // Primary model gets one retry after backoff; if it's still down, fall back
  // to a second model entirely rather than degrading straight to the much
  // weaker text-only path — verified in testing that when the primary model
  // is genuinely unavailable, a fallback model still analyzing the actual
  // video beats losing per-exercise granularity altogether.
  const MODEL_CHAIN = ['gemini-3.5-flash', 'gemini-3.1-flash-lite'];
  const RETRYABLE_STATUS = new Set([429, 500, 503]);
  let data, usedModel;
  outer: for (const model of MODEL_CHAIN) {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { file_data: { file_uri: url } },
                { text: prompt },
              ],
            }],
            generationConfig: { response_mime_type: 'application/json' },
          }),
        }
      );

      if (res.ok) { data = await res.json(); usedModel = model; break outer; }

      const errBody = await res.text();
      if (RETRYABLE_STATUS.has(res.status) && attempt === 0) {
        console.log(`Gemini ${model} ${res.status} (transient) — retrying once after backoff`);
        await new Promise(r => setTimeout(r, 4000));
        continue;
      }
      if (RETRYABLE_STATUS.has(res.status) && model !== MODEL_CHAIN[MODEL_CHAIN.length - 1]) {
        console.log(`Gemini ${model} ${res.status} — falling back to next model in chain`);
        break; // move to next model in MODEL_CHAIN
      }
      throw new Error(`Gemini API (${model}) ${res.status}: ${errBody.slice(0, 300)}`);
    }
  }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const parsed = JSON.parse(extractFirstJsonObject(text));
  console.log(`Gemini (${usedModel}): ${parsed.exercises?.length ?? 0} exercises from video`);
  if (metrics) {
    // Gemini bills thinking tokens as output; candidatesTokenCount alone undercounts.
    const inTok = data.usageMetadata?.promptTokenCount;
    const outTok = (data.usageMetadata?.candidatesTokenCount || 0) + (data.usageMetadata?.thoughtsTokenCount || 0);
    metrics.pipelines.gemini = { ms: Date.now() - start, model: usedModel, inTok, outTok, costUsd: usdCost(usedModel, inTok, outTok) };
  }
  return parsed;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// External text (YouTube titles/descriptions/captions, occasionally user
// input) can contain unpaired UTF-16 surrogates — e.g. from a corrupted
// emoji — which JSON.stringify happily serializes but the Anthropic API
// rejects outright with a 400 ("no low surrogate in string"). Strip any
// surrogate half that isn't part of a valid pair before it reaches a prompt.
function stripLoneSurrogates(str) {
  if (!str) return str;
  return str
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '')
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
}

function normalize(str) {
  return str.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Word overlap fuzzy match — true if 60%+ of significant words match
function fuzzyMatch(a, b) {
  const wordsA = normalize(a).split(/\s+/).filter(w => w.length > 2);
  const wordsB = normalize(b).split(/\s+/).filter(w => w.length > 2);
  if (!wordsA.length || !wordsB.length) return false;
  const overlap = wordsA.filter(w => wordsB.includes(w)).length;
  return overlap / Math.max(wordsA.length, wordsB.length) >= 0.6;
}

// Search full timed transcript for first mention of an exercise
// Uses a sliding 3-segment window to catch phrases split across captions
function findInTranscript(exerciseName, timedTranscript) {
  const keywords = normalize(exerciseName).split(/\s+/).filter(w => w.length > 2);
  if (!keywords.length) return null;

  for (let i = 0; i < timedTranscript.length; i++) {
    const window = timedTranscript.slice(i, i + 3).map(e => e.text).join(' ');
    const matchCount = keywords.filter(k => normalize(window).includes(k)).length;
    if (matchCount / keywords.length >= 0.7) {
      return timedTranscript[i].startSec;
    }
  }
  return null;
}

// Refine AI timestamp guess by searching ±60s window in transcript
function refineWithTranscript(exerciseName, aiGuess, timedTranscript, videoDurationSec) {
  const windowStart = Math.max(0, aiGuess - 60);
  const windowEnd = Math.min(videoDurationSec, aiGuess + 60);
  const segments = timedTranscript.filter(e => e.startSec >= windowStart && e.startSec <= windowEnd);

  const keywords = normalize(exerciseName).split(/\s+/).filter(w => w.length > 2);
  if (!keywords.length) return aiGuess;

  for (let i = 0; i < segments.length; i++) {
    const window = segments.slice(i, i + 3).map(e => e.text).join(' ');
    const matchCount = keywords.filter(k => normalize(window).includes(k)).length;
    if (matchCount / keywords.length >= 0.7) {
      return segments[i].startSec;
    }
  }
  return aiGuess;
}

// Fill exercises missing startSec by interpolating between surrounding matched ones
function interpolateGaps(exercises, videoDurationSec) {
  return exercises.map((ex, i) => {
    if (ex.startSec !== undefined && ex.startSec !== null) return ex;

    let prevSec = 0;
    let nextSec = videoDurationSec || 0;

    for (let j = i - 1; j >= 0; j--) {
      if (exercises[j].startSec !== undefined) { prevSec = exercises[j].startSec; break; }
    }
    for (let j = i + 1; j < exercises.length; j++) {
      if (exercises[j].startSec !== undefined) { nextSec = exercises[j].startSec; break; }
    }

    let gapCount = 0, gapPos = 0;
    for (let j = 0; j < exercises.length; j++) {
      if (exercises[j].startSec === undefined) {
        if (j < i) gapPos++;
        gapCount++;
      }
    }

    const interpolated = Math.round(prevSec + ((gapPos + 1) / (gapCount + 1)) * (nextSec - prevSec));
    return { ...ex, startSec: interpolated, demoMode: 'source_video' };
  });
}
// Parse timestamps from any text — handles multiple formats:
// "0:40 Jumping Jacks"  (standard chapters format)
// "Jumping Jacks - 0:40"  (name first)
// "Jumping Jacks .... 0:40"  (name with dots)
// "1. Jumping Jacks 0:40"  (numbered list)
function parseTimestamps(text) {
  const results = [];
  const lines = text.replace(/<br>/g, '\n').split('\n');

  const patterns = [
    /^(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)$/,
    /^(?:\d+\.\s*)?(.+?)\s*[-:–—]+\s*(\d{1,2}:\d{2}(?::\d{2})?)$/,
    /^(?:\d+\.\s*)?(.+?)\s*\.{2,}\s*(\d{1,2}:\d{2}(?::\d{2})?)$/,
    /^(?:\d+\.\s*)?(.+?)\s+(\d{1,2}:\d{2}(?::\d{2})?)$/,
  ];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    for (let i = 0; i < patterns.length; i++) {
      const match = trimmed.match(patterns[i]);
      if (match) {
        let timeStr, label;
        if (i === 0) {
          timeStr = match[1];
          label = match[2].trim();
        } else {
          label = match[1].trim();
          timeStr = match[2];
        }

        if (label.length < 3 || label.includes('http')) continue;

        const parts = timeStr.split(':').map(Number);
        let seconds = 0;
        if (parts.length === 2) seconds = parts[0] * 60 + parts[1];
        if (parts.length === 3) seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];

        results.push({ label, startSec: seconds, timeStr });
        break;
      }
    }
  }

  const seen = new Set();
  return results
    .filter(r => { const key = r.timeStr; if (seen.has(key)) return false; seen.add(key); return true; })
    .sort((a, b) => a.startSec - b.startSec);
}