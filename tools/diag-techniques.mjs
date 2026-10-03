/* 诊断：对每种技巧做「消除不得删掉真实解」的性质测试 */
import { loadEngine } from './engine-load.mjs';
const SK = loadEngine();
const KEYS = ['nakedPair', 'pointing', 'claiming', 'hiddenPair', 'nakedTriple', 'xwing', 'swordfish', 'trial'];
const report = {};
for (const k of KEYS) report[k] = { seen: 0, bad: 0, samples: [] };

for (let s = 0; s < 260; s++) {
  const clues = 24 + (s % 5);
  const made = SK.Gen.make(1000 + s * 7919, { clues: clues, attempts: 2 });
  if (!made) continue;
  const sol = made.solution;
  /* 走一遍真实解法，逐步检查各技巧的消除合法性 */
  const st = SK.Board.create(made.puzzle);
  for (let step = 0; step < 90; step++) {
    for (const k of KEYS) {
      const probe = SK.Board.clone(st);
      let mv = null;
      try { mv = SK.Tech[k](probe); } catch (e) { mv = null; }
      if (!mv) continue;
      report[k].seen++;
      if (mv.place) {
        if (SK.digitAt(sol, mv.place.i) !== mv.place.d) report[k].bad++;
        continue;
      }
      for (const e of mv.elim) {
        if (SK.digitAt(sol, e.i) === e.d) {
          report[k].bad++;
          if (report[k].samples.length < 3) report[k].samples.push({ step: step, msg: mv.why, cell: SK.Tech.cellName(e.i), digit: e.d, board: SK.stringify(st.digits) });
        }
      }
    }
    const mv = SK.Tech.findMove(st, false);
    if (!mv) break;
    const r = SK.Tech.apply(st, mv);
    if (!r.ok) break;
  }
}
for (const k of KEYS) {
  const r = report[k];
  console.log((r.bad ? '❌ ' : '✅ ') + k.padEnd(12) + ' 出现 ' + String(r.seen).padStart(4) + ' 次，错误消除 ' + r.bad);
  for (const s of r.samples) console.log('     · step' + s.step + ' ' + s.msg + '  →  删掉真实解 ' + s.cell + '=' + s.digit + '\n       board=' + s.board);
}
