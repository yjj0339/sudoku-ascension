/* 菜单层：屏幕路由 + 抽屉栈（一级/二级/三级）+ 关卡表 + AI 面板 + 设置 + 图鉴 + 生涯 */
(function () {
  const SK = window.SK, M = (SK.Menus = {});
  const S = SK.Session, U = SK.UI;
  const el = U.el;

  /* ---------- 屏幕路由 ---------- */
  M.go = function (name) {
    document.body.dataset.screen = name;
    U.$$('.screen').forEach(s => s.classList.remove('active'));
    const cur = U.$('#screen-' + name);
    if (cur) cur.classList.add('active');
    if (name === 'levels') M.renderLevels();
    if (name === 'title') M.renderTitle();
    M.closeSheet();
    SK.App.screen = name;
  };

  /* ---------- 抽屉栈（多级） ---------- */
  M.stack = [];
  M.openSheet = function (id, opts) {
    opts = opts || {};
    const sheet = U.$('#' + id);
    if (!sheet) return;
    if (M.stack.indexOf(id) >= 0) { while (M.stack[M.stack.length - 1] !== id) M.closeTop(); if (!opts.reopen) return; }
    sheet.classList.add('on');
    sheet.dataset.openBack = M.stack.length ? '1' : '0';
    M.stack.push(id);
    U.$('#scrim').classList.add('on');
    const prep = M.PREP[id];
    if (prep) prep(opts);
    const bar = sheet.querySelector('.sheet-bar');
    if (bar) bar.addEventListener('touchstart', M.grabStart, { passive: true });
    if (bar) bar.addEventListener('touchmove', M.grabMove, { passive: false });
    if (bar) bar.addEventListener('touchend', M.grabEnd);
  };
  M.closeTop = function () {
    const id = M.stack.pop();
    if (id) U.$('#' + id).classList.remove('on');
    if (!M.stack.length) U.$('#scrim').classList.remove('on');
    else { const prev = U.$('#' + M.stack[M.stack.length - 1]); if (prev) prev.dataset.openBack = M.stack.length > 1 ? '1' : '0'; }
    return id;
  };
  M.closeSheet = function () {
    while (M.stack.length) M.closeTop();
    M.closeSub();
    U.$('#scrim').classList.remove('on');
    U.$$('#tabbar .tab').forEach(t => t.classList.remove('on'));
  };
  M.sheetBack = function () {
    const id = M.closeTop();
    if (!M.stack.length) U.$('#scrim').classList.remove('on');
    return id;
  };
  /* 下拉手势关闭 */
  let grab = null;
  M.grabStart = e => { grab = { y: e.touches[0].clientY, moved: 0, el: e.target.closest('.sheet, .subsheet') }; };
  M.grabMove = e => {
    if (!grab || !grab.el) return;
    grab.moved = e.touches[0].clientY - grab.y;
    if (grab.moved > 0) { grab.el.style.transform = 'translateY(' + grab.moved + 'px)'; if (grab.moved > 12) e.preventDefault(); }
  };
  M.grabEnd = () => {
    if (!grab || !grab.el) return;
    const g = grab; grab = null; g.el.style.transform = '';
    if (g.moved > 84) {
      if (g.el.classList.contains('subsheet')) M.closeSub();
      else if (g.el.dataset && g.el.id) { U.$('#' + g.el.id).classList.remove('on'); M.stack = M.stack.filter(x => x !== g.el.id); if (!M.stack.length) U.$('#scrim').classList.remove('on'); }
    }
  };

  /* ---------- 通用二级浮层 ---------- */
  M.openSub = function (title, sub, node, opts) {
    opts = opts || {};
    U.$('#subsheet-title').textContent = title;
    U.$('#subsheet-sub').textContent = sub || '';
    const body = U.$('#subsheet-body');
    body.innerHTML = '';
    body.appendChild(node);
    U.$('#subsheet').classList.add('on');
    if (!M.stack.length) U.$('#scrim').classList.add('on');
    M.subOpen = true;
  };
  M.closeSub = function () { U.$('#subsheet').classList.remove('on'); U.$('#subsheet').style.transform = ''; M.subOpen = false; if (!M.stack.length) U.$('#scrim').classList.remove('on'); };

  /* ---------- 小组件 ---------- */
  function row(title, desc, tail, onClick, cls) {
    const r = el('div', 'row' + (cls ? ' ' + cls : ''));
    r.innerHTML = '<div><b></b><small></small></div><div class="row-tail"></div>';
    r.querySelector('b').textContent = title;
    r.querySelector('small').textContent = desc || '';
    r.querySelector('.row-tail').textContent = tail || '';
    if (onClick) r.addEventListener('click', onClick);
    return r;
  }
  M.row = row;
  function acc(title, desc, build, open) {
    const a = el('div', 'acc' + (open ? ' open' : ''));
    const h = el('div', 'acc-head', '<div><b></b><small></small></div><span class="acc-arrow">›</span>');
    h.querySelector('b').textContent = title;
    h.querySelector('small').textContent = desc || '';
    const body = el('div', 'acc-body', '<div class="acc-inner"></div>');
    a.appendChild(h); a.appendChild(body);
    build(body.querySelector('.acc-inner'));   /* 立即构建：折叠着也不会是空的 */
    h.addEventListener('click', () => a.classList.toggle('open'));
    return a;
  }
  function seg(items, value, onChange) {
    const s = el('div', 'seg');
    items.forEach(it => {
      const b = el('button', it.v === value ? 'on' : '');
      b.textContent = it.t;
      b.addEventListener('click', () => { onChange(it.v); Array.from(s.children).forEach((c, i) => c.classList.toggle('on', items[i].v === it.v)); });
      s.appendChild(b);
    });
    return s;
  }
  M.seg = seg;
  M.swatches = function (list, cur, onPick) {
    const wrap = el('div', 'swatches');
    list.forEach(o => {
      const b = el('button', 'swatch' + (o.v === cur ? ' on' : ''));
      b.style.background = o.css;
      b.innerHTML = '<span>' + o.t + '</span>';
      b.addEventListener('click', () => { Array.from(wrap.children).forEach((c, i) => c.classList.toggle('on', list[i].v === o.v)); onPick(o.v); });
      wrap.appendChild(b);
    });
    return wrap;
  };

  /* ---------- 主菜单 ---------- */
  M.PREP = {};
  M.renderTitle = function () {
    const done = SK.Progress.doneCount();
    const next = SK.Progress.nextLevel();
    const meta = SK.Levels.meta(next);
    U.$('#hero-done').textContent = done;
    const ring = U.$('#hero-ring-fill');
    if (ring) ring.style.strokeDashoffset = String(327 * (1 - done / 100));
    U.$('#hero-chapter').textContent = meta.chapterName;
    U.$('#hero-time').textContent = SK.fmtTime(SK.Progress.data.time || 0);
    U.$('#hero-ai').textContent = ((SK.Progress.data.hints || 0) + (SK.Progress.data.ai || 0)) + ' 次';
    const cont = U.$('#btn-continue-sub');
    if (cont) cont.textContent = done >= 100 ? '已全部通关 · 可自由重玩' : '第 ' + next + ' 关 · ' + meta.chapterName;
    const cta = U.$('#btn-continue em');
    if (cta) cta.textContent = SK.Store.get('session', null) ? '继续上一局' : (done ? '继续闯关' : '开始第 1 关');

    const lad = U.$('#title-ladder');
    lad.innerHTML = '';
    SK.Levels.CHAPTERS.forEach((c, idx) => {
      const rowEl = el('div', 'ladder-row');
      const dn = SK.Progress.chapterDone(c.id);
      rowEl.innerHTML =
        '<div class="lr-ico"><svg class="ic"><use href="#' + c.icon + '"></use></svg></div>' +
        '<div><div class="ladder-name"><b>' + c.name + '</b><span>' + dn + '/10</span></div>' +
        '<div class="ladder-bar"><i style="width:' + (dn * 10) + '%"></i></div></div>' +
        '<div class="muted" style="text-align:right">Lv ' + (c.id * 10 - 9) + '-' + (c.id * 10) + '</div>';
      rowEl.addEventListener('click', () => { M.go('levels'); setTimeout(() => M.showChapter(c.id, true), 60); });
      lad.appendChild(rowEl);
    });

    const chips = U.$('#ai-tier-chips');
    chips.innerHTML = '';
    SK.AI.TIERS.forEach(t => {
      const c = el('div', 'chip');
      c.innerHTML = '<b>' + t.id + '</b>' + t.name;
      c.title = t.desc;
      chips.appendChild(c);
    });
  };

  /* ---------- 桌面副驾面板 ---------- */
  M.renderRail = function () {
    const rail = U.$('#desk-rail');
    if (!rail || !S.st) return;
    const tiers = U.$('#rail-tiers');
    if (!tiers.children.length) {
      SK.AI.TIERS.forEach(t => {
        const b = el('button');
        b.innerHTML = '<b>L' + t.id + ' ' + t.name + '</b><small></small>';
        b.querySelector('small').textContent = t.short;
        b.title = t.desc;
        b.addEventListener('click', () => { M.aiAsk(t.id); });
        tiers.appendChild(b);
      });
    }
    const rep = SK.AI.analyze(S.st, S.data.solution, S.data);
    U.$('#rail-grade').textContent = (S.data.grade || '') + ' ' + (S.data.score || '');
    U.$('#rail-verdict-text').textContent = rep.verdict.text;
    const ul = U.$('#rail-advice');
    ul.innerHTML = '';
    rep.advice.slice(0, 3).forEach((a, i) => {
      const li = el('li');
      li.innerHTML = '<span>' + (i + 1) + '</span>';
      li.appendChild(el('div')).textContent = a;
      ul.appendChild(li);
    });
    const ch = SK.Levels.chapterOf(S.level);
    U.$('#rail-chapter-title').textContent = ch.name;
    U.$('#rail-chapter-done').textContent = SK.Progress.chapterDone(ch.id) + '/10';
    const grid = U.$('#rail-levels');
    grid.innerHTML = '';
    for (let n = (ch.id - 1) * 10 + 1; n <= ch.id * 10; n++) grid.appendChild(M.levelNode(n));

    /* 本关解法构成 */
    const cnt = S.data.counts || {};
    const ck = Object.keys(cnt).sort((a, b) => ((SK.Tech.META[b] || {}).weight || 0) - ((SK.Tech.META[a] || {}).weight || 0));
    U.$('#rail-diff').textContent = 'T' + (S.data.maxTier || 1) + ' 档 · 假设 ' + (S.data.guesses || 0) + ' 次';
    const box = U.$('#rail-counts');
    box.innerHTML = '';
    if (!ck.length) box.appendChild(el('div', 'muted', '开局后这里会统计这关用到的技巧。'));
    ck.forEach(k => {
      const c = el('div', 'chip');
      c.appendChild(el('b')).textContent = cnt[k];
      c.appendChild(document.createTextNode(' ' + ((SK.Tech.META[k] || {}).name || k)));
      box.appendChild(c);
    });

    /* AI 介入记录 */
    const log = U.$('#rail-log');
    log.innerHTML = '';
    if (!S.hintLog.length) log.appendChild(el('div', 'muted', '还没用过提示 —— 全靠你自己。'));
    S.hintLog.slice(-4).reverse().forEach(h => {
      const c = el('div', 'move-card');
      c.innerHTML = '<b>L' + h.tier + ' ' + h.title + ' <span class="pill">' + SK.fmtTime(h.at) + '</span></b>';
      c.appendChild(el('small')).textContent = h.text;
      log.appendChild(c);
    });
  };

  /* ---------- 关卡表 ---------- */
  M.filter = { state: 'all', chapter: 0 };
  M.renderLevels = function () {
    U.$('#levels-summary').textContent = SK.Progress.doneCount() + ' / 100 已通关';
    const rail = U.$('#chapter-rail');
    rail.innerHTML = '';
    SK.Levels.CHAPTERS.forEach(c => {
      const chip = el('button', 'rail-chip' + (M.filter.chapter === c.id ? ' on' : ''));
      const dn = SK.Progress.chapterDone(c.id);
      chip.innerHTML = '<svg class="ic"><use href="#' + c.icon + '"></use></svg><b>第' + '一二三四五六七八九十'.charAt(c.id - 1) + '章</b>' + c.name + ' · ' + dn + '/10';
      chip.addEventListener('click', () => M.showChapter(c.id, true));
      rail.appendChild(chip);
    });
    const groups = U.$('#chapter-groups');
    groups.innerHTML = '';
    SK.Levels.CHAPTERS.forEach(c => {
      const g = el('div', 'cgroup' + (M.filter.chapter === c.id ? ' open' : ''));
      const dn = SK.Progress.chapterDone(c.id);
      const head = el('div', 'cgroup-head');
      head.innerHTML = '<div class="cg-ico"><svg class="ic"><use href="#' + c.icon + '"></use></svg></div><div><b></b><small></small></div>' +
        '<span class="cg-state">' + dn + '/10</span><span class="cg-arrow">›</span>';
      head.querySelector('b').textContent = '第' + '一二三四五六七八九十'.charAt(c.id - 1) + '章 · ' + c.name;
      head.querySelector('small').textContent = c.sub + ' · Lv ' + (c.id * 10 - 9) + '-' + (c.id * 10);
      head.addEventListener('click', () => { g.classList.toggle('open'); U.$$('#chapter-rail .rail-chip').forEach((x, i) => x.classList.toggle('on', i + 1 === c.id && g.classList.contains('open'))); });
      const body = el('div', 'cgroup-body', '<div class="cgroup-inner"></div>');
      const grid = el('div', 'lvl-grid');
      for (let n = (c.id - 1) * 10 + 1; n <= c.id * 10; n++) {
        if (!M.matchFilter(n)) continue;
        grid.appendChild(M.levelNode(n));
      }
      body.querySelector('.cgroup-inner').appendChild(grid);
      g.appendChild(head); g.appendChild(body);
      groups.appendChild(g);
    });
  };
  M.matchFilter = function (n) {
    const f = M.filter;
    if (f.chapter && SK.Levels.chapterOf(n).id !== f.chapter) return true;
    if (f.state === 'todo' && SK.Progress.isDone(n)) return false;
    if (f.state === 'done' && !SK.Progress.isDone(n)) return false;
    if (f.state === 'star' && (SK.Progress.data.stars[n] || 0) < 3) return false;
    return true;
  };
  M.levelNode = function (n) {
    const meta = SK.Levels.meta(n);
    const locked = !SK.Progress.unlocked(n);
    const nd = el('button', 'lvl-node' + (locked ? ' lock' : '') + (SK.Progress.isDone(n) ? ' done' : '') + (SK.Progress.nextLevel() === n ? ' cur' : ''));
    const cached = SK.Levels.cached(n);
    nd.innerHTML = String(n) + '<small>' + (cached ? (cached.grade || meta.band) : meta.band) + '</small>';
    nd.addEventListener('click', () => { if (locked) { U.toast({ title: '尚未解锁', text: '先通过第 ' + (n - 1) + ' 关。', kind: 'warn' }); return; } M.levelDetail(n); });
    return nd;
  };
  M.showChapter = function (c, scroll) {
    M.filter.chapter = c;
    U.$$('#chapter-rail .rail-chip').forEach((x, i) => x.classList.toggle('on', i + 1 === c));
    const groups = U.$$('#chapter-groups .cgroup');
    groups.forEach((g, i) => g.classList.toggle('open', i + 1 === c));
    if (scroll && groups[c - 1]) groups[c - 1].scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  /* 关卡详情（三级） */
  M.levelDetail = function (n) {
    const meta = SK.Levels.meta(n), cached = SK.Levels.cached(n), best = SK.Progress.data.best[n];
    U.$('#ld-title').textContent = '第 ' + n + ' 关';
    U.$('#ld-sub').textContent = meta.chapterName + ' · ' + (cached ? cached.grade : meta.band);
    const body = U.$('#ld-body');
    body.innerHTML = '';
    const kv = el('div', 'kv');
    const item = (k, v) => '<div class="k"><small>' + k + '</small><b>' + v + '</b></div>';
    kv.innerHTML =
      item('难度分', cached ? cached.score : '待生成') +
      item('给定数', cached ? cached.clues : meta.clues) +
      item('所需技巧', meta.tierName) +
      item('最好成绩', best ? SK.fmtTime(best.time) + ' · ' + best.stars + ' 星' : '未通关');
    body.appendChild(kv);
    if (cached) {
      const tech = el('div', 'verdict');
      const cnt = cached.counts || {};
      const list = Object.keys(cnt).map(k => (SK.AI.TIERS.length, (SK.Tech.META[k] || {}).name || k) + ' ×' + cnt[k]).join(' · ');
      tech.innerHTML = '<h5>本关解法构成</h5>' + (list || '—') + '<br><span class="muted">深度搜索 ' + (cached.brute || 0) + ' 格 · 试位 ' + (cached.guesses || 0) + ' 次</span>';
      body.appendChild(tech);
    }
    const start = el('button', 'btn btn-hero');
    start.innerHTML = '<span class="btn-glow"></span><em>' + (SK.Progress.isDone(n) ? '再次挑战' : '开始这一关') + '</em>';
    start.addEventListener('click', () => SK.App.startLevel(n, !SK.Progress.isDone(n) ? undefined : { fresh: true }));
    body.appendChild(start);
    if (cached) {
      const info = el('button', 'btn btn-ghost');
      info.textContent = 'AI 先看一眼这关';
      info.addEventListener('click', () => {
        SK.App.startLevel(n);
        setTimeout(() => { M.openSheet('sheet-ai'); M.aiTab('analyze'); }, 260);
      });
      body.appendChild(info);
    }
    M.openSheet('sheet-level-detail');
  };

  /* ---------- AI 大师面板 ---------- */
  M.PREP['sheet-ai'] = () => { M.aiTab(M._aiTab || 'hint'); };
  M.aiTab = function (name) {
    M._aiTab = name;
    const sheet = U.$('#sheet-ai');
    const tabs = U.$('#ai-tabs');
    if (!tabs.children.length) {
      [{ k: 'hint', t: '提示', s: '六级' }, { k: 'analyze', t: '分析', s: 'AI 看盘' }, { k: 'play', t: '接管', s: '代打' }, { k: 'log', t: '记录', s: '历史' }]
        .forEach(t => {
          const b = el('button', 'stab', '<b>' + t.t + '</b><small>' + t.s + '</small>');
          b.dataset.k = t.k;
          b.addEventListener('click', () => M.aiTab(t.k));
          tabs.appendChild(b);
        });
    }
    Array.from(tabs.children).forEach(b => b.classList.toggle('on', b.dataset.k === name));
    sheet.querySelectorAll('.pane').forEach(p => p.hidden = p.dataset.pane !== name);
    U.$('#sheet-ai-sub').textContent = { hint: '选等级 · 按当前盘面给指引', analyze: 'AI 实时读盘报告', play: '让 AI 连续作答', log: '本关 AI 介入记录' }[name];
    if (name === 'hint') M.aiBuildHint();
    if (name === 'analyze') M.aiBuildAnalyze();
    if (name === 'play') M.aiBuildPlay();
    if (name === 'log') M.aiBuildLog();
  };
  function pane(name) { return U.$('#sheet-ai .pane[data-pane="' + name + '"]'); }

  M.aiBuildHint = function () {
    const list = U.$('#ai-tier-list');
    list.innerHTML = '';
    SK.AI.TIERS.forEach(t => {
      const row = el('div', 'tier' + (M._tier === t.id ? ' on' : ''));
      row.innerHTML = '<div class="tn">' + t.id + '</div><div><b>' + t.name + '</b><small>' + t.desc + '</small></div><span class="cost">' + (t.cost ? '代价 ' + t.cost : '免费') + '</span>';
      row.addEventListener('click', () => { M._tier = t.id; M.aiAsk(t.id); });
      list.appendChild(row);
    });
  };
  M.aiAsk = function (tier) {
    if (!S.st) return;
    const h = SK.Game.askHint(tier);
    M.aiBuildHint();
    const box = U.$('#ai-hint-result');
    box.innerHTML = '';
    const h4 = el('h4');
    h4.innerHTML = '<span class="hint-tag">L' + h.tier + '</span>';
    h4.appendChild(document.createTextNode(' ' + h.title + ' '));
    h4.innerHTML += '<span class="hint-tag">' + (h.kind || '') + '</span>';
    box.appendChild(h4);
    const para = el('p');
    para.textContent = h.text;
    box.appendChild(para);
    if (h.digit) { U.hintDigit = h.digit; U.renderNumpad(); setTimeout(() => { U.hintDigit = 0; U.renderNumpad(); }, 3000); }
    if (h.focus && h.focus.length) U.mark('tipCells', h.focus, 5200);
    if (h.path) {
      const act = el('div', 'hint-actions');
      const go = el('button', 'btn btn-hero', '<em>开始逐步代打</em>');
      go.addEventListener('click', () => { M.aiTab('play'); });
      act.appendChild(go);
      box.appendChild(act);
    }
    U.sound('ai');
    U.toast({ kind: 'ai', title: 'AI 大师 · ' + h.title, text: h.text.slice(0, 40) + (h.text.length > 40 ? '…' : ''), ms: 2200 });
  };

  M.aiBuildAnalyze = function () {
    const p = pane('analyze');
    p.innerHTML = '';
    if (!S.st) { p.appendChild(el('div', 'hint-empty', '还没有开局。')); return; }
    const rep = SK.Game.analyze();
    const prog = el('div', 'kv');
    const item = (k, v, em) => '<div class="k"><small>' + k + '</small><b>' + v + (em ? '<em>' + em + '</em>' : '') + '</b></div>';
    prog.innerHTML =
      item('已填 / 剩余', rep.progress.filled, ' / ' + rep.progress.left) +
      item('所需技巧', rep.needTierName) +
      item('唯一候选格', rep.singleCandidates, '格') +
      item('双候选格', rep.doubleCandidates, '格');
    p.appendChild(prog);

    const v = el('div', 'verdict ' + rep.verdict.tone, '<h5></h5>');
    v.querySelector('h5').textContent = 'AI 判断';
    v.appendChild(el('', '', '')).textContent = rep.verdict.text;
    p.appendChild(v);

    const advBox = el('div', 'acc open');
    advBox.innerHTML = '<div class="acc-head"><div><b>下一步建议</b><small>按当前盘面排序</small></div><span class="acc-arrow">▾</span></div><div class="acc-body"><div class="acc-inner"></div></div>';
    const inner = advBox.querySelector('.acc-inner');
    const ul = el('ul', 'advice');
    rep.advice.forEach((a, i) => { const li = el('li', ''); li.innerHTML = '<span>' + (i + 1) + '</span>'; li.appendChild(el('', '', '')); li.lastChild.textContent = a; ul.appendChild(li); });
    inner.appendChild(ul);
    if (rep.wrong.length) {
      const fix = el('button', 'btn btn-ghost', '标出与唯一解不符的 ' + rep.wrong.length + ' 格');
      fix.addEventListener('click', () => { U.mark('badCells', rep.wrong, 6000); U.toast({ kind: 'warn', title: '已标红', text: '这些格与唯一解不一致。' }); });
      inner.appendChild(fix);
    }
    advBox.querySelector('.acc-head').addEventListener('click', () => advBox.classList.toggle('open'));
    p.appendChild(advBox);

    const movesBox = el('div', 'acc open');
    movesBox.innerHTML = '<div class="acc-head"><div><b>此刻能用的招法</b><small>' + rep.availableMoves.length + ' 类</small></div><span class="acc-arrow">▾</span></div><div class="acc-body"><div class="acc-inner"></div></div>';
    const mi = movesBox.querySelector('.acc-inner');
    if (!rep.availableMoves.length) mi.appendChild(el('div', 'hint-empty', '直观招法已用尽，需要试位或更深的观察。'));
    rep.availableMoves.forEach(m => {
      const c = el('div', 'move-card');
      c.innerHTML = '<b>' + m.name + ' <span class="pill">' + 'T' + m.tier + '</span></b>';
      c.appendChild(el('small', '', '')).textContent = m.why;
      c.addEventListener('click', () => { if (m.cells) U.mark('tipCells', m.cells, 5000); });
      mi.appendChild(c);
    });
    movesBox.querySelector('.acc-head').addEventListener('click', () => movesBox.classList.toggle('open'));
    p.appendChild(movesBox);

    const dp = el('div', 'acc');
    dp.innerHTML = '<div class="acc-head"><div><b>数字压力榜</b><small>剩余数 vs 可放位置</small></div><span class="acc-arrow">›</span></div><div class="acc-body"><div class="acc-inner"></div></div>';
    const di = dp.querySelector('.acc-inner');
    rep.digitPressure.forEach(x => {
      const k = el('div', 'k');
      k.innerHTML = '<small>数字 ' + x.d + '</small><b>' + x.left + '<em>待填 / ' + x.slots + ' 落点</em></b><div class="bar"><i style="width:' + Math.min(100, x.left / Math.max(1, x.slots) * 100) + '%"></i></div>';
      di.appendChild(k);
    });
    dp.querySelector('.acc-head').addEventListener('click', () => dp.classList.toggle('open'));
    p.appendChild(dp);
  };

  M.aiBuildPlay = function () {
    const p = pane('play');
    p.innerHTML = '';
    if (!S.st) { p.appendChild(el('div', 'hint-empty', '还没有开局。')); return; }
    const head = el('div', 'verdict', '<h5>AI 接管</h5>');
    head.appendChild(el('', '', '')).textContent = '按当前盘面计算，AI 需要 ' + SK.AI.plan(S.st, { maxSteps: 200 }).length + ' 步收完这关。可以选择讲解模式（每步说明）或极速模式。';
    p.appendChild(head);
    const speedRow = el('div', 'row');
    speedRow.innerHTML = '<div><b>节奏</b><small>每一步之间的停顿</small></div>';
    const sg = M.seg([{ v: 700, t: '讲解' }, { v: 340, t: '标准' }, { v: 110, t: '极速' }], 340, v => { M._speed = v; });
    speedRow.appendChild(sg);
    p.appendChild(speedRow);
    const acts = el('div', 'hint-actions');
    const go = el('button', 'btn btn-hero', '<span class="btn-glow"></span><em>开始代打</em>');
    go.addEventListener('click', () => { const path = SK.Game.aiTakeover(200).steps; U.playPath(path, { speed: M._speed || 340, explain: (M._speed || 340) > 500, explainMax: 8 }); M.closeSheet(); });
    const stop = el('button', 'btn btn-ghost', '接管到此为止');
    stop.addEventListener('click', () => { U.stopPlay(); U.toast({ title: '已停止代打', text: '盘面保留，继续由你填。' }); });
    const reveal = el('button', 'btn btn-ghost', '直接给出完整解');
    reveal.addEventListener('click', async () => {
      if (!(await U.confirm('给出完整解？', '这关将标记为「AI 完成」，不计三星。'))) return;
      S.aiSteps += 40; U.playPath(SK.Game.aiTakeover(200).steps, { speed: 40 });
    });
    acts.appendChild(go); acts.appendChild(stop);
    p.appendChild(acts);
    p.appendChild(reveal);
  };

  M.aiBuildLog = function () {
    const p = pane('log');
    p.innerHTML = '';
    if (!S.hintLog.length) { p.appendChild(el('div', 'hint-empty', '本关还没用过 AI。')); return; }
    S.hintLog.slice().reverse().forEach(h => {
      const c = el('div', 'move-card');
      c.innerHTML = '<b>L' + h.tier + ' ' + h.title + ' <span class="pill">' + SK.fmtTime(h.at) + '</span></b>';
      c.appendChild(el('small', '', '')).textContent = h.text;
      p.appendChild(c);
    });
  };

  /* ---------- 工具抽屉 ---------- */
  M.PREP['sheet-tools'] = function () {
    const body = U.$('#tools-body');
    body.innerHTML = '';
    const check = acc('盘面校验', '错误、冲突与死局', inner => {
      const mkBtn = (t, fn) => { const b = el('button', 'btn btn-ghost', t); b.addEventListener('click', fn); inner.appendChild(b); return b; };
      mkBtn('检查与唯一解不符的格', () => {
        const wrong = SK.AI.wrongCells(S.st, S.data.solution);
        if (!wrong.length) U.toast({ kind: 'good', title: '目前全对', text: '已填的数字都与唯一解一致。' });
        else { U.mark('badCells', wrong, 6000); U.toast({ kind: 'warn', title: '发现 ' + wrong.length + ' 处', text: wrong.slice(0, 6).map(SK.Tech.cellName).join('、') + ' 需要修正。' }); }
      });
      mkBtn('检查规则冲突', () => {
        const c = SK.Board.conflicts(S.st);
        if (!c.length) U.toast({ kind: 'good', title: '无冲突', text: '行、列、宫都没有重复。' });
        else { U.mark('badCells', c, 6000); U.toast({ kind: 'bad', title: c.length + ' 个冲突格', text: c.map(SK.Tech.cellName).join('、') }); }
      });
      mkBtn('AI 局势分析', () => { M.openSheet('sheet-ai'); M.aiTab('analyze'); });
    });
    const notes = acc('候选与笔记', '把推理写下来', inner => {
      const b1 = el('button', 'btn btn-ghost', '按真实候选填充全部笔记');
      b1.addEventListener('click', () => {
        for (let i = 0; i < 81; i++) if (!S.st.digits[i]) { const a = []; for (let d = 1; d <= 9; d++) if (S.st.masks[i] & SK.BIT[d]) a.push(d); S.notes[i] = a; }
        U.renderAll(); U.toast({ title: '已写入笔记', text: '空格已标出全部候选。' }); M.closeSheet();
      });
      const b2 = el('button', 'btn btn-ghost', '清空全部笔记');
      b2.addEventListener('click', () => { S.notes = new Array(81); U.renderAll(); U.toast({ title: '笔记已清空' }); M.closeSheet(); });
      inner.appendChild(b1); inner.appendChild(b2);
    });
    const flow = acc('这一关', '重来、跳过与信息', inner => {
      const b = (t, fn) => { const x = el('button', 'btn btn-ghost', t); x.addEventListener('click', fn); inner.appendChild(x); };
      b('重新开始本关', async () => { if (await U.confirm('重新开始？', '当前进度会丢失。')) SK.App.startLevel(S.level, { fresh: true }), M.closeSheet(); });
      b('撤销全部', () => { while (SK.Game.undoStep()); U.renderAll(); });
      b('下一关', () => { const n = Math.min(100, S.level + 1); if (SK.Progress.unlocked(n)) SK.App.startLevel(n); else U.toast({ kind: 'warn', title: '尚未解锁', text: '先过第 ' + (n - 1) + ' 关。' }); M.closeSheet(); });
      b('回到关卡表', async () => { if (!SK.Settings.confirmExit || await U.confirm('离开对局？', '进度已自动保存，可随时继续。')) { M.closeSheet(); SK.App.go('levels'); } });
      const info = el('div', 'verdict');
      info.innerHTML = '<h5>关卡信息</h5>';
      info.appendChild(el('', '', '')).textContent = '第 ' + S.level + ' 关 · 给定 ' + S.data.clues + ' 数 · 难度分 ' + S.data.score + ' · 技巧档 T' + S.data.maxTier + ' · 试位 ' + S.data.guesses + ' 次';
      inner.appendChild(info);
    });
    body.appendChild(check); body.appendChild(notes); body.appendChild(flow);
    body.querySelectorAll('.acc').forEach(a => a.classList.add('open'));   /* 工具抽屉内容少，默认全展开 */
  };

  /* ---------- 筛选 ---------- */
  M.PREP['sheet-filter'] = function () {
    const body = U.$('#filter-body');
    body.innerHTML = '';
    const r1 = el('div', 'row');
    r1.innerHTML = '<div><b>通关状态</b><small>只看某一类</small></div>';
    r1.appendChild(M.seg([{ v: 'all', t: '全部' }, { v: 'todo', t: '未过' }, { v: 'done', t: '已过' }, { v: 'star', t: '三星' }], M.filter.state, v => { M.filter.state = v; M.renderLevels(); M.closeSheet(); }));
    body.appendChild(r1);
    const r2 = el('div', 'row');
    r2.innerHTML = '<div><b>章节跳转</b><small>直接展开一章</small></div>';
    const sel = el('div', 'chip-row');
    SK.Levels.CHAPTERS.forEach(c => {
      const chip = el('div', 'chip' + (M.filter.chapter === c.id ? ' on' : ''), c.icon + ' 第' + '一二三四五六七八九十'.charAt(c.id - 1) + '章');
      chip.addEventListener('click', () => { M.showChapter(c.id, true); M.closeSheet(); });
      sel.appendChild(chip);
    });
    r2.appendChild(sel);
    body.appendChild(r2);
    const r3 = row('全部关卡重新出题', '清掉本地缓存的 100 关盘面，之后按当前算法重新生成', '›', async () => {
      if (!await U.confirm('重新出题？', '已通关记录保留，但每关盘面会重新生成。')) return;
      SK.Levels.clearCache();
      U.toast({ kind: 'good', title: '缓存已清空', text: '下次进入关卡时重新生成。' });
      M.renderLevels(); M.closeSheet();
    });
    body.appendChild(r3);
  };

  /* ---------- 设置 ---------- */
  M.PREP['sheet-settings'] = function () {
    const body = U.$('#settings-body');
    body.innerHTML = '';
    const themes = [
      { v: 'aurora', t: '极光', css: 'linear-gradient(140deg,#ffd9ef,#cfe4ff 55%,#d9f7ee)' },
      { v: 'matcha', t: '抹茶', css: 'linear-gradient(140deg,#d7f5c9,#e6f7d2 55%,#cfeaf4)' },
      { v: 'peach', t: '蜜桃', css: 'linear-gradient(140deg,#ffd9c0,#ffd0e0 55%,#ffe9b8)' },
      { v: 'midnight', t: '深夜', css: 'linear-gradient(140deg,#2a2f5c,#0b1024 60%,#123a4a)' },
      { v: 'contrast', t: '高对比', css: 'linear-gradient(140deg,#fff,#e9ebf5 55%,#fff)' },
    ];
    body.appendChild(acc('视觉 · 主题', '毛玻璃配色与光影强度', inner => {
      inner.appendChild(M.swatches(themes, SK.Settings.theme, v => { SK.Settings.set('theme', v); U.toast({ title: '主题已切换', text: themes.find(t => t.v === v).t }); }));
      const l = el('div', 'row'); l.innerHTML = '<div><b>光影层次</b><small>光斑、高光与投影</small></div>';
      l.appendChild(M.seg([{ v: 'off', t: '关' }, { v: 'flat', t: '简' }, { v: 'soft', t: '柔' }, { v: 'rich', t: '华' }], SK.Settings.light, v => SK.Settings.set('light', v)));
      inner.appendChild(l);
      const g = el('div', 'row'); g.innerHTML = '<div><b>毛玻璃</b><small>背景模糊（低端机可关）</small></div>';
      g.appendChild(M.seg([{ v: 'on', t: '开' }, { v: 'off', t: '关' }], SK.Settings.blur, v => SK.Settings.set('blur', v)));
      inner.appendChild(g);
      const k = el('div', 'row'); k.innerHTML = '<div><b>数字发光</b><small>选中数字的高亮辉光</small></div>';
      k.appendChild(M.seg([{ v: true, t: '开' }, { v: false, t: '关' }], SK.Settings.digitGlow, v => SK.Settings.set('digitGlow', v)));
      inner.appendChild(k);
    }, true));

    body.appendChild(acc('操作手感', '连填、笔记、触感与声音', inner => {
      const f = el('div', 'row'); f.innerHTML = '<div><b>连填模式</b><small>填对后自动跳到下一个空格</small></div>';
      f.appendChild(M.seg([{ v: true, t: '开' }, { v: false, t: '关' }], SK.Settings.keepFlow, v => SK.Settings.set('keepFlow', v)));
      inner.appendChild(f);
      const n = el('div', 'row'); n.innerHTML = '<div><b>填对清笔记</b><small>正确落子后自动清掉该格笔记</small></div>';
      n.appendChild(M.seg([{ v: true, t: '开' }, { v: false, t: '关' }], SK.Settings.noteAutoClear, v => SK.Settings.set('noteAutoClear', v)));
      inner.appendChild(n);
      const h = el('div', 'row'); h.innerHTML = '<div><b>触感反馈</b><small>支持振动的设备</small></div>';
      h.appendChild(M.seg([{ v: true, t: '开' }, { v: false, t: '关' }], SK.Settings.haptics, v => SK.Settings.set('haptics', v)));
      inner.appendChild(h);
      const s = el('div', 'row'); s.innerHTML = '<div><b>音效</b><small>落子 / 纠错 / 通关</small></div>';
      s.appendChild(M.seg([{ v: true, t: '开' }, { v: false, t: '关' }], SK.Settings.sound, v => { SK.Settings.set('sound', v); if (v) U.sound('place'); }));
      inner.appendChild(s);
      const c = el('div', 'row'); c.innerHTML = '<div><b>离开确认</b><small>退出对局时询问</small></div>';
      c.appendChild(M.seg([{ v: true, t: '问' }, { v: false, t: '不问' }], SK.Settings.confirmExit, v => SK.Settings.set('confirmExit', v)));
      inner.appendChild(c);
    }));

    body.appendChild(acc('辅助程度', '候选显示与纠错方式', inner => {
      const cd = el('div', 'row'); cd.innerHTML = '<div><b>候选显示</b><small>空格里的灰色小数字</small></div>';
      cd.appendChild(M.seg([{ v: 'off', t: '关' }, { v: 'auto', t: '智能' }, { v: 'always', t: '全部' }], SK.Settings.candidateHint, v => { SK.Settings.set('candidateHint', v); U.renderAll(); U.syncSwitches(); }));
      inner.appendChild(cd);
      const em = el('div', 'row'); em.innerHTML = '<div><b>错误处理</b><small>填错时怎么办</small></div>';
      em.appendChild(M.seg([{ v: 'mark', t: '标红' }, { v: 'strict', t: '拒绝' }, { v: 'off', t: '不管' }], SK.Settings.errorMode, v => SK.Settings.set('errorMode', v)));
      inner.appendChild(em);
    }));

    body.appendChild(acc('AI 出题', '生成质量与耗时权衡', inner => {
      const b = el('div', 'row'); b.innerHTML = '<div><b>生成预算</b><small>越高考量越难，等待越久</small></div>';
      b.appendChild(M.seg([{ v: 'fast', t: '快' }, { v: 'normal', t: '标准' }, { v: 'deep', t: '考究' }], SK.Settings.generateBudget, v => SK.Settings.set('generateBudget', v)));
      inner.appendChild(b);
      const w = row('重新生成全部关卡', '清空关卡缓存，下次进入按当前算法重出', '›', async () => {
        if (!await U.confirm('清空关卡缓存？', '通关记录保留，盘面会重新生成。')) return;
        SK.Levels.clearCache(); U.toast({ kind: 'good', title: '已清空' }); M.closeSheet();
      });
      inner.appendChild(w);
    }));

    body.appendChild(acc('数据', '进度与存档', inner => {
      inner.appendChild(row('导出存档', '复制一段可粘贴保存的文本', '›', () => {
        const txt = btoa(unescape(encodeURIComponent(JSON.stringify({ p: SK.Progress.data, l: SK.Levels.CHAPTERS.length, v: 1 })))).slice(0, 4000);
        M.openSub('存档文本', '长按选择复制', el('div', 'verdict', '<code style="font-size:10px;word-break:break-all">' + txt + '</code>'));
      }));
      inner.appendChild(row('重置进度', '清空全部通关记录与统计', '›', async () => {
        if (!await U.confirm('重置全部进度？', '100 关记录、星级、统计都会清空，无法恢复。')) return;
        SK.Game.wipe('progress'); SK.Game.wipe('session'); U.toast({ kind: 'good', title: '已重置' }); M.go('title'); M.closeSheet();
      }));
    }));
  };

  /* ---------- 技巧图鉴 ---------- */
  M.PREP['sheet-codex'] = function () {
    const body = U.$('#codex-body');
    body.innerHTML = '';
    const keys = SK.Tech.ORDER.concat(['trial']);
    keys.forEach(k => {
      const m = SK.Tech.META[k];
      body.appendChild(acc(m.name + ' · ' + m.en, 'T' + m.tier + ' 难度权重 ' + m.weight, inner => {
        const v = el('div', 'verdict');
        v.innerHTML = '<h5>怎么用</h5>';
        v.appendChild(el('', '', '')).textContent = m.tip;
        inner.appendChild(v);
        const demo = M.codexDemo(k);
        if (demo) inner.appendChild(demo);
        const used = SK.Game.career().techUse[k];
        inner.appendChild(el('div', 'muted', '你在已通关的盘里用过约 ' + (used || 0) + ' 次'));
      }));
    });
  };
  M.codexDemo = function (k) {
    const box = el('div', 'move-card');
    let txt = '';
    if (k === 'nakedSingle') txt = '例：某格所在行列宫已出现 1-8，只剩 9 可填 → 直接写 9。';
    else if (k === 'hiddenSingle') txt = '例：第 4 行只缺 3 和 7，而 3 已在该宫出现 → 该行 3 只能落在唯一空格。';
    else if (k === 'nakedPair') txt = '例：同宫两格候选都是 {2,6} → 2、6 必在这两格，宫内其他格可删 2、6。';
    else if (k === 'pointing') txt = '例：第 7 宫的 5 只在第 3 行的三格 → 第 3 行别处的 5 全部划掉。';
    else if (k === 'claiming') txt = '例：第 2 行的 8 都落在第 1 宫 → 第 1 宫内非第 2 行的 8 可划掉。';
    else if (k === 'hiddenPair') txt = '例：一列里 4 和 9 只出现在同样的两格 → 这两格剩下的候选全划掉。';
    else if (k === 'nakedTriple') txt = '例：宫内三格候选合起来是 {1,3,7} → 该宫其他格不能是 1、3、7。';
    else if (k === 'xwing') txt = '例：第 2、6 行的 5 都只落在第 1、8 列 → 第 1、8 列其他位置的 5 可删。';
    else if (k === 'swordfish') txt = '例：三行的 7 被限制在同样三列（1:1:1 或 2:2:2）→ 这三列其他 7 可删。';
    else if (k === 'trial') txt = '例：假设 r5c3=4 造成某格无候选 → 该格 4 可删；若一路顺畅解通 → 4 成立。';
    box.innerHTML = '<b>直观示例</b>';
    box.appendChild(el('small', '', '')).textContent = txt;
    return box;
  };

  /* ---------- 生涯 ---------- */
  M.PREP['sheet-stats'] = function () {
    const body = U.$('#stats-body');
    body.innerHTML = '';
    const c = SK.Game.career();
    const kv = el('div', 'kv');
    kv.innerHTML =
      '<div class="k"><small>已通关</small><b>' + c.done + '<em>/100</em></b></div>' +
      '<div class="k"><small>累计星</small><b>' + c.stars + '<em>/300</em></b></div>' +
      '<div class="k"><small>总时长</small><b style="font-size:15px">' + SK.fmtTime(c.time) + '</b></div>' +
      '<div class="k"><small>AI 介入</small><b>' + (c.hints + c.ai) + '<em>次</em></b></div>';
    body.appendChild(kv);

    const ch = el('div', 'acc open');
    ch.innerHTML = '<div class="acc-head"><div><b>章节进度</b><small>' + c.chapters.filter(x => x.done === 10).length + ' 章已满</small></div><span class="acc-arrow">▾</span></div><div class="acc-body"><div class="acc-inner"></div></div>';
    const inner = ch.querySelector('.acc-inner');
    c.chapters.forEach(x => {
      const r = el('div', 'ladder-row');
      r.innerHTML = '<div class="lr-ico"><svg class="ic"><use href="#' + x.c.icon + '"></use></svg></div><div><div class="ladder-name"><b>' + x.c.name + '</b><span>' + x.done + '/10</span></div><div class="ladder-bar"><i style="width:' + x.done * 10 + '%"></i></div></div><div class="muted" style="text-align:right">Lv ' + (x.c.id * 10 - 9) + '-' + (x.c.id * 10) + '</div>';
      inner.appendChild(r);
    });
    body.appendChild(ch);

    const weak = el('div', 'verdict');
    weak.innerHTML = '<h5>技巧使用画像</h5>';
    const order = SK.Tech.ORDER.concat(['trial']);
    const lines = order.map(k => {
      const n = c.techUse[k] || 0;
      return '<div class="bar" title="' + (SK.Tech.META[k].name) + '"><i style="width:' + Math.min(100, n) + '%"></i></div><span class="muted">' + SK.Tech.META[k].name + ' · ' + n + '</span>';
    }).join('');
    weak.appendChild(el('', 'chip-row', '')).innerHTML = '';
    const wrap = el('div', '');
    wrap.innerHTML = lines;
    weak.appendChild(wrap);
    body.appendChild(weak);

    const badges = el('div', 'acc');
    badges.innerHTML = '<div class="acc-head"><div><b>徽章</b><small>' + SK.Game.badges().filter(b => b.got).length + '/8</small></div><span class="acc-arrow">›</span></div><div class="acc-body"><div class="acc-inner"></div></div>';
    const bi = badges.querySelector('.acc-inner');
    SK.Game.badges().forEach(b => {
      const r = row(b.name, b.desc, b.got ? '已获得' : '未达成', null, b.got ? 'on' : 'disabled');
      r.querySelector('.row-tail').insertAdjacentHTML('afterbegin', '<svg class="ic sm"><use href="#' + (b.got ? 'i-trophy' : 'i-lock') + '"></use></svg>');
      bi.appendChild(r);
    });
    badges.querySelector('.acc-head').addEventListener('click', () => badges.classList.toggle('open'));
    body.appendChild(badges);

    body.appendChild(row('最近一局的关卡', '跳到关卡表继续', '›', () => { M.closeSheet(); M.go('levels'); }));
  };

  /* ---------- 结果屏 ---------- */
  M.showResult = function (res) {
    U.$('#result-title').textContent = '第 ' + res.level + ' 关 · ' + (res.pure ? '完美通关' : '已通关');
    U.$('#result-badge').textContent = res.grade + ' · ' + res.chapter;
    const stars = U.$$('#result-stars svg');
    stars.forEach((s, i) => { s.classList.remove('lit'); if (i < res.stars) setTimeout(() => { s.classList.add('lit'); U.sound('star'); }, 220 + i * 260); });
    const g = U.$('#result-grid');
    g.innerHTML =
      '<div><b>' + SK.fmtTime(res.time) + '</b><small>用时（参考 ' + SK.fmtTime(res.par) + '）</small></div>' +
      '<div><b>' + res.score + '</b><small>得分</small></div>' +
      '<div><b>' + res.mistakes + ' / ' + res.hints + '</b><small>失误 / 提示</small></div>';
    const ai = el('div', 'verdict');
    ai.innerHTML = '<h5>AI 复盘</h5>';
    const d = S.data || {};
    ai.appendChild(el('', '', '')).textContent = '这一关给定 ' + res.clues + ' 个数，难度分 ' + (d.score || '-') + '，需要 ' + (d.maxTier >= 6 ? '试位与假设' : 'T' + (d.maxTier || 1) + ' 档技巧') + '。你用了 ' + res.hints + ' 次提示、AI 代填 ' + res.aiSteps + ' 格。' + (res.pure ? '全程自主，非常干净。' : res.stars < 3 ? '下次试试只用一次「技巧讲解」，把推理留在自己脑子里。' : '已经很稳，试着零提示过一章。');
    U.$('#result-ai').innerHTML = '';
    U.$('#result-ai').appendChild(ai);
    U.$('#btn-next').querySelector('em').textContent = res.level >= 100 ? '天阶已满 · 回顾关卡' : '下一关 · Lv ' + (res.level + 1);
    M.go('result');
  };
})();
