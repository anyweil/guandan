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

  // ---------- 手数估计：越少越接近走完（核心目标） ----------
  function estPlays(cards, level) {
    let wild = 0; const counts = {}, nat = {};
    for (const c of cards) {
      if (GD.isWild(c, level)) { wild++; continue; }
      const p = GD.powerOfCard(c, level);
      counts[p] = (counts[p] || 0) + 1;
      if (!GD.isJoker(c) && c.rank !== level) { const v = GD.naturalRank(c.rank); nat[v] = (nat[v] || 0) + 1; }
    }
    let plays = Object.keys(counts).length;                 // 每个点数≥1手
    // 顺子奖励：连续自然单点长≥5 合并为1手（省 len-1）
    const sv = []; for (const v in nat) sv.push(+v); sv.sort((a, b) => a - b);
    let run = 0, prev = -9;
    for (const v of sv) { run = (v === prev + 1) ? run + 1 : 1; prev = v; if (run >= 5) { plays -= 4; run = 0; prev = -9; } }
    // 连对奖励：连续点(每点≥2)长≥3 合并
    const pv = []; for (const v in nat) if (nat[v] >= 2) pv.push(+v); pv.sort((a, b) => a - b);
    run = 0; prev = -9;
    for (const v of pv) { run = (v === prev + 1) ? run + 1 : 1; prev = v; if (run >= 3) { plays -= 2; run = 0; prev = -9; } }
    return Math.max(1, plays - wild * 0.2);
  }
  const handScore = estPlays;   // 兼容旧 API 名
  function removeSig(hand, cards) { const ids = new Set(cards.map(c => c.id)); return hand.filter(c => !ids.has(c.id)); }
  function opponentsOf(seat) { return [next(seat), next(next(seat))].filter(s => teamOf(s) !== teamOf(seat)); }
  function strongest(moves) { return moves.slice().sort((a, b) => b.combo.key - a.combo.key)[0]; }

  // ---------- 记忆能力（按档位决定能“数清”哪些已出牌） ----------
  // 0入门:无 | 1中级:王+级牌 | 2高级:+所有≥10 | 3大师:全部 | 4宗师:全部+谁出
  function memSees(tier, card, level) {
    if (tier <= 0) return false;
    if (GD.isJoker(card)) return true;
    if (card.rank === level) return true;                   // 级牌(主牌)
    if (tier >= 2 && GD.naturalRank(card.rank) >= 10) return true;
    return tier >= 3;
  }
  function deckCopies(p, level) {
    if (p >= 16) return 2;                                  // 大/小王各2
    if (p === 15) return 8;                                 // 级牌8(含2逢人配)
    if (p === GD.naturalRank(level)) return 0;              // 该自然点全是级牌
    return 8;
  }
  // accounted[p] = 我手牌 + 记得的已出牌 中 power=p 的张数
  function buildMemory(state, seat, tier, level) {
    const acc = {};
    const add = c => { const p = GD.powerOfCard(c, level); acc[p] = (acc[p] || 0) + 1; };
    for (const c of state.hands[seat]) add(c);              // 自己手牌永远可见
    for (const c of state.played) if (memSees(tier, c, level)) add(c);
    const opps = opponentsOf(seat);
    const oppCnts = opps.map(o => state.hands[o].length);
    const oppCards = oppCnts.reduce((s, n) => s + n, 0);
    const mateCards = state.hands[teammate(seat)].length;
    // 宗师：统计各对手已甩出的大牌数 → 牌力评估（已甩大牌多者，剩余牌力相对弱）
    const dumped = {};
    if (tier >= 4 && state.playLog) for (const e of state.playLog)
      if (teamOf(e.seat) !== teamOf(seat)) for (const c of e.cards)
        if (GD.powerOfCard(c, level) >= 13) dumped[e.seat] = (dumped[e.seat] || 0) + 1;
    return { acc, tier, level, opps, oppCnts, dumped,
             oppShare: (oppCards + mateCards) ? oppCards / (oppCards + mateCards) : 0,
             oppMin: opps.length ? Math.min(...oppCnts) : 99 };
  }
  function outsideCopies(mem, p) { return Math.max(0, deckCopies(p, mem.level) - (mem.acc[p] || 0)); }
  function outsideHigher(mem, p) { let n = 0; for (let q = p + 1; q <= 17; q++) n += outsideCopies(mem, q); return n; }

  // 对手能压过这手牌的“非炸期望数”（≈0 表示绝张/控场，对手跟不动）
  function oppFollowCount(combo, mem) {
    if (isBomb(combo)) return 0;
    let raw = 0; const k = combo.key;
    switch (combo.type) {
      case T.SINGLE: raw = outsideHigher(mem, k); break;
      case T.PAIR: for (let q = k + 1; q <= 17; q++) { const o = outsideCopies(mem, q); if (o >= 2) raw += o - 1; } break;
      case T.TRIPLE: case T.TRIPLE_PAIR: for (let q = k + 1; q <= 17; q++) if (outsideCopies(mem, q) >= 3) raw += 1; break;
      default: for (let q = k + 1; q <= 14; q++) if (outsideCopies(mem, q) >= 1) raw += 0.4; break; // 顺/连对/钢板/同花顺：粗估偏低
    }
    return raw * mem.oppShare;
  }
  function isControl(combo, mem) { return oppFollowCount(combo, mem) < 0.5; }
  function hasLock(hand, level, mem) {     // 手里是否还握“绝张”单(顶单，无人能压)
    for (const c of hand) if (outsideHigher(mem, GD.powerOfCard(c, level)) === 0) return true;
    return false;
  }

  // ---------- 决策入口（所有档位共用同一套原则；唯一差异 = 记忆能力，全部经由 mem 体现） ----------
  function makeAI(name) {
    const tier = TIER[name] != null ? TIER[name] : 1;
    return function decide(state, seat) {
      const level = state.level, hand = state.hands[seat], top = state.current, owner = state.currentOwner;
      const mem = buildMemory(state, seat, tier, level);
      return top ? chooseFollow(hand, level, top, owner, state, seat, mem)
                 : chooseLead(hand, level, state, seat, mem);
    };
  }

  // ---------- 领出 ----------
  function chooseLead(hand, level, state, seat, mem) {
    const moves = allCombos(hand, level);
    if (!moves.length) return hand.slice(0, 1);
    const goOut = moves.filter(m => m.cards.length === hand.length);
    if (goOut.length) return strongest(goOut).cards;             // 能一把走完→走完
    const nb = moves.filter(m => !isBomb(m.combo));
    const pool = nb.length ? nb : moves;
    const mateClose = state.hands[teammate(seat)].length <= 4;
    let best = null, bestSc = -Infinity;
    for (const m of pool) {
      const rem = removeSig(hand, m.cards);
      // 核心：出后手数最少；并“留高打低”——优先领小牌、把大牌留作回手与控场
      let sc = -estPlays(rem, level) * 10 - m.combo.key * 0.3;
      if (m.combo.type === T.TUBE || m.combo.type === T.PLATE) sc += 3;   // 木板/钢板早出对手难跟
      if (m.combo.type === T.STRAIGHT) sc -= 2;                           // 顺子留后
      if (mateClose) sc += (m.combo.type === T.SINGLE ? 2 : 0) - m.combo.key * 0.1;  // 队友将走→领小让路
      if (sc > bestSc) { bestSc = sc; best = m; }
    }
    return best.cards;
  }

  // ---------- 跟牌 ----------
  function chooseFollow(hand, level, top, owner, state, seat, mem) {
    const moves = movesBeating(hand, level, top);
    if (!moves.length) return 'pass';
    const out = moves.find(m => m.cards.length === hand.length);
    if (out) return out.cards;                                   // 一把走完
    const nb = moves.filter(m => !isBomb(m.combo)).sort((a, b) => a.combo.key - b.combo.key);
    const bombs = moves.filter(m => isBomb(m.combo)).sort((a, b) => a.combo.bombScore - b.combo.bombScore || a.combo.key - b.combo.key);

    // 队友正控场：配合让牌（记忆越好→isControl 判断越准，越不会瞎盖队友）
    if (owner != null && teammate(seat) === owner) {
      const mateClose = state.hands[owner].length <= 6;
      if (mateClose || isBomb(top) || isControl(top, mem)) return 'pass';
    }

    if (nb.length) {
      const pick = pickFollow(hand, level, nb, mem);
      if (pick) return pick.cards;
    }
    if (bombs.length && shouldBomb(state, seat, hand, level, mem, owner)) return bombs[0].cards;
    return 'pass';
  }

  function pickFollow(hand, level, nb, mem) {
    let best = null, bestSc = -Infinity;
    for (const m of nb) {
      const rem = removeSig(hand, m.cards);
      let sc = -estPlays(rem, level) * 10 - m.combo.key * 0.05;
      if (isControl(m.combo, mem)) sc += 3;                      // 这手压下去对手反压不动→赢墩夺权(记忆好才认得出)
      if (hasLock(rem, level, mem)) sc += 2;                     // 出完仍有回手
      if (sc > bestSc) { bestSc = sc; best = m; }
    }
    // 跟牌纪律（记忆驱动）：这手最小可压若压不死对手(非绝张、会被反压)、又是较大的单/对、且我方不紧迫，
    //   则跟下去多半是“白送大牌”——宁可 pass 留牌。记忆好才认得出哪些跟牌是绝张(值得跟)/哪些是白送。
    if (best && !isControl(best.combo, mem) && best.cards.length <= 2 && best.combo.key >= FOLLOW_KEY
        && mem.oppMin > FOLLOW_OPP && hand.length > 5) return null;
    return best;
  }

  // 对手威胁度：牌越少越危险；宗师额外用「已甩大牌数」修正(甩得多→剩余牌力弱→威胁小)
  function oppDanger(state, mem, o) {
    let d = 20 - state.hands[o].length;
    if (mem.tier >= 4) d -= (mem.dumped[o] || 0) * 1.5;
    return d;
  }
  // 外面(未被记忆记录)的高威胁材料：K 及以上 + 级牌 + 大小王。记忆越好→记录越多→此值越真实(不虚高)
  function highMaterial(mem) { let m = 0; for (let q = 13; q <= 17; q++) m += outsideCopies(mem, q); return m; }

  // ---------- 是否出炸（所有档位同一口径；“威胁感”由记忆驱动：记忆差→虚高→滥炸浪费） ----------
  function shouldBomb(state, seat, hand, level, mem, owner) {
    const oppMin = mem.oppMin, myPlays = estPlays(hand, level);
    if (oppMin <= 1) return true;                             // 对手即将赢→必炸
    if (myPlays <= 2) return true;                            // 我即将走完→抢风必炸
    const ownerIsOpp = owner != null && teamOf(owner) !== teamOf(seat);
    // 取舍：放掉不紧迫/已虚的强对手，省炸专防真威胁（宗师用 dumped 修正）
    if (ownerIsOpp && mem.opps.length === 2) {
      const other = mem.opps[0] === owner ? mem.opps[1] : mem.opps[0];
      if (oppDanger(state, mem, other) > oppDanger(state, mem, owner) + 4 && state.hands[owner].length >= 6) return false;
    }
    // 威胁感：对手牌越少越危险 + 外面高材料越多越危险（记忆好→材料估得准偏低→省炸；记忆差→虚高→滥炸）
    const danger = (15 - oppMin) + highMaterial(mem) * mem.oppShare * 0.6 + (ownerIsOpp ? 2 : 0);
    return danger >= BOMB_TH;
  }
  // 经复式(运气抵消)对抗扫参确定的阈值
  const BOMB_TH = 12, FOLLOW_KEY = 7, FOLLOW_OPP = 4;

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
