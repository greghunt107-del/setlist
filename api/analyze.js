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

      // Fetch YouTube auto-captions via timedtext API
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
              console.log('Captions fetched, length:', transcript.length);
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

    console.log('Transcript available:', hasTranscript, 'Length:', transcript.length);

    const sourceBlock = `
PLATFORM: ${platform}
URL: ${url || 'none'}
${videoTitle ? `VIDEO TITLE: ${videoTitle}` : ''}
${videoDescription ? `VIDEO DESCRIPTION:\n${videoDescription.slice(0, 3000)}` : ''}
${hasTranscript ? `VIDEO CAPTIONS (highest priority — use exact exercise names from here):\n${transcript.slice(0, 8000)}` : ''}
${hasCaption ? `USER-PROVIDED CAPTION:\n${caption}` : ''}
`.trim();

    const prompt = `You are an expert fitness coach and workout transcription specialist. Extract the workout from the source material below with maximum accuracy.

${sourceBlock}

EXTRACTION RULES:
1. PRESERVE EXACT NAMES: Use exact exercise names from the captions. Do NOT simplify. Preserve modifiers: R/L, single-arm, alternating, offset, staggered, tempo, pulse, hold.
2. PRESERVE SECTIONS: Include warmup, main workout, finisher, cooldown if present.
3. NO HALLUCINATION: Only include exercises explicitly mentioned. Prefer fewer correct exercises over many wrong ones.
4. SETS/REPS/REST: Extract exact numbers. For timed exercises use "30s" in the reps field. Leave empty string if not mentioned.
5. EQUIPMENT: Use exact equipment mentioned. Never substitute.
6. WEIGHT: Always leave as empty string.

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
      "name": "Exact Exercise Name With Modifiers",
      "section": "Warmup|Main Workout|Finisher|Cooldown",
      "sets": "3 or empty string",
      "reps": "12 or 30s or empty string",
      "rest": "30s or empty string",
      "weight": "",
      "notes": "form tip or empty string"
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
        system: 'You are a fitness workout extraction specialist. Always respond with valid JSON only. No markdown. No explanation. Preserve exact exercise names from source material.',
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(clean);
    if (videoId) parsed.videoId = videoId;
    res.status(200).json(parsed);

  } catch (err) {
    console.error('Analyze error:', err);
    res.status(500).json({ error: err.message });
  }
}