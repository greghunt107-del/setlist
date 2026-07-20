import Anthropic from '@anthropic-ai/sdk';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { url, caption } = req.body;
    const parsed = await runHybridExtraction({ url, caption });
    res.status(200).json(parsed);
  } catch (err) {
    console.error('Analyze error:', err);
    res.status(500).json({ error: err.message });
  }
}

// ── Hybrid extraction: both pipelines in parallel → Claude merge ─────────────
export async function runHybridExtraction({ url, caption }) {
  const [textRes, geminiRes] = await Promise.allSettled([
    runTextPipeline({ url, caption }),
    runGeminiVideo({ url }),
  ]);

  const textOut = textRes.status === 'fulfilled' ? textRes.value : null;
  const geminiOut = geminiRes.status === 'fulfilled' ? geminiRes.value : null;
  if (textRes.status === 'rejected') console.log('Text pipeline failed:', textRes.reason?.message);
  if (geminiRes.status === 'rejected') console.log('Gemini pipeline failed:', geminiRes.reason?.message);

  if (!textOut && !geminiOut) throw new Error('Both extraction pipelines failed');

  const platform = detectPlatform(url);
  // Only one pipeline survived — skip the merge, map directly
  if (!geminiOut) return finalizeWorkout(textOut, mergeFromTextOnly(textOut), url, platform);
  if (!textOut) return finalizeWorkout(null, mergeFromGeminiOnly(geminiOut), url, platform);

  const merged = await mergeWithClaude({ textOut, geminiOut, url, platform });
  return finalizeWorkout(textOut, merged, url, platform);
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

async function mergeWithClaude({ textOut, geminiOut, url, platform }) {
  const anthropic = new Anthropic({ apiKey: process.env.VITE_ANTHROPIC_API_KEY });

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-8',
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

Reconcile them:
1. Exercise list: include exercises supported by at least one source, but drop entries that look like extraction noise (e.g. an intro/outro segment misread as an exercise).
2. Timestamps: prefer A's visually-observed timestamps. Use B's only when A lacks the exercise.
3. Names: prefer the more standard/specific fitness name of the two.
4. sets/reps/rest: prefer explicitly stated values (B's chapters/caption) over inferred ones.
5. creator_handle: prefer a personal @handle over a publication/brand name when both appear.
6. exercise_type: classify every exercise as exactly one of strength, cardio, core, mobility, plyometric.`,
    }],
  });

  const jsonBlock = response.content.find(b => b.type === 'text');
  return JSON.parse(jsonBlock.text);
}

// Map merged canonical form → app shape, stamping the required data-model
// fields (creator/source/timestamp) onto every exercise.
function finalizeWorkout(textOut, merged, url, platform) {
  const videoId = textOut?.videoId ?? extractYouTubeVideoId(url);
  return {
    title: merged.title,
    tag: merged.tag,
    duration: merged.duration,
    level: merged.level,
    influencer: merged.creator_handle,
    source: platform,
    notes: merged.notes,
    videoId,
    exerciseList: merged.exercises.map(ex => ({
      // Existing UI fields
      name: ex.exercise_name,
      section: ex.section,
      sets: ex.sets,
      reps: ex.reps,
      rest: ex.rest,
      weight: '',
      notes: ex.notes,
      startSec: ex.timestamp,
      demoMode: videoId != null ? 'source_video' : 'generic_demo',
      // Required data-model fields
      exercise_name: ex.exercise_name,
      exercise_type: ex.exercise_type,
      creator_handle: merged.creator_handle,
      creator_platform: platform,
      source_url: url ?? '',
      timestamp: ex.timestamp,
    })),
  };
}

// Single-pipeline fallbacks — no Claude merge call needed
function mergeFromTextOnly(t) {
  return {
    title: t.title, tag: t.tag, duration: t.duration, level: t.level,
    creator_handle: t.influencer ?? '', notes: t.notes ?? '',
    exercises: (t.exerciseList ?? []).map(ex => ({
      exercise_name: ex.name, exercise_type: inferType(ex.name), section: ex.section,
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
    if (url.includes('youtu.be/')) return url.split('youtu.be/')[1]?.split('?')[0] || null;
  } catch {}
  return null;
}

// ── Text pipeline: metadata + chapters + transcript + caption → Claude ───────
export async function runTextPipeline({ url, caption }) {
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

    // ── YouTube: fetch all metadata ─────────────────────────────────────────
    if (platform === 'YouTube') {
      try {
        if (url.includes('youtube.com/watch')) {
          videoId = new URL(url).searchParams.get('v');
        } else if (url.includes('youtu.be/')) {
          videoId = url.split('youtu.be/')[1]?.split('?')[0];
        }
      } catch {}

      // YouTube Data API: title, description, duration
      if (videoId && process.env.YOUTUBE_API_KEY) {
        try {
          const ytRes = await fetch(
            `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoId}&key=${process.env.YOUTUBE_API_KEY}`
          );
          const ytData = await ytRes.json();
          if (ytData.items?.[0]) {
            videoTitle = ytData.items[0].snippet.title || '';
            videoDescription = ytData.items[0].snippet.description || '';

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
                  text: e.segs.map(s => s.utf8).join('').replace(/\n/g, ' ').trim(),
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
7. weight: always empty string "".
8. demoMode: "source_video" if you have a confident startSec, otherwise "generic_demo".
9. startSec: the second in the video when this exercise begins. Be precise — use transcript timestamps when available.
10. section: Warmup (first ~10%), Main Workout (middle), Finisher (last intense burst), Cooldown (final stretches).

Return ONLY valid JSON, no markdown:
{
  "title": "workout title",
  "tag": "HIIT|Strength|Cardio|Yoga|Core|Full Body|Mobility",
  "duration": 30,
  "level": "Beginner|Intermediate|Advanced",
  "influencer": "@handle or empty string",
  "source": "${platform}",
  "notes": "one sentence about workout structure",
  "videoId": ${videoId ? `"${videoId}"` : 'null'},
  "exerciseList": [
    {
      "name": "Exact Exercise Name",
      "section": "Warmup|Main Workout|Finisher|Cooldown",
      "sets": "3",
      "reps": "12",
      "rest": "30s",
      "weight": "",
      "notes": "form tip or empty string",
      "demoMode": "source_video",
      "startSec": 40
    }
  ]
}`;

    // ── Call Claude ─────────────────────────────────────────────────────────
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.VITE_ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 4000,
        system: 'You are a fitness workout extraction specialist. Always respond with valid JSON only. No markdown. No explanation. Preserve exact exercise names. Use transcript timestamps precisely.',
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const aiData = await response.json();
    const aiText = aiData.content?.[0]?.text || '';
    const clean = aiText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(clean);
    if (videoId) parsed.videoId = videoId;

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
// TIER 3: No chapters, no transcript — play from beginning
          // Better to show full video than jump to wrong timestamp
          parsed.exerciseList = parsed.exerciseList.map(ex => ({
            ...ex,
            startSec: 0,
            demoMode: 'source_video'
          }));

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
export async function runGeminiVideo({ url }) {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set');
  if (!url || !(url.includes('youtube.com') || url.includes('youtu.be'))) {
    throw new Error('Gemini video extraction supports YouTube URLs only');
  }

  const prompt = `Watch this workout video and extract every exercise performed.

RULES:
1. Report only exercises you actually observe being performed or demonstrated.
2. timestamp: the second in the video when the exercise begins (when the trainer starts it, not when they mention it).
3. exercise_type must be exactly one of: strength, cardio, core, mobility, plyometric.
4. sets/reps: read from on-screen text if shown, otherwise infer from what you see. Use "30s" style for timed exercises.
5. creator_handle: the creator's @handle if shown on screen or in intro, else "".
6. section: Warmup, Main Workout, Finisher, or Cooldown.

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

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
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

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Gemini API ${res.status}: ${errBody.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const parsed = JSON.parse(text);
  console.log(`Gemini: ${parsed.exercises?.length ?? 0} exercises from video`);
  return parsed;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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