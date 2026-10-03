/* 局域网静态服务：手机与电脑同一 WiFi 时，用手机浏览器打开打印出的地址即可竖屏游玩
   node tools/serve.mjs [端口]  */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';

/* 路径含空格时 import.meta.url 会被百分号编码，必须用 fileURLToPath 解回来 */
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PORT = +(process.argv[2] || 8123);
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon' };

const srv = createServer(async (req, res) => {
  const rel = decodeURIComponent((req.url || '/').split('?')[0]);
  const file = join(ROOT, rel === '/' ? 'index.html' : rel);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }
  try {
    const buf = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(buf);
  } catch (e) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('404 ' + rel);
  }
});

srv.listen(PORT, '0.0.0.0', () => {
  const ips = Object.values(networkInterfaces()).flat().filter(x => x && x.family === 'IPv4' && !x.internal).map(x => x.address);
  console.log('数独·天阶 已启动');
  console.log('  电脑： http://localhost:' + PORT);
  ips.forEach(ip => console.log('  手机： http://' + ip + ':' + PORT + '  （同一 WiFi，竖屏体验最佳）'));
});
