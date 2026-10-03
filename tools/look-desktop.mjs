/* 桌面尺寸视觉取证：逐屏截图 + 布局体检（重叠/溢出/裁切）+ 断言 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PAGE = 'http://localhost:8123';
const PORT = +(process.env.PORT || 9491);
const OUT = join(process.cwd(), 'tools', 'look-desktop');
mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const udd = join(tmpdir(), 'suk-desk'); try { rmSync(udd, { recursive: true, force: true }); } catch (e) { }
const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--remote-debugging-port=' + PORT, '--user-data-dir=' + udd,
  '--window-size=1440,900', '--force-device-scale-factor=1', '--hide-scrollbars', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
let ws, id = 0; const pend = new Map(); const errors = [];
const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
for (let i = 0; i < 80; i++) { try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (l.find(x => x.type === 'page')) break; } catch (e) { } await sleep(200); }
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
ws.onmessage = e => {
  const d = JSON.parse(e.data);
  if (d.id && pend.has(d.id)) { const p = pend.get(d.id); pend.delete(d.id); d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result); }
  if (d.method === 'Runtime.exceptionThrown') errors.push('EXC ' + (d.params.exceptionDetails.exception?.description || ''));
};
await new Promise(r => ws.onopen = r);
const evl = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
const shot = async t => { const { data } = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(OUT, t + '.png'), Buffer.from(data, 'base64')); };
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: PAGE });
await sleep(1600);

const AUDIT = `(function(){
  var vw=innerWidth, vh=innerHeight, cur=null;
  document.querySelectorAll('.screen').forEach(function(e){ if (getComputedStyle(e).display!=='none') cur=e; });
  var cr=cur.getBoundingClientRect();
  var rl=document.querySelector('.desk-rail'), railOn = rl && getComputedStyle(rl).display!=='none';
  var rr = railOn ? rl.getBoundingClientRect() : null;
  var b=document.querySelector('#board'), n=document.querySelector('#numpad'), k=n&&n.querySelector('.key'), t=document.querySelector('#tabbar');
  var strip=document.querySelector('.ai-strip'), sr=(strip && getComputedStyle(strip).display!=='none') ? strip.getBoundingClientRect() : null;
  var nb = n?n.getBoundingClientRect():null, bad=[];
  document.querySelectorAll('.card, .board-frame, .numpad, .tabbar, .toolstrip, .hud, .appbar, .lvl-grid').forEach(function(e){
    var r=e.getBoundingClientRect(); if(!r.width) return;
    if (r.right > vw+1 || r.left < -1) bad.push(e.className.toString().slice(0,26)+'@x'+Math.round(r.left)+'-'+Math.round(r.right));
    if (r.bottom > vh+1 && getComputedStyle(e).position!=='fixed') bad.push(e.className.toString().slice(0,26)+'@bottom'+Math.round(r.bottom));
  });
  return { vw:vw, vh:vh,
    col:[Math.round(cr.left), Math.round(cr.right)],
    rail: rr? [Math.round(rr.left), Math.round(rr.right)] : 'off',
    overlap: rr? Math.round(cr.right - rr.left) : 0,
    board: b?Math.round(b.getBoundingClientRect().width):0,
    boardBottom: b?Math.round(b.getBoundingClientRect().bottom):0,
    key: k? Math.round(k.getBoundingClientRect().width)+'x'+Math.round(k.getBoundingClientRect().height):0,
    tabW: t?Math.round(t.getBoundingClientRect().width):0,
    stripGap: (sr && b) ? Math.round(b.getBoundingClientRect().top - sr.bottom) : null,
    toastOverNumpad: (function(){ var tt=document.querySelector('#toasts .toast'); if(!tt||!nb) return false; var r=tt.getBoundingClientRect(); return !(r.bottom < nb.top || r.top > nb.bottom); })(),
    clip: bad.slice(0,6)
  };
})()`;
const show = async tag => { const j = await evl(AUDIT); console.log(tag.padEnd(10), JSON.stringify(j)); return j; };

await show('title'); await shot('a-title');
await evl(`SK.App.startLevel(1)`); await sleep(1700);
const play = await show('play'); await shot('b-play');
await evl(`SK.Menus.openSheet('sheet-ai'); SK.Menus.aiTab('analyze')`); await sleep(700);
await show('ai-sheet'); await shot('c-ai-sheet');
await evl(`SK.Menus.closeSheet(); SK.Menus.openSheet('sheet-settings')`); await sleep(700); await shot('d-settings');
await evl(`SK.Menus.closeSheet(); SK.Menus.go('levels'); SK.Menus.renderLevels(); SK.Menus.showChapter(1,true)`); await sleep(700);
await show('levels'); await shot('e-levels');
await evl(`SK.Menus.closeSheet(); SK.Game.revealAll()`); await sleep(1600); await shot('f-result');
await send('Emulation.setDeviceMetricsOverride', { width: 1180, height: 820, deviceScaleFactor: 1, mobile: false });
await evl(`SK.Menus.go('play'); SK.Game.load(2); SK.UI.renderAll(); SK.App.railSoon(true)`); await sleep(700);
const mid = await show('1180x820'); await shot('g-play-1180');
await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 700, deviceScaleFactor: 1, mobile: false });
await evl(`SK.Game.load(3); SK.UI.renderAll()`); await sleep(600);
const narrow = await show('900x700'); await shot('h-play-900');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await evl(`SK.Menus.go('title'); SK.Menus.renderTitle()`); await sleep(500); await shot('i-title-1440');

let bad = 0;
const need = (name, cond, extra) => { if (cond) console.log('  PASS  ' + name); else { bad++; console.log('  FAIL  ' + name + '  ' + JSON.stringify(extra)); } };
console.log('--- 桌面断言 ---');
need('副驾面板已显示', play.rail !== 'off', play.rail);
need('副驾面板与游戏列不重叠', play.overlap <= 0, play);
need('棋盘完整在视口内', play.boardBottom > 0 && play.boardBottom < play.vh, play.boardBottom);
need('数字键比例正常（宽 ≤ 56）', parseInt(play.key, 10) > 0 && parseInt(play.key, 10) <= 56, play.key);
need('提示条不压在键盘上', play.toastOverNumpad === false, play.toastOverNumpad);
need('洞察条与棋盘衔接自然（间隙 < 26px）', play.stripGap !== null && play.stripGap < 26, play.stripGap);
need('1180 宽：两栏不重叠', mid.overlap <= 0, mid);
need('900 宽：无元素被裁', narrow.clip.length === 0, narrow.clip);
need('无 JS 异常', errors.length === 0, errors.slice(0, 3));
console.log(bad ? '\n❌ 桌面体检失败 ' + bad + ' 项' : '\n✅ 桌面体检全绿');
ws.close(); chrome.kill(); process.exit(bad ? 1 : 0);
