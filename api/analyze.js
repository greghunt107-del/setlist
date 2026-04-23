export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { url, caption } = req.body;
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

      // Parse chapters from description
      if (videoDescription) {
        const lines = videoDescription.split('\n');
        const chapterRegex = /^(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)$/;
        for (const line of lines) {
          const match = line.trim().match(chapterRegex);
          if (match) {
            const timeStr = match[1];
            const label = match[2].trim();
            const parts = timeStr.split(':').map(Number);
            let seconds = 0;
            if (parts.length === 2) seconds = parts[0] * 60 + parts[1];
            if (parts.length === 3) seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
            chapters.push({ label, startSec: seconds, timeStr });
          }
        }
        console.log(`Chapters: ${chapters.length}`, chapters.map(c => `${c.timeStr} ${c.label}`).join(', '));
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
    res.status(200).json(parsed);

  } catch (err) {
    console.error('Analyze error:', err);
    res.status(500).json({ error: err.message });
  }
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