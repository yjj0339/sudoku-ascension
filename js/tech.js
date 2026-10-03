/* 技巧引擎：数独人类解法（唯一候选/隐性唯一/数对/指向/区块/数组/_X-翼/剑鱼/试位）。
   提示、AI 分析、难度评分共用同一套判定，保证三者结论一致。 */
(function () {
  const SK = window.SK, T = (SK.Tech = {});

  T.META = {
    nakedSingle: { name: '唯一候选', en: 'Naked Single', weight: 1, tier: 1, tip: '这一格所在的行、列、宫已经出现过其余 8 个数字，只剩一个可填。' },
    hiddenSingle: { name: '隐性唯一', en: 'Hidden Single', weight: 2, tier: 1, tip: '在某一行/列/宫里，这个数字只有唯一一个位置能放。' },
    nakedPair: { name: '显性数对', en: 'Naked Pair', weight: 6, tier: 2, tip: '两格候选完全相同且只有两个数，则这两个数不会出现在同单元其它格。' },
    pointing: { name: '指向对子', en: 'Pointing', weight: 7, tier: 2, tip: '宫内某个数字只落在同一行（或列），该行（列）其它宫就不能再放它。' },
    claiming: { name: '区块摒除', en: 'Claiming', weight: 7, tier: 2, tip: '行（列）中某个数字只落在一个宫，该宫其它位置就不能再放它。' },
    hiddenPair: { name: '隐性数对', en: 'Hidden Pair', weight: 10, tier: 3, tip: '某单元里两个数字只出现在同样两格，这两格的其它候选全部可删。' },
    nakedTriple: { name: '显性数组', en: 'Naked Triple', weight: 14, tier: 3, tip: '三格候选合起来只含三个数字，则这三个数字在同单元其它格被排除。' },
    xwing: { name: 'X-翼', en: 'X-Wing', weight: 22, tier: 4, tip: '两行中某数字都只落在同样两列，构成矩形，这两列的其它位置不能放它。' },
    swordfish: { name: '剑鱼', en: 'Swordfish', weight: 34, tier: 5, tip: '三行（或三列）的某数字被限制在同样三列（行）内，可做同向摒除。' },
    trial: { name: '试位法', en: 'Bifurcation', weight: 60, tier: 6, tip: '假设某候选成立，若立刻引发矛盾则删之，若可贯通则成立。' },
  };
  T.ORDER = ['nakedSingle', 'hiddenSingle', 'nakedPair', 'pointing', 'claiming', 'hiddenPair', 'nakedTriple', 'xwing', 'swordfish'];

  T.cellName = i => 'R' + (SK.rowOf(i) + 1) + 'C' + (SK.colOf(i) + 1);
  T.unitName = u => (u < 9 ? '第 ' + (u + 1) + ' 行' : u < 18 ? '第 ' + (u - 9 + 1) + ' 列' : '第 ' + (u - 18 + 1) + ' 宫');
  T.listCells = list => list.map(T.cellName).join('、');

  const emptyCellsOf = (st, unit) => { const o = []; for (const i of SK.UNITS[unit]) if (!st.digits[i]) o.push(i); return o; };

  function mk(key, extra) {
    const m = T.META[key];
    return Object.assign({ key: key, name: m.name, en: m.en, weight: m.weight, tier: m.tier, tip: m.tip, elim: [], place: null, focus: [], digit: 0 }, extra);
  }

  T.nakedSingle = function (st) {
    for (let i = 0; i < 81; i++) {
      if (!st.digits[i] && SK.POP[st.masks[i]] === 1) {
        const d = SK.LOW[st.masks[i]];
        return mk('nakedSingle', { place: { i: i, d: d }, digit: d, focus: [i], why: T.cellName(i) + ' 只剩唯一候选 ' + d + '，直接填入。' });
      }
    }
    return null;
  };

  T.hiddenSingle = function (st) {
    for (let u = 0; u < 27; u++) {
      const cells = emptyCellsOf(st, u);
      if (cells.length < 2) continue;
      for (let d = 1; d <= 9; d++) {
        const bit = SK.BIT[d];
        let hit = -1, n = 0;
        for (const i of cells) if (st.masks[i] & bit) { hit = i; n++; if (n > 1) break; }
        if (n === 1) {
          return mk('hiddenSingle', { place: { i: hit, d: d }, digit: d, focus: [hit].concat(cells), why: '在' + T.unitName(u) + '中，数字 ' + d + ' 只能放在 ' + T.cellName(hit) + '。' });
        }
      }
    }
    return null;
  };

  T.nakedPair = function (st) {
    for (let u = 0; u < 27; u++) {
      const cells = emptyCellsOf(st, u);
      for (let a = 0; a < cells.length; a++) {
        const ia = cells[a];
        if (SK.POP[st.masks[ia]] !== 2) continue;
        for (let b = a + 1; b < cells.length; b++) {
          const ib = cells[b];
          if (st.masks[ib] !== st.masks[ia]) continue;
          const elim = [];
          for (const j of cells) {
            if (j === ia || j === ib) continue;
            for (let d = 1; d <= 9; d++) if (st.masks[j] & SK.BIT[d] && st.masks[ia] & SK.BIT[d]) elim.push({ i: j, d: d });
          }
          if (elim.length) {
            const ds = []; for (let d = 1; d <= 9; d++) if (st.masks[ia] & SK.BIT[d]) ds.push(d);
            return mk('nakedPair', { elim: elim, digit: ds[0], focus: [ia, ib], why: T.unitName(u) + '中 ' + T.cellName(ia) + ' 与 ' + T.cellName(ib) + ' 候选同为 {' + ds.join(' ') + '}，该单元其它格的 ' + ds.join('/') + ' 可删。' });
          }
        }
      }
    }
    return null;
  };

  T.pointing = function (st) {
    for (let b = 0; b < 9; b++) {
      const unit = 18 + b, cells = emptyCellsOf(st, unit);
      for (let d = 1; d <= 9; d++) {
        const bit = SK.BIT[d];
        const hit = cells.filter(i => st.masks[i] & bit);
        if (hit.length < 2) continue;
        const rows = new Set(hit.map(SK.rowOf)), cols = new Set(hit.map(SK.colOf));
        let line = -1, dir = 0;
        if (rows.size === 1) { line = hit[0] / 9 | 0; dir = 0; }
        else if (cols.size === 1) { line = hit[0] % 9; dir = 1; }
        else continue;
        const elim = [];
        for (let k = 0; k < 9; k++) {
          const i = dir === 0 ? line * 9 + k : k * 9 + line;
          if (SK.boxOf(i) === b || st.digits[i] || !(st.masks[i] & bit)) continue;
          elim.push({ i: i, d: d });
        }
        if (elim.length) return mk('pointing', { elim: elim, digit: d, focus: hit, why: '第 ' + (b + 1) + ' 宫内数字 ' + d + ' 只出现在' + (dir === 0 ? '第 ' + (line + 1) + ' 行' : '第 ' + (line + 1) + ' 列') + '，该行（列）宫外的 ' + d + ' 可删。' });
      }
    }
    return null;
  };

  T.claiming = function (st) {
    for (let u = 0; u < 18; u++) {
      const cells = emptyCellsOf(st, u);
      for (let d = 1; d <= 9; d++) {
        const bit = SK.BIT[d];
        const hit = cells.filter(i => st.masks[i] & bit);
        if (hit.length < 2) continue;
        const boxes = new Set(hit.map(SK.boxOf));
        if (boxes.size !== 1) continue;
        const boxId = SK.boxOf(hit[0]);
        const elim = [];
        for (const j of emptyCellsOf(st, 18 + boxId)) {
          if (!(st.masks[j] & bit)) continue;
          const same = u < 9 ? SK.rowOf(j) === SK.rowOf(hit[0]) : SK.colOf(j) === SK.colOf(hit[0]);
          if (!same) elim.push({ i: j, d: d });
        }
        if (elim.length) return mk('claiming', { elim: elim, digit: d, focus: hit, why: T.unitName(u) + '中数字 ' + d + ' 只落在第 ' + (boxId + 1) + ' 宫，该宫其它格的 ' + d + ' 可删。' });
      }
    }
    return null;
  };

  T.hiddenPair = function (st) {
    for (let u = 0; u < 27; u++) {
      const cells = emptyCellsOf(st, u);
      if (cells.length < 3) continue;
      for (let d1 = 1; d1 <= 9; d1++) {
        for (let d2 = d1 + 1; d2 <= 9; d2++) {
          const set1 = cells.filter(i => st.masks[i] & SK.BIT[d1]);
          const set2 = cells.filter(i => st.masks[i] & SK.BIT[d2]);
          if (set1.length !== 2 || set2.length !== 2) continue;
          if (set1[0] !== set2[0] || set1[1] !== set2[1]) continue;
          const hit = set1, bit = SK.BIT[d1] | SK.BIT[d2];
          const elim = [];
          for (const j of hit) for (let d = 1; d <= 9; d++) if ((st.masks[j] & SK.BIT[d]) && !(bit & SK.BIT[d])) elim.push({ i: j, d: d });
          if (elim.length) return mk('hiddenPair', { elim: elim, digit: d1, focus: hit, why: T.unitName(u) + '中数字 ' + d1 + ' 和 ' + d2 + ' 只出现在 ' + T.listCells(hit) + '，这两格的其余候选可删。' });
        }
      }
    }
    return null;
  };

  T.nakedTriple = function (st) {
    for (let u = 0; u < 27; u++) {
      const cells = emptyCellsOf(st, u).filter(i => SK.POP[st.masks[i]] <= 3);
      if (cells.length < 3) continue;
      for (let a = 0; a < cells.length - 2; a++)
        for (let b = a + 1; b < cells.length - 1; b++)
          for (let c = b + 1; c < cells.length; c++) {
            const uni = st.masks[cells[a]] | st.masks[cells[b]] | st.masks[cells[c]];
            if (SK.POP[uni] !== 3) continue;
            const elim = [];
            for (const j of cells) {
              if (j === cells[a] || j === cells[b] || j === cells[c]) continue;
              for (let d = 1; d <= 9; d++) if ((st.masks[j] & SK.BIT[d]) && (uni & SK.BIT[d])) elim.push({ i: j, d: d });
            }
            if (elim.length) {
              const ds = []; for (let d = 1; d <= 9; d++) if (uni & SK.BIT[d]) ds.push(d);
              return mk('nakedTriple', { elim: elim, digit: ds[0], focus: [cells[a], cells[b], cells[c]], why: T.unitName(u) + '中三格 {' + T.listCells([cells[a], cells[b], cells[c]]) + '} 候选合起来只有 {' + ds.join(' ') + '}，该单元其它格的这些数字可删。' });
            }
          }
    }
    return null;
  };

  function fish(st, size) {
    for (let d = 1; d <= 9; d++) {
      const bit = SK.BIT[d];
      for (let dir = 0; dir < 2; dir++) {
        const masks = new Int16Array(9), pos = [];
        for (let l = 0; l < 9; l++) {
          const unit = dir === 0 ? l : 9 + l, cells = emptyCellsOf(st, unit);
          let m = 0; const list = [];
          for (const i of cells) if (st.masks[i] & bit) { m |= 1 << (dir === 0 ? SK.colOf(i) : SK.rowOf(i)); list.push(i); }
          masks[l] = m; pos[l] = list;
        }
        const idx = [];
        for (let l = 0; l < 9; l++) { const p = SK.POP[masks[l]]; if (p >= 2 && p <= size) idx.push(l); }
        if (idx.length < size) continue;
        const combos = size === 2 ? pairCombos(idx) : tripleCombos(idx);
        for (const set of combos) {
          let uni = 0; for (const l of set) uni |= masks[l];
          if (SK.POP[uni] !== size) continue;
          const used = new Set(set);
          const elim = [];
          for (let l = 0; l < 9; l++) {
            if (used.has(l)) continue;
            for (const i of pos[l]) {
              const cross = dir === 0 ? SK.colOf(i) : SK.rowOf(i);
              if (uni & (1 << cross)) elim.push({ i: i, d: d });
            }
          }
          if (elim.length) {
            const focus = []; for (const l of set) focus.push.apply(focus, pos[l]);
            const ln = set.map(l => (dir === 0 ? '第 ' + (l + 1) + ' 行' : '第 ' + (l + 1) + ' 列')).join('、');
            return mk(size === 2 ? 'xwing' : 'swordfish', { elim: elim, digit: d, focus: focus, why: '数字 ' + d + ' 在' + ln + '中被限制在同样 ' + size + ' 条' + (dir === 0 ? '列' : '行') + '内，可对其余位置做摒除。' });
          }
        }
      }
    }
    return null;
  }
  function pairCombos(a) { const o = []; for (let i = 0; i < a.length - 1; i++) for (let j = i + 1; j < a.length; j++) o.push([a[i], a[j]]); return o; }
  function tripleCombos(a) { const o = []; for (let i = 0; i < a.length - 2; i++) for (let j = i + 1; j < a.length - 1; j++) for (let k = j + 1; k < a.length; k++) o.push([a[i], a[j], a[k]]); return o; }
  T.xwing = st => fish(st, 2);
  T.swordfish = st => fish(st, 3);

  /* 试位：找一个候选，假定成立后要么立刻矛盾（可删），要么能一路解完（可填） */
  T.trial = function (st) {
    const cands = [];
    for (let i = 0; i < 81; i++) if (!st.digits[i]) for (let d = 1; d <= 9; d++) if (st.masks[i] & SK.BIT[d]) cands.push([i, d]);
    cands.sort((a, b) => SK.POP[st.masks[a[0]]] - SK.POP[st.masks[b[0]]]);
    for (const pair of cands.slice(0, 24)) {
      const t = SK.Board.clone(st);
      const r = SK.Board.assign(t, pair[0], pair[1]);
      if (!r.ok) return mk('trial', { elim: [{ i: pair[0], d: pair[1] }], digit: pair[1], focus: [pair[0]], why: '假设 ' + T.cellName(pair[0]) + ' = ' + pair[1] + ' 会立刻造成矛盾，所以 ' + pair[1] + ' 不在该格。' });
      let solved = true;
      for (let k = 0; k < 81; k++) if (!t.digits[k]) { solved = false; break; }
      if (solved) return mk('trial', { place: { i: pair[0], d: pair[1] }, digit: pair[1], focus: [pair[0]], why: '假设 ' + T.cellName(pair[0]) + ' = ' + pair[1] + ' 可以顺畅解通，可作为突破口。' });
    }
    return null;
  };

  /* 按优先级找出下一个可用招法；withTrial=true 时允许试位 */
  T.findMove = function (st, withTrial) {
    for (const key of T.ORDER) { const m = T[key](st); if (m) return m; }
    if (withTrial) { const m = T.trial(st); if (m) return m; }
    return null;
  };

  /* 全盘扫描：当前所有可用招法（AI 分析用） */
  T.allMoves = function (st) {
    const out = [];
    for (const key of T.ORDER) {
      try { const m = T[key](st); if (m) out.push(m); } catch (e) { }
    }
    return out;
  };

  T.apply = function (st, move) {
    if (move.place) return SK.Board.assign(st, move.place.i, move.place.d);
    let bad = false;
    for (const e of move.elim) if (SK.Board.eliminate(st, e.i, e.d)) bad = true;
    return { ok: !bad, out: [] };
  };
})();
