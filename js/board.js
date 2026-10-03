/* 棋盘状态：digits(0=空) + masks(空格候选；已填格为 0)，assign 带约束传播 */
(function () {
  const SK = window.SK, B = (SK.Board = {});

  B.create = function (givenStr) {
    const given = SK.parse(givenStr);
    const st = { given, digits: new Uint8Array(given), masks: new Uint16Array(81) };
    B.recompute(st);
    return st;
  };
  B.clone = function (st) {
    return { given: st.given, digits: new Uint8Array(st.digits), masks: new Uint16Array(st.masks) };
  };
  B.recompute = function (st) {
    for (let i = 0; i < 81; i++) {
      if (st.digits[i]) { st.masks[i] = 0; continue; }
      let m = SK.ALL;
      const P = SK.PEERS[i];
      for (let k = 0; k < P.length; k++) { const d = st.digits[P[k]]; if (d) m &= ~SK.BIT[d]; }
      st.masks[i] = m;
    }
    return st;
  };
  B.conflicts = function (st) {
    const out = [];
    for (let i = 0; i < 81; i++) {
      const d = st.digits[i]; if (!d || st.given[i]) continue;
      const P = SK.PEERS[i];
      for (let k = 0; k < P.length; k++) if (st.digits[P[k]] === d) { out.push(i); break; }
    }
    return out;
  };
  /* 赋值并传播；out 收集 [cell,digit] 顺序。冲突/矛盾 -> ok:false（不回滚，调用方负责克隆） */
  B.assign = function (st, i, d, out) {
    out = out || [];
    const cur = st.digits[i];
    if (cur === d) return { ok: true, out };
    if (cur !== 0) return { ok: false, out };
    const P = SK.PEERS[i];
    for (let k = 0; k < P.length; k++) if (st.digits[P[k]] === d) return { ok: false, out };
    st.digits[i] = d; st.masks[i] = 0; out.push([i, d]);
    const bit = SK.BIT[d], queue = [];
    for (let k = 0; k < P.length; k++) {
      const j = P[k];
      if (st.digits[j] || !(st.masks[j] & bit)) continue;
      st.masks[j] &= ~bit;
      if (st.masks[j] === 0) return { ok: false, out };
      if (SK.POP[st.masks[j]] === 1) queue.push(j);
    }
    for (let q = 0; q < queue.length; q++) {
      const j = queue[q];
      if (st.digits[j]) continue;
      if (!B.assign(st, j, SK.LOW[st.masks[j]], out).ok) return { ok: false, out };
    }
    return { ok: true, out };
  };
  /* 仅删除候选（用于技巧消除），返回是否产生矛盾 */
  B.eliminate = function (st, i, d) {
    if (st.digits[i]) return false;
    const bit = SK.BIT[d];
    if (!(st.masks[i] & bit)) return false;
    st.masks[i] &= ~bit;
    return st.masks[i] === 0;
  };
  B.clear = function (st, i) {
    if (st.given[i] || !st.digits[i]) return;
    st.digits[i] = 0;
    B.recompute(st);
  };
  B.setValue = function (st, i, d) {
    if (st.given[i]) return { ok: false, out: [] };
    if (st.digits[i] === d) return { ok: true, out: [] };
    st.digits[i] = 0;
    B.recompute(st);
    if (d === 0) return { ok: true, out: [] };
    return B.assign(st, i, d);
  };
  /* 玩家手写：允许造成冲突（UI 负责标红），不做连锁传播 */
  B.forceSet = function (st, i, d) {
    if (st.given[i]) return false;
    st.digits[i] = d;
    B.recompute(st);
    return true;
  };
  /* 难度评分专用落子：只删候选，不做连锁，保证每一步都被计入推理成本 */
  B.placeNoCascade = function (st, i, d) {
    if (st.digits[i] === d) return true;
    if (st.digits[i] !== 0) return false;
    const P = SK.PEERS[i];
    for (let k = 0; k < P.length; k++) if (st.digits[P[k]] === d) return false;
    st.digits[i] = d; st.masks[i] = 0;
    const bit = SK.BIT[d];
    for (let k = 0; k < P.length; k++) {
      const j = P[k];
      if (st.digits[j] || !(st.masks[j] & bit)) continue;
      st.masks[j] &= ~bit;
      if (st.masks[j] === 0) return false;
    }
    return true;
  };
  B.isSolved = function (st) {
    for (let i = 0; i < 81; i++) if (!st.digits[i]) return false;
    return B.conflicts(st).length === 0;
  };
  B.progress = function (st) {
    let filled = 0;
    for (let i = 0; i < 81; i++) if (st.digits[i]) filled++;
    return { filled, total: 81, left: 81 - filled };
  };
  /* 每数字剩余待填个数 */
  B.remaining = function (st) {
    const r = new Int8Array(10);
    for (let d = 1; d <= 9; d++) r[d] = 9;
    for (let i = 0; i < 81; i++) { const d = st.digits[i]; if (d) r[d]--; }
    return r;
  };
})();
