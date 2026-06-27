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
        // 选对子点 b：尽量「不耗逢人配 + 点数最低」——别把级牌(power15)/逢人配当廉价的"二"
        let chosen = null;
        for (const b of GD.RANKS) {
          if (b === a) continue;
          const cb = (idx.byRank[b] || []).length, wB = Math.max(0, 2 - cb);
          if (wA + wB > W) continue;
          const score = wB * 1000 + GD.powerOfRank(b, level);   // 先不耗逢人配，再点数最低(级牌15被压到很后)
          if (!chosen || score < chosen.score) chosen = { b, cb, wB, score };
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
  // 浪费代价：逢人配(红桃主牌)是无价的(应留配炸/同花顺)——除炸/同花顺外，配成任何牌型都重罚(含配成级牌对)；
  //   自然级牌仅当"非级牌主点的廉价配角"(三带二的二、顺子填缺)时才罚，单纯打级牌对/单(key=15)不罚。
  function wasteCost(m, level, key) {
    if (isBomb(m.combo)) return 0;                  // 炸/同花顺：逢人配本就该配
    let lv = 0, w = 0;
    for (const c of m.cards) { if (GD.isWild(c, level)) w++; else if (c.rank === level) lv++; }
    return w * 12 + (key === 15 ? 0 : lv * 5);
  }

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

  // ---------- 启发式决策（默认·快）：所有档位同一原则，差异=记忆，经 mem 体现 ----------
  function heuristicDecide(state, seat, tier) {
    const level = state.level, hand = state.hands[seat], top = state.current, owner = state.currentOwner;
    const mem = buildMemory(state, seat, tier, level);
    return top ? chooseFollow(hand, level, top, owner, state, seat, mem)
               : chooseLead(hand, level, state, seat, mem);
  }

  // ---------- 领出 ----------
  function chooseLead(hand, level, state, seat, mem) {
    const moves = allCombos(hand, level);
    if (!moves.length) return hand.slice(0, 1);
    const goOut = moves.filter(m => m.cards.length === hand.length);
    if (goOut.length) return strongest(goOut).cards;             // 能一把走完→走完
    const nb = moves.filter(m => !isBomb(m.combo));
    const pool = nb.length ? nb : moves;
    const mateCnt = state.hands[teammate(seat)].length;
    const support = mateCnt <= 4 || mateCnt + 5 <= hand.length;   // 队友将走完 / 领先我≥5张 → 帮队友(领小让路)
    const downLow = state.hands[next(seat)].length <= 5;          // 下家(对手)是否牌少
    let best = null, bestSc = -Infinity;
    for (const m of pool) {
      const rem = removeSig(hand, m.cards);
      const t = m.combo.type, k = m.combo.key;
      // 核心：出后手数最少；并“留高打低”——优先领小牌、把大牌留作回手与控场
      let sc = -estPlays(rem, level) * 10 - k * 0.3;
      if (t === T.TUBE || t === T.PLATE) sc += 3;                  // 木板/钢板早出对手难跟
      else if (t === T.STRAIGHT) sc += (k <= 8 ? 1.5 : -2.5);      // 小顺/无用顺早出腾手；大顺留后(对手接不动)
      else if (t === T.SINGLE && k <= 8) sc += 1;                  // 弱小单早出腾手("要上游，先弱单")
      sc -= wasteCost(m, level, k);                               // 别把级牌/逢人配当廉价配角(三带二的"二"、顺子填缺等)
      // 吊下家：下家牌少时，别用易被其接走的小单/小对去喂他
      if (downLow && (t === T.SINGLE || t === T.PAIR) && k <= 10) sc -= 2.5;
      if (support) sc += (t === T.SINGLE ? 2 : 0) - k * 0.1;       // 帮队友→领小让路、不抢头游
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

    // 队友正控场：一般不盖队友（盖了浪费牌力）。记忆越好→isControl 判断越准。
    if (owner != null && teammate(seat) === owner) {
      if (state.hands[owner].length <= 6) return 'pass';        // 队友快走完→绝不盖，让队友走头游
      const urgent = mem.oppMin <= 3;                           // 下家(对手)快走完，可能逃掉
      if (!urgent) {
        // 不紧迫：绝不送大牌/炸盖队友；仅允许「过一手小牌」接管(如对家出3、我过4/7)
        if (isBomb(top) || isControl(top, mem)) return 'pass';  // 队友这手已压死对手
        // 过小牌(可)：跟张不超过队友点数+3 且 ≤10（如队友出3，最多过到6）
        if (nb.length && nb[0].combo.key <= 10 && nb[0].combo.key <= top.key + 3) return nb[0].cards;
        return 'pass';                                          // 最小可压都偏大→不为盖队友送大牌
      }
      // 紧迫：对手快走完——若队友已压死对手则安心 pass；否则落到正常跟牌，按代价/收益决定是否付大牌或炸
      if (isControl(top, mem)) return 'pass';
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
      sc -= wasteCost(m, level, m.combo.key);                   // 别把级牌/逢人配当廉价配角
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

  // ---------- 是否出炸（按规格书：张数口径 + 记忆预测；同花顺序由引擎合法性兜底） ----------
  // 注：本函数仅在"已无划算的非炸跟牌"时被调用；top 多为对手所出，bombs 已是合法可压的炸。
  function shouldBomb(state, seat, hand, level, mem, owner) {
    const oppMin = mem.oppMin, myPlays = estPlays(hand, level);
    if (oppMin <= 2) return true;                             // 对手可能1手走完→必炸
    if (myPlays <= 2) return true;                            // 我也即将走完→抢风必炸
    const ownerIsOpp = owner != null && teamOf(owner) !== teamOf(seat);
    // 强弱取舍：放掉不紧迫的强对手，省炸专防真威胁（宗师用 dumped 修正威胁度）
    if (ownerIsOpp && mem.opps.length === 2) {
      const other = mem.opps[0] === owner ? mem.opps[1] : mem.opps[0];
      if (oppDanger(state, mem, other) > oppDanger(state, mem, owner) + 4 && state.hands[owner].length >= 6) return false;
    }
    if (oppMin <= 3) return true;                             // 3张很危急→炸
    if (oppMin === 4) return ownerIsOpp && state.hands[owner].length <= 4;  // 4张:仅当控场对手剩4(即将走完)才炸，否则不炸
    if (oppMin <= 7) return true;                             // 5/6/7张:一般炸(夺权、防其走小)
    // 8/9张:仅当记忆预测对手可能"成炸+一手"即将走完（外面高威胁材料多→可能在对手手里成炸）
    if (oppMin <= 9) return highMaterial(mem) * mem.oppShare >= 5;
    return false;
  }
  const FOLLOW_KEY = 7, FOLLOW_OPP = 4;   // 跟牌纪律阈值（复式扫参确定）

  // ===================== 深度搜索：PIMC（完美信息蒙特卡洛） =====================
  // 记忆 = 信念：已“记住”的出牌从牌池剔除；对每个候选出牌，采样多种可能的对手手牌、
  // 各自完美信息模拟到本局结束，取平均收益最高者。记忆越准→采样越真实→评估越准→出牌越强。
  const PIMC_K = (typeof process !== 'undefined' && process.env && +process.env.PIMC_K) || 24;     // 每个决策的采样次数

  function nextAct(active, s) { let t = (s + 1) % 4, g = 0; while (!active[t] && g++ < 4) t = (t + 1) % 4; return t; }

  // rollout 基准策略（与启发式同口径）：领出=最低一组(留高打低)；跟牌=最小可压、不盖队友；
  //   出炸=按对手张数(≤3 或 5/6/7 才炸，4 与 ≥8 不炸)。
  function rolloutMove(hand, level, top, oppMin, mateOwns) {
    const byP = new Map();
    for (const c of hand) { const p = GD.powerOfCard(c, level); if (!byP.has(p)) byP.set(p, []); byP.get(p).push(c); }
    const powers = [...byP.keys()].sort((a, b) => a - b);
    if (!top) {
      const g = byP.get(powers[0]);
      return g.slice(0, g.length >= 4 ? 1 : g.length);     // 炸弹组只领1张，不当普通组送出
    }
    const beats = movesBeating(hand, level, top);
    if (!beats.length) return 'pass';
    const nb = beats.filter(m => !isBomb(m.combo));
    if (nb.length) {
      nb.sort((a, b) => a.combo.key - b.combo.key);
      // 队友控场且不紧迫→不盖队友（仅允许过小牌：≤队友点数+3 且 ≤10）
      if (mateOwns && oppMin > 3 && (nb[0].combo.key > top.key + 3 || nb[0].combo.key > 10)) return 'pass';
      return nb[0].cards;
    }
    // 仅能炸：按对手张数口径
    if (oppMin <= 3 || (oppMin >= 5 && oppMin <= 7)) {
      beats.sort((a, b) => a.combo.bombScore - b.combo.bombScore || a.combo.key - b.combo.key);
      return beats[0].cards;
    }
    return 'pass';
  }

  // 从给定局面用 rollout 策略模拟到本局结束，返回名次顺序 ranks
  function simFrom(hands, level, turn, current, owner, passes, active, finished) {
    hands = hands.map(h => h.slice()); active = active.slice(); finished = finished.slice();
    let guard = 0;
    const cnt = () => active[0] + active[1] + active[2] + active[3];
    while (cnt() > 1) {
      if (++guard > 1500) break;
      if (!active[turn]) { turn = (turn + 1) % 4; continue; }
      const leading = current === null;
      let om = 99; for (const o of [(turn + 1) % 4, (turn + 3) % 4]) if (active[o]) om = Math.min(om, hands[o].length);
      const mateOwns = (current !== null && owner !== null && (turn + 2) % 4 === owner);
      let mv = rolloutMove(hands[turn], level, current, om, mateOwns);
      if (mv === 'pass' || !mv) {
        if (leading) mv = hands[turn].slice(0, 1);
        else {
          passes++;
          const others = cnt() - (active[owner] ? 1 : 0);
          if (passes >= others) { turn = leadAfter(active, finished, owner); current = null; owner = null; passes = 0; continue; }
          turn = (turn + 1) % 4; continue;
        }
      }
      const ids = new Set(mv.map(c => c.id));
      hands[turn] = hands[turn].filter(c => !ids.has(c.id));
      current = GD.classify(mv, level); owner = turn; passes = 0;
      if (hands[turn].length === 0) { finished.push(turn); active[turn] = false; if (cnt() <= 1) break; }
      turn = (turn + 1) % 4;
    }
    const last = active.indexOf(true);
    return finished.concat(last >= 0 ? [last] : []);
  }
  function leadAfter(active, finished, owner) {     // 收墩后由谁领出
    if (active[owner]) return owner;
    const mate = (owner + 2) % 4;
    return active[mate] ? mate : nextAct(active, owner);
  }

  // 应用候选出牌(或 'pass')后模拟到结束，返回 ranks
  function applyCand(hands, seat, cand, level, active0, finished0, current0, owner0, passes0) {
    const active = active0.slice(), finished = finished0.slice();
    let current = current0, owner = owner0, passes = passes0 || 0, turn;
    const h = hands.map(x => x.slice());
    const cnt = () => active[0] + active[1] + active[2] + active[3];
    if (cand === 'pass') {
      passes++;
      const others = cnt() - (active[owner] ? 1 : 0);
      if (passes >= others) { current = null; owner = null; passes = 0; turn = leadAfter(active, finished, owner0); }
      else turn = nextAct(active, seat);
    } else {
      const ids = new Set(cand.map(c => c.id));
      h[seat] = h[seat].filter(c => !ids.has(c.id));
      current = GD.classify(cand, level); owner = seat; passes = 0;
      if (h[seat].length === 0) { finished.push(seat); active[seat] = false; }
      turn = nextAct(active, seat);
    }
    if (cnt() <= 1) { const last = active.indexOf(true); return finished.concat(last >= 0 ? [last] : []); }
    return simFrom(h, level, turn, current, owner, passes, active, finished);
  }

  // 收益：本局我方拿头游记 +gain(双下+3/+2/+1)，对方头游记 -gain
  function dealReward(ranks, seat) {
    const head = ranks[0], pIdx = ranks.indexOf((head + 2) % 4);
    const g = pIdx === 1 ? 3 : pIdx === 2 ? 2 : 1;
    return teamOf(head) === teamOf(seat) ? g : -g;
  }

  // 候选剪枝：领出每种牌型留最低1~2手（不主动领炸）；跟牌留最小若干 + 最小炸
  function pruneLead(moves) {
    const byType = {};
    for (const m of moves) { if (isBomb(m.combo)) continue; (byType[m.combo.type] = byType[m.combo.type] || []).push(m); }
    const out = [];
    for (const t in byType) {
      const arr = byType[t].sort((a, b) => a.combo.key - b.combo.key);
      const take = (t === T.SINGLE || t === T.PAIR) ? 2 : 1;
      for (let i = 0; i < Math.min(take, arr.length); i++) out.push(arr[i].cards);
    }
    if (!out.length) out.push(moves.slice().sort((a, b) => a.combo.bombScore - b.combo.bombScore)[0].cards);
    return out;
  }
  function pruneFollow(beats) {
    const nb = beats.filter(m => !isBomb(m.combo)).sort((a, b) => a.combo.key - b.combo.key);
    const bombs = beats.filter(m => isBomb(m.combo)).sort((a, b) => a.combo.bombScore - b.combo.bombScore || a.combo.key - b.combo.key);
    const out = [];
    for (let i = 0; i < Math.min(3, nb.length); i++) out.push(nb[i].cards);
    if (bombs.length) out.push(bombs[0].cards);
    return out;
  }

  // PIMC 决策：记忆决定牌池（信念），多次采样对手手牌、模拟到底、取平均收益最高的候选
  function pimcDecide(state, seat, tier, level, cands) {
    const myIds = new Set(state.hands[seat].map(c => c.id));
    const remembered = new Set();
    for (const c of state.played) if (memSees(tier, c, level)) remembered.add(c.id);
    const pool = GD.makeDeck().filter(c => !myIds.has(c.id) && !remembered.has(c.id));
    const others = [0, 1, 2, 3].filter(s => s !== seat);
    const counts = others.map(o => state.hands[o].length);
    const finished = state.finished || [];
    const scores = cands.map(() => 0);
    for (let k = 0; k < PIMC_K; k++) {
      const rng = GD.mulberry32((state.played.length * 131 + seat * 17 + k * 1009 + 1) >>> 0);
      const sh = GD.shuffle(pool, rng);
      const hands = []; hands[seat] = state.hands[seat];
      let idx = 0;
      for (let oi = 0; oi < others.length; oi++) { hands[others[oi]] = sh.slice(idx, idx + counts[oi]); idx += counts[oi]; }
      for (let ci = 0; ci < cands.length; ci++) {
        const ranks = applyCand(hands, seat, cands[ci], level, state.active, finished, state.current, state.currentOwner, state.passes);
        scores[ci] += dealReward(ranks, seat);
      }
    }
    let bi = 0; for (let i = 1; i < cands.length; i++) if (scores[i] > scores[bi]) bi = i;
    return cands[bi];
  }

  // ---------- PIMC 深度决策（可选·慢但更深；硬规则前置，其余交给搜索） ----------
  function pimcMove(state, seat, tier) {
    const level = state.level, hand = state.hands[seat], top = state.current, owner = state.currentOwner;
    let cands;
    if (top) {
      const beats = movesBeating(hand, level, top);
      const out = beats.find(m => m.cards.length === hand.length); if (out) return out.cards;  // 一把走完
      // 不盖队友（与启发式同口径，硬规则前置）
      if (owner != null && teammate(seat) === owner) {
        const mem = buildMemory(state, seat, tier, level);
        if (state.hands[owner].length <= 6) return 'pass';
        const nb = beats.filter(m => !isBomb(m.combo)).sort((a, b) => a.combo.key - b.combo.key);
        if (mem.oppMin > 3) {   // 不紧迫
          if (isBomb(top) || isControl(top, mem)) return 'pass';
          if (nb.length && nb[0].combo.key <= 10 && nb[0].combo.key <= top.key + 3) return nb[0].cards;
          return 'pass';
        }
        if (isControl(top, mem)) return 'pass';   // 紧迫但队友已压死对手
      }
      cands = pruneFollow(beats); cands.push('pass');
    } else {
      const moves = allCombos(hand, level);
      if (!moves.length) return hand.slice(0, 1);
      const out = moves.filter(m => m.cards.length === hand.length); if (out.length) return strongest(out).cards;
      cands = pruneLead(moves);
    }
    if (cands.length === 1) return cands[0];
    return pimcDecide(state, seat, tier, level, cands);
  }

  // ---------- 总入口：默认启发式(快)；opts.deep=true 走 PIMC 深度搜索 ----------
  function makeAI(name, opts) {
    const tier = TIER[name] != null ? TIER[name] : 1;
    const deep = !!(opts && opts.deep);
    return function decide(state, seat) {
      return deep ? pimcMove(state, seat, tier) : heuristicDecide(state, seat, tier);
    };
  }

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
