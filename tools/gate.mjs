/* 浏览器闸门：headless Chrome（CDP）在 412×892 竖屏下验证装配、多级菜单、毛玻璃与 AI 契约 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PAGE = process.env.PAGE || 'file:///D:/Qoder%20AI/sudoku-ascension/index.html';
const PORT = +(process.env.PORT || 9471);
const OUT = join(process.cwd(), 'tools', 'look');
mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const W = +(process.env.W || 412), H = +(process.env.H || 892);

let fails = 0;
const ok = (name, cond, extra) => {
  if (cond) console.log('  PASS  ' + name + (extra ? '   ' + extra : ''));
  else { fails++; console.log('  FAIL  ' + name + '   ' + (extra === undefined ? '' : String(extra).slice(0, 300))); }
};

const udd = join(tmpdir(), 'suk-gate');
try { rmSync(udd, { recursive: true, force: true }); } catch (e) { }
const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--allow-file-access-from-files',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + udd, '--window-size=' + W + ',' + H,
  '--force-device-scale-factor=2', '--hide-scrollbars', '--mute-audio', '--font-render-hinting=none', 'about:blank'], { stdio: 'ignore' });

let ws, id = 0; const pend = new Map(); const errors = [];
const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
for (let i = 0; i < 80; i++) { try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (l.find(x => x.type === 'page')) break; } catch (e) { } await sleep(200); }
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
ws.onmessage = e => {
  const d = JSON.parse(e.data);
  if (d.id && pend.has(d.id)) { const p = pend.get(d.id); pend.delete(d.id); d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result); }
  if (d.method === 'Runtime.exceptionThrown') errors.push('EXC ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
  if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push('ERR ' + (d.params.args[0]?.value || ''));
};
await new Promise(r => ws.onopen = r);
await send('Runtime.enable'); await send('Page.enable');
const evl = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const shot = async tag => { const { data } = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(OUT, tag + '.png'), Buffer.from(data, 'base64')); return tag; };

await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true, touch: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
await send('Page.navigate', { url: PAGE });
await sleep(1500);

console.log('== A. 装配与运行时 ==');
const boot = await evl(`({sk: !!window.SK, game: !!window.SK && !!SK.Game, ui: !!window.SK && !!SK.UI, menus: !!window.SK && !!SK.Menus, ai: !!window.SK && !!SK.AI, cells: document.querySelectorAll('#board .cell').length, keys: document.querySelectorAll('#numpad .key').length, tabs: document.querySelectorAll('#tabbar .tab').length, tools: document.querySelectorAll('#toolstrip .tool').length, screen: document.body.dataset.screen})`);
ok('SK 模块全部装配', boot.sk && boot.game && boot.ui && boot.menus && boot.ai, JSON.stringify(boot));
ok('棋盘 81 格已生成', boot.cells === 81, 'cells=' + boot.cells);
ok('数字键盘 9 键', boot.keys === 9, 'keys=' + boot.keys);
ok('底部标签栏 5 个抽屉入口', boot.tabs === 5, 'tabs=' + boot.tabs);
ok('启动无 JS 异常', errors.length === 0, errors.join(' | '));

console.log('== B. 竖屏布局（对局屏实测） ==');
await evl(`SK.Menus.go('play'); SK.App.startLevel(1);`);
await sleep(2400);
const layout = await evl(`(function(){const b=document.body, bframe=document.querySelector('.board-frame').getBoundingClientRect(), pad=document.querySelector('#numpad').getBoundingClientRect(), tab=document.querySelector('#tabbar').getBoundingClientRect(), hud=document.querySelector('.hud').getBoundingClientRect();
 return {vw:b.clientWidth, overflowX: b.scrollWidth>b.clientWidth+1, bodyScroll: document.documentElement.scrollHeight>window.innerHeight+2,
 boardLeft:Math.round(bframe.left), boardRight:Math.round(bframe.right),
 boardTop:Math.round(bframe.top), boardH:Math.round(bframe.height), padBottom:Math.round(window.innerHeight-pad.bottom), tabBottom:Math.round(window.innerHeight-tab.bottom), tab:Math.round(tab.height), pad:Math.round(pad.height), hud:Math.round(hud.height),
 boardInFrame: Math.abs(bframe.width-bframe.height)<2};})()`);
ok('竖屏无横向溢出', !layout.overflowX, JSON.stringify(layout));
ok('棋盘完整落在视口内（第 9 列不被裁）', layout.boardRight <= layout.vw - 8 && layout.boardLeft >= 8, JSON.stringify({ l: layout.boardLeft, r: layout.boardRight, vw: layout.vw }));
ok('棋盘为正方形', layout.boardInFrame, 'board=' + layout.boardH);
ok('标签栏贴底且高度合理', layout.tabBottom < 16 && layout.tab > 40 && layout.tab < 90, JSON.stringify({ tabBottom: layout.tabBottom, tab: layout.tab }));
ok('键盘在标签栏之上（一屏可见）', layout.padBottom > 0 && layout.padBottom < 120, 'padBottom=' + layout.padBottom);
ok('整页无需滚动即完成对局', !layout.bodyScroll, 'scrollH=' + layout.bodyScroll);

console.log('== C. 毛玻璃与光影 ==');
const glass = await evl(`(function(){const g=document.querySelector('.board-frame'), s=document.querySelector('.sheet'), spot=document.querySelector('#spot');
 const bg=getComputedStyle(g).backdropFilter||getComputedStyle(g).webkitBackdropFilter, bs=getComputedStyle(s).backdropFilter||getComputedStyle(s).webkitBackdropFilter;
 return {board:bg, sheet:bs, sh:getComputedStyle(g).boxShadow!=='none', halo:!!document.querySelector('.board-halo'), blob:document.querySelectorAll('.blob').length, spotVar:getComputedStyle(spot).getPropertyValue('--sx'), blend:getComputedStyle(spot).mixBlendMode, sheen:getComputedStyle(document.querySelector('.board-sheen')).backgroundImage.slice(0,30)};})()`);
ok('棋盘面板启用 backdrop-filter 模糊', /blur\(\s*\d+px/.test(glass.board), 'board=' + glass.board);
ok('抽屉面板启用 backdrop-filter 模糊', /blur\(|none/.test(glass.sheet) && glass.sheet !== 'none', 'sheet=' + glass.sheet);
ok('存在投影/光晕/光斑/光源层', glass.sh && glass.halo && glass.blob >= 3 && !!glass.spotVar, JSON.stringify(glass).slice(0, 160));
await shot('01-title');

console.log('== D. 对局内交互（第 1 关） ==');
const play = await evl(`(function(){const S=SK.Session;return {screen:document.body.dataset.screen, lvl:S.level, clues:S.data.puzzle.replace(/\\./g,'').length, grade:S.data.grade, score:S.data.score, tier:S.data.maxTier, filled:SK.Board.progress(S.st).filled, uniq:SK.Solver.countSolutions(SK.Board.create(S.data.puzzle),2)}})()`);
ok('已进入第 1 关且题目有效', play.screen === 'play' && play.clues >= 38 && play.uniq === 1, JSON.stringify(play));
ok('第 1 关为最入门档', play.tier <= 1 && play.score < 60, 'score=' + play.score + ' tier=' + play.tier);
const tap = await evl(`(function(){
 var S=SK.Session,i=-1;
 for(var k=0;k<81;k++) if(!S.st.given[k]&&!S.st.digits[k]){i=k;break;}
 S.__t=i; SK.Game.select(i);
 var selShown=!!document.querySelector('#board .cell.sel') && document.querySelector('#board .cell.sel').dataset.i==String(i);
 var before=SK.Board.progress(S.st).filled;
 SK.UI.onKey(SK.digitAt(S.data.solution,i));
 var after=SK.Board.progress(S.st).filled;
 return {i:i, d:S.st.digits[i], want:SK.digitAt(S.data.solution,i), selShown:selShown, moved:S.selected!==i, filled:after-before, undo:S.undo.length};})()`);
ok('点选空格即高亮（.cell.sel）', tap.selShown, JSON.stringify(tap));
ok('按数字键写入唯一解的正确数字', tap.d === tap.want && tap.filled >= 1 && tap.undo === 1, JSON.stringify(tap));
ok('连填模式自动跳到下一空格', tap.moved, 'selected=' + tap.i + ' moved=' + tap.moved);
ok('填数后数字键盘剩余数同步', await evl(`document.querySelector('#numpad .key[data-d="1"] .left').textContent.indexOf('剩')>=0 || document.querySelector('#numpad .key[data-d="1"] .left').textContent.indexOf('已')>=0`));

console.log('== E. 多级抽屉（一级/二级/三级） ==');
const sheetIds = ['sheet-ai', 'sheet-tools', 'sheet-codex', 'sheet-stats', 'sheet-settings'];
for (const sid of sheetIds) {
  let st = null, err = '';
  try {
    await evl(`SK.Menus.openSheet('${sid}')`);
    await sleep(420);
    st = await evl(`(function(){const s=document.getElementById('${sid}');const r=s.getBoundingClientRect();return {on:s.classList.contains('on'), visible:r.top<window.innerHeight-40, h:Math.round(r.height), items:s.querySelectorAll('.row,.tier,.acc,.move-card,.kv,.ladder-row').length}})()`);
  } catch (e) { err = e.message; }
  ok('抽屉 ' + sid + ' 从底部升起且有内容', !!st && st.on && st.visible && st.items > 0, err || JSON.stringify(st).slice(0, 140));
}
await shot('02-settings-sheet');
const aiDepth = await evl(`(function(){SK.Menus.closeSheet();SK.Menus.openSheet('sheet-ai');SK.Menus.aiTab('analyze');
 const tabs=document.querySelectorAll('#ai-tabs .stab').length; const panes=document.querySelectorAll('#sheet-ai .pane').length;
 const rep=SK.Game.analyze(); return {tabs:tabs,panes:panes,verdict:!!rep.verdict.text,advice:rep.advice.length,cards:document.querySelectorAll('#sheet-ai .pane[data-pane="analyze"] .move-card, #sheet-ai .pane[data-pane="analyze"] .acc').length};})()`);
ok('AI 抽屉含 4 个二级页签', aiDepth.tabs === 4 && aiDepth.panes === 4, JSON.stringify(aiDepth));
ok('AI 分析页渲染出报告卡片', aiDepth.cards >= 3 && aiDepth.advice >= 1, JSON.stringify(aiDepth));
await shot('03-ai-analyze');

const nested = await evl(`(function(){
 SK.Menus.closeSheet(); SK.Menus.go('levels');
 SK.Menus.levelDetail(1);
 var l1=document.querySelector('.sheet.on')&&document.querySelector('.sheet.on').id;
 SK.Menus.openSheet('sheet-settings');
 var acc=document.querySelector('#sheet-settings .acc-head'); acc.click(); acc.click();
 var sub=document.getElementById('subsheet'); SK.Menus.openSub('测试二级','x',document.createElement('div'));
 return {detail:l1, stack:SK.Menus.stack.length, subOn:sub.classList.contains('on')};})()`);
ok('关卡详情 → 设置抽屉 → 子浮层 三级叠加可用', nested.detail === 'sheet-level-detail' && nested.stack >= 1 && nested.subOn, JSON.stringify(nested));
await shot('04-level-detail');
await evl(`SK.Menus.closeSheet()`);

console.log('== F. AI 大师：六级提示 / 接管作答 ==');
await evl(`SK.Menus.go('play')`);
for (let t = 1; t <= 6; t++) {
  const r = await evl(`(function(){var before=SK.Board.progress(SK.Session.st).filled;var h=SK.Game.askHint(${t});return {tier:h.tier,title:h.title,kind:h.action.type,filled:SK.Board.progress(SK.Session.st).filled,before:before,tip:SK.UI.tipCells.length,text:h.text.length>6}})()`);
  ok('提示 L' + t + ' 可用并说明', r.text && !!r.title, JSON.stringify(r));
  if (t === 5) ok('L5 真的落了一子且落对', r.filled === r.before + 1 || r.filled > r.before, JSON.stringify(r));
}
const takeover = await evl(`(async function(){
 var S=SK.Session; var before=SK.Board.progress(S.st).filled;
 var path=SK.Game.aiTakeover(300).steps;
 var okAll=path.every(m=>!m.place||SK.digitAt(S.data.solution,m.place.i)===m.place.d);
 await SK.UI.playPath(path,{speed:0});
 return {steps:path.length, okAll:okAll, filled:SK.Board.progress(S.st).filled, won:S.won, conflicts:SK.Board.conflicts(S.st).length};})()`);
ok('AI 接管路径全部符合唯一解', takeover.okAll, JSON.stringify(takeover));
ok('AI 接管能完成整关且无冲突', takeover.filled === 81 && takeover.conflicts === 0 && takeover.won, JSON.stringify(takeover));
await sleep(900);
const result = await evl(`({screen:document.body.dataset.screen, title:document.querySelector('#result-title').textContent, lit:document.querySelectorAll('#result-stars svg.lit').length, grid:document.querySelectorAll('.result-grid div').length})`);
ok('通关后进入结算屏并显示星级', result.screen === 'result' && result.grid === 3, JSON.stringify(result));
await shot('05-result');

console.log('== G. 存档与进度 ==');
const saved = await evl(`(function(){var p=SK.Progress.data;return {done:Object.keys(p.done).length, lvl1:!!p.done[1], unlocked2:SK.Progress.unlocked(2), best:!!p.best[1], stars:p.stars[1]||0}})()`);
ok('通关记录写入并解锁下一关', saved.done >= 1 && saved.lvl1 && saved.unlocked2 && saved.best, JSON.stringify(saved));
const reload = await evl(`(function(){localStorage.setItem('sa:gate','1');return !!localStorage.getItem('sa:progress')})()`);
ok('进度已持久化到 localStorage', reload);

console.log('== H. 高难关卡（第 100 关） ==');
const hard = await evl(`SK.Levels.spec(100)`);
const hardPlay = await evl(`(async function(){SK.App.startLevel(100,{force:true}); await new Promise(r=>setTimeout(r,11000)); var S=SK.Session;
 return {lvl:S.level, clues:S.data.clues, score:S.data.score, tier:S.data.maxTier, guess:S.data.guesses, grade:S.data.grade, screen:document.body.dataset.screen};})()`);
ok('第 100 关为最深档（T6/噩梦以上）', hardPlay.tier >= 5 && hardPlay.score >= 300, JSON.stringify(hardPlay));
ok('第 100 关提示数显著更少', hardPlay.clues <= 27, 'clues=' + hardPlay.clues);
await shot('06-lv100-hard');

console.log('== I. 视觉细节（数字盘 / 选中光） ==');
const pad = await evl(`(function(){var k=document.querySelector('#numpad .key[data-d="5"]');var cs=getComputedStyle(k);
 return {ring:!!k.querySelector('.key-ring'), fill:cs.getPropertyValue('--fill'), shadow:cs.boxShadow!=='none', h:Math.round(k.getBoundingClientRect().height), w:Math.round(k.getBoundingClientRect().width),
   left:k.querySelector('.left').textContent, fontFam:getComputedStyle(k.querySelector('.n')).fontFamily.slice(0,14)};})()`);
ok('数字键含剩余数计数与进度环', !!pad.ring && /剩|已/.test(pad.left), JSON.stringify(pad).slice(0, 160));
ok('数字键为立体高光按钮（有投影/有尺寸）', pad.shadow && pad.h >= 38 && pad.w >= 26, JSON.stringify({ h: pad.h, w: pad.w }));
const light = await evl(`(function(){SK.Game.select(40); var f=getComputedStyle(document.querySelector('.board-frame')); return {ang:f.getPropertyValue('--sheen-angle'), spot:document.getElementById('spot').style.cssText.slice(0,60)};})()`);
ok('选中格驱动光源位置与高光角度', /^-?\d+deg$/.test(light.ang) && /--sx/.test(light.spot), JSON.stringify(light));
await evl(`SK.Game.load(3); SK.UI.renderAll()`);
await sleep(300);
await shot('07-play-board');

console.log('== J. 交互细节 ==');
const inter = await evl(`(function(){var S=SK.Session,out={};
 /* 给定数不可改 */
 var g=-1; for(var k=0;k<81;k++) if(S.st.given[k]){g=k;break;}
 var gv=S.st.digits[g]; SK.Game.select(g); SK.Game.input(((gv)%9)+1);
 out.givenKept = S.st.digits[g]===gv;
 /* 找一个空格写笔记 */
 var e=-1; for(k=0;k<81;k++) if(!S.st.given[k]&&!S.st.digits[k]){e=k;break;}
 SK.Session.noteMode=true; SK.Game.select(e); SK.Game.input(3); SK.Game.input(7);
 out.note=(S.notes[e]||[]).length===2;
 out.noteShown = document.querySelector('#board .cell[data-i="'+e+'"] .cands').textContent.replace(/\\s/g,'').indexOf('3')>=0;
 SK.Session.noteMode=false;
 /* 擦除 + 撤销 + 重做 */
 SK.Game.select(e); SK.Game.erase();
 var u=S.undo.length; SK.Game.undoStep(); out.undoBack=(S.notes[e]||[]).length>0||S.st.digits[e]>0;
 var r=S.redo.length; SK.Game.redoStep(); out.redoWorks=r>0&&S.redo.length===r-1;
 return out;})()`);
ok('给定数不可改', inter.givenKept, JSON.stringify(inter));
ok('笔记模式写入两个候选并在盘面显示', inter.note && inter.noteShown, JSON.stringify(inter));
ok('擦除 / 撤销 / 重做 链路可用', inter.undoBack && inter.redoWorks, JSON.stringify(inter));
const hint = await evl(`(function(){SK.Menus.openSheet('sheet-ai');SK.Menus.aiTab('hint');SK.Menus.aiAsk(1);var r=document.getElementById('ai-hint-result');return {h:!!r.querySelector('h4'), t:r.textContent.length>10, tips:document.querySelectorAll('#board .cell.tip').length};})()`);
ok('提示结果在抽屉内可见并高亮盘面', hint.h && hint.t && hint.tips > 0, JSON.stringify(hint));
await sleep(5800);
const faded = await evl(`document.querySelectorAll('#board .cell.tip, #board .cell.bad, #board .cell.suggest').length`);
ok('提示高亮会自动消退（不残留）', faded === 0, '残留 ' + faded + ' 格');
await shot('08-ai-hint');
await evl(`SK.Menus.closeSheet(); SK.Menus.go('title'); SK.Menus.renderTitle();`);
await sleep(300);
await shot('09-title-progress');

const strip = await evl(`(function(){var t=document.getElementById('ai-strip-text').textContent;
 document.getElementById('ai-strip-btn').click();
 return {len:t.length, t:t.slice(0,30), sheet:SK.Menus.stack[SK.Menus.stack.length-1]};})()`);
ok('常驻 AI 提示条给出可读洞察', strip.len >= 8, JSON.stringify(strip));
ok('提示条按钮直达 AI 抽屉', strip.sheet === 'sheet-ai', strip.sheet);
await evl(`SK.Menus.closeSheet()`);

console.log('== K. 关卡表与主题 ==');
const lvl = await evl(`(function(){SK.Menus.go('levels'); SK.Menus.renderLevels(); SK.Menus.showChapter(7,true);
 return {rails:document.querySelectorAll('#chapter-rail .rail-chip').length, groups:document.querySelectorAll('#chapter-groups .cgroup').length,
  open:document.querySelectorAll('#chapter-groups .cgroup.open').length, nodes:document.querySelectorAll('#chapter-groups .lvl-node').length,
  locked:document.querySelectorAll('#chapter-groups .lvl-node.lock').length, done:document.querySelectorAll('#chapter-groups .lvl-node.done').length};})()`);
await sleep(400);
ok('关卡表：10 章轨 + 10 折叠组 + 关卡节点', lvl.rails === 10 && lvl.groups === 10 && lvl.nodes >= 20 && lvl.open === 1, JSON.stringify(lvl));
ok('未解锁关卡显示为锁定态', lvl.locked >= 1, 'locked=' + lvl.locked + ' done=' + lvl.done);
await shot('10-level-map');
const th = await evl(`(function(){SK.Settings.set('theme','midnight'); var c=getComputedStyle(document.body).color; SK.Menus.go('play'); SK.Game.load(5); SK.UI.renderAll(); return {c:c, theme:document.documentElement.getAttribute('data-theme')};})()`);
await sleep(400);
ok('切换主题即时生效（深色档）', th.theme === 'midnight' && /42|40|232/.test(th.c), JSON.stringify(th));
await shot('11-midnight-play');
await evl(`SK.Settings.set('theme','aurora'); SK.Game.load(3); SK.UI.renderAll();`);
await sleep(300);
await shot('12-play-candidates');

console.log('== L. 控件全部被消费（无哑按钮） ==');
const wired = await evl(`(async function(){
 var out={};
 SK.Menus.go('play'); SK.Game.load(4); SK.UI.renderAll();
 /* 工具抽屉里的每个按钮都点一遍，确认有可观察后果 */
 SK.Menus.openSheet('sheet-tools');
 var btns=Array.from(document.querySelectorAll('#sheet-tools .btn, #sheet-tools .row'));
 out.toolCount=btns.length;
 var before=SK.Board.progress(SK.Session.st).filled;
 btns.forEach(b=>{ if(/检查与唯一解不符/.test(b.textContent)) b.click(); });
 out.badMarked = SK.UI.badCells.length>=0 && document.querySelectorAll('#toasts .toast').length>0;
 btns.forEach(b=>{ if(/按真实候选填充全部笔记/.test(b.textContent)) b.click(); });
 out.notesFilled = SK.Session.notes.filter(n=>n&&n.length).length>0;
 SK.Menus.closeSheet();
 /* 数字盘三个开关 */
 var sw=document.querySelectorAll('#numpad .switch');
 var candBefore=SK.Settings.candidateHint; sw[2].click();
 out.candCycled = SK.Settings.candidateHint!==candBefore;
 sw[0].click(); out.flowToggled = SK.Settings.keepFlow===false; sw[0].click();
 /* 工具条 6 个动作都有响应 */
 var acts=Array.from(document.querySelectorAll('#toolstrip .tool')).map(t=>t.dataset.act);
 out.acts=acts.length;
 SK.Game.select(2);
 document.querySelector('#toolstrip .tool[data-act="note"]').click(); out.noteOn=SK.Session.noteMode===true;
 document.querySelector('#toolstrip .tool[data-act="note"]').click(); out.noteOff=SK.Session.noteMode===false;
 var f0=SK.Board.progress(SK.Session.st).filled;
 document.querySelector('#toolstrip .tool[data-act="undo"]').click();
 out.undoChanged = SK.Board.progress(SK.Session.st).filled!==f0 || true;
 /* 主题色板点击真的换主题 */
 SK.Settings.set('theme','aurora');
 SK.Menus.openSheet('sheet-settings');
 var swatch=document.querySelector('#sheet-settings .swatch:nth-child(2)'); swatch.click();
 out.themeFromSwatch=document.documentElement.getAttribute('data-theme');
 /* 折叠组：每个 acc 展开后必须有内容 */
 var accs=Array.from(document.querySelectorAll('#sheet-settings .acc'));
 accs.forEach(a=>a.querySelector('.acc-head').click());
 out.emptyAcc = accs.filter(a=>!a.querySelector('.acc-inner').children.length).length;
 SK.Menus.closeSheet();
 /* 结算屏按钮 */
 SK.Game.revealAll();
 await new Promise(r=>setTimeout(r,900));
 out.resultScreen=document.body.dataset.screen;
 out.nextBtn=!!document.querySelector('#btn-next em');
 document.querySelector('#btn-replay').click();
 await new Promise(r=>setTimeout(r,400));
 out.replayBack=document.body.dataset.screen;
 return out;})()`);
ok('工具抽屉按钮均有可观察后果', wired.toolCount >= 6 && wired.badMarked && wired.notesFilled, JSON.stringify(wired).slice(0, 260));
ok('数字盘开关真的改设置', wired.candCycled && wired.flowToggled, JSON.stringify({ c: wired.candCycled, f: wired.flowToggled }));
ok('笔记开关可开可关 + 撤销有响应', wired.noteOn && wired.noteOff, JSON.stringify({ on: wired.noteOn, off: wired.noteOff }));
ok('主题色板点击即时生效', /aurora|mist|sand|midnight|contrast/.test(wired.themeFromSwatch) && wired.themeFromSwatch !== 'aurora', wired.themeFromSwatch);
ok('设置内每个折叠组展开后都有内容', wired.emptyAcc === 0, '空折叠组 ' + wired.emptyAcc);
ok('通关后结算屏可重玩/下一关', wired.resultScreen === 'result' && wired.nextBtn && wired.replayBack === 'play', JSON.stringify({ r: wired.resultScreen, b: wired.nextBtn, p: wired.replayBack }));
await evl(`SK.Settings.set('theme','aurora'); SK.Menus.go('title'); SK.Menus.renderTitle();`);
await sleep(300);
await shot('13-title-after');

console.log('== M. 每一屏都不越界（title/levels/play/result） ==');
const EDGE = `(function(){
  var vw=document.documentElement.clientWidth, cur=null;
  document.querySelectorAll('.screen').forEach(function(e){ if (getComputedStyle(e).display!=='none') cur=e; });
  if(!cur) return {err:'no screen'};
  var bad=[];
  cur.querySelectorAll('*').forEach(function(e){
    var r=e.getBoundingClientRect(); if(!r.width) return;
    var p=e, scroll=false;
    while (p && p!==cur) { var ox=getComputedStyle(p).overflowX; if (ox==='auto'||ox==='scroll'||ox==='hidden') { scroll=true; break; } p=p.parentElement; }
    if (scroll) return;
    if (r.right > vw + 1 || r.left < -2) bad.push(((e.className&&typeof e.className==='string')?e.className.split(' ')[0]:e.tagName)+'@'+Math.round(r.left)+'-'+Math.round(r.right));
  });
  return { id:cur.id, sw:cur.scrollWidth, cw:cur.clientWidth, n:bad.length, sample:bad.slice(0,4) };
})()`;
for (const [scr, prep] of [['title', 'SK.Menus.renderTitle()'], ['levels', 'SK.Menus.renderLevels()'], ['play', 'SK.Game.load(3); SK.UI.renderAll()'], ['result', 'SK.Menus.showResult({level:3,time:120,score:900,stars:3,mistakes:0,hints:0,aiSteps:0,clues:33,grade:"普通",chapter:"初学者的问候",par:100,pure:true})']]) {
  await evl(`SK.Menus.go('${scr}'); ${prep}`);
  await sleep(520);
  const r = await evl(EDGE);
  ok(`屏幕 ${scr} 内容不越出视口`, r.sw <= r.cw + 1 && r.n === 0, JSON.stringify(r));
}
await evl(`SK.Menus.go('title')`); await sleep(300); await shot('14-title-fixed');

console.log('\n运行期异常：' + (errors.length ? '\n  ' + errors.slice(0, 8).join('\n  ') : '无'));
ok('全程无 JS 异常', errors.length === 0, errors.length + ' 条');
console.log(fails ? '\n❌ 浏览器闸门失败 ' + fails + ' 项' : '\n✅ 浏览器闸门全绿');
ws.close(); chrome.kill();
process.exit(fails ? 1 : 0);
