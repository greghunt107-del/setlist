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
    let transcript = '';
    let platform = 'Other';
    let chapters = [];

    if (url) {
      if (url.includes('youtube.com') || url.includes('youtu.be')) platform = 'YouTube';
      else if (url.includes('instagram.com')) platform = 'Instagram';
      else if (url.includes('tiktok.com')) platform = 'TikTok';
    }

    if (platform === 'YouTube') {
      try {
        if (url.includes('youtube.com/watch')) {
          videoId = new URL(url).searchParams.get('v');
        } else if (url.includes('youtu.be/')) {
          videoId = url.split('youtu.be/')[1]?.split('?')[0];
        }
      } catch {}

      if (videoId && process.env.YOUTUBE_API_KEY) {
        try {
          const ytRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${process.env.YOUTUBE_API_KEY}`);
          const ytData = await ytRes.json();
          if (ytData.items?.[0]) {
            videoTitle = ytData.items[0].snippet.title || '';
            videoDescription = ytData.items[0].snippet.description || '';
          }
        } catch {}
      }

      // Parse YouTube chapters from description
      // Format: "0:00 Exercise Name" or "00:00 Exercise Name" or "0:00:00 Exercise Name"
      if (videoDescription) {
        const lines = videoDescription.split('\n');
        const chapterRegex = /^(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)$/;
        for (const line of lines) {
          const match = line.trim().match(chapterRegex);
          if (match) {
            const timeStr = match[1];
            const label = match[2].trim();
            // Convert time to seconds
            const parts = timeStr.split(':').map(Number);
            let seconds = 0;
            if (parts.length === 2) seconds = parts[0] * 60 + parts[1];
            if (parts.length === 3) seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
            chapters.push({ label, startSec: seconds, timeStr });
          }
        }
        console.log('Chapters found:', chapters.length, chapters.map(c => `${c.timeStr} ${c.label}`).join(', '));
      }

      // Fetch YouTube captions
      if (videoId) {
        try {
          const captionRes = await fetch(`https://www.youtube.com/api/timedtext?lang=en&v=${videoId}&fmt=json3`);
          if (captionRes.ok) {
            const captionData = await captionRes.json();
            if (captionData?.events) {
              transcript = captionData.events
                .filter(e => e.segs)
                .map(e => e.segs.map(s => s.utf8).join(''))
                .join(' ')
                .replace(/\n/g, ' ')
                .trim();
            }
          }
        } catch (captionErr) {
          console.log('Caption fetch failed:', captionErr.message);
          transcript = '';
        }
      }
    }

    const hasTranscript = transcript.length > 100;
    const hasCaption = caption && caption.trim().length > 0;
    const hasChapters = chapters.length > 0;

    const chaptersBlock = hasChapters
      ? `YOUTUBE CHAPTERS (use these for exercise names and timestamps — high confidence):\n${chapters.map(c => `${c.timeStr} ${c.label}`).join('\n')}`
      : '';

    const sourceBlock = `
PLATFORM: ${platform}
URL: ${url || 'none'}
${videoTitle ? `VIDEO TITLE: ${videoTitle}` : ''}
${videoDescription ? `VIDEO DESCRIPTION:\n${videoDescription.slice(0, 3000)}` : ''}
${chaptersBlock}
${hasTranscript ? `VIDEO CAPTIONS:\n${transcript.slice(0, 6000)}` : ''}
${hasCaption ? `USER-PROVIDED CAPTION:\n${caption}` : ''}
`.trim();

    const prompt = `You are an expert fitness coach and workout transcription specialist. Extract the workout from the source material below with maximum accuracy.

${sourceBlock}

EXTRACTION RULES:
1. CHAPTERS ARE GOLD: If YouTube chapters are provided above, use them as the primary source for exercise names and order. They are the most reliable signal.
2. PRESERVE EXACT NAMES: Use exact names from chapters. Do not simplify or normalize.
3. TIMESTAMPS: If chapters are provided, assign startSec from the chapter timestamp for each matching exercise. This enables timestamp-based demo videos.
4. SETS/REPS/REST: Extract from captions/description. For timed exercises like "30 seconds on, 30 seconds off", set reps="30s" and rest="30s". If a circuit repeats, set sets accordingly.
5. NO HALLUCINATION: Only include exercises from chapters or clearly mentioned in captions.
6. WEIGHT: Always leave as empty string.
7. demoMode: Set to "source_video" if you have a reliable startSec from chapters. Otherwise set to "generic_demo".

Return ONLY valid JSON, no markdown:
{
  "title": "workout title",
  "tag": "HIIT|Strength|Cardio|Yoga|Core|Full Body|Mobility",
  "duration": 30,
  "level": "Beginner|Intermediate|Advanced",
  "influencer": "@handle or empty string",
  "source": "${platform}",
  "notes": "one sentence about workout structure",
  "exerciseList": [
    {
      "name": "Exact Exercise Name",
      "section": "Warmup|Main Workout|Finisher|Cooldown",
      "sets": "2",
      "reps": "30s",
      "rest": "30s",
      "weight": "",
      "notes": "form tip or empty string",
      "demoMode": "source_video|generic_demo",
      "startSec": 40
    }
  ]
}`;

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
        system: 'You are a fitness workout extraction specialist. Always respond with valid JSON only. No markdown. No explanation. Preserve exact exercise names. Use chapter timestamps when available.',
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(clean);
    if (videoId) parsed.videoId = videoId;

    // Post-process: match chapters to exercises and assign timestamps
    if (chapters.length > 0 && parsed.exerciseList) {
      parsed.exerciseList = parsed.exerciseList.map(ex => {
        // Find best matching chapter
        const match = chapters.find(c =>
          c.label.toLowerCase().includes(ex.name.toLowerCase()) ||
          ex.name.toLowerCase().includes(c.label.toLowerCase()) ||
          c.label.toLowerCase() === ex.name.toLowerCase()
        );
        if (match && !ex.startSec) {
          return { ...ex, startSec: match.startSec, demoMode: 'source_video' };
        }
        return ex;
      });
    }

    res.status(200).json(parsed);

  } catch (err) {
    console.error('Analyze error:', err);
    res.status(500).json({ error: err.message });
  }
}