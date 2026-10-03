/* 100 关难度曲线：10 章 × 10 关，规格化出题 + 本地缓存 */
(function () {
  const SK = window.SK, L = (SK.Levels = {});

  L.COUNT = 100;
  L.CHAPTERS = [
    { id: 1, name: '初学者的问候', sub: '只看唯一候选，熟悉棋盘', hue: 205, icon: 'i-sprout' },
    { id: 2, name: '行列直觉', sub: '开始用数对与指向摒除', hue: 172, icon: 'i-cloud' },
    { id: 3, name: '宫内摒除', sub: '隐性数对与区块登场', hue: 140, icon: 'i-puzzle' },
    { id: 4, name: '数对与数组', sub: '显性数组拉高观察宽度', hue: 96, icon: 'i-link' },
    { id: 5, name: '结构的影子', sub: 'X-翼开始出现', hue: 52, icon: 'i-shapes' },
    { id: 6, name: '鱼形水域', sub: '剑鱼与多重摒除', hue: 22, icon: 'i-fish' },
    { id: 7, name: '假设之门', sub: '技巧用尽，需要试位', hue: 348, icon: 'i-branch' },
    { id: 8, name: '连锁推理', sub: '多次试位才能贯通', hue: 320, icon: 'i-zap' },
    { id: 9, name: '深渊试炼', sub: '极少提示，极深推理', hue: 288, icon: 'i-moon' },
    { id: 10, name: '天阶之门', sub: '近乎无解的终局考验', hue: 258, icon: 'i-crown' },
  ];

  /* 章节曲线：分数目标取自 tools/calibrate.mjs 的实测刻度，深挖阶段负责追上 */
  const CURVE = [
    { c0: 46, c1: 38, s0: 35, s1: 43, minTier: 1, maxTier: 1, minGuess: 0, maxGuess: 0, minBrute: 0, strictTier: 1, att: 8, bud: 1100 },
    { c0: 38, c1: 35, s0: 44, s1: 52, minTier: 1, maxTier: 2, minGuess: 0, maxGuess: 0, minBrute: 0, strictTier: 1, att: 9, bud: 1200 },
    { c0: 35, c1: 33, s0: 54, s1: 70, minTier: 2, maxTier: 3, minGuess: 0, maxGuess: 0, minBrute: 0, strictTier: 0, att: 24, bud: 1600 },
    { c0: 33, c1: 31, s0: 74, s1: 96, minTier: 3, maxTier: 4, minGuess: 0, maxGuess: 0, minBrute: 0, strictTier: 0, att: 30, bud: 1800 },
    { c0: 31, c1: 30, s0: 100, s1: 135, minTier: 4, maxTier: 5, minGuess: 0, maxGuess: 1, minBrute: 0, strictTier: 0, att: 36, bud: 2000 },
    { c0: 30, c1: 28, s0: 140, s1: 185, minTier: 4, maxTier: 6, minGuess: 1, maxGuess: 2, minBrute: 0, strictTier: 0, att: 40, bud: 2400 },
    { c0: 28, c1: 27, s0: 195, s1: 260, minTier: 5, maxTier: 6, minGuess: 2, maxGuess: 4, minBrute: 0, strictTier: 0, att: 40, bud: 3000 },
    { c0: 27, c1: 26, s0: 275, s1: 360, minTier: 5, maxTier: 6, minGuess: 3, maxGuess: 6, minBrute: 0, strictTier: 0, att: 70, bud: 3600 },
    { c0: 26, c1: 24, s0: 380, s1: 520, minTier: 6, maxTier: 6, minGuess: 4, maxGuess: 10, minBrute: 0, strictTier: 0, att: 140, bud: 5200 },
    { c0: 24, c1: 22, s0: 560, s1: 820, minTier: 6, maxTier: 6, minGuess: 5, maxGuess: 14, minBrute: 0, strictTier: 0, att: 240, bud: 7000 },
  ];

  L.chapterOf = n => L.CHAPTERS[Math.min(9, Math.floor((n - 1) / 10))];
  L.spec = function (n) {
    const c = CURVE[Math.min(9, Math.floor((n - 1) / 10))];
    const t = ((n - 1) % 10) / 9;
    const round = v => Math.round(v);
    const clues = round(c.c0 + (c.c1 - c.c0) * t);
    return {
      level: n,
      clues: clues,
      cluesFloor: Math.max(21, clues - 4),
      minTier: c.minTier,
      maxTier: c.maxTier,
      minGuess: round(c.minGuess + (c.maxGuess - c.minGuess) * t * 0.5),
      maxGuess: c.maxGuess + 6,
      minBrute: round(c.minBrute * (0.5 + t * 0.5)),
      scoreTarget: round(c.s0 + (c.s1 - c.s0) * t),
      attempts: c.att,
      budgetMs: c.bud,
      strictTier: !!c.strictTier,
      seed: (SK.hash('suk.' + n + '.ascension.v3') ^ (n * 2654435761)) >>> 0,
    };
  };
  L.gradeOf = n => SK.Solver.gradeOf(L.spec(n).targetScore || 0);

  L.meta = function (n) {
    const ch = L.chapterOf(n), spec = L.spec(n);
    return {
      n: n, chapter: ch.id, chapterName: ch.name, hue: ch.hue, icon: ch.icon,
      clues: spec.clues, minTier: spec.minTier, minGuess: spec.minGuess,
      tierName: ['—', '唯一候选', '数对/指向', '数组/隐性对', 'X-翼', '剑鱼', '试位'][Math.min(6, spec.maxTier)],
      band: n <= 10 ? '入门' : n <= 30 ? '简单' : n <= 50 ? '普通' : n <= 70 ? '困难' : n <= 90 ? '大师' : '天阶',
    };
  };

  const MEM = {};
  const KEY = n => 'sa:lv:v1:' + n;
  function store(n, data) {
    MEM[n] = data;
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(KEY(n), JSON.stringify(data)); } catch (e) { }
  }
  function fetchCached(n) {
    if (MEM[n]) return MEM[n];
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(KEY(n));
        if (raw) { const d = JSON.parse(raw); if (d && d.puzzle && d.puzzle.length === 81) { MEM[n] = d; return d; } }
      }
    } catch (e) { }
    return null;
  }
  L.cached = fetchCached;
  L.clearCache = function (n) {
    if (n == null) { for (let i = 1; i <= L.COUNT; i++) { delete MEM[i]; try { if (typeof localStorage !== 'undefined') localStorage.removeItem(KEY(i)); } catch (e) { } } }
    else { delete MEM[n]; try { if (typeof localStorage !== 'undefined') localStorage.removeItem(KEY(n)); } catch (e) { } }
  };

  L.get = function (n, force) {
    n = Math.max(1, Math.min(L.COUNT, n | 0));
    if (!force) { const hit = fetchCached(n); if (hit) return hit; }
    const spec = L.spec(n);
    const made = SK.Gen.make(spec.seed, spec);
    const data = {
      n: n, puzzle: made.puzzle, solution: made.solution, clues: made.clues,
      score: Math.round(made.stats.score), maxTier: made.stats.maxTier, guesses: made.stats.guesses,
      counts: made.stats.counts, attempts: made.attempts, fit: made.fit, grade: SK.Solver.gradeOf(made.stats.score).name,
      stars: SK.Solver.gradeOf(made.stats.score).stars,
    };
    store(n, data);
    return data;
  };

  /* 顺序解锁：通关第 n 关解锁 n+1 */
  L.isUnlocked = function (n, progress) { return n === 1 || (progress && progress[n - 1] && progress[n - 1].done); };
})();
