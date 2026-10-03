/* 渲染层：棋盘 / 数字盘 / HUD / 光影与动效 */
(function () {
  const SK = window.SK, UI = (SK.UI = {});
  const S = SK.Session;

  UI.el = function (tag, cls, html) { const e = document.createElement(tag || 'div'); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  UI.$ = sel => document.querySelector(sel);
  UI.$$ = sel => Array.from(document.querySelectorAll(sel));

  /* ---------- 视口变量 ---------- */
  UI.measure = function () {
    document.documentElement.style.setProperty('--vh', (window.innerHeight / 100) + 'px');
  };

  /* ---------- 棋盘 ---------- */
  UI.buildBoard = function () {
    const board = UI.$('#board');
    board.innerHTML = '';
    UI.cells = [];
    for (let b = 0; b < 9; b++) {
      const box = UI.el('div', 'box');
      box.dataset.box = b;
      for (let k = 0; k < 9; k++) {
        const i = SK.boxCell(b, k);
        const cell = UI.el('div', 'cell');
        cell.dataset.i = i;
        cell.setAttribute('role', 'gridcell');
        cell.innerHTML = '<span class="cands">' + '<span></span>'.repeat(9) + '</span><b class="val"></b>';
        box.appendChild(cell);
        UI.cells[i] = cell;
      }
      board.appendChild(box);
    }
    board.addEventListener('click', e => {
      const c = e.target.closest('.cell');
      if (!c) return;
      SK.Game.select(+c.dataset.i);
      SK.UI.sound('tap');
    });
  };

  UI.cellClasses = function (i) {
    const st = S.st, cell = UI.cells[i];
    const d = st.digits[i];
    const sel = S.selected;
    let cls = 'cell';
    if (st.given[i]) cls += ' given';
    else if (d) cls += ' user';
    if (i === sel) cls += ' sel';
    else if (sel >= 0 && (SK.rowOf(i) === SK.rowOf(sel) || SK.colOf(i) === SK.colOf(sel) || SK.boxOf(i) === SK.boxOf(sel))) cls += ' peer';
    if (sel >= 0 && st.digits[sel] && d === st.digits[sel] && i !== sel) cls += ' same';
    if (UI.tipCells.indexOf(i) >= 0) cls += ' tip';
    if (UI.suggestCells.indexOf(i) >= 0) cls += ' suggest';
    if (UI.badCells.indexOf(i) >= 0) cls += ' bad';
    if (UI.thinCells.indexOf(i) >= 0) cls += ' thint';
    return cls;
  };

  UI.renderCell = function (i) {
    const st = S.st, cell = UI.cells[i];
    if (!cell) return;
    const next = UI.cellClasses(i);
    if (cell.className !== next) cell.className = next;
    const d = st.digits[i];
    const val = cell.querySelector('.val');
    if (val.textContent !== (d ? String(d) : '')) val.textContent = d ? String(d) : '';
    /* 候选 / 笔记 */
    const cand = cell.querySelector('.cands');
    const show = [];
    if (!d) {
      const notes = S.notes[i] || [];
      if (notes.length) {
        const set = {};
        notes.forEach(n => set[n] = 1);
        for (let n = 1; n <= 9; n++) if (set[n]) show.push({ d: n, kind: 'note' });
      } else if (UI.candMode() && (SK.POP[st.masks[i]] <= 4 || UI.candMode() === 'always' || i === S.selected)) {
        for (let n = 1; n <= 9; n++) if (st.masks[i] & SK.BIT[n]) show.push({ d: n, kind: 'cand' });
      }
    }
    const spans = cand.children;
    for (let k = 0; k < 9; k++) {
      const slot = k + 1;
      const hit = show.find(x => x.d === slot);
      const sp = spans[k];
      const txt = hit ? String(slot) : '';
      if (sp.textContent !== txt) sp.textContent = txt;
      const cn = hit ? (hit.kind === 'note' ? '' : 'candnum') : '';
      const sel2 = hit && S.digit && S.digit === slot ? ' hit' : '';
      const want = cn + sel2;
      if (sp.className !== want.trim()) sp.className = want.trim();
    }
  };

  UI.candMode = function () { return SK.Settings.candidateHint; };

  UI.renderAll = function () {
    if (!S.st) return;
    for (let i = 0; i < 81; i++) UI.renderCell(i);
    UI.renderNumpad();
    UI.renderHud();
    UI.followSelectionLight();
  };

  UI.refreshHighlights = function () {
    if (!S.st) return;
    for (let i = 0; i < 81; i++) {
      const cell = UI.cells[i], next = UI.cellClasses(i);
      if (cell.className !== next) cell.className = next;
    }
  };

  /* ---------- 标记集合（提示/错误/建议） ---------- */
  UI.tipCells = []; UI.suggestCells = []; UI.badCells = []; UI.thinCells = [];
  UI._timers = {};
  UI.mark = function (kind, list, ms) {
    UI[kind] = (list || []).slice();
    clearTimeout(UI._timers[kind]);
    UI.refreshHighlights();
    for (const i of UI[kind]) UI.renderCell(i);
    if (ms !== false) {
      UI._timers[kind] = setTimeout(() => {
        UI[kind] = [];
        UI.refreshHighlights();
        if (kind === 'tipCells') { UI.renderNumpad(); }
      }, ms || 4200);
    }
  };
  UI.clearMarks = function () {
    Object.keys(UI._timers).forEach(k => clearTimeout(UI._timers[k]));
    UI._timers = {};
    UI.tipCells = []; UI.suggestCells = []; UI.badCells = []; UI.thinCells = [];
    UI.refreshHighlights();
  };

  /* ---------- 数字键盘 ---------- */
  UI.buildNumpad = function () {
    const pad = UI.$('#numpad');
    pad.innerHTML = '';
    UI.keys = [];
    for (let d = 1; d <= 9; d++) {
      const k = UI.el('button', 'key');
      k.dataset.d = d;
      k.type = 'button';
      k.innerHTML = '<span class="sweep"></span><span class="key-ring"></span><span class="n">' + d + '</span><span class="left">9</span>';
      k.addEventListener('click', () => UI.onKey(d));
      pad.appendChild(k);
      UI.keys[d] = k;
    }
    const foot = UI.el('div', 'numpad-foot');
    foot.innerHTML =
      '<span class="switch" data-toggle="keepFlow"><i></i>连填</span>' +
      '<span class="switch" data-toggle="noteAutoClear"><i></i>对则清笔记</span>' +
      '<span class="switch" data-toggle="candidateHint" data-cycle="off,auto,always"><i></i>候选<i class="mode" style="font-style:normal"></i></span>';
    pad.appendChild(foot);
    foot.addEventListener('click', e => {
      const sw = e.target.closest('.switch');
      if (!sw) return;
      const key = sw.dataset.toggle;
      if (sw.dataset.cycle) {
        const modes = sw.dataset.cycle.split(',');
        const at = modes.indexOf(SK.Settings[key]);
        SK.Settings.set(key, modes[(at + 1) % modes.length]);
      } else SK.Settings.set(key, !SK.Settings[key]);
      UI.syncSwitches();
      UI.renderAll();
      UI.toast({ title: '已切换', text: SK.UI.switchLabel(key, SK.Settings[key]) });
    });
    SK.Game.on('settings', () => UI.syncSwitches());
  };
  UI.switchLabel = function (k, v) {
    if (k === 'candidateHint') return '候选显示：' + { off: '关闭', auto: '智能', always: '全部' }[v];
    return (k === 'keepFlow' ? '连填' : '填对即清笔记') + '：' + (v ? '开' : '关');
  };
  UI.syncSwitches = function () {
    UI.$$('.switch').forEach(sw => {
      const k = sw.dataset.toggle;
      if (!k || sw.dataset.cycle) return;
      sw.classList.toggle('on', !!SK.Settings[k]);
    });
    UI.$$('.switch[data-cycle]').forEach(sw => {
      const k = sw.dataset.toggle;
      sw.classList.toggle('on', SK.Settings[k] !== 'off');
      const m = sw.querySelector('.mode');
      if (m) m.textContent = ' · ' + { off: '关', auto: '智', always: '全' }[SK.Settings[k]];
    });
  };

  UI.onKey = function (d) {
    const r = SK.Game.input(d);
    if (r.reason === 'no-cell') { UI.toast({ title: '先选一格', text: '点棋盘里任意空格，再按数字。', kind: 'warn' }); return; }
    if (r.reason === 'given') { UI.toast({ title: '题目给定的数字', text: '已知数不能改动。', kind: 'warn' }); return; }
    if (r.ok) {
      UI.cells[S.selected === undefined ? 0 : 0];
      UI.keys[d].classList.remove('flash'); void UI.keys[d].offsetWidth; UI.keys[d].classList.add('flash');
      UI.sound(r.note ? 'note' : r.correct ? 'place' : 'bad');
      const popAt = SK.Session.selected;
      UI.pop(popAt);
    }
    if (r.reason === 'wrong-rejected') { UI.shake(SK.Session.selected); UI.sound('bad'); }
  };

  UI.pop = function (i) {
    const c = UI.cells[i]; if (!c) return;
    c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop');
    setTimeout(() => c.classList.remove('pop'), 360);
  };
  UI.shake = function (i) {
    const c = UI.cells[i]; if (!c) return;
    c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake');
    setTimeout(() => c.classList.remove('shake'), 340);
  };
  UI.vanish = function (i, after) {
    const c = UI.cells[i]; if (!c) { after && after(); return; }
    c.classList.add('vanish');
    setTimeout(() => { c.classList.remove('vanish'); after && after(); }, 240);
  };

  UI.renderNumpad = function () {
    if (!S.st) return;
    const rem = SK.Board.remaining(S.st);
    for (let d = 1; d <= 9; d++) {
      const k = UI.keys[d]; if (!k) continue;
      const left = rem[d];
      k.querySelector('.left').textContent = left > 0 ? '剩 ' + left : '已填满';
      k.classList.toggle('spent', left <= 0);
      k.style.setProperty('--fill', String(left / 9));
      k.style.setProperty('--p', String(Math.round((1 - left / 9) * 100)));
      const isHint = UI.hintDigit === d;
      k.classList.toggle('hintkey', isHint);
      if (S.digit === d) k.classList.add('on'); else k.classList.remove('on');
    }
  };

  /* ---------- HUD ---------- */
  UI.renderStrip = function () {
    const box = UI.$('#ai-strip-text');
    if (!box || !S.st || !S.data) return;
    const now = Date.now(), left = SK.Board.progress(S.st).left;
    const key = S.level + ':' + left;
    if (key === UI._stripKey && now - (UI._stripAt || 0) < 2500) return;
    UI._stripKey = key; UI._stripAt = now;
    let txt;
    if (!left) txt = '已填满且无冲突，这一关可以交了。';
    else {
      const rep = SK.AI.analyze(S.st, S.data.solution, S.data);
      if (rep.deadlock.contradiction) txt = '盘面已矛盾：有重复或零候选格，先撤销。';
      else if (rep.wrong.length) txt = '有 ' + rep.wrong.length + ' 格与唯一解不符，越晚发现代价越大。';
      else if (rep.singleCandidates) txt = '白送 ' + rep.singleCandidates + ' 格：只剩唯一候选，先收掉最划算。';
      else if (rep.digitPressure.length) { const d = rep.digitPressure[0]; txt = '盯住数字 ' + d.d + '：还剩 ' + d.left + ' 个，只有 ' + d.slots + ' 个落点。'; }
      else txt = '需要「' + rep.needTierName + '」才能继续推进。';
    }
    if (box.textContent !== txt) { box.textContent = txt; const s = UI.$('#ai-strip'); s.classList.remove('flash'); void s.offsetWidth; s.classList.add('flash'); }
  };

  UI.renderHud = function () {
    if (!S.data) return;
    const meta = SK.Levels.meta(S.level), d = S.data;
    UI.$('#hud-num').textContent = 'Lv ' + S.level;
    UI.$('#hud-chapter').textContent = meta.chapterName;
    UI.$('#hud-grade').textContent = d.grade || meta.band;
    const grade = SK.Solver.gradeOf(d.score || 0);
    const bars = UI.$$('#hud-diff i');
    bars.forEach((b, i) => b.classList.toggle('on', i < Math.min(5, Math.ceil(grade.stars / 1.8))));
    const prog = SK.Board.progress(S.st);
    UI.$('#hud-progress-fill').style.width = Math.round(prog.filled / 81 * 100) + '%';
    UI.$('#hud-timer').textContent = SK.fmtTime(SK.Game.elapsed());
    UI.$('#hud-mistake').textContent = '错 ' + S.mistakes + ' · 提示 ' + S.hints;
    UI.renderStrip();
  };

  /* ---------- 工具条 / 标签栏 ---------- */
  const TOOLS = [
    { act: 'undo', icon: 'i-undo', name: '撤销' },
    { act: 'redo', icon: 'i-redo', name: '重做' },
    { act: 'erase', icon: 'i-erase', name: '擦除' },
    { act: 'note', icon: 'i-pencil', name: '笔记' },
    { act: 'hint', icon: 'i-bulb', name: '提示', sheet: 'sheet-ai' },
    { act: 'ai', icon: 'i-ai', name: 'AI 大师', sheet: 'sheet-ai' },
  ];
  UI.buildTools = function () {
    const strip = UI.$('#toolstrip');
    strip.innerHTML = '';
    TOOLS.forEach(t => {
      const b = UI.el('button', 'tool');
      b.dataset.act = t.act;
      b.innerHTML = '<svg class="ic"><use href="#' + t.icon + '"></use></svg>' + t.name;
      b.addEventListener('click', () => SK.App.tool(t.act, b));
      strip.appendChild(b);
    });
    const tabs = [
      { sheet: 'sheet-ai', icon: 'i-ai', name: 'AI 大师' },
      { sheet: 'sheet-tools', icon: 'i-layers', name: '工具' },
      { sheet: 'sheet-codex', icon: 'i-book', name: '技巧' },
      { sheet: 'sheet-stats', icon: 'i-chart', name: '生涯' },
      { sheet: 'sheet-settings', icon: 'i-sliders', name: '设置' },
    ];
    const bar = UI.$('#tabbar');
    bar.innerHTML = '';
    tabs.forEach(t => {
      const b = UI.el('button', 'tab');
      b.dataset.sheet = t.sheet;
      b.innerHTML = '<svg class="ic"><use href="#' + t.icon + '"></use></svg><span>' + t.name + '</span>';
      b.addEventListener('click', () => {
        SK.Menus.openSheet(t.sheet);
        UI.$$('#tabbar .tab').forEach(x => x.classList.toggle('on', x === b));
      });
      bar.appendChild(b);
    });
  };
  UI.syncTools = function () {
    const map = { undo: S.undo.length > 0, redo: S.redo.length > 0, erase: S.selected >= 0 && !S.st.given[S.selected] && (S.st.digits[S.selected] || (S.notes[S.selected] || []).length) };
    UI.$$('#toolstrip .tool').forEach(b => {
      const act = b.dataset.act;
      if (act in map) b.classList.toggle('disabled', !map[act]);
      if (act === 'note') b.classList.toggle('on', S.noteMode);
    });
    const badge = UI.$('#tabbar .tab[data-sheet="sheet-ai"] em');
    if (badge) badge.textContent = String(S.hints + S.aiSteps);
  };

  /* ---------- 光影 ---------- */
  UI.spotTo = function (x, y) {
    const spot = UI.$('#spot');
    if (!spot) return;
    spot.style.setProperty('--sx', x + 'px');
    spot.style.setProperty('--sy', y + 'px');
  };
  UI.followSelectionLight = function () {
    const frame = UI.$('.board-frame');
    if (!frame) return;
    const fr = frame.getBoundingClientRect();
    const c = S.selected >= 0 ? UI.cells[S.selected] : null;
    if (!c) {
      frame.style.setProperty('--sheen-angle', '155deg');
      UI.spotTo(fr.left + fr.width / 2, fr.top + fr.height / 2);
      return;
    }
    const r = c.getBoundingClientRect();
    const cx = r.left + r.width / 2 - fr.left, cy = r.top + r.height / 2 - fr.top;
    const ang = Math.atan2(cy - fr.height / 2, cx - fr.width / 2) * 180 / Math.PI + 90;
    frame.style.setProperty('--sheen-angle', Math.round(ang) + 'deg');
    UI.spotTo(r.left + r.width / 2, r.top + r.height / 2);
  };

  UI.flash = function () { const f = UI.$('#board-flash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); };

  /* ---------- 提示条 / 加载 / 弹窗 ---------- */
  UI.toast = function (o) {
    const wrap = UI.$('#toasts');
    while (wrap.children.length >= 2) wrap.lastChild.remove();
    const long = (o.text || '').length > 34;
    const t = UI.el('div', 'toast glass ' + (o.kind || '') + (long ? ' long' : ''));
    const icon = o.kind === 'ai' ? 'i-ai' : (o.kind === 'warn' || o.kind === 'bad') ? 'i-alert' : o.kind === 'good' ? 'i-check' : 'i-bulb';
    t.innerHTML = '<svg class="ic"><use href="#' + icon + '"></use></svg><div class="tx"><b></b><small></small></div>';
    t.querySelector('b').textContent = o.title || '';
    t.querySelector('small').textContent = o.text || '';
    wrap.appendChild(t);
    const ms = o.ms || (long ? 2600 : 1500);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 260); }, ms);
    return t;
  };
  UI.loading = function (on, title, sub) {
    const l = UI.$('#loading');
    if (title) UI.$('#loading-title').textContent = title;
    if (sub) UI.$('#loading-sub').textContent = sub;
    l.classList.toggle('on', !!on);
  };
  UI.confirm = function (title, text) {
    return new Promise(res => {
      const m = UI.$('#modal');
      UI.$('#modal-title').textContent = title;
      UI.$('#modal-text').textContent = text;
      m.classList.add('on');
      const done = v => { m.classList.remove('on'); UI.$('#modal-ok').onclick = null; UI.$('#modal-cancel').onclick = null; res(v); };
      UI.$('#modal-ok').onclick = () => done(true);
      UI.$('#modal-cancel').onclick = () => done(false);
    });
  };

  /* ---------- 音效（WebAudio 合成，无外部资源） ---------- */
  UI.sound = function (kind) {
    if (!SK.Settings.sound) return;
    try {
      UI.ac = UI.ac || new (window.AudioContext || window.webkitAudioContext)();
      const ac = UI.ac, t = ac.currentTime;
      const notes = { tap: [520, .05], place: [660, .1], bad: [180, .16], note: [880, .05], win: [523, .5], star: [1046, .18], ai: [740, .12] }[kind] || [520, .05];
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = kind === 'bad' ? 'sawtooth' : 'triangle';
      o.frequency.setValueAtTime(notes[0], t);
      if (kind === 'win') o.frequency.setValueAtTime(notes[0] * 1.5, t + .18);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(kind === 'bad' ? .1 : .06, t + .012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + notes[1]);
      o.connect(g).connect(ac.destination);
      o.start(t); o.stop(t + notes[1] + .02);
    } catch (e) { }
  };
  UI.haptic = function (ms) { if (SK.Settings.haptics && navigator.vibrate) try { navigator.vibrate(ms || 8); } catch (e) { } };

  /* ---------- AI 逐步作答动画 ---------- */
  UI.playPath = async function (path, opts) {
    opts = opts || {};
    const speed = opts.speed == null ? 420 : opts.speed;
    UI.running = true;
    SK.App.setBusy(true);
    for (let k = 0; k < path.length; k++) {
      if (!UI.running) break;
      const step = path[k];
      if (step.elim && step.elim.length) {
        if (opts.explain) UI.toast({ kind: 'ai', title: step.name, text: step.why, ms: Math.max(900, speed) });
        for (const e of step.elim) { SK.Board.eliminate(S.st, e.i, e.d); UI.renderCell(e.i); }
        UI.mark('thinCells', step.elim.map(e => e.i), speed);
        UI.sound('ai');
      }
      if (step.place) {
        SK.Game.aiApplyStep(step);
        UI.renderCell(step.place.i);
        UI.pop(step.place.i);
        UI.sound('place'); UI.haptic(6);
        if (opts.explain && k < (opts.explainMax || 6)) UI.toast({ kind: 'ai', title: step.name + ' → ' + SK.Tech.cellName(step.place.i), text: step.why, ms: Math.max(1000, speed) });
      }
      UI.renderNumpad(); UI.renderHud(); UI.syncTools();
      await new Promise(r => setTimeout(r, speed));
    }
    UI.running = false;
    UI.thinCells = [];
    SK.App.setBusy(false);
    UI.renderAll();
    return !UI.running;
  };
  UI.stopPlay = function () { UI.running = false; };
})();
