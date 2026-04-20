import { YoutubeTranscript } from 'youtube-transcript';

async function getYouTubeData(url) {
  const videoId = new URL(url).searchParams.get('v');
  if (!videoId) return { videoId: null, transcript: '', title: '' };
  try {
    const transcriptArr = await YoutubeTranscript.fetchTranscript(videoId);
    const transcript = transcriptArr.map(t => t.text).join(' ');
    return { videoId, transcript };
  } catch {
    return { videoId, transcript: '' };
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { messages, url, caption } = req.body;

    let transcript = '';
    let videoId = null;

    if (url && url.includes('youtube.com')) {
      const ytData = await getYouTubeData(url);
      transcript = ytData.transcript;
      videoId = ytData.videoId;
    }

    const prompt = `You are a fitness coach AI. Analyze this workout content and extract every single exercise.

URL: ${url || 'none'}
Caption: ${caption || 'none'}
Video Transcript: ${transcript || 'none'}

Return ONLY valid JSON (no markdown, no explanation):
{
  "title": "Workout Name",
  "tag": "HIIT|Strength|Cardio|Yoga|Core|Full Body",
  "duration": 25,
  "level": "Beginner|Intermediate|Advanced",
  "influencer": "@handle or channel name",
  "source": "YouTube|Instagram|TikTok|Other",
  "notes": "key coaching tips from the content",
  "exerciseList": [
    {
      "name": "Exercise Name",
      "sets": "3",
      "reps": "12",
      "rest": "30s",
      "weight": "",
      "notes": "form tip"
    }
  ]
}

Extract EVERY distinct exercise mentioned. Use the transcript to find exact exercises, sets, reps, and timing. Return ONLY the JSON.`;

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
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    parsed.videoId = videoId;

    res.status(200).json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}