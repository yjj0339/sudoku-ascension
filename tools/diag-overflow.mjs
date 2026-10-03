/* 溢出诊断：逐屏找出超出视口的元素 */
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PAGE = process.env.PAGE || 'http://localhost:8123';
const PORT = +(process.env.PORT || 9481);
const W = +(process.env.W || 412), H = +(process.env.H || 892);
const udd = join(tmpdir(), 'suk-ovf'); try { rmSync(udd, { recursive: true, force: true }); } catch (e) { }
const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--remote-debugging-port=' + PORT, '--user-data-dir=' + udd,
  '--window-size=' + W + ',' + H, '--force-device-scale-factor=2', '--hide-scrollbars', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pend = new Map();
const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
for (let i = 0; i < 80; i++) { try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (l.find(x => x.type === 'page')) break; } catch (e) { } await sleep(200); }
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
ws.onmessage = e => { const d = JSON.parse(e.data); if (d.id && pend.has(d.id)) { const p = pend.get(d.id); pend.delete(d.id); d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result); } };
await new Promise(r => ws.onopen = r);
const evl = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true, touch: true });
await send('Page.navigate', { url: PAGE });
await sleep(1600);

const probe = () => evl(`(function(){
 var vw=document.documentElement.clientWidth, out=[];
 document.querySelectorAll('*').forEach(function(e){
   var r=e.getBoundingClientRect();
   if (r.width===0) return;
   if (r.right > vw+1 || r.left < -1) {
     var st=getComputedStyle(e);
     out.push({ sel: e.tagName.toLowerCase()+(e.id?'#'+e.id:'')+(e.className&&typeof e.className==='string'?'.'+e.className.trim().split(/\\s+/).slice(0,2).join('.'):''),
       left:Math.round(r.left), right:Math.round(r.right), w:Math.round(r.width), pos:st.position, of:st.overflowX });
   }
 });
 document.documentElement.style.overflowX="visible"; document.body.style.overflow="visible";
 var dw=document.documentElement.scrollWidth;
 var keys=["#screen-title",".brand",".hero-card",".hero-actions",".hero-actions .btn","#title-ladder",".ai-intro",".card-p"].map(function(s){var e=document.querySelector(s); if(!e) return {s:s,miss:1}; var r=e.getBoundingClientRect(); return {s:s, left:Math.round(r.left), right:Math.round(r.right), w:Math.round(r.width), sw:e.scrollWidth, cl: e.scrollWidth>e.clientWidth+1};});
 return { vw: vw, docW_after: dw, docW: document.documentElement.scrollWidth, screen: document.body.dataset.screen, keys: keys, over: out.slice(0,8) };
})()`);

const screens = ['title'];
for (const s of ['levels', 'play']) screens.push(s);
console.log(JSON.stringify(await probe(), null, 1));
await evl(`SK.App.startLevel(1)`); await sleep(1400);
console.log(JSON.stringify(await probe(), null, 1));
await evl(`SK.Menus.go('levels')`); await sleep(600);
console.log(JSON.stringify(await probe(), null, 1));
await evl(`SK.Menus.go('title')`); await sleep(600);
console.log(JSON.stringify(await probe(), null, 1));
ws.close(); chrome.kill(); process.exit(0);
