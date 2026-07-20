// Local test harness for the extraction pipeline — no Vercel needed.
// Usage: node --env-file=.env scripts/test-analyze.mjs [youtube-url]
import { runTextPipeline } from '../api/analyze.js';

const url = process.argv[2] || 'https://www.youtube.com/watch?v=ml6cT4AZdqI'; // default: a chaptered workout video
const missing = ['VITE_ANTHROPIC_API_KEY', 'YOUTUBE_API_KEY'].filter(k => !process.env[k]);
if (missing.length) {
  console.error(`Missing in .env: ${missing.join(', ')}`);
  process.exit(1);
}

console.log(`Analyzing: ${url}\n`);
const start = Date.now();
const result = await runTextPipeline({ url, caption: '' });
console.log(`\n─── Result (${((Date.now() - start) / 1000).toFixed(1)}s) ───`);
console.log(`Title: ${result.title}`);
console.log(`Tag: ${result.tag} | Level: ${result.level} | Duration: ${result.duration}min`);
console.log(`Influencer: ${result.influencer || '(none)'}`);
console.log(`Exercises (${result.exerciseList?.length ?? 0}):`);
for (const ex of result.exerciseList ?? []) {
  console.log(`  [${ex.section}] ${ex.name} — ${ex.sets}x${ex.reps} @ ${ex.startSec}s (${ex.demoMode})`);
}
