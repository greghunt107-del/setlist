import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

      if (videoId) {
        try {
          const audioUrl = `https://www.youtube.com/watch?v=${videoId}`;
          const infoRes = await fetch(`https://ytdl-api.fly.dev/info?url=${encodeURIComponent(audioUrl)}`);
          if (infoRes.ok) {
            const infoData = await infoRes.json();
            const audioFormat = infoData.formats?.find(f =>
              f.acodec !== 'none' && f.vcodec === 'none' && f.url
            ) || infoData.formats?.find(f => f.url);
            if (audioFormat?.url) {
              const audioRes = await fetch(audioFormat.url);
              if (audioRes.ok) {
                const audioBuffer = await audioRes.arrayBuffer();
                const audioBlob = new Blob([audioBuffer], { type: 'audio/mp4' });
                const audioFile = new File([audioBlob], 'audio.mp4', { type: 'audio/mp4' });
                const transcription = await openai.audio.transcriptions.create({
                  file: audioFile,
                  model: 'whisper-1',
                  prompt: 'This is a fitness workout video. Listen carefully for exact exercise names including any modifiers like left, right, single-arm, offset, alternating, tempo, pulse, hold, staggered.',
                });
                transcript = transcription.text || '';
              }
            }
          }
        } catch (transcriptErr) {
          console.log('Transcript extraction failed:', transcriptErr.message);
          transcript = '';
        }
      }
    }

    const hasTranscript = transcript.length > 100;
    const hasCaption = caption && caption.trim().length > 0;

    console.log('Transcript available:', hasTranscript, 'Length:', transcript.length);
    console.log('Description length:', videoDescription.length);

    const sourceBlock = `
PLATFORM: ${platform}
URL: ${url || 'none'}
${videoTitle ? `VIDEO TITLE: ${videoTitle}` : ''}
${videoDescription ? `VIDEO DESCRIPTION:\n${videoDescription.slice(0, 3000)}` : ''}
${hasTranscript ? `AUDIO TRANSCRIPT (highest priority source — use exact names from here):\n${transcript.slice(0, 6000)}` : ''}
${hasCaption ? `USER-PROVIDED CAPTION:\n${caption}` : ''}
`.trim();

    const prompt = `You are an expert fitness coach and workout transcription specialist. Your job is to extract a workout from the source material below with maximum fidelity to what is actually described.

${sourceBlock}

EXTRACTION RULES — follow these exactly:

1. PRESERVE EXACT NAMES: If the source says "Offset Dumbbell Squat (R)", use that exact name. Do NOT simplify to "Dumbbell Squat". Preserve all modifiers including: R/L, single-arm, alternating, offset, staggered, tempo, pulse, hold, march, rotation.

2. PRESERVE SECTIONS: If the workout has warmup, activation, main workout, finisher, or cooldown sections, preserve them. Use the "section" field on each exercise.

3. NO HALLUCINATION: Only include exercises explicitly mentioned or clearly demonstrated. If you are uncertain about an exercise name, include your best guess but set confidence to "low". Do NOT invent exercises to fill a quota.

4. PARTIAL IS OK: If the source only supports 4 exercises, return 4. Do not pad to 10.

5. EQUIPMENT FIDELITY: Use exact equipment mentioned. Do not substitute or generalize.

6. SETS/REPS/REST: Extract exact numbers if stated. If not stated, leave as empty string. For timed exercises use format "30s" or "45s" in the reps field.

7. TIMESTAMPS: If you can infer when an exercise starts from the transcript, include startTime as "MM:SS" string.

Return ONLY valid JSON, no markdown, no explanation:
{
  "title": "exact or close title from source",
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
      "reps": "12 or 30s if timed or empty string",
      "rest": "30s or empty string",
      "weight": "",
      "confidence": "high|medium|low",
      "notes": "form tip or uncertainty note",
      "startTime": "05:24 or empty string"
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