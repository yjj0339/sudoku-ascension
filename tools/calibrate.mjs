/* 校准：扫描提示数 → 实测难度分数/技巧档/试位数，用于设定曲线与档位 */
import { loadEngine } from './engine-load.mjs';
const SK = loadEngine();
const N = +(process.env.N || 8);
console.log('clues  avgScore  medScore  minS  maxS  avgTier  tier分布           avgGuess  guess>=1%');
for (let clues = 46; clues >= 22; clues--) {
  const rows = [];
  for (let k = 0; k < N; k++) {
    const made = SK.Gen.make(90210 + clues * 131 + k * 7919, { clues: clues, attempts: 3 });
    if (!made || !made.stats.solved) continue;
    rows.push(made.stats);
  }
  if (!rows.length) { console.log(String(clues).padStart(5) + '   无有效样本'); continue; }
  const sc = rows.map(r => r.score).sort((a, b) => a - b);
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
  const tiers = {};
  for (const r of rows) tiers[r.maxTier] = (tiers[r.maxTier] || 0) + 1;
  console.log(
    String(clues).padStart(5) + '  ' +
    String(Math.round(avg(sc))).padStart(8) + '  ' +
    String(Math.round(sc[sc.length >> 1])).padStart(8) + '  ' +
    String(Math.round(sc[0])).padStart(5) + '  ' +
    String(Math.round(sc[sc.length - 1])).padStart(5) + '  ' +
    avg(rows.map(r => r.maxTier)).toFixed(2).padStart(7) + '  ' +
    JSON.stringify(tiers).padEnd(18) + '  ' +
    avg(rows.map(r => r.guesses)).toFixed(2).padStart(8) + '  ' +
    (100 * rows.filter(r => r.guesses >= 1).length / rows.length).toFixed(0) + '%');
}
