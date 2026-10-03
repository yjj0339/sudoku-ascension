/* 出题器：终盘生成 → 对称变换洗牌 → 保唯一解挖洞 → 按规格校准确认 */
(function () {
  const SK = window.SK, G = (SK.Gen = {});

  /* 随机终盘（回溯 + 每格随机数字序） */
  G.solvedGrid = function (rng) {
    const digits = new Uint8Array(81);
    function fill(i) {
      if (i === 81) return true;
      const opts = SK.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rng);
      for (const d of opts) {
        const P = SK.PEERS[i];
        let bad = false;
        for (let k = 0; k < P.length; k++) if (digits[P[k]] === d) { bad = true; break; }
        if (bad) continue;
        digits[i] = d;
        if (fill(i + 1)) return true;
        digits[i] = 0;
      }
      return false;
    }
    return fill(0) ? SK.stringify(digits) : null;
  };

  /* 保持合法性的等价变换：数字重标 + 带/栈置换 + 宫内行列交换 + 转置 */
  G.transform = function (sol, rng) {
    const g = SK.parse(sol);
    const perm = SK.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rng);
    const map = new Uint8Array(10);
    for (let d = 1; d <= 9; d++) map[d] = perm[d - 1];
    for (let i = 0; i < 81; i++) g[i] = map[g[i]];
    const transpose = rng() < 0.5;
    function lineOrder() {
      const o = [];
      const bands = SK.shuffle([0, 1, 2], rng);
      for (const b of bands) { const inner = SK.shuffle([0, 1, 2], rng); for (const k of inner) o.push(b * 3 + k); }
      return o;
    }
    const rows = lineOrder(), cols = lineOrder();
    const out = new Uint8Array(81);
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      const sr = transpose ? cols[r] : rows[r], sc = transpose ? rows[c] : cols[c];
      out[SK.cellOf(sr, sc)] = g[SK.cellOf(r, c)];
    }
    return SK.stringify(out);
  };

  /* 挖洞：多轮随机删除，每轮验证唯一解；上一轮删不动的格，下一轮常能删 */
  G.digHoles = function (sol, rng, clueTarget) {
    const arr = SK.parse(sol);
    let clues = 81, pass = 0;
    while (clues > clueTarget && pass++ < 4) {
      const pool = [];
      for (let i = 0; i < 81; i++) if (arr[i]) pool.push(i);
      SK.shuffle(pool, rng);
      let changed = false;
      for (const i of pool) {
        if (clues <= clueTarget) break;
        const keep = arr[i];
        arr[i] = 0;
        if (SK.Solver.countSolutions(SK.Board.create(SK.stringify(arr)), 2) !== 1) arr[i] = keep;
        else { clues--; changed = true; }
      }
      if (!changed) break;
    }
    return { puzzle: SK.stringify(arr), clues: clues };
  };

  /* 契合度（仅用于报告：1 = 完全命中规格） */
  G.fit = function (stats, spec) {
    if (!stats.solved) return -1e9;
    const score = Number(stats.score);
    if (!Number.isFinite(score)) return -1e9;
    let f = 1;
    if (spec.scoreTarget != null) {
      const rel = Math.abs(score - spec.scoreTarget) / Math.max(40, spec.scoreTarget * 0.5);
      f -= Math.min(0.6, rel * 0.6);
    }
    if (spec.minTier != null && stats.maxTier < spec.minTier) f -= (spec.minTier - stats.maxTier) * 0.3;
    if (spec.maxTier != null && stats.maxTier > spec.maxTier) f -= (stats.maxTier - spec.maxTier) * (spec.strictTier ? 0.55 : 0.14);
    if (spec.minGuess != null && stats.guesses < spec.minGuess) f -= (spec.minGuess - stats.guesses) * 0.12;
    if (spec.maxGuess != null && stats.guesses > spec.maxGuess) f -= (stats.guesses - spec.maxGuess) * 0.1;
    return f;
  };

  /* 选盘排序键：离目标难度越近越好（不饱和、单调），并硬性惩罚越档/不足 */
  G.rank = function (stats, spec) {
    const target = spec.scoreTarget || 0;
    const score = Number(stats.score);
    if (!Number.isFinite(score)) return -Infinity;
    let r = -Math.abs(score - target);
    if (spec.strictTier && spec.maxTier != null && stats.maxTier > spec.maxTier) r -= (stats.maxTier - spec.maxTier) * 4000;
    if (spec.maxTier != null && stats.maxTier > spec.maxTier) r -= (stats.maxTier - spec.maxTier) * Math.max(60, target * 0.25);
    if (spec.minTier != null && stats.maxTier < spec.minTier) r -= (spec.minTier - stats.maxTier) * Math.max(50, target * 0.2);
    if (spec.minGuess != null && stats.guesses < spec.minGuess) r -= (spec.minGuess - stats.guesses) * Math.max(25, target * 0.1);
    if (spec.maxGuess != null && stats.guesses > spec.maxGuess) r -= (stats.guesses - spec.maxGuess) * Math.max(30, target * 0.12);
    if (spec.clues != null && Number.isFinite(stats.clues)) r -= Math.max(0, spec.clues - stats.clues) * 8;
    return r;
  };

  const RATE_GUESS = 12;   // 人类可接受的假设层数，超出则按「深度搜索」计入难度

  /* 定向深挖：在已有盘上继续删格，每次选择让难度增益最大的删除 */
  G.digDeeper = function (puzzle, stats, rng, spec, budgetEnd) {
    let clues = puzzle.replace(/[.^]/g, '').length;
    const floor = spec.cluesFloor || Math.max(21, (spec.clues || clues) - 5);
    const target = spec.scoreTarget || 0;
    const gainOf = s => -Math.abs(s.score - target) + s.maxTier * 20 + s.guesses * 25;
    const need = () => stats.score < target * 0.97 || stats.maxTier < (spec.minTier || 1) || stats.guesses < (spec.minGuess || 0);
    let guard = 0;
    while (need() && clues > floor && guard++ < 16 && Date.now() < budgetEnd) {
      const order = SK.shuffle(Array.from({ length: 81 }, (_, i) => i), rng).filter(i => SK.digitAt(puzzle, i));
      let picked = null, pickedStats = null, pickedGain = gainOf(stats), tried = 0;
      for (const i of order) {
        if (tried++ > 26 || Date.now() > budgetEnd) break;
        const arr = SK.parse(puzzle);
        arr[i] = 0;
        const cand = SK.stringify(arr);
        if (SK.Solver.countSolutions(SK.Board.create(cand), 2) !== 1) continue;
        const s2 = SK.Solver.solveSmart(cand, { maxGuess: RATE_GUESS });
        s2.clues = arr.reduce((n, d) => n + (d ? 1 : 0), 0);
        const g = gainOf(s2);
        if (g > pickedGain) { pickedGain = g; picked = cand; pickedStats = s2; if (s2.score >= target && s2.maxTier >= (spec.minTier || 1) && s2.guesses >= (spec.minGuess || 0)) break; }
      }
      if (!picked) break;
      puzzle = picked; clues--; stats = pickedStats;
    }
    return { puzzle: puzzle, clues: clues, stats: stats };
  };

  /* 两阶段出题：A 广撒网按 rank 取最优 → B 只对最优底盘定向深挖 */
  G.make = function (seed, spec) {
    const t0 = Date.now();
    const budgetMs = spec.budgetMs || 4000;
    const budgetEnd = t0 + budgetMs;
    const rng = SK.mulberry32(seed >>> 0);
    let sol = G.transform(G.solvedGrid(rng), rng);
    let best = null, bestRank = -Infinity, attempts = 0;
    const limit = spec.attempts || 10;
    const target = spec.scoreTarget || 0;

    const consider = (puzzle, clues, stats) => {
      const r = G.rank(stats, spec);
      if (r > bestRank) best = { puzzle: puzzle, clues: clues, stats: stats, rank: r, fit: G.fit(stats, spec), attempts: attempts };
      return !!target && best.stats.score >= target * 1.02 && best.stats.maxTier >= (spec.minTier || 1);
    };

    /* A：广度采样 */
    for (let a = 0; a < limit; a++) {
      attempts++;
      if (a && a % 4 === 0) sol = G.transform(G.solvedGrid(rng), rng);
      const cand = G.transform(sol, rng);
      const dug = G.digHoles(cand, rng, spec.clues);
      const stats = SK.Solver.solveSmart(dug.puzzle, { maxGuess: RATE_GUESS });
      if (!stats.solved) continue;
      stats.clues = dug.clues;
      if (consider(dug.puzzle, dug.clues, stats)) break;
      /* 还差得远就把时间继续花在广度采样上（深挖只在有较好底盘时才划算） */
      const needMore = !best || best.stats.score < target * 0.8;
      if (Date.now() > t0 + budgetMs * (needMore ? 0.86 : 0.5)) break;
    }
    if (!best) {
      /* 兜底：任何情况下都交出一个唯一解盘 */
      const dug = G.digHoles(sol, rng, spec.clues);
      const stats = SK.Solver.solveSmart(dug.puzzle, { maxGuess: RATE_GUESS });
      stats.clues = dug.clues;
      best = { puzzle: dug.puzzle, clues: dug.clues, stats: stats, rank: 0, fit: 0, attempts: attempts };
    }
    /* B：定向深挖（只追难度，不毁唯一解） */
    const deep = G.digDeeper(best.puzzle, best.stats, rng, spec, budgetEnd);
    if (deep.puzzle !== best.puzzle) { deep.stats.clues = deep.clues; consider(deep.puzzle, deep.clues, deep.stats); }

    const st = SK.Board.create(best.puzzle);
    if (!SK.Solver.backtrack(st)) {
      const fallback = G.digHoles(sol, rng, spec.clues);
      SK.Solver.backtrack(SK.Board.create(fallback.puzzle));
    }
    best.solution = SK.stringify(st.digits);
    best.cost = Date.now() - t0;
    best.seed = seed >>> 0;
    return best;
  };
})();
