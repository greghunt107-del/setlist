// Local test harness for the hybrid extraction pipeline — no Vercel needed.
// Single video:  node --env-file=.env scripts/test-analyze.mjs [youtube-url]
// Batch:         node --env-file=.env scripts/test-analyze.mjs --batch urls.txt
import { runHybridExtraction } from '../api/analyze.js';
import { readFileSync } from 'fs';

const missing = ['VITE_ANTHROPIC_API_KEY', 'YOUTUBE_API_KEY', 'GEMINI_API_KEY'].filter(k => !process.env[k]);
if (missing.length) {
  console.error(`Missing in .env: ${missing.join(', ')}`);
  process.exit(1);
}

// Intercept the EXTRACTION_METRICS console.log line without changing the
// production return shape (metrics never leave the server as API response data).
function captureMetrics(fn) {
  const orig = console.log;
  let metrics = null;
  console.log = (...args) => {
    if (args[0] === 'EXTRACTION_METRICS') { metrics = JSON.parse(args[1]); return; }
    orig(...args);
  };
  return fn().finally(() => { console.log = orig; }).then(result => ({ result, metrics }));
}

async function runOne(url) {
  console.log(`\nAnalyzing: ${url}`);
  const { result, metrics } = await captureMetrics(() => runHybridExtraction({ url, caption: '' }));
  console.log(`─── ${result.title} ───`);
  console.log(`Tag: ${result.tag} | Level: ${result.level} | Influencer: ${result.influencer || '(none)'}`);
  console.log(`Exercises: ${result.exerciseList?.length ?? 0}`);
  for (const ex of result.exerciseList ?? []) {
    console.log(`  [${ex.section}] ${ex.exercise_name} (${ex.exercise_type}) — ${ex.sets}x${ex.reps} @ ${ex.timestamp}s`);
  }
  const p = metrics.pipelines;
  console.log(`Timing: text=${p.text?.ms ?? '-'}ms gemini=${p.gemini?.ms ?? '-'}ms merge=${p.merge?.ms ?? '-'}ms total=${metrics.totalMs}ms`);
  console.log(`Cost: text=$${p.text?.costUsd?.toFixed(4) ?? '-'} gemini=$${p.gemini?.costUsd?.toFixed(4) ?? '-'} merge=$${p.merge?.costUsd?.toFixed(4) ?? '-'} total=$${metrics.totalKnownCostUsd?.toFixed(4) ?? '0'}`);
  return { url, result, metrics };
}

const args = process.argv.slice(2);
if (args[0] === '--batch') {
  const urls = readFileSync(args[1], 'utf-8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  const runs = [];
  for (const url of urls) {
    try { runs.push(await runOne(url)); }
    catch (e) { console.error(`FAILED: ${url} — ${e.message}`); runs.push({ url, error: e.message }); }
  }
  const ok = runs.filter(r => !r.error);
  const totalCost = ok.reduce((s, r) => s + (r.metrics.totalKnownCostUsd || 0), 0);
  const avgMs = ok.reduce((s, r) => s + r.metrics.totalMs, 0) / (ok.length || 1);
  console.log(`\n═══ Batch summary: ${ok.length}/${runs.length} succeeded ═══`);
  console.log(`Avg time: ${(avgMs / 1000).toFixed(1)}s | Total cost: $${totalCost.toFixed(4)} | Avg: $${(totalCost / (ok.length || 1)).toFixed(4)}/video`);
} else {
  const url = args[0] || 'https://www.youtube.com/watch?v=ml6cT4AZdqI';
  await runOne(url);
}
