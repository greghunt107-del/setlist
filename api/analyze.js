export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { url, caption } = req.body;
    let videoId = null;
    if (url && url.includes('youtube.com/watch')) {
      try { videoId = new URL(url).searchParams.get('v'); } catch {}
    }

    const systemPrompt = 'You are a fitness coach AI. Always respond with valid JSON only, no markdown, no explanation.';
    
    const userPrompt = 'Analyze this workout and return a JSON object with these exact fields: title (string), tag (one of: HIIT, Strength, Cardio, Yoga, Core, Full Body), duration (number in minutes), level (one of: Beginner, Intermediate, Advanced), influencer (string), source (string), notes (string with coaching tips), exerciseList (array of objects each with: name, sets, reps, rest, weight, notes). Generate at least 6 realistic exercises based on this content. URL: ' + (url || 'none') + ' Caption: ' + (caption || 'none');

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
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    const data = await response.json();
    const text = data.content && data.content[0] ? data.content[0].text : '';
    const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(clean);
    if (videoId)