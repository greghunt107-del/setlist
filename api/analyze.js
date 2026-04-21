export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { url, caption } = req.body;
    let videoId = null;
    let transcript = '';
    let videoTitle = '';

    if (url && url.includes('youtube.com/watch')) {
      try { videoId = new URL(url).searchParams.get('v'); } catch {}
    }

    if (videoId && process.env.YOUTUBE_API_KEY) {
      try {
        const ytRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${process.env.YOUTUBE_API_KEY}`);
        const ytData = await ytRes.json();
        if (ytData.items && ytData.items[0]) {
          videoTitle = ytData.items[0].snippet.title;
          const desc = ytData.items[0].snippet.description;
          transcript = desc;
        }
      } catch {}

      try {
        const captionRes = await fetch(`https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=${videoId}&key=${process.env.YOUTUBE_API_KEY}`);
        const captionData = await captionRes.json();
        if (captionData.items && captionData.items.length > 0) {
          transcript += ' [captions available]';
        }
      } catch {}
    }

    const userPrompt = 'You are a fitness coach AI. Analyze this workout video content and extract every single exercise with exact sets, reps, and rest periods. Video Title: ' + videoTitle + ' Video Description: ' + transcript + ' Additional Caption: ' + (caption || 'none') + ' Return ONLY valid JSON with these fields: title, tag (HIIT/Strength/Cardio/Yoga/Core/Full Body), duration (number), level (Beginner/Intermediate/Advanced), influencer, source, notes, exerciseList (array with name/sets/reps/rest/weight/notes for each exercise). Generate at least 6 specific exercises based on the content.';

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
        system: 'You are a fitness coach AI. Always respond with valid JSON only, no markdown.',
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    const data = await response.json();
    const text = data.content && data.content[0] ? data.content[0].text : '';
    const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(clean);
    if (videoId) parsed.videoId = videoId;
    res.status(200).json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}