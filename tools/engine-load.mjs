/* Node 侧加载浏览器脚本（无构建，纯全局 SK 命名空间） */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['core.js', 'board.js', 'tech.js', 'solver.js', 'generator.js', 'levels.js', 'ai.js'];

export function loadEngine() {
  const win = {};
  const sandbox = { window: win, console, Math, JSON, Set, Map, Uint8Array, Uint16Array, Int16Array, Array, Object, String, Number, Date };
  for (const f of FILES) {
    try {
      const src = readFileSync(join(ROOT, 'js', f), 'utf8');
      new Function('window', 'console', 'performance', src)(win, console, { now: () => Number(process.hrtime.bigint() / 1000n) / 1000 });
    } catch (e) {
      throw new Error('load ' + f + ': ' + e.message + '\n' + e.stack);
    }
  }
  return win.SK;
}
