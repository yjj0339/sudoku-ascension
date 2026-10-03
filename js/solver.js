/* 求解器：技巧解 + 试位/回溯兜底；同时产出「解法路径」和难度评分 */
(function () {
  const SK = window.SK, S = (SK.Solver = {});

  function empties(st) { const o = []; for (let i = 0; i < 81; i++) if (!st.digits[i]) o.push(i); return o; }
  S.empties = empties;

  /* 暴力回溯补全（原地修改），用于取解答与计数 */
  S.backtrack = function (st) {
    let best = -1, bc = 10;
    for (let i = 0; i < 81; i++) if (!st.digits[i]) { const p = SK.POP[st.masks[i]]; if (p < bc) { bc = p; best = i; if (p <= 1) break; } }
    if (best < 0) return true;
    if (bc === 0) return false;
    const m = st.masks[best];
    for (let d = 1; d <= 9; d++) {
      if (!(m & SK.BIT[d])) continue;
      const t = SK.Board.clone(st);
      if (SK.Board.assign(t, best, d).ok && S.backtrack(t)) { st.digits.set(t.digits); st.masks.set(t.masks); return true; }
    }
    return false;
  };

  S.countSolutions = function (st, limit) {
    limit = limit || 2;
    function rec(cur) {
      let best = -1, bc = 10;
      for (let i = 0; i < 81; i++) if (!cur.digits[i]) { const p = SK.POP[cur.masks[i]]; if (p < bc) { bc = p; best = i; } }
      if (best < 0) return 1;
      if (bc === 0) return 0;
      let total = 0;
      const m = cur.masks[best];
      for (let d = 1; d <= 9; d++) {
        if (!(m & SK.BIT[d])) continue;
        const t = SK.Board.clone(cur);
        if (!SK.Board.assign(t, best, d).ok) continue;
        total += rec(t);
        if (total >= limit) return total;
      }
      return total;
    }
    return rec(st);
  };
  S.hasUniqueSolution = function (givenStr) {
    return S.countSolutions(SK.Board.create(givenStr), 2) === 1;
  };
  S.solutionOf = function (givenStr) {
    const st = SK.Board.create(givenStr);
    return S.backtrack(st) ? SK.stringify(st.digits) : null;
  };

  /* 智能求解：先纯技巧，卡住则试位（一层前瞻）。返回 stats + 完整路径 */
  S.solveSmart = function (givenStr, opts) {
    opts = opts || {};
    const maxGuess = opts.maxGuess == null ? 12 : opts.maxGuess;
    const T = SK.Tech;
    const st = SK.Board.create(givenStr);
    const stats = { score: 0, counts: {}, guesses: 0, maxTier: 0, steps: [], solved: false, techSolved: false };
    let guard = 0;
    while (guard++ < 900) {
      const mv = T.findMove(st, false);
      if (mv) {
        stats.counts[mv.key] = (stats.counts[mv.key] || 0) + 1;
        stats.score += mv.weight;
        if (mv.tier > stats.maxTier) stats.maxTier = mv.tier;
        stats.steps.push({ key: mv.key, name: mv.name, tier: mv.tier, digit: mv.digit, why: mv.why, focus: mv.focus, place: mv.place, elim: mv.elim });
        let good = true;
        if (mv.place) good = SK.Board.placeNoCascade(st, mv.place.i, mv.place.d);
        else for (const e of mv.elim) SK.Board.eliminate(st, e.i, e.d);
        if (!good) { stats.solved = false; stats.brokenAt = guard; return stats; }
        continue;
      }
      const left = empties(st);
      if (!left.length) { stats.solved = true; stats.techSolved = true; return stats; }
      if (stats.guesses >= maxGuess) {
        /* 技巧+一层试位都推不动：这已经超出「可讲解范围」，用回溯补全并计入巨额难度 */
        const t = SK.Board.clone(st);
        if (!S.backtrack(t)) { stats.solved = false; return stats; }
        stats.solved = true;
        stats.brute = (stats.brute || 0) + left.length;
        stats.score += left.length * 26;
        stats.maxTier = 6;
        stats.steps.push({ key: 'brute', name: '深度搜索', tier: 6, digit: 0, focus: left.slice(0, 9), place: null, elim: [], why: '剩余 ' + left.length + ' 格需要深层假设回溯，无法用单一技巧直接推出。' });
        st.digits.set(t.digits); SK.Board.recompute(st);
        return stats;
      }
      /* 试位：候选最少格，逐个用「技巧解+回溯」判定可行性 */
      let pickCell = left[0], pickPop = 10;
      for (const i of left) { const p = SK.POP[st.masks[i]]; if (p < pickPop) { pickPop = p; pickCell = i; } }
      const mask = st.masks[pickCell];
      let chosen = 0;
      for (let d = 1; d <= 9; d++) {
        if (!(mask & SK.BIT[d])) continue;
        const t = SK.Board.clone(st);
        if (!SK.Board.assign(t, pickCell, d).ok) continue;
        if (S.backtrack(t)) { chosen = d; break; }
      }
      if (!chosen) return stats;
      stats.guesses++;
      stats.counts.trial = (stats.counts.trial || 0) + 1;
      stats.score += T.META.trial.weight * (1 + stats.guesses * 0.6);
      if (T.META.trial.tier > stats.maxTier) stats.maxTier = T.META.trial.tier;
      stats.steps.push({
        key: 'trial', name: '试位法', tier: 6, digit: chosen, focus: [pickCell], place: { i: pickCell, d: chosen }, elim: [],
        why: '常规技巧已用尽：试 ' + SK.Tech.cellName(pickCell) + ' = ' + chosen + '（其余候选均导致矛盾）。'
      });
      SK.Board.placeNoCascade(st, pickCell, chosen);
    }
    return stats;
  };

  /* 纯技巧求解到卡住为止（AI 提示/分析用），不猜测 */
  S.solveTechOnly = function (givenStr) {
    const T = SK.Tech, st = SK.Board.create(givenStr), steps = [];
    for (;;) {
      const mv = T.findMove(st, false);
      if (!mv) break;
      steps.push(mv);
      const r = T.apply(st, mv);
      if (!r.ok) break;
    }
    return { state: st, steps: steps };
  };

  /* 只依赖唯一候选+隐性唯一的关卡（最入门） */
  S.solveSinglesOnly = function (givenStr) {
    const st = SK.Board.create(givenStr);
    let guard = 0;
    for (;;) {
      if (++guard > 200) break;
      const mv = SK.Tech.nakedSingle(st) || SK.Tech.hiddenSingle(st);
      if (!mv) break;
      if (!SK.Board.placeNoCascade(st, mv.place.i, mv.place.d)) break;
    }
    return { state: st, solved: empties(st).length === 0 };
  };

  S.GRADES = [
    { min: 0, name: '入门', stars: 1 }, { min: 50, name: '轻松', stars: 2 },
    { min: 72, name: '普通', stars: 3 }, { min: 100, name: '进阶', stars: 4 },
    { min: 140, name: '困难', stars: 5 }, { min: 200, name: '专家', stars: 6 },
    { min: 290, name: '大师', stars: 7 }, { min: 420, name: '噩梦', stars: 8 },
    { min: 620, name: '天阶', stars: 9 },
  ];
  S.gradeOf = function (score) {
    let g = S.GRADES[0];
    for (const x of S.GRADES) if (score >= x.min) g = x;
    return g;
  };
})();
