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

    // Detect platform
    if (url) {
      if (url.includes('youtube.com') || url.includes('youtu.be')) platform = 'YouTube';
      else if (url.includes('instagram.com')) platform = 'Instagram';
      else if (url.includes('tiktok.com')) platform = 'TikTok';
    }

    // YouTube — extract video ID, metadata, and audio transcript
    if (platform === 'YouTube') {
      try {
        if (url.includes('youtube.com/watch')) {
          videoId = new URL(url).searchParams.get('v');
        } else if (url.includes('youtu.be/')) {
          videoId = url.split('youtu.be/')[1]?.split('?')[0];
        }
      } catch {}

      // Fetch YouTube metadata
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

      // Fetch audio and transcribe with Whisper
      if (videoId) {
        try {
          // Get the audio stream URL via a public proxy
          const audioUrl = `https://www.youtube.com/watch?v=${videoId}`;
          
          // Use youtube-dl-exec style fetch to get audio
          const infoRes = await fetch(`https://ytdl-api.fly.dev/info?url=${encodeURIComponent(audioUrl)}`);
          
          if (infoRes.ok) {
            const infoData = await infoRes.json();
            // Find best audio format
            const audioFormat = infoData.formats?.find(f => 
              f.acodec !== 'none' && f.vcodec === 'none' && f.url
            ) || infoData.formats?.find(f => f.url);
            
            if (audioFormat?.url) {
              // Fetch the audio
              const audioRes = await fetch(audioFormat.url);
              if (audioRes.ok) {
                const audioBuffer = await audioRes.arrayBuffer();
                const audioBlob = new Blob([audioBuffer], { type: 'audio/mp4' });
                const audioFile = new File([audioBlob], 'audio.mp4', { type: 'audio/mp4' });
                
                // Transcribe with Whisper
                const transcription = await openai.audio.transcriptions.create({
                  file: audioFile,
                  model: 'whisper-1',
                  prompt: 'This is a fitness workout video. Extract exercise names, sets, reps, and rest periods.',
                });
                transcript = transcription.text || '';
              }
            }
          }
        } catch (transcriptErr) {
          console.log('Transcript extraction failed, continuing without:', transcriptErr.message);
        }
      }
    }

    // Build the analysis prompt
    const hasTranscript = transcript.length > 100;
    const hasCaption = caption && caption.trim().length > 0;
    const hasVideoMeta = videoTitle || videoDescription;

    const context = `
PLATFORM: ${platform}
URL: ${url || 'none'}
${videoTitle ? `VIDEO TITLE: ${videoTitle}` : ''}
${videoDescription ? `VIDEO DESCRIPTION: ${videoDescription.slice(0, 800)}` : ''}
${hasTranscript ? `FULL VIDEO TRANSCRIPT (most accurate source — use this above everything else):\n${transcript.slice(0, 4000)}` : ''}
${hasCaption ? `USER CAPTION (use this if transcript is missing): ${caption}` : ''}
`.trim();

    const extractionRules = hasTranscript
      ? 'You have a full video transcript. Extract ONLY exercises explicitly mentioned in the transcript, in the exact order they appear. Use the exact equipment mentioned. Do not add exercises not in the transcript.'
      : hasCaption
      ? 'No transcript available. Use the caption to extract exercises. Only include what is explicitly mentioned.'
      : 'Very limited context. Make conservative best guess based on title only. Return 4-6 generic exercises matching the workout type implied by the title.';

    const prompt = `You are an expert fitness coach AI. Analyze this workout content and extract the complete workout structure.

${context}

RULES:
${extractionRules}
- Use EXACT equipment mentioned (kettlebell stays kettlebell, never substitute)
- Extract exercises in the ORDER they appear in the video/transcript
- Include exact sets, reps, rest periods if mentioned
- If weight is mentioned, include it
- Do NOT hallucinate exercises not present in the source material
- Be specific: "Kettlebell Swing" not "Swing"
- ALWAYS include sets as a number like "3" or "4"
- ALWAYS include reps as a number like "12" or a time like "30s" if it's a timed exercise
- ALWAYS include rest as a time like "30s" or "60s"
- If sets/reps/rest are not explicitly stated, estimate based on workout type
- NEVER leave sets, reps, or rest as empty strings
- ALWAYS leave weight as an empty string — weight is logged by the user during the workout
{
  "title": "workout name",
  "tag": "HIIT|Strength|Cardio|Yoga|Core|Full Body",
  "duration": 25,
  "level": "Beginner|Intermediate|Advanced",
  "influencer": "@handle or empty string",
  "source": "${platform}",
  "notes": "one sentence coaching note",
  "exerciseList": [
    {
      "name": "Exercise Name",
      "sets": "3",
      "reps": "12 or 30s if timed",
      "rest": "30s",
      "weight": "",
      "notes": "form tip"
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
        max_tokens: 2000,
        system: 'You are a fitness coach AI. Always respond with valid JSON only. No markdown. No explanation. No extra text.',
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