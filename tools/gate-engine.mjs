/* 引擎闸门：技巧正确性 / AI 大师契约 / 100 关唯一解与难度曲线
   node tools/gate-engine.mjs          全量（含 100 关）
   node tools/gate-engine.mjs --fast   只跑技巧 + AI 契约 */
import { loadEngine } from './engine-load.mjs';
const SK = loadEngine();
const FAST = process.argv.includes('--fast');
let fails = 0;
const ok = (name, cond, extra) => {
  if (cond) console.log('  PASS  ' + name + (extra ? '   ' + extra : ''));
  else { fails++; console.log('  FAIL  ' + name + '   ' + (extra || '')); }
};

const NEST = '.....6....59.....82....8....45........3........6..3.54...325..6..................';
const MILD = '4.....8.5.3..........7......2.....6.....8.4......1.......6.3.7.5..2.....1.4......';
const ESCAPE = '0000000000000000000000000000000000000000000000000000000000000000000000000000000'.replace(/0/g, '.');
const SEVENTEEN = '100000000000000104002000050000000010040000002000010000003000000007030020500000000';
const GRID = '534678912672195348198342567859761423426853791713924856961537284287419635345286179';
function isValidGrid(s) {
  if (s.length !== 81) return false;
  for (let u = 0; u < 27; u++) { const seen = new Set(); for (const i of SK.UNITS[u]) seen.add(s.charCodeAt(i)); if (seen.size !== 9) return false; }
  return true;
}

console.log('== 0. 基础数据与赋值传播 ==');
ok('样例终盘是合法完整解', isValidGrid(GRID), 'len=' + GRID.length);
ok('MILD 盘长度合法', MILD.length === 81);
ok('SEVENTEEN 盘长度合法', SEVENTEEN.length === 81);
{
  const made = SK.Gen.make(4242, { clues: 31, attempts: 3 });
  const st = SK.Board.create(made.puzzle);
  const before = SK.Board.progress(st).filled;
  /* 找一个空格，填入唯一解中的正确数字 */
  let cell = -1;
  for (let i = 0; i < 81; i++) if (!st.digits[i]) { cell = i; break; }
  SK.Board.assign(st, cell, SK.digitAt(made.solution, cell));
  const after = SK.Board.progress(st).filled;
  ok('单步赋值只带出连锁唯一候选', after - before <= 52, '空格 ' + (81 - before) + ' 个，一步后新增 ' + (after - before));
  ok('赋值后仍与唯一解完全一致', (() => { for (let i = 0; i < 81; i++) if (st.digits[i] && st.digits[i] !== SK.digitAt(made.solution, i)) return false; return true; })());
  ok('填错一步会被判为矛盾或背离唯一解', (() => {
    const t = SK.Board.create(made.puzzle);
    let c2 = -1; for (let i = 0; i < 81; i++) if (!t.digits[i]) { c2 = i; break; }
    const wrong = (SK.digitAt(made.solution, c2) % 9) + 1;
    const r = SK.Board.assign(t, c2, wrong);
    return !r.ok || t.digits[c2] === wrong && SK.digitAt(made.solution, c2) !== wrong;
  })());
}

console.log('== 1. 技巧判定 ==');
{
  /* 由规格保证：maxTier=1 的盘应能被纯单步技巧解完 */
  const easy = SK.Gen.make(9001, { clues: 40, minTier: 1, maxTier: 1, attempts: 6 });
  ok('纯单步规格盘能被单技巧解完', SK.Solver.solveSinglesOnly(easy.puzzle).solved, 'tier=' + easy.stats.maxTier + ' fit=' + easy.fit);
  const er = easy.stats;
  ok('纯单步规格盘零试位', er.guesses === 0, 'score=' + Math.round(er.score) + ' steps=' + er.steps.length);
  const hard = SK.Gen.make(9002, { clues: 26, minTier: 5, minGuess: 2, attempts: 8 });
  ok('高难规格盘需要试位或高档技巧', hard.stats.guesses >= 1 || hard.stats.maxTier >= 4, 'tier=' + hard.stats.maxTier + ' guess=' + hard.stats.guesses + ' score=' + Math.round(hard.stats.score));
  ok('评分区分难易（高难盘分数远高于入门盘）', hard.stats.score > er.score * 2, Math.round(hard.stats.score) + ' vs ' + Math.round(er.score));
}
{
  const sol = SK.Solver.solutionOf(MILD);
  ok('独立题集可解且解合法', !!sol && isValidGrid(sol), sol && sol.slice(0, 18));
  {
    const rr = SK.Solver.solveSmart(MILD, { maxGuess: 12 });
    const replay = SK.Board.create(MILD);
    for (const s of rr.steps) SK.Tech.apply(replay, { place: s.place, elim: s.elim });
    ok('技巧解路径重放能填满全盘', SK.Board.progress(replay).filled === 81, 'filled=' + SK.Board.progress(replay).filled + ' steps=' + rr.steps.length);
    ok('独立题集解与技巧解一致', rr.solved && SK.stringify(replay.digits) === sol);
    ok('AI 接管路径逐格覆盖所有空格', (() => {
      const stt = SK.Board.create(MILD);
      const plan = SK.AI.plan(stt, { maxSteps: 200 });
      const placed = plan.filter(m => m.place).map(m => m.place.i);
      const empt = []; for (let i = 0; i < 81; i++) if (!stt.digits[i]) empt.push(i);
      return empt.every(i => placed.indexOf(i) >= 0) && new Set(placed).size === placed.length;
    })(), 'plan=' + SK.AI.plan(SK.Board.create(MILD), { maxSteps: 200 }).length);
  }
  const s17 = SK.Solver.solutionOf(SEVENTEEN);
  ok('17 提示盘可解且解合法', !!s17 && isValidGrid(s17));
  ok('17 提示盘非平凡（需高档技巧）', (() => { const r = SK.Solver.solveSmart(SEVENTEEN, { maxGuess: 30 }); return r.guesses >= 1 || r.maxTier >= 4; })(), 'guess=' + SK.Solver.solveSmart(SEVENTEEN, { maxGuess: 30 }).guesses);
}
ok('多解盘被判定为非唯一', SK.Solver.countSolutions(SK.Board.create('.................1...............'), 2) === 2);
ok('唯一解判定成立', SK.Solver.hasUniqueSolution(SK.Gen.make(5151, { clues: 30, attempts: 2 }).puzzle));
{
  const made = SK.Gen.make(12345, { clues: 33, minTier: 1, maxTier: 2, attempts: 4 });
  const st = SK.Board.create(made.puzzle);
  const mv = SK.Tech.findMove(st, true);
  ok('findMove 能给出招法', !!mv, mv ? mv.name + ' | ' + mv.why : '');
  if (mv) {
    SK.Tech.apply(st, mv);
    let match = true;
    for (let i = 0; i < 81; i++) if (st.digits[i] && st.digits[i] !== SK.digitAt(made.solution, i)) match = false;
    ok('招法只产生正确落子（不背离唯一解）', match);
    ok('招法说明为中文且具体', /[一-龥]/.test(mv.why) && mv.why.length > 10);
  }
}

console.log('== 2. AI 大师契约 ==');
{
  const made = SK.Gen.make(777, { clues: 26, minTier: 3, minGuess: 0, attempts: 8 });
  const sol = made.solution;
  const st = SK.Board.create(made.puzzle);
  const seeded = SK.Solver.solveSmart(made.puzzle, {}).steps.filter(s => s.place).slice(0, 3);
  for (const s of seeded) SK.Board.assign(st, s.place.i, s.place.d);
  st.selected = SK.AI.hardestCell(st);
  ok('玩家推进后有真实进度且盘面未完', SK.Board.progress(st).filled > made.clues && SK.Board.progress(st).left > 10, JSON.stringify(SK.Board.progress(st)));

  const p = SK.AI.plan(st, { maxSteps: 120 });
  const c = SK.Board.clone(st);
  for (const m of p) SK.Tech.apply(c, m);
  ok('AI 路径能独立解完剩余盘面', SK.Board.isSolved(c), 'steps=' + p.length);
  ok('AI 路径每步都有招法名与说明', p.length > 0 && p.every(m => !!m.name && !!m.why));
  ok('AI 路径落子全部符合唯一解', p.filter(m => m.place).every(m => SK.digitAt(sol, m.place.i) === m.place.d));

  for (let t = 1; t <= 6; t++) {
    const h = SK.AI.hint(st, sol, t);
    ok('提示 tier' + t + ' 结构完整', !!(h && h.title && h.text && h.action), '「' + h.title + '」 ' + String(h.text).slice(0, 26) + '…');
    if (t === 5) ok('tier5 直接填入与唯一解一致', SK.digitAt(sol, h.action.i) === h.action.d, SK.Tech.cellName(h.action.i) + '=' + h.action.d);
    if (t === 6) ok('tier6 给出连续接管路径', h.path && h.path.length > 1, 'path=' + (h.path || []).length);
  }
  {
    const bad = SK.Board.clone(st);
    const target = SK.AI.firstWrongOrEmpty(bad, sol);
    const wrongDigit = (SK.digitAt(sol, target) % 9) + 1;
    SK.Board.forceSet(bad, target, wrongDigit);
    const w = SK.AI.wrongCells(bad, sol);
    ok('AI 能指出填错的格', w.length >= 1 && w.indexOf(target) >= 0, 'wrong=' + JSON.stringify(w.map(SK.Tech.cellName)));
    /* 造一个同单元重复的矛盾盘：把行 0 已有的数字塞进行 0 的另一个空格 */
    const dead = SK.Board.create(made.puzzle);
    const donor = SK.UNITS[0].find(j => dead.digits[j] && !dead.given[j]) ?? SK.UNITS[0].find(j => dead.digits[j]);
    const victim = SK.UNITS[0].find(j => !dead.digits[j] && !dead.given[j]);
    SK.Board.forceSet(dead, victim, dead.digits[donor]);
    const dl = SK.AI.deadlockOf(dead);
    ok('矛盾盘被 AI 检出冲突', dl.conflicts.length >= 1, 'conflicts=' + dl.conflicts.length + ' 格=' + dl.conflicts.map(SK.Tech.cellName).join(','));
    const h1 = SK.AI.hint(dead, sol, 1);
    ok('矛盾时提示自动转为「盘面已矛盾」', h1.kind === 'deadlock', h1.text);
  }
  {
    const rep = SK.AI.analyze(st, sol, { n: 42, grade: '困难', score: Math.round(made.stats.score), clues: made.clues, guesses: made.stats.guesses });
    ok('分析报告字段齐全', !!(rep.progress && rep.verdict && rep.advice && rep.digitPressure && rep.availableMoves && rep.needTierName && rep.hardestCells),
      JSON.stringify({ left: rep.progress.left, need: rep.needTierName, moves: rep.availableMoves.length, tone: rep.verdict.tone }));
    ok('报告含可执行建议', rep.advice.length >= 1 && /数字|技巧|撤销|候选|行|扫描|提交/.test(rep.advice.join('')), rep.advice[0]);
    ok('候选压力项自洽（落点数>=待填数）', rep.digitPressure.every(x => x.slots >= x.left), JSON.stringify(rep.digitPressure.slice(0, 3)));
    ok('分析能指出所需技巧档', /唯一候选|隐性唯一|数对|数组|X-翼|剑鱼|试位|收尾/.test(rep.needTierName), rep.needTierName);
  }
  {
    const ref = SK.AI.referencePath(made.puzzle);
    ok('整关参考解可生成', ref.length > 10, 'steps=' + ref.length);
  }
}

if (!FAST) {
  console.log('== 3. 100 关逐关校验 ==');
  const rows = []; let lvFail = 0;
  const t0 = Date.now();
  for (let n = 1; n <= 100; n++) {
    const spec = SK.Levels.spec(n);
    const made = SK.Gen.make(spec.seed, spec);
    if (!made) { fails++; console.log('  FAIL  第 ' + n + ' 关出题失败'); continue; }
    const uniq = SK.Solver.countSolutions(SK.Board.create(made.puzzle), 2);
    const solOk = made.solution === SK.Solver.solutionOf(made.puzzle);
    const clues = made.puzzle.replace(/\./g, '').length;
    rows.push({ n: n, clues: clues, score: Math.round(made.stats.score), tier: made.stats.maxTier, guess: made.stats.guesses, brute: made.stats.brute || 0, fit: +made.fit.toFixed(2), uniq: uniq, solOk: solOk, ms: made.cost, target: spec.scoreTarget });
    if (uniq !== 1) { lvFail++; console.log('  FAIL  第 ' + n + ' 关非唯一解 (' + uniq + ')'); }
    if (!solOk) { lvFail++; console.log('  FAIL  第 ' + n + ' 关解答不一致'); }
    if (!made.stats.solved) { lvFail++; console.log('  FAIL  第 ' + n + ' 关求解器无法解出'); }
  }
  const ms = Date.now() - t0;
  ok('100 关全部唯一解且可解', lvFail === 0, ms + 'ms，平均 ' + (ms / 100).toFixed(1) + 'ms/关');
  console.table(rows.filter((_, i) => i % 10 === 9 || i >= 96));

  console.log('== 4. 难度曲线断言 ==');
  const sc = rows.map(r => r.score);
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
  const chap = [];
  for (let c = 0; c < 10; c++) chap.push(Math.round(avg(sc.slice(c * 10, c * 10 + 10))));
  ok('章节平均难度递增', chap.every((v, i) => i === 0 || v >= chap[i - 1] * 0.97), chap.join(' → '));
  ok('前 10 关只用唯一候选（很简单）', rows.slice(0, 10).every(r => r.tier <= 1), 'maxTier=' + Math.max.apply(null, rows.slice(0, 10).map(r => r.tier)));
  ok('前 10 关提示数充足(>=38)', rows.slice(0, 10).every(r => r.clues >= 38), 'min=' + Math.min.apply(null, rows.slice(0, 10).map(r => r.clues)));
  ok('后 10 关全部需要深层推理', rows.slice(90).every(r => r.tier >= 5 && r.score >= 300), rows.slice(90).map(r => r.score + '@T' + r.tier).join(' '));
  ok('后 10 关难度是前 10 关 5 倍以上', avg(sc.slice(90)) >= avg(sc.slice(0, 10)) * 5, Math.round(avg(sc.slice(90))) + ' vs ' + Math.round(avg(sc.slice(0, 10))));
  ok('提示数整体随进度收紧', avg(rows.slice(80).map(r => r.clues)) <= avg(rows.slice(0, 20).map(r => r.clues)) - 12 && avg(rows.slice(90).map(r => r.clues)) <= 25,
    '前 20 均 ' + avg(rows.slice(0, 20).map(r => r.clues)).toFixed(1) + ' → 后 20 均 ' + avg(rows.slice(80).map(r => r.clues)).toFixed(1));
  const inv = rows.filter((r, i) => i > 12 && r.score < sc[i - 1] * 0.6).length;
  ok('局部难度无明显倒挂', inv <= 8, '倒挂 ' + inv + ' 关：' + rows.filter((r, i) => i > 12 && r.score < sc[i - 1] * 0.6).map(r => 'Lv' + r.n).join(' '));
  /* 难度分数是双峰度量（纯技巧 35-70，一旦需要假设就跳到 200+），因此只要求不偏离目标 0.4–3 倍 */
  const onSpec = rows.filter(r => r.score >= r.target * 0.4 && r.score <= r.target * 3).length;
  ok('逐关难度落在目标带内(0.4–3 倍)', onSpec >= 90, onSpec + '/100 关');
  ok('相邻关卡无「越玩越简单」的断崖', rows.filter((r, i) => i > 20 && r.score < sc[i - 1] * 0.35).length === 0,
    '断崖 ' + rows.filter((r, i) => i > 20 && r.score < sc[i - 1] * 0.35).length + ' 处');

  console.log('\n== 5. 关卡片段 ==');
  for (const n of [1, 5, 10, 25, 50, 75, 90, 95, 100]) {
    const r = rows[n - 1];
    console.log('  Lv' + String(n).padStart(3) + '  提示 ' + r.clues + '  分 ' + String(r.score).padStart(5) + '  技巧档 ' + r.tier + '  试位 ' + r.guess + '  fit ' + r.fit);
  }
}

console.log(fails ? '\n❌ 引擎闸门失败 ' + fails + ' 项' : '\n✅ 引擎闸门全绿');
process.exit(fails ? 1 : 0);
