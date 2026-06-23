/* 掼蛋规则引擎 · 牌 + 牌型识别 + 比较
 * 同时支持浏览器(<script>挂到 window.GD)与 Node(require)。无第三方依赖。
 * 规则口径：全国竞技掼蛋标准（双副牌108张，级牌，红桃级牌为逢人配，
 *   牌型：单/对/三/三带二/顺子/三连对(木板)/二连三(钢板)/炸弹/同花顺/天王炸）。
 */
(function (root) {
  'use strict';

  // ---------- 常量 ----------
  const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  const SUITS = ['S','H','C','D'];      // 黑桃 红桃 梅花 方块
  const SMALL = 's', BIG = 'b';          // 小王 大王
  const TYPE = {
    SINGLE:'single', PAIR:'pair', TRIPLE:'triple', TRIPLE_PAIR:'triple_pair',
    STRAIGHT:'straight', TUBE:'tube', PLATE:'plate',
    BOMB:'bomb', STRAIGHT_FLUSH:'straight_flush', KING_BOMB:'king_bomb'
  };

  // ---------- 牌的基本属性 ----------
  function naturalRank(r) {            // 顺子用：2..14，A=14（A也可作1，另行处理）
    if (r === 'A') return 14;
    if (r === 'K') return 13;
    if (r === 'Q') return 12;
    if (r === 'J') return 11;
    return parseInt(r, 10);            // '2'..'10'
  }
  function isJoker(c) { return c.rank === SMALL || c.rank === BIG; }
  function isWild(c, level) { return c.suit === 'H' && c.rank === level; } // 红桃级牌=逢人配
  // 单张/对/三/炸弹等比较用的“点值”（级牌抬到A之上，王最大）
  function powerOfRank(r, level) {
    if (r === BIG) return 17;
    if (r === SMALL) return 16;
    if (r === level) return 15;
    return naturalRank(r);
  }
  function powerOfCard(c, level) { return powerOfRank(c.rank, level); }

  // ---------- 牌堆 ----------
  function makeDeck() {
    const cards = []; let id = 0;
    for (let d = 0; d < 2; d++) {
      for (const s of SUITS) for (const r of RANKS) cards.push({ id: id++, rank: r, suit: s });
      cards.push({ id: id++, rank: SMALL, suit: '' });
      cards.push({ id: id++, rank: BIG, suit: '' });
    }
    return cards; // 108
  }
  function mulberry32(seed) {            // 可复现随机
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rng) {
    rng = rng || Math.random;
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function deal(seed) {                  // 返回 4 手各 27 张
    const rng = (seed === undefined) ? Math.random : mulberry32(seed);
    const d = shuffle(makeDeck(), rng);
    return [d.slice(0,27), d.slice(27,54), d.slice(54,81), d.slice(81,108)];
  }

  // ---------- 排序 / 显示 ----------
  function sortHand(cards, level) {
    return cards.slice().sort((x, y) => {
      const dv = powerOfCard(y, level) - powerOfCard(x, level);
      if (dv) return dv;
      return SUITS.indexOf(x.suit) - SUITS.indexOf(y.suit);
    });
  }
  function cardLabel(c) {
    if (c.rank === SMALL) return '小王';
    if (c.rank === BIG) return '大王';
    const sm = { S:'♠', H:'♥', C:'♣', D:'♦' };
    return sm[c.suit] + c.rank;
  }

  // ---------- 牌型识别（含逢人配） ----------
  // 返回 combo: {type,len,key,bombScore,suit?} 或 null
  //   key       —— 同型比较用的主点值
  //   bombScore —— 0=非炸；4/5/6/7/8=对应张数炸；5.5=同花顺；100=天王炸
  function nonWild(cards, level) { return cards.filter(c => !isWild(c, level)); }
  function wildCount(cards, level) { return cards.filter(c => isWild(c, level)).length; }

  // 把非王、非逢人配的牌按“点值”分组计数（普通点数，A=14）
  function countByNat(cards) {
    const m = {};
    for (const c of cards) {
      const v = naturalRank(c.rank);
      m[v] = (m[v] || 0) + 1;
    }
    return m;
  }

  // 同一点数（含逢人配补齐）→ 返回该 rank 字符串 或 null
  function allSameRank(cards, level) {
    const nw = nonWild(cards, level);
    if (nw.some(isJoker) && nw.some(c => !isJoker(c))) return null; // 王不能和普通牌同组
    if (nw.length === 0) return level;               // 全是逢人配 → 作级牌
    const r0 = nw[0].rank;
    if (nw.every(c => c.rank === r0)) return r0;
    return null;
  }

  function classify(cards, level) {
    const n = cards.length;
    if (n === 0) return null;
    const W = wildCount(cards, level);
    const nw = nonWild(cards, level);

    // 天王炸：四张王（逢人配不是王）
    if (n === 4 && cards.every(isJoker)) {
      const big = cards.filter(c => c.rank === BIG).length;
      const small = cards.filter(c => c.rank === SMALL).length;
      if (big === 2 && small === 2) return { type: TYPE.KING_BOMB, len: 4, key: 100, bombScore: 100 };
    }

    // 炸弹（4张及以上同点）——优先于同长度的非炸（除同花顺另判）
    if (n >= 4) {
      const r = allSameRank(cards, level);
      if (r && !isJoker({ rank: r })) {
        // n==5/6 时同花顺更大，但同点炸也成立；分别在各自分支返回，比较时取强
        if (!(n === 5)) // 非5张：直接同点炸（5张时下方会综合判断）
          return { type: TYPE.BOMB, len: n, key: powerOfRank(r, level), bombScore: n };
      }
    }

    if (n === 1) return { type: TYPE.SINGLE, len: 1, key: powerOfCard(cards[0], level), bombScore: 0 };

    if (n === 2) {
      const r = allSameRank(cards, level);
      return r ? { type: TYPE.PAIR, len: 2, key: powerOfRank(r, level), bombScore: 0 } : null;
    }

    if (n === 3) {
      const r = allSameRank(cards, level);
      return r ? { type: TYPE.TRIPLE, len: 3, key: powerOfRank(r, level), bombScore: 0 } : null;
    }

    if (n === 4) {
      const r = allSameRank(cards, level);
      if (r && !isJoker({ rank: r })) return { type: TYPE.BOMB, len: 4, key: powerOfRank(r, level), bombScore: 4 };
      return null; // 4张不构成顺/连对
    }

    if (n === 5) {
      // 候选：5张炸 > 同花顺 > 三带二 > 顺子（按强度，但实际选择按结构唯一）
      const r = allSameRank(cards, level);
      const fiveBomb = (r && !isJoker({ rank: r })) ? { type: TYPE.BOMB, len: 5, key: powerOfRank(r, level), bombScore: 5 } : null;
      const sf = tryStraight(cards, level, 5, true);   // 同花顺
      const tp = tryTriplePair(cards, level);
      const st = tryStraight(cards, level, 5, false);  // 普通顺子
      return fiveBomb || sf || tp || st || null;
    }

    if (n === 6) {
      const r = allSameRank(cards, level);
      if (r && !isJoker({ rank: r })) return { type: TYPE.BOMB, len: 6, key: powerOfRank(r, level), bombScore: 6 };
      const tube = trySeq(cards, level, 3, 2);   // 三连对（木板）
      const plate = trySeq(cards, level, 2, 3);  // 二连三（钢板）
      return tube || plate || null;
    }

    if (n >= 7 && n <= 8) {
      const r = allSameRank(cards, level);
      if (r && !isJoker({ rank: r })) return { type: TYPE.BOMB, len: n, key: powerOfRank(r, level), bombScore: n };
      return null;
    }
    return null;
  }

  // 顺子 / 同花顺：len 张连续单牌（A 可高可低，不连环绕），flush=是否要求同花
  function tryStraight(cards, level, len, flush) {
    if (cards.length !== len) return null;
    const nw = nonWild(cards, level);
    if (nw.some(isJoker)) return null;
    const W = cards.length - nw.length;
    // 同花顺：非王牌需同一花色（逢人配可补任意花色）
    let suit = null;
    if (flush) {
      const suits = new Set(nw.map(c => c.suit));
      if (suits.size > 1) return null;
      suit = nw.length ? nw[0].suit : 'S';
    }
    // 枚举窗口 [lo, lo+len-1]，顶值 lo+len-1 ∈ [len .. 14]；A 可作 1 或 14
    for (let lo = 1; lo + len - 1 <= 14; lo++) {
      const need = {}; for (let v = lo; v <= lo + len - 1; v++) need[v] = 1;
      let ok = true, fills = 0, used = {};
      for (const c of nw) {
        // 该牌可取的自然值集合（A 特殊）
        const opts = c.rank === 'A' ? [14, 1] : [naturalRank(c.rank)];
        const hit = opts.find(v => need[v] && !used[v]);
        if (hit === undefined) { ok = false; break; }
        used[hit] = 1;
      }
      if (!ok) continue;
      const missing = len - Object.keys(used).length;
      if (missing < 0 || missing > W) continue;
      const top = lo + len - 1;        // 顶牌自然值（A低顺 A2345 顶=5）
      return flush
        ? { type: TYPE.STRAIGHT_FLUSH, len, key: top, bombScore: 5.5, suit }
        : { type: TYPE.STRAIGHT, len, key: top, bombScore: 0 };
    }
    return null;
  }

  // 三带二：三张 + 一对（点数不同）
  function tryTriplePair(cards, level) {
    if (cards.length !== 5) return null;
    const nw = nonWild(cards, level);
    if (nw.some(isJoker)) return null;
    const W = cards.length - nw.length;
    const cnt = countByNat(nw);
    const ranks = Object.keys(cnt).map(Number);
    // 选三张主点 a、对子点 b(≠a)，逢人配补齐
    for (const a of allCandidateRanks()) {
      const haveA = cnt[a] || 0; if (haveA > 3) continue;
      const needA = 3 - haveA; if (needA < 0) continue;
      for (const b of allCandidateRanks()) {
        if (b === a) continue;
        const haveB = cnt[b] || 0; if (haveB > 2) continue;
        const needB = 2 - haveB;
        if (needA + needB !== W) continue;
        // 非王牌必须全部落在 a/b 上
        const usedNW = (cnt[a] || 0) + (cnt[b] || 0);
        if (usedNW !== nw.length) continue;
        return { type: TYPE.TRIPLE_PAIR, len: 5, key: powerOfRank(natToRank(a), level), bombScore: 0 };
      }
    }
    return null;
  }

  // 连续 groups 组、每组 each 张（三连对=3组每组2；钢板=2组每组3）
  function trySeq(cards, level, groups, each) {
    if (cards.length !== groups * each) return null;
    const nw = nonWild(cards, level);
    if (nw.some(isJoker)) return null;
    const W = cards.length - nw.length;
    const cnt = countByNat(nw);
    // 连对/钢板的点用自然值，A 仅作 14（不作 1，避免 A2 相连歧义；标准规则连对A只接K）
    for (let lo = 2; lo + groups - 1 <= 14; lo++) {
      const win = []; for (let v = lo; v <= lo + groups - 1; v++) win.push(v);
      let fills = 0, ok = true, usedNW = 0;
      for (const v of win) {
        const have = cnt[v] || 0;
        if (have > each) { ok = false; break; }
        usedNW += have; fills += (each - have);
      }
      if (!ok) continue;
      if (usedNW !== nw.length) continue; // 非王牌必须都在窗口内
      if (fills !== W) continue;
      const topRank = natToRank(lo + groups - 1);
      const type = (each === 2) ? TYPE.TUBE : TYPE.PLATE;
      return { type, len: cards.length, key: powerOfRank(topRank, level), bombScore: 0 };
    }
    return null;
  }

  function allCandidateRanks() { return [2,3,4,5,6,7,8,9,10,11,12,13,14]; }
  function natToRank(v) {
    if (v === 14) return 'A'; if (v === 13) return 'K'; if (v === 12) return 'Q';
    if (v === 11) return 'J'; if (v === 1) return 'A'; return String(v);
  }

  // ---------- 比较：a 是否能压过 b ----------
  function beats(a, b, level) {
    if (!a) return false;
    if (!b) return true;                       // 自由出牌
    // 炸弹体系
    if (a.bombScore > 0 || b.bombScore > 0) {
      if (a.bombScore === b.bombScore) return a.key > b.key;
      return a.bombScore > b.bombScore;        // 张数/级别高者胜；非炸 bombScore=0 必负于炸
    }
    // 普通牌：同型同长才可比
    if (a.type !== b.type || a.len !== b.len) return false;
    return a.key > b.key;
  }

  // ---------- 导出 ----------
  const API = {
    RANKS, SUITS, SMALL, BIG, TYPE,
    naturalRank, isJoker, isWild, powerOfRank, powerOfCard,
    makeDeck, mulberry32, shuffle, deal, sortHand, cardLabel,
    classify, beats
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.GD = Object.assign(root.GD || {}, API);
})(typeof globalThis !== 'undefined' ? globalThis : this);
