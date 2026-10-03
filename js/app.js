/* 应用装配：启动、路由、计时、键盘、生成排队 */
(function () {
  const SK = window.SK, App = (SK.App = {});
  const S = SK.Session, U = SK.UI, M = SK.Menus;
  App.screen = 'title';
  App.busy = false;

  App.setBusy = function (v) { App.busy = v; };

  /* 桌面副驾面板：宽屏才渲染，且节流（analyze 不便宜） */
  App.railSoon = function (force) {
    if (window.innerWidth < 1100) return;
    const t = Date.now();
    if (!force && App._railAt && t - App._railAt < 2000) return;
    App._railAt = t;
    try { M.renderRail(); } catch (e) { console.warn('rail', e); }
  };
  SK.Game.on('load', () => App.railSoon(true));
  SK.Game.on('change', () => App.railSoon());
  window.addEventListener('resize', () => App.railSoon(true));

  /* ---------- 关卡加载（带生成遮罩） ---------- */
  App.startLevel = function (n, opts) {
    opts = opts || {};
    n = Math.max(1, Math.min(100, n | 0));
    if (!SK.Progress.unlocked(n) && !opts.force) { U.toast({ kind: 'warn', title: '尚未解锁', text: '先通过第 ' + (n - 1) + ' 关。' }); return; }
    M.go('play');
    const cached = !opts.fresh && SK.Levels.cached(n);
    if (!cached) {
      U.loading(true, 'AI 正在出题', '第 ' + n + ' 关 · 生成唯一解盘面并校准难度');
      setTimeout(() => {
        try {
          const t0 = Date.now();
          SK.Levels.get(n);
          S.level = n; S.data = SK.Levels.cached(n);
          SK.Game.load(n);
          App.afterLoad(Date.now() - t0, n);
        } catch (e) {
          console.error(e);
          U.toast({ kind: 'bad', title: '出题失败', text: String(e.message || e) });
        } finally { U.loading(false); }
      }, 60);
    } else {
      SK.Game.load(n, opts);
      App.afterLoad(0, n);
    }
  };

  App.afterLoad = function (ms, n) {
    U.clearMarks();
    U.renderAll();
    U.syncTools();
    U.syncSwitches();
    App.railSoon(true);
    const d = S.data;
    const meta = SK.Levels.meta(n);
    U.toast({
      kind: ms > 0 ? 'ai' : '', title: 'Lv ' + n + ' · ' + (d.grade || meta.band),
      text: (ms > 0 ? '生成用了 ' + ms + 'ms · ' : '') + '给定 ' + d.clues + ' 数 · 难度分 ' + d.score + ' · ' + (d.guesses ? '需 ' + d.guesses + ' 次假设' : '纯推理可解'),
      ms: 2200,
    });
    if (n === 1 && !SK.Store.get('onboarded', false)) {
      SK.Store.set('onboarded', true);
      setTimeout(() => U.toast({ kind: 'ai', title: '第一次玩？', text: 'AI 大师有六级：从「只告诉你看哪里」到「全程替你填」。', ms: 3200 }), 2400);
    }
  };

  /* ---------- 工具条动作 ---------- */
  App.tool = function (act, btn) {
    U.haptic(6);
    if (act === 'undo') { if (!SK.Game.undoStep()) U.toast({ title: '没有可撤销的步骤' }); U.sound('tap'); return; }
    if (act === 'redo') { if (!SK.Game.redoStep()) U.toast({ title: '没有可重做的步骤' }); U.sound('tap'); return; }
    if (act === 'erase') {
      if (S.selected < 0) { U.toast({ title: '先选一格' }); return; }
      U.vanish(S.selected, () => { SK.Game.erase(); U.renderAll(); });
      U.sound('tap'); return;
    }
    if (act === 'note') { const on = SK.Game.toggleNote(); U.toast({ title: on ? '笔记模式：开' : '笔记模式：关', text: on ? '点数字会在格里写候选。' : '恢复为直接填数。' }); U.sound('note'); return; }
    if (act === 'hint') { M.openSheet('sheet-ai'); M.aiTab('hint'); U.sound('ai'); return; }
    if (act === 'ai') { M.openSheet('sheet-ai'); M.aiTab('analyze'); U.sound('ai'); return; }
    if (act === 'pause') { SK.Game.pause(); App.showPause(); return; }
  };

  App.showPause = function () {
    M.openSub('已暂停', '计时已停', (() => {
      const wrap = U.el('div', '');
      const b1 = U.el('button', 'btn btn-hero', '<span class="btn-glow"></span><em>继续</em>');
      b1.addEventListener('click', () => { SK.Game.unpause(); M.closeSub(); });
      const b2 = U.el('button', 'btn btn-ghost', '回到关卡表');
      b2.addEventListener('click', () => { M.closeSub(); SK.Game.save(); M.go('levels'); });
      wrap.appendChild(b1); wrap.appendChild(b2);
      return wrap;
    })());
  };

  /* ---------- 结算与通关 ---------- */
  SK.Game.on('win', res => {
    U.flash();
    U.sound('win');
    U.mark('suggest', [], 0);
    setTimeout(() => M.showResult(res), 620);
  });
  SK.Game.on('wrong', e => { U.shake(e.i); U.sound('bad'); U.haptic(28); });
  SK.Game.on('good', () => U.sound('place'));
  SK.Game.on('select', () => { U.renderAll(); U.syncTools(); });
  SK.Game.on('change', () => { U.syncTools(); U.renderHud(); });
  SK.Game.on('cell', i => U.renderCell(i));
  SK.Game.on('note-mode', on => U.toast({ title: on ? '笔记模式' : '直接填数', ms: 1200 }));
  SK.Game.on('settings', () => { U.renderAll(); U.syncSwitches(); });

  /* ---------- 键盘 ---------- */
  function onKey(e) {
    if (document.body.dataset.screen !== 'play') return;
    if (e.key >= '1' && e.key <= '9') { U.onKey(+e.key); e.preventDefault(); return; }
    if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') { App.tool('erase'); e.preventDefault(); return; }
    if (e.key === 'n' || e.key === 'N') { App.tool('note'); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { App.tool(e.shiftKey ? 'redo' : 'undo'); e.preventDefault(); return; }
    if (e.key === 'h' || e.key === 'H') { M.openSheet('sheet-ai'); M.aiTab('hint'); return; }
    if (e.key === 'Escape') { if (M.stack.length || M.subOpen) M.closeSheet(), M.closeSub(); else M.go('levels'); return; }
    const arrow = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 }[e.key];
    if (arrow != null) {
      const cur = S.selected < 0 ? 0 : S.selected;
      const nx = cur + arrow;
      if (nx >= 0 && nx < 81) SK.Game.select(nx);
      e.preventDefault();
    }
  }

  /* ---------- 计时 ---------- */
  function tick() {
    if (document.body.dataset.screen === 'play' && S.st && !S.paused && !S.won) {
      U.$('#hud-timer').textContent = SK.fmtTime(SK.Game.elapsed());
      if (S.selected >= 0) U.renderNumpad();
    }
  }

  /* ---------- 性能降级探测 ---------- */
  function perfCheck() {
    const cores = navigator.hardwareConcurrency || 4;
    const mem = navigator.deviceMemory || 4;
    if (cores <= 4 || mem <= 3) { document.body.classList.add('perf-lite'); if (SK.Settings.light === 'rich') SK.Settings.set('light', 'soft'); }
    if (!('backdrop-filter' in document.documentElement.style) && !('webkitBackdropFilter' in document.documentElement.style)) {
      document.body.classList.add('no-glass');
      U.toast({ title: '这台设备不支持毛玻璃', text: '已自动切换为等效实色面板，功能不受影响。', ms: 3600 });
    }
  }

  /* ---------- 启动 ---------- */
  App.boot = function () {
    SK.Settings.apply();
    U.measure();
    window.addEventListener('resize', () => { U.measure(); U.followSelectionLight(); });
    U.buildBoard();
    U.buildNumpad();
    U.buildTools();
    M.renderTitle();
    perfCheck();
    document.addEventListener('visibilitychange', () => { if (document.hidden) { SK.Game.pause(); SK.Game.save(); } });
    document.addEventListener('keydown', onKey);

    /* 顶栏与抽屉按钮的统一委托 */
    document.addEventListener('click', e => {
      const nav = e.target.closest('[data-nav]');
      if (nav) {
        const to = nav.dataset.nav;
        if (to === 'levels' && document.body.dataset.screen === 'play' && SK.Settings.confirmExit && !S.won) {
          U.confirm('离开对局？', '进度已自动保存，可继续。').then(v => { if (v) { SK.Game.save(); M.go('levels'); } });
          return;
        }
        M.go(to); return;
      }
      const sh = e.target.closest('[data-sheet]');
      if (sh && !sh.classList.contains('tab')) { M.openSheet(sh.dataset.sheet); return; }
      if (e.target.id === 'scrim') { if (M.subOpen) M.closeSub(); else M.sheetBack(); return; }
      if (e.target.closest('.sheet-close')) { M.sheetBack(); return; }
      if (e.target.closest('.sheet-back')) { M.sheetBack(); return; }
      if (e.target.closest('.subsheet-close')) { M.closeSub(); return; }
      if (e.target.closest('.subsheet-back')) { M.closeSub(); return; }
    });

    U.$('#hud-timer').addEventListener('click', () => App.tool('pause'));
    U.$('#hud-timer').style.cursor = 'pointer';
    U.$('#ai-strip-btn').addEventListener('click', () => { M.openSheet('sheet-ai'); M.aiTab('hint'); U.sound('ai'); });

    U.$('#btn-continue').addEventListener('click', () => {      const saved = SK.Store.get('session', null);
      if (saved && !saved.won && SK.Progress.unlocked(saved.level)) {
        if (SK.Game.resumeSaved()) { M.go('play'); U.renderAll(); U.syncSwitches(); U.syncTools(); U.toast({ title: '已恢复上一局', text: '第 ' + saved.level + ' 关 · 已用 ' + SK.fmtTime(saved.elapsed || 0) }); return; }
      }
      App.startLevel(SK.Progress.nextLevel());
    });
    U.$('#btn-next').addEventListener('click', () => {
      const n = Math.min(100, S.level + 1);
      if (S.level >= 100) { M.go('levels'); return; }
      App.startLevel(n);
    });
    U.$('#btn-replay').addEventListener('click', () => App.startLevel(S.level, { fresh: false }));
    U.$('#btn-review').addEventListener('click', () => {
      const path = SK.AI.referencePath(S.data.puzzle);
      App.startLevel(S.level);
      setTimeout(() => U.playPath(path, { speed: 110, explain: false }), 320);
      U.toast({ kind: 'ai', title: 'AI 演示解法', text: path.length + ' 步，随时点「工具 → 重新开始本关」回到你的盘面。', ms: 3400 });
      M.go('play');
    });

    setInterval(tick, 500);
    setInterval(() => { if (document.body.dataset.screen === 'play' && !S.won) SK.Game.save(); }, 15000);

    if (window.matchMedia('(display-mode: standalone)').matches === false && navigator.standalone !== true) {
      /* 桌面浏览器宽屏提示：竖屏更好看 */
      if (window.innerWidth > 760) setTimeout(() => U.toast({ title: '手机竖屏体验最佳', text: '窄屏下抽屉与二级菜单会自动收敛。', ms: 3000 }), 1200);
    }
    M.go('title');
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', App.boot);
  else App.boot();
})();
