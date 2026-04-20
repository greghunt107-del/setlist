export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { url, caption } = req.body;
    const videoId = url && url.includes('youtube.com') ? new URL(url).searchParams.get('v') : null;

   const prompt = `You are a fitness coach AI. Your job is to extract or intelligently infer workout exercises.

URL: ${url || 'none'}
Caption/Description: ${caption || 'none'}

Even if the caption is minimal, use the URL context and your knowledge to generate a complete, realistic workout plan with specific exercises. For example, if the URL suggests a kettlebell workout, generate 5-8 real kettlebell exercises with sets and reps.

Return ONLY valid JSON, no markdown:
{"title":"Descriptive Workout Title","tag":"HIIT|Strength|Cardio|Yoga|Core|Full Body","duration":30,"level":"Beginner|Intermediate|Advanced","influencer":"@unknown","source":"YouTube","notes":"key coaching tips","exerciseList":[{"name":"Real Exercise Name","sets":"3","reps":"12","rest":"30s","weight":"","notes":"form tip"}]}

You MU

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
    res.status(200).json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}