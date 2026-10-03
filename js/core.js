/* 数独内核：位标候选、单元/邻居表、随机源 */
(function () {
  const SK = (window.SK = window.SK || {});

  SK.BIT = new Uint16Array(10);      // 数字 1..9 -> 位
  for (let d = 1; d <= 9; d++) SK.BIT[d] = 1 << (d - 1);
  SK.ALL = 0x1ff;
  SK.POP = new Uint8Array(512);
  for (let m = 1; m < 512; m++) SK.POP[m] = SK.POP[m >> 1] + (m & 1);
  SK.LOW = new Uint8Array(512);      // 最低位对应数字
  for (let m = 1; m < 512; m++) { let b = m & -m, d = 1; while (b >>= 1) d++; SK.LOW[m] = d; }

  SK.rowOf = i => (i / 9) | 0;
  SK.colOf = i => i % 9;
  SK.boxOf = i => (((i / 9) | 0) / 3 | 0) * 3 + ((i % 9) / 3 | 0);
  SK.cellOf = (r, c) => r * 9 + c;
  SK.boxCell = (b, k) => ((b / 3 | 0) * 3 + (k / 3 | 0)) * 9 + (b % 3) * 3 + (k % 3);

  // 27 个单元：0-8 行, 9-17 列, 18-26 宫
  SK.UNITS = [];
  for (let r = 0; r < 9; r++) { const u = []; for (let c = 0; c < 9; c++) u.push(SK.cellOf(r, c)); SK.UNITS.push(u); }
  for (let c = 0; c < 9; c++) { const u = []; for (let r = 0; r < 9; r++) u.push(SK.cellOf(r, c)); SK.UNITS.push(u); }
  for (let b = 0; b < 9; b++) { const u = []; for (let k = 0; k < 9; k++) u.push(SK.boxCell(b, k)); SK.UNITS.push(u); }

  SK.UNIT_OF = [];                   // 每格所属 3 个单元
  for (let i = 0; i < 81; i++) SK.UNIT_OF[i] = [SK.rowOf(i), 9 + SK.colOf(i), 18 + SK.boxOf(i)];

  SK.PEERS = [];                     // 每格的 20 个邻居
  for (let i = 0; i < 81; i++) {
    const s = new Set();
    for (const u of SK.UNIT_OF[i]) for (const j of SK.UNITS[u]) if (j !== i) s.add(j);
    SK.PEERS[i] = Int8Array.from(s);
  }

  SK.digitAt = (s, i) => { const ch = s.charCodeAt(i); return ch >= 49 && ch <= 57 ? ch - 48 : 0; };
  SK.parse = s => { const a = new Uint8Array(81); for (let i = 0; i < 81; i++) a[i] = SK.digitAt(s, i); return a; };
  SK.stringify = arr => { let o = ''; for (let i = 0; i < 81; i++) o += arr[i] || '.'; return o; };

  SK.mulberry32 = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  SK.randInt = (rng, n) => Math.floor(rng() * n);
  SK.shuffle = function (arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) { const j = SK.randInt(rng, i + 1); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    return arr;
  };
  SK.hash = function (str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  SK.fmtTime = function (sec) {
    sec = Math.max(0, Math.floor(sec));
    const m = (sec / 60) | 0, s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  };
})();
