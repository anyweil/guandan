/* 掼蛋 AI 五档（阶段③）· 依赖 engine.js
 * 含完整出牌生成器（单/对/三/三带二/顺子/连对/钢板/炸弹/同花顺/天王炸，逢人配感知）
 * 五档：入门 / 中级 / 高级 / 大师 / 宗师。AI 只读自己手牌 + 公共信息(已出牌/各家张数)。
 */
(function (root) {
  'use strict';
  const GD = (typeof module !== 'undefined' && module.exports) ? require('../engine/engine.js') : root.GD;
  const T = GD.TYPE, SUITS = ['S', 'H', 'C', 'D'];
  const next = s => (s + 1) % 4, teammate = s => (s + 2) % 4, teamOf = s => (s % 2 === 0) ? 'A' : 'B';
  const TIER = { '入门': 0, '中级': 1, '高级': 2, '大师': 3, '宗师': 4 };

  // ---------- 索引 ----------
  function buildIndex(hand, level) {
    const wilds = hand.filter(c => GD.isWild(c, level));
    const jokers = hand.filter(GD.isJoker);
    const normal = hand.filter(c => !GD.isWild(c, level) && !GD.isJoker(c));
    const byRank = {}, byVal = {}, bySuitVal = { S: {}, H: {}, C: {}, D: {} };
    for (const c of normal) {
      (byRank[c.rank] = byRank[c.rank] || []).push(c);
      const v = GD.naturalRank(c.rank);
      (byVal[v] = byVal[v] || []).push(c);
      (bySuitVal[c.suit][v] = bySuitVal[c.suit][v] || []).push(c);
      if (c.rank === 'A') { (byVal[1] = byVal[1] || []).push(c); (bySuitVal[c.suit][1] = bySuitVal[c.suit][1] || []).push(c); }
    }
    return { wilds, jokers, normal, byRank, byVal, bySuitVal };
  }

  // ---------- 生成器 ----------
  // types 为可选集合，仅生成所需牌型（跟牌时提速）
  function allCombos(hand, level, types) {
    const idx = buildIndex(hand, level);
    const out = [], seen = new Set();
    const want = t => !types || types.has(t);
    const add = (cards) => {
      if (cards.some(c => c == null)) return;
      const cb = GD.classify(cards, level); if (!cb) return;
      if (types && !types.has(cb.type)) return;
      const sig = cb.type + '|' + cb.key + '|' + cb.len + '|' + (cb.suit || '');
      if (seen.has(sig)) return; seen.add(sig);
      out.push({ cards: cards.slice(), combo: cb });
    };
    const W = idx.wilds.length;

    if (want(T.SINGLE)) for (const c of hand) add([c]);

    // 对/三/炸（按点数，含逢人配）
    if (want(T.PAIR) || want(T.TRIPLE) || want(T.BOMB)) {
      for (const r in idx.byRank) {
        const cs = idx.byRank[r], k = cs.length;
        for (let size = 2; size <= Math.min(8, k + W); size++) {
          const un = Math.min(k, size), uw = size - un; if (uw > W) continue;
          add(cs.slice(0, un).concat(idx.wilds.slice(0, uw)));
        }
      }
      if (W >= 2 && want(T.PAIR)) add(idx.wilds.slice(0, 2));
    }
    // 天王炸
    if (want(T.KING_BOMB)) {
      const b = idx.jokers.filter(c => c.rank === GD.BIG), s = idx.jokers.filter(c => c.rank === GD.SMALL);
      if (b.length >= 2 && s.length >= 2) add([b[0], b[1], s[0], s[1]]);
    }
    // 三带二
    if (want(T.TRIPLE_PAIR)) {
      for (const a of GD.RANKS) {
        const ca = (idx.byRank[a] || []).length, wA = Math.max(0, 3 - ca); if (wA > W) continue;
        // 选一个对子点 b：优先自身≥2不耗逢人配，其次最小
        let chosen = null;
        for (const b of GD.RANKS) {
          if (b === a) continue;
          const cb = (idx.byRank[b] || []).length, wB = Math.max(0, 2 - cb);
          if (wA + wB > W) continue;
          if (!chosen || wB < chosen.wB) chosen = { b, cb, wB };
          if (wB === 0) break;
        }
        if (!chosen) continue;
        const tri = (idx.byRank[a] || []).slice(0, 3).concat(idx.wilds.slice(0, wA));
        const pr = (idx.byRank[chosen.b] || []).slice(0, 2).concat(idx.wilds.slice(wA, wA + chosen.wB));
        add(tri.concat(pr));
      }
    }
    // 顺子 / 同花顺
    if (want(T.STRAIGHT)) genStraight(idx, level, W, null, add);
    if (want(T.STRAIGHT_FLUSH)) for (const s of SUITS) genStraight(idx, level, W, s, add);
    // 连对(3组每组2) / 钢板(2组每组3)
    if (want(T.TUBE)) genSeq(idx, level, W, 3, 2, add);
    if (want(T.PLATE)) genSeq(idx, level, W, 2, 3, add);
    return out;
  }

  function genStraight(idx, level, W, suit, add) {
    const pool = suit ? idx.bySuitVal[suit] : idx.byVal;
    for (let lo = 1; lo + 4 <= 14; lo++) {
      const used = new Set(), cards = []; let need = 0;
      for (let v = lo; v <= lo + 4; v++) {
        const avail = (pool[v] || []).filter(c => !used.has(c.id));
        if (avail.length) { cards.push(avail[0]); used.add(avail[0].id); } else need++;
      }
      if (need > W) continue;
      for (let i = 0; i < need; i++) cards.push(idx.wilds[i]);
      add(cards);
    }
  }
  function genSeq(idx, level, W, groups, each, add) {
    for (let lo = 2; lo + groups - 1 <= 14; lo++) {
      const used = new Set(), cards = []; let need = 0;
      for (let v = lo; v <= lo + groups - 1; v++) {
        const avail = (idx.byVal[v] || []).filter(c => !used.has(c.id)).slice(0, each);
        for (const c of avail) used.add(c.id);
        cards.push(...avail); need += (each - avail.length);
      }
      if (need > W) continue;
      for (let i = 0; i < need; i++) cards.push(idx.wilds[i]);
      add(cards);
    }
  }

  function isBomb(combo) { return combo.bombScore > 0; }
  function movesBeating(hand, level, top) {
    if (!top) return allCombos(hand, level);
    if (isBomb(top)) {
      // 只能用更大的炸压
      const m = allCombos(hand, level, new Set([T.BOMB, T.KING_BOMB, T.STRAIGHT_FLUSH]));
      return m.filter(x => GD.beats(x.combo, top, level));
    }
    const types = new Set([top.type, T.BOMB, T.KING_BOMB, T.STRAIGHT_FLUSH]);
    const m = allCombos(hand, level, types);
    return m.filter(x => GD.beats(x.combo, top, level));
  }

  // ---------- 评估：估计“手数”（越少越接近打完） ----------
  function handScore(cards, level) {
    const cnt = {}; let wild = 0;
    for (const c of cards) {
      if (GD.isWild(c, level)) { wild++; continue; }
      const v = GD.isJoker(c) ? (c.rank === GD.BIG ? 17 : 16) : GD.naturalRank(c.rank);
      cnt[v] = (cnt[v] || 0) + 1;
    }
    let plays = 0; const singles = [];
    for (const v in cnt) { plays++; if (cnt[v] === 1) singles.push(+v); }
    singles.sort((a, b) => a - b);
    let run = 1, bonus = 0;
    for (let i = 1; i < singles.length; i++) {
      if (singles[i] === singles[i - 1] + 1) { run++; if (run >= 5) { bonus++; run = 1; } } else run = 1;
    }
    return plays - bonus * 3 - wild * 0.1;
  }
  function removeSig(hand, cards) { const ids = new Set(cards.map(c => c.id)); return hand.filter(c => !ids.has(c.id)); }

  // ---------- 记牌：某点数还剩多少未现身（不含我手牌、不含已出牌） ----------
  function remainingHigherSingles(hand, level, state, seat, myKey) {
    // 估计场上比 myKey 更大的“单牌威胁”数量（粗略，用于判断绝张）
    const seen = {};
    const acc = c => { const v = GD.isWild(c, level) ? 15 : GD.powerOfCard(c, level); seen[v] = (seen[v] || 0) + 1; };
    state.played.forEach(acc); hand.forEach(acc);
    let higher = 0;
    for (let v = myKey + 1; v <= 17; v++) {
      const total = v >= 16 ? 2 : 8;           // 王各2张；普通点8张（含级牌口径近似）
      higher += Math.max(0, total - (seen[v] || 0));
    }
    return higher;
  }

  // ---------- 五档决策 ----------
  function opponentsOf(seat) { return [next(seat), next(next(seat))].filter(s => teamOf(s) !== teamOf(seat)); }
  function minOppHand(state, seat) {
    return Math.min(...opponentsOf(seat).map(s => state.hands[s].length));
  }

  function makeAI(name) {
    const tier = TIER[name] != null ? TIER[name] : 1;
    return function decide(state, seat) {
      const hand = state.hands[seat], level = state.level, top = state.current, owner = state.currentOwner;
      // 跟牌阶段：队友正压着 → 高级+ 配合让牌
      if (top && owner != null && teammate(seat) === owner && tier >= 2) {
        const goOut = canGoOutNow(hand, level, top);
        if (!goOut) {
          // 队友牌少 或 队友这手够大 → 不盖队友
          if (state.hands[owner].length <= 6 || top.key >= 13 || isBomb(top)) return 'pass';
        }
      }
      return top ? follow(hand, level, top, state, seat, tier) : lead(hand, level, state, seat, tier);
    };
  }

  function canGoOutNow(hand, level, top) {
    const m = movesBeating(hand, level, top);
    return m.some(x => x.cards.length === hand.length);
  }

  function lead(hand, level, state, seat, tier) {
    const moves = allCombos(hand, level);
    if (!moves.length) return hand.slice(0, 1); // 兜底
    // 一把走完
    const goOut = moves.filter(m => m.cards.length === hand.length);
    if (goOut.length && tier >= 1) return strongest(goOut).cards;
    if (tier === 0) { // 入门：随机偏小，避免随手炸
      const nb = moves.filter(m => !isBomb(m.combo)); const pool = nb.length ? nb : moves;
      return pool[Math.floor(Math.random() * pool.length)].cards;
    }
    // 中级+：选“出后剩余手数最少、且尽量出小牌”的非炸组合
    const nb = moves.filter(m => !isBomb(m.combo)); const pool = nb.length ? nb : moves;
    let best = null, bestSc = Infinity;
    for (const m of pool) {
      const rem = removeSig(hand, m.cards);
      let sc = handScore(rem, level) + m.combo.key * 0.002;     // 同手数则出小牌
      if (tier >= 3 && state.hands[teammate(seat)].length <= 4) sc += m.combo.key * 0.01; // 队友将走：领更小
      if (sc < bestSc) { bestSc = sc; best = m; }
    }
    return best.cards;
  }

  function follow(hand, level, top, state, seat, tier) {
    const moves = movesBeating(hand, level, top);
    if (!moves.length) return 'pass';
    const nb = moves.filter(m => !isBomb(m.combo)).sort((a, b) => a.combo.key - b.combo.key);
    const bombs = moves.filter(m => isBomb(m.combo)).sort((a, b) => a.combo.bombScore - b.combo.bombScore || a.combo.key - b.combo.key);

    if (nb.length) {
      // 一把走完优先
      const out = nb.find(m => m.cards.length === hand.length);
      if (out) return out.cards;
      if (tier === 0) return (Math.random() < 0.65) ? nb[0].cards : 'pass';   // 入门：常乱跟或不跟
      if (tier === 1) return nb[0].cards;                                      // 中级：最小可压
      // 高级+：最小可压，但避免拆掉成型结构、避免无谓送大单
      const best = pickFollowAdvanced(hand, level, nb, state, seat, tier);
      return best ? best.cards : 'pass';
    }
    // 仅能用炸
    if (shouldBomb(tier, state, seat, hand, level)) return bombs[0].cards;
    return 'pass';
  }

  function pickFollowAdvanced(hand, level, nb, state, seat, tier) {
    // 在“最小可压”附近，选拆牌代价最低者；若仅有的可压牌是高单且无人威胁(绝张)，可保留→pass
    let best = null, bestSc = Infinity;
    for (const m of nb) {
      const rem = removeSig(hand, m.cards);
      const sc = handScore(rem, level) + m.combo.key * 0.02;   // 偏好出小、少拆
      if (sc < bestSc) { bestSc = sc; best = m; }
    }
    // 大师+：若这手要送出大牌(高key单)而对手并不紧迫，且我领先，宁可pass留牌
    if (tier >= 3 && best && best.combo.type === T.SINGLE && best.combo.key >= 14) {
      if (minOppHand(state, seat) > 4 && state.hands[seat].length > 6) return null;
    }
    return best;
  }

  function shouldBomb(tier, state, seat, hand, level) {
    const oh = minOppHand(state, seat);
    if (tier === 0) return false;
    if (tier === 1) return oh <= 1;                  // 中级：对手将赢才炸
    if (tier === 2) return oh <= 2;                  // 高级
    // 大师/宗师：对手将赢，或残局抢风走牌
    if (oh <= 2) return true;
    if (tier >= 4) {
      const total = state.hands.reduce((s, h) => s + h.length, 0);
      if (total <= 16 && handScore(hand, level) <= 3) return true; // 残局且我接近走完→抢风
    }
    return false;
  }

  function strongest(moves) { return moves.slice().sort((a, b) => b.combo.key - a.combo.key)[0]; }

  // ---------- 自动理牌：把手牌分解为“最少手数”的牌型组合 ----------
  function wildUsed(m, level) { return m.cards.filter(c => GD.isWild(c, level)).length; }
  function decomposeHand(hand, level) {
    let rem = hand.slice();
    const groups = [];
    // 优先成大结构，不拆炸弹/同花顺；逢人配优先补成结构
    const order = [T.KING_BOMB, T.STRAIGHT_FLUSH, T.BOMB, T.PLATE, T.TUBE, T.STRAIGHT, T.TRIPLE_PAIR, T.TRIPLE, T.PAIR];
    for (const tp of order) {
      while (true) {
        const cands = allCombos(rem, level, new Set([tp])).filter(m => m.combo && m.combo.type === tp);
        if (!cands.length) break;
        cands.sort((a, b) => wildUsed(a, level) - wildUsed(b, level) || b.cards.length - a.cards.length || a.combo.key - b.combo.key);
        const m = cands[0], ids = new Set(m.cards.map(c => c.id));
        rem = rem.filter(c => !ids.has(c.id));
        groups.push(m);
      }
    }
    return { groups, singles: rem.slice(), hands: groups.length + rem.length };
  }

  const API = { allCombos, movesBeating, handScore, makeAI, buildIndex, decomposeHand, TIER };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.GDAI = Object.assign(root.GDAI || {}, API);
})(typeof globalThis !== 'undefined' ? globalThis : this);
