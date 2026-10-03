/* 对局状态、设置、存档、进度与计分 */
(function () {
  const SK = window.SK, G = (SK.Game = {});
  const NS = 'sa:';

  /* ---------- 存储 ---------- */
  const Store = (SK.Store = {
    ok: (function () { try { localStorage.setItem(NS + 't', '1'); localStorage.removeItem(NS + 't'); return true; } catch (e) { return false; } })(),
    get(k, dflt) {
      if (!Store.ok) return dflt;
      try { const raw = localStorage.getItem(NS + k); return raw == null ? dflt : JSON.parse(raw); } catch (e) { return dflt; }
    },
    set(k, v) { if (!Store.ok) return; try { localStorage.setItem(NS + k, JSON.stringify(v)); } catch (e) { } },
    del(k) { if (!Store.ok) return; try { localStorage.removeItem(NS + k); } catch (e) { } },
  });

  /* ---------- 设置 ---------- */
  const DEFAULTS = {
    theme: 'aurora', light: 'rich', blur: 'on', candidateHint: 'auto', errorMode: 'mark',
    noteAutoClear: true, keepFlow: true, confirmExit: true, haptics: true, sound: true,
    keyLayout: 'row', timerUp: true, digitGlow: true, generateBudget: 'normal',
  };
  const Settings = (SK.Settings = Object.assign({}, DEFAULTS, Store.get('settings', {})));
  Settings.set = function (k, v) {
    Settings[k] = v;
    Store.set('settings', Settings);
    Settings.apply();
    G.emit('settings', { key: k, value: v });
  };
  Settings.reset = function () {
    Object.keys(DEFAULTS).forEach(k => { Settings[k] = DEFAULTS[k]; });
    Store.set('settings', Settings); Settings.apply(); G.emit('settings', {});
  };
  Settings.apply = function () {
    const root = document.documentElement;
    root.setAttribute('data-theme', Settings.theme);
    root.setAttribute('data-light', Settings.light);
    document.body.classList.toggle('no-glass', Settings.blur !== 'on');
    document.body.classList.toggle('lite', !Settings.digitGlow);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', { aurora: '#eef0fb', matcha: '#eaf4ea', peach: '#fdefe6', midnight: '#0b1024', contrast: '#ffffff' }[Settings.theme] || '#eef0fb');
  };

  /* ---------- 进度 ---------- */
  const Progress = (SK.Progress = {
    data: Store.get('progress', { done: {}, best: {}, stars: {}, hints: 0, ai: 0, time: 0, level: 1, streak: 0, badges: {} }),
    save() { Store.set('progress', Progress.data); },
    doneCount() { return Object.keys(Progress.data.done).length; },
    isDone(n) { return !!Progress.data.done[n]; },
    unlocked(n) { return n === 1 || Progress.isDone(n - 1) || Progress.isDone(n); },
    nextLevel() {
      for (let n = 1; n <= 100; n++) if (!Progress.isDone(n)) return n;
      return Math.min(100, Progress.data.level || 1);
    },
    chapterDone(c) { let n = 0; for (let i = (c - 1) * 10 + 1; i <= c * 10; i++) if (Progress.isDone(i)) n++; return n; },
  });

  /* ---------- 事件总线 ---------- */
  const listeners = {};
  G.on = function (evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); return () => G.off(evt, fn); };
  G.off = function (evt, fn) { const a = listeners[evt] || []; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); };
  G.emit = function (evt, payload) { (listeners[evt] || []).slice().forEach(fn => { try { fn(payload); } catch (e) { console.warn('listener ' + evt, e); } }); };

  /* ---------- 对局 ---------- */
  const S = (SK.Session = {
    level: 0, data: null, st: null, notes: [], selected: -1, digit: 0,
    undo: [], redo: [], mistakes: 0, hints: 0, aiSteps: 0, hintLog: [],
    elapsed: 0, startedAt: 0, paused: false, won: false, noteMode: false, review: null,
  });
  G.s = S;

  S.cellNotes = function (i) { return S.notes[i] || (S.notes[i] = []); };

  G.load = function (level, opts) {
    opts = opts || {};
    level = Math.max(1, Math.min(100, level | 0));
    const cached = !opts.fresh ? SK.Levels.cached(level) : null;
    const data = cached || SK.Levels.get(level);
    S.level = level;
    S.data = data;
    S.st = SK.Board.create(data.puzzle);
    S.st.selected = -1;
    S.notes = new Array(81);
    S.hintLog = [];
    S.undo = []; S.redo = [];
    S.mistakes = 0; S.hints = 0; S.aiSteps = 0;
    S.elapsed = 0; S.startedAt = Date.now(); S.paused = false; S.won = false; S.review = null;
    S.selected = opts.select != null ? opts.select : -1;
    S.digit = 0;
    Progress.data.level = level;
    Progress.save();
    G.save();
    G.emit('load', S);
    return S;
  };

  G.resumeSaved = function () {
    const saved = Store.get('session', null);
    if (!saved || !saved.puzzle) return false;
    const data = SK.Levels.cached(saved.level) || SK.Levels.get(saved.level);
    S.level = saved.level; S.data = data;
    S.st = SK.Board.create(data.puzzle);
    for (let i = 0; i < 81; i++) { const d = SK.digitAt(saved.digits, i); if (d && !S.st.given[i]) S.st.digits[i] = d; }
    SK.Board.recompute(S.st);
    S.notes = saved.notes || new Array(81);
    S.selected = saved.selected != null ? saved.selected : -1;
    S.digit = saved.digit || 0;
    S.mistakes = saved.mistakes || 0; S.hints = saved.hints || 0; S.aiSteps = saved.aiSteps || 0;
    S.undo = saved.undo || []; S.redo = saved.redo || []; S.hintLog = saved.hintLog || [];
    S.elapsed = saved.elapsed || 0;
    S.startedAt = Date.now() - S.elapsed * 1000;
    S.paused = !!saved.paused; S.won = !!saved.won; S.review = null;
    G.emit('load', S);
    return true;
  };

  G.save = function () {
    if (!S.st) return;
    Store.set('session', {
      level: S.level, puzzle: S.data.puzzle, digits: SK.stringify(S.st.digits), notes: S.notes,
      selected: S.selected, digit: S.digit, mistakes: S.mistakes, hints: S.hints, aiSteps: S.aiSteps,
      undo: S.undo.slice(-60), redo: S.redo.slice(-20), hintLog: S.hintLog.slice(-20),
      elapsed: G.elapsed(), paused: S.paused, won: S.won, ts: Date.now(),
    });
  };

  G.elapsed = function () {
    if (!S.startedAt) return S.elapsed;
    if (S.paused || S.won) return S.elapsed;
    return S.elapsed + (Date.now() - S.startedAt) / 1000;
  };
  G.pause = function () { if (S.paused || S.won) return; S.elapsed = G.elapsed(); S.paused = true; G.save(); G.emit('pause', S); };
  G.unpause = function () { if (!S.paused) return; S.startedAt = Date.now(); S.paused = false; G.emit('resume', S); };

  G.select = function (i) {
    if (!S.st || S.won) return;
    S.selected = i;
    S.st.selected = i;
    G.emit('select', i);
  };

  function snapshot(i) {
    return { i: i, d: S.st.digits[i], notes: (S.notes[i] || []).slice() };
  }
  function restore(snap) {
    SK.Board.forceSet(S.st, snap.i, snap.d);
    S.notes[snap.i] = snap.notes.slice();
  }

  G.input = function (d) {
    if (!S.st || S.won || S.selected < 0) return { ok: false, reason: 'no-cell' };
    if (S.st.given[S.selected]) return { ok: false, reason: 'given' };
    const i = S.selected;
    if (S.noteMode) {
      S.undo.push(snapshot(i)); S.redo.length = 0;
      const list = S.cellNotes(i);
      if (S.st.digits[i]) SK.Board.forceSet(S.st, i, 0);
      const at = list.indexOf(d);
      if (at >= 0) list.splice(at, 1); else list.push(d);
      G.emit('cell', i); G.emit('change', S);
      return { ok: true, note: true };
    }
    if (S.st.digits[i] === d) return { ok: false, reason: 'same' };
    const correct = SK.digitAt(S.data.solution, i) === d;
    if (Settings.errorMode === 'strict' && !correct) {
      S.undo.push(snapshot(i)); S.redo.length = 0;
      S.mistakes++;
      SK.Board.forceSet(S.st, i, d);
      G.emit('wrong', { i: i, d: d });
      G.emit('cell', i); G.emit('change', S);
      return { ok: false, reason: 'wrong-rejected', shown: true };
    }
    S.undo.push(snapshot(i)); S.redo.length = 0;
    if (!correct) S.mistakes++;
    SK.Board.forceSet(S.st, i, d);
    if (correct && Settings.noteAutoClear) S.notes[i] = [];
    if (correct && !S.won && Settings.digitGlow) G.emit('good', { i: i, d: d });
    if (!correct) G.emit('wrong', { i: i, d: d });
    /* 连填：自动跳到下一个空格 */
    if (Settings.keepFlow && correct) { const nx = G.nextEmpty(i); if (nx >= 0) { S.selected = nx; S.st.selected = nx; } }
    else if (Settings.keepFlow && !correct) { /* 停在原地便于修正 */ }
    G.emit('cell', i); G.emit('change', S);
    G.checkComplete();
    G.save();
    return { ok: true, correct: correct };
  };

  G.nextEmpty = function (from) {
    for (let k = 1; k <= 81; k++) { const i = (from + k) % 81; if (!S.st.given[i] && !S.st.digits[i]) return i; }
    return -1;
  };

  G.erase = function () {
    const i = S.selected;
    if (!S.st || i < 0 || S.st.given[i]) return false;
    if (!S.st.digits[i] && !(S.notes[i] || []).length) return false;
    S.undo.push(snapshot(i)); S.redo.length = 0;
    SK.Board.forceSet(S.st, i, 0);
    S.notes[i] = [];
    G.emit('cell', i); G.emit('change', S); G.save();
    return true;
  };

  G.undoStep = function () {
    if (!S.undo.length) return false;
    const cur = snapshot(S.undo[S.undo.length - 1].i);
    const snap = S.undo.pop();
    S.redo.push(cur);
    restore(snap);
    S.selected = snap.i; S.st.selected = snap.i;
    G.emit('cell', snap.i); G.emit('change', S); G.save();
    return true;
  };
  G.redoStep = function () {
    if (!S.redo.length) return false;
    const snap = S.redo.pop();
    const cur = snapshot(snap.i);
    S.undo.push(cur);
    restore(snap);
    S.selected = snap.i; S.st.selected = snap.i;
    G.emit('cell', snap.i); G.emit('change', S); G.save();
    return true;
  };
  G.toggleNote = function () { S.noteMode = !S.noteMode; G.emit('note-mode', S.noteMode); return S.noteMode; };

  /* ---------- 提示 / AI ---------- */
  G.askHint = function (tier) {
    if (!S.st) return null;
    const hint = SK.AI.hint(S.st, S.data.solution, tier);
    if (hint.action && hint.action.type === 'place' && !S.won) {
      S.undo.push(snapshot(hint.action.i)); S.redo.length = 0;
      SK.Board.forceSet(S.st, hint.action.i, hint.action.d);
      if (Settings.noteAutoClear) S.notes[hint.action.i] = [];
      S.selected = hint.action.i; S.st.selected = hint.action.i;
      G.emit('cell', hint.action.i);
      G.checkComplete();
    }
    S.hints++;
    Progress.data.hints = (Progress.data.hints || 0) + 1; Progress.save();
    S.hintLog.push({ tier: tier, title: hint.title, text: hint.text, at: Math.round(G.elapsed()) });
    G.emit('hint', hint); G.emit('change', S); G.save();
    return hint;
  };

  G.analyze = function () { return SK.AI.analyze(S.st, S.data.solution, S.data); };

  /* AI 接管：按解法路径逐步作答，返回步数 */
  G.aiTakeover = function (maxSteps) {
    if (!S.st || S.won) return { steps: [], done: false };
    const path = SK.AI.plan(S.st, { maxSteps: maxSteps || 400 });
    return { steps: path, done: false };
  };
  G.aiApplyStep = function (step) {
    if (!step) return false;
    if (step.place) {
      const i = step.place.i, d = step.place.d;
      if (S.st.given[i]) return false;
      S.undo.push(snapshot(i)); S.redo.length = 0;
      SK.Board.forceSet(S.st, i, d);
      S.notes[i] = [];
      S.selected = i; S.st.selected = i;
      S.aiSteps++;
      Progress.data.ai = (Progress.data.ai || 0) + 1;
      G.emit('cell', i); G.emit('ai-step', step);
      G.checkComplete();
      G.save();
      return true;
    }
    for (const e of step.elim || []) SK.Board.eliminate(S.st, e.i, e.d);
    S.aiSteps++;
    G.emit('ai-step', step); G.emit('change', S);
    return true;
  };

  G.revealAll = function () {
    if (!S.st) return;
    for (let i = 0; i < 81; i++) if (!S.st.digits[i]) { S.undo.push(snapshot(i)); SK.Board.forceSet(S.st, i, SK.digitAt(S.data.solution, i)); }
    G.checkComplete(true);
    G.save();
  };

  /* ---------- 结算 ---------- */
  G.checkComplete = function (force) {
    if (!S.st || S.won) return false;
    let full = true;
    for (let i = 0; i < 81; i++) if (!S.st.digits[i]) { full = false; break; }
    if (!full) return false;
    if (SK.Board.conflicts(S.st).length && !force) return false;
    let correct = true;
    for (let i = 0; i < 81; i++) if (S.st.digits[i] !== SK.digitAt(S.data.solution, i)) { correct = false; break; }
    if (!correct && !force) { G.emit('nearly', S); return false; }
    S.won = true;
    S.elapsed = G.elapsed();
    const res = G.result();
    const p = Progress.data;
    const firstTime = !p.done[S.level];
    p.done[S.level] = 1;
    p.stars[S.level] = Math.max(p.stars[S.level] || 0, res.stars);
    if (!p.best[S.level] || p.best[S.level].time > res.time) p.best[S.level] = { time: res.time, score: res.score, mistakes: res.mistakes, hints: res.hints };
    p.time = (p.time || 0) + Math.round(res.time);
    p.level = Math.min(100, S.level + (firstTime ? 1 : 0));
    Progress.save();
    Store.del('session');
    G.emit('win', res);
    return true;
  };

  G.result = function () {
    const d = S.data, sec = Math.round(G.elapsed());
    const par = Math.max(40, d.clues * 2.4 + (d.score || 40) * 0.35);
    const timeScore = Math.max(0, Math.round(1000 * Math.min(1, par / Math.max(par, sec))));
    const base = 400 + Math.round(Math.min(900, (d.score || 40) * 1.1));
    const penalty = S.mistakes * 45 + S.hints * 28 + S.aiSteps * 18;
    const score = Math.max(50, base + timeScore - penalty);
    let stars = 1;
    if (S.mistakes === 0 && S.hints <= 1 && S.aiSteps === 0) stars = 3;
    else if (S.mistakes <= 1 && S.hints <= 3) stars = 2;
    return {
      level: S.level, time: sec, score: score, stars: stars, mistakes: S.mistakes, hints: S.hints,
      aiSteps: S.aiSteps, clues: d.clues, grade: d.grade || SK.Solver.gradeOf(d.score || 0).name,
      score42: d.score, chapter: SK.Levels.chapterOf(S.level).name, par: Math.round(par), pure: stars === 3,
    };
  };

  /* ---------- 生涯统计 ---------- */
  G.career = function () {
    const p = Progress.data;
    const techUse = {};
    let bestScore = 0, hardest = 0;
    for (let n = 1; n <= 100; n++) {
      const d = SK.Levels.cached(n);
      if (!d) continue;
      bestScore = Math.max(bestScore, d.score || 0);
      if (p.done[n]) { hardest = Math.max(hardest, d.score || 0); for (const k in (d.counts || {})) techUse[k] = (techUse[k] || 0) + d.counts[k]; }
    }
    const stars = Object.keys(p.stars || {}).reduce((s, k) => s + p.stars[k], 0);
    return {
      done: Progress.doneCount(), stars: stars, maxStars: 300, time: p.time || 0, hints: p.hints || 0, ai: p.ai || 0,
      techUse: techUse, bestScore: bestScore, hardest: hardest,
      chapters: SK.Levels.CHAPTERS.map(c => ({ c: c, done: Progress.chapterDone(c.id) })),
      perfect: Object.keys(p.done).filter(n => (p.stars[n] || 0) === 3).length,
    };
  };

  G.badges = function () {
    const c = G.career(), p = Progress.data, out = [];
    const add = (id, name, desc, got) => out.push({ id: id, name: name, desc: desc, got: !!got });
    add('first', '初登天阶', '通过第 1 关', p.done[1]);
    add('pure10', '心算起手', '前十关全三星', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].every(n => (p.stars[n] || 0) === 3));
    add('nohint', '拒绝外援', '零提示通过任意一章末关', [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].some(n => p.done[n] && (p.best[n] || {}).hints === 0));
    add('half', '半途不歇', '通过 50 关', c.done >= 50);
    add('master', '天阶登顶', '通过第 100 关', p.done[100]);
    add('speed', '快手', '单关用时低于参考值一半', Object.keys(p.best).some(n => p.best[n].time < 60));
    add('ai-friend', '与 AI 同行', '使用 AI 大师 20 次以上', (p.ai || 0) + (p.hints || 0) >= 20);
    add('allstar', '满天星', '累计 240 星以上', c.stars >= 240);
    return out;
  };

  G.wipe = function (what) {
    if (what === 'progress') { Progress.data = { done: {}, best: {}, stars: {}, hints: 0, ai: 0, time: 0, level: 1, streak: 0, badges: {} }; Progress.save(); }
    if (what === 'levels') SK.Levels.clearCache();
    if (what === 'session') Store.del('session');
    if (what === 'settings') Settings.reset();
    G.emit('wipe', what);
  };
})();
