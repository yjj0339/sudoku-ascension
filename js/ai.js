/* AI 大师：分层提示 / 局势分析 / 解题路径 / 接管作答。
   全部以「实时棋盘状态」为输入，与玩家真实进度一致。 */
(function () {
  const SK = window.SK, AI = (SK.AI = {});

  AI.TIERS = [
    { id: 1, name: '观察方向', short: '看一眼哪里', cost: 0, desc: '不告诉你答案，只把你该盯的地方点亮。' },
    { id: 2, name: '候选清单', short: '这格能填什么', cost: 0, desc: '列出目标格的全部候选数字。' },
    { id: 3, name: '技巧讲解', short: '用什么招', cost: 1, desc: '找到当前可用最高级招法，讲清逻辑但不替你填。' },
    { id: 4, name: '思路推演', short: '为什么这么填', cost: 1, desc: '连同涉及的行、列、宫一起高亮，展示推理链。' },
    { id: 5, name: '直接填入', short: '帮我填一格', cost: 2, desc: 'AI 直接落一子（计入提示消耗）。' },
    { id: 6, name: 'AI 接管', short: '帮我作答', cost: 3, desc: 'AI 按解法路径连续作答，可中途接管。' },
  ];

  AI.TIER_NAME = ['—', '唯一候选', '隐性唯一', '数对/指向', '隐性数对/数组', 'X-翼', '剑鱼/试位'];

  /* 实时状态 -> 干净可解的工作副本（保留玩家已填的正确部分） */
  function liveState(st) {
    return { given: st.given, digits: new Uint8Array(st.digits), masks: new Uint16Array(81) };
  }

  AI.deadlockOf = function (st) {
    const out = { conflicts: [], emptyCells: [], contradiction: false };
    out.conflicts = SK.Board.conflicts(st);
    for (let i = 0; i < 81; i++) if (!st.digits[i] && st.masks[i] === 0) out.emptyCells.push(i);
    out.contradiction = out.emptyCells.length > 0 || out.conflicts.length > 0;
    return out;
  };

  /* 与唯一解对比，找出填错的格 */
  AI.wrongCells = function (st, solution) {
    const out = [];
    for (let i = 0; i < 81; i++) if (!st.given[i] && st.digits[i] && solution.charCodeAt(i) - 48 !== st.digits[i]) out.push(i);
    return out;
  };

  /* AI 解法路径：技巧优先，卡住则试位；返回每步的招法与说明 */
  AI.plan = function (st, opts) {
    opts = opts || {};
    const maxSteps = opts.maxSteps || 120;
    const work = liveState(st);
    SK.Board.recompute(work);
    const T = SK.Tech, path = [];
    let guard = 0;
    while (guard++ < maxSteps) {
      const left = [];
      for (let i = 0; i < 81; i++) if (!work.digits[i]) left.push(i);
      if (!left.length) break;
      const mv = T.findMove(work, false);
      if (mv) {
        const before = pack(mv);
        const r = T.apply(work, mv);
        if (!r.ok) { before.broken = true; path.push(before); break; }
        path.push(before);
        pushChains(r.out, mv.place ? 1 : 0);
        continue;
      }
      const tm = T.trial(work);
      if (tm) {
        const before2 = pack(tm);
        const r2 = T.apply(work, tm);
        path.push(before2);
        if (!r2.ok) { before2.broken = true; break; }
        pushChains(r2.out, tm.place ? 1 : 0);
        continue;
      }
      /* 技巧与试位都拿不到：退回最约束格 + 回溯补全，保证一定能给出下一步 */
      let cell = left[0], cp = 10;
      for (const i of left) { const p = SK.POP[work.masks[i]]; if (p < cp) { cp = p; cell = i; } }
      const t = SK.Board.clone(work);
      if (SK.Solver.backtrack(t)) {
        const d = t.digits[cell];
        path.push({ key: 'backtrack', name: '回溯定位', tier: 6, digit: d, place: { i: cell, d: d }, elim: [], focus: [cell], why: '盘面已无直观招法：' + T.cellName(cell) + ' 只能填 ' + d + '（由全局唯一性回推）。' });
        const r3 = SK.Board.assign(work, cell, d);
        pushChains(r3.out, 1);
      } else break;
    }
    return path;

    function pushChains(out, skip) {
      if (!out) return;
      for (let k = skip || 0; k < out.length; k++) {
        const pr = out[k];
        path.push({
          key: 'chain', name: '连锁填入', tier: 1, digit: pr[1], place: { i: pr[0], d: pr[1] }, elim: [], focus: [pr[0]],
          why: '上一步删掉候选后，' + T.cellName(pr[0]) + ' 只剩唯一候选 ' + pr[1] + '，可直接填入。',
          hint: '一格的候选被删到只剩一个时就是白送的位置。', chained: true,
        });
      }
    }

    function pack(m) {
      return {
        key: m.key, name: m.name, tier: m.tier, digit: m.digit, place: m.place, elim: m.elim, focus: m.focus, why: m.why,
        hint: m.tip,
      };
    }
  };

  /* 分层提示：tier=1..6 */
  AI.hint = function (st, solution, tier) {
    tier = Math.max(1, Math.min(6, tier || 3));
    const dl = AI.deadlockOf(st);
    if (dl.contradiction) {
      return {
        tier: tier, kind: 'deadlock', title: '盘面已矛盾', focus: dl.conflicts.concat(dl.emptyCells),
        text: '这些位置出现了同单元重复或某格已无候选，必须撤销到矛盾发生之前。',
        action: { type: 'undo', cells: dl.conflicts.concat(dl.emptyCells) },
      };
    }
    const sel = st.selected != null && !st.digits[st.selected] && !st.given[st.selected] ? st.selected : -1;

    if (tier === 1) {
      const t = AI.suggestFocus(st);
      return {
        tier: 1, kind: 'focus', title: '先看这里', focus: t.focus, digit: t.digit, text: t.text,
        action: { type: 'highlight' },
      };
    }
    if (tier === 2) {
      const target = sel >= 0 ? sel : AI.hardestCell(st);
      const cands = [];
      for (let d = 1; d <= 9; d++) if (st.masks[target] & SK.BIT[d]) cands.push(d);
      return {
        tier: 2, kind: 'candidates', title: '候选一览', focus: [target], digits: cands, digit: cands.length === 1 ? cands[0] : 0,
        text: cands.length ? SK.Tech.cellName(target) + ' 的候选是 ' + cands.join(' / ') + '（共 ' + cands.length + ' 个）。'
          : SK.Tech.cellName(target) + ' 已填满。',
        action: { type: 'highlight' },
      };
    }
    const path = AI.plan(st, { maxSteps: 8 });
    if (!path.length) return { tier: tier, kind: 'done', title: '已经完成', focus: [], text: '当前盘面已被 AI 解完，直接提交即可。', action: { type: 'none' } };
    const mv = path[0];
    if (tier === 3) {
      return { tier: 3, kind: 'technique', title: mv.name + '（' + AI.TIER_NAME[Math.min(6, mv.tier)] + '）', focus: mv.focus, digit: mv.digit, text: mv.why + ' ' + mv.hint, move: mv, action: { type: 'highlight' } };
    }
    if (tier === 4) {
      const extra = [];
      for (const i of mv.focus) for (const u of SK.UNIT_OF[i]) for (const j of SK.UNITS[u]) if (extra.indexOf(j) < 0) extra.push(j);
      return { tier: 4, kind: 'chain', title: '推理链：' + mv.name, focus: mv.focus.concat(extra.slice(0, 40)), digit: mv.digit, text: mv.why + ' 涉及 ' + mv.focus.length + ' 个关键格。', move: mv, action: { type: 'highlight' } };
    }
    if (tier === 5) {
      const target = mv.place || (solution ? { i: AI.firstWrongOrEmpty(st, solution), d: solution.charCodeAt(AI.firstWrongOrEmpty(st, solution)) - 48 } : null);
      if (!target) return { tier: 5, kind: 'done', title: '无可填', focus: [], text: '盘面已完成。', action: { type: 'none' } };
      return { tier: 5, kind: 'fill', title: 'AI 落子', focus: [target.i], digit: target.d, text: mv.place ? mv.why : '按唯一解，' + SK.Tech.cellName(target.i) + ' 填 ' + target.d + '。', action: { type: 'place', i: target.i, d: target.d } };
    }
    return { tier: 6, kind: 'takeover', title: 'AI 接管', focus: [], path: path, text: 'AI 已连续给出 ' + path.length + ' 步解法，逐步执行中。', action: { type: 'play', path: path } };
  };

  AI.hardestCell = function (st) {
    let cell = -1, cp = 10;
    for (let i = 0; i < 81; i++) if (!st.digits[i]) { const p = SK.POP[st.masks[i]]; if (p < cp) { cp = p; cell = i; if (p === 1) break; } }
    return cell < 0 ? 0 : cell;
  };
  AI.firstWrongOrEmpty = function (st, solution) {
    for (let i = 0; i < 81; i++) if (!st.given[i] && st.digits[i] && solution.charCodeAt(i) - 48 !== st.digits[i]) return i;
    for (let i = 0; i < 81; i++) if (!st.digits[i]) return i;
    return 0;
  };

  /* tier1：给一个「最值得看」的方向 —— 空位最少的单元 / 剩余位置最少的数字 */
  AI.suggestFocus = function (st) {
    let bu = -1, bl = 10;
    for (let u = 0; u < 27; u++) { let e = 0; for (const i of SK.UNITS[u]) if (!st.digits[i]) e++; if (e > 1 && e < bl) { bl = e; bu = u; } }
    const rem = SK.Board.remaining(st);
    let bd = 0, bn = 10;
    for (let d = 1; d <= 9; d++) if (rem[d] > 0 && rem[d] < bn) { bn = rem[d]; bd = d; }
    if (bu >= 0 && bd > 0) {
      const hit = SK.UNITS[bu].filter(i => !st.digits[i] && (st.masks[i] & SK.BIT[bd]));
      return { focus: (hit.length ? hit : SK.UNITS[bu]), digit: bd, text: '盯住' + SK.Tech.unitName(bu) + '，数字 ' + bd + ' 在这条单元里只剩 ' + (hit.length || '?') + ' 个可能的落点。' };
    }
    if (bu >= 0) return { focus: SK.UNITS[bu], digit: 0, text: '先扫' + SK.Tech.unitName(bu) + '，它只剩 ' + bl + ' 个空格。' };
    if (bd > 0) {
      const hit = [];
      for (let i = 0; i < 81; i++) if (!st.digits[i] && (st.masks[i] & SK.BIT[bd])) hit.push(i);
      return { focus: hit, digit: bd, text: '全盘点数字 ' + bd + '，还有 ' + hit.length + ' 个位置可以放。' };
    }
    return { focus: [], digit: 0, text: '盘面已无空格。' };
  };

  /* AI 局势分析：结构化报告（供二级面板渲染） */
  AI.analyze = function (st, solution, levelData) {
    const prog = SK.Board.progress(st);
    const dl = AI.deadlockOf(st);
    const wrong = solution ? AI.wrongCells(st, solution) : [];
    const moves = SK.Tech.allMoves(st);
    const path = AI.plan(st, { maxSteps: 200 });
    const rem = SK.Board.remaining(st);
    const notes = st.notes ? countNotes(st) : 0;
    const tierNeed = path.length ? path[0].tier : 0;
    const hardest = [];
    for (let i = 0; i < 81; i++) if (!st.digits[i]) hardest.push([i, SK.POP[st.masks[i]]]);
    hardest.sort((a, b) => a[1] - b[1]);
    const pairs = hardest.filter(x => x[1] === 1).length;
    const fragile = hardest.filter(x => x[1] === 2).length;
    const digitPressure = [];
    for (let d = 1; d <= 9; d++) if (rem[d] > 0) {
      let n = 0; for (let i = 0; i < 81; i++) if (!st.digits[i] && (st.masks[i] & SK.BIT[d])) n++;
      digitPressure.push({ d: d, left: rem[d], slots: n });
    }
    digitPressure.sort((a, b) => (a.slots - a.left) - (b.slots - b.left));
    const remaining = path.filter(m => m.place).length + Math.max(0, prog.left - path.filter(m => m.place).length);
    return {
      progress: prog,
      solved: prog.left === 0,
      deadlock: dl,
      wrong: wrong,
      notes: notes,
      availableMoves: moves.map(m => ({ key: m.key, name: m.name, tier: m.tier, why: m.why, digit: m.digit })),
      needTier: tierNeed,
      needTierName: AI.TIER_NAME[Math.min(6, tierNeed)] || '收尾',
      estimateSteps: path.length,
      singleCandidates: pairs,
      doubleCandidates: fragile,
      digitPressure: digitPressure,
      hardestCells: hardest.slice(0, 6).map(x => ({ i: x[0], n: x[1] })),
      level: levelData ? { n: levelData.n, grade: levelData.grade, score: levelData.score, clues: levelData.clues, specGuess: levelData.guesses } : null,
      verdict: AI.verdict({ dl, wrong, moves, tierNeed, prog, pairs, fragile }),
      advice: AI.advice({ dl, wrong, tierNeed, prog, pairs, digitPressure }),
      remaining: remaining,
    };
  };

  function countNotes(st) {
    let n = 0;
    for (let i = 0; i < 81; i++) n += (st.notes[i] || []).length;
    return n;
  }

  AI.verdict = function (x) {
    if (x.dl.contradiction) return { tone: 'danger', text: '盘面已走入死局：存在重复或零候选格，建议撤销。' };
    if (x.wrong.length) return { tone: 'warn', text: '有 ' + x.wrong.length + ' 格与唯一解不符，越晚发现代价越大。' };
    if (x.prog.left === 0) return { tone: 'good', text: '盘面已填满且无冲突，可以提交。' };
    if (x.tier >= 6) return { tone: 'hard', text: '直观技巧已用尽，需要试位/假设推理才能推进。' };
    if (x.pairs >= 3) return { tone: 'good', text: '有 ' + x.pairs + ' 格只剩唯一候选，先收掉这些最划算。' };
    if (x.fragile >= 5) return { tone: 'info', text: '有 ' + x.fragile + ' 格只剩两个候选，适合做数对摒除。' };
    return { tone: 'info', text: '当前还靠观察可推进，优先扫剩余次数最多的数字。' };
  };

  AI.advice = function (x) {
    const a = [];
    if (x.dl.contradiction) a.push('按「撤销」退回，或让 AI 指出矛盾格。');
    if (x.wrong.length) a.push('打开「错误检查」并清掉标红格。');
    if (x.tier >= 5) a.push('这一关的瓶颈在 ' + AI.TIER_NAME[Math.min(6, x.tier)] + '，值得用一次「技巧讲解」。');
    if (x.digitPressure && x.digitPressure.length) a.push('数字 ' + x.digitPressure[0].d + ' 还剩 ' + x.digitPressure[0].left + ' 个待填，只有 ' + x.digitPressure[0].slots + ' 个落点 — 先攻它。');
    if (x.pairs === 0 && x.prog.left > 20) a.push('暂无单候选格：先用候选标记把数对固化下来。');
    if (!a.length) a.push('保持节奏，按行→列→宫三向扫描。');
    return a.slice(0, 4);
  };

  /* 直接生成整关参考解（用于「看答案」和校验） */
  AI.referencePath = function (givenStr) {
    const st = SK.Board.create(givenStr);
    return AI.plan(st, { maxSteps: 200 });
  };
})();
