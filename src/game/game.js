/* 掼蛋牌局流程（阶段②）· 纯引擎，无 UI/无 DOM
 * 依赖 engine.js。提供：合法出牌生成、单局驱动、进贡/还贡/抗贡、名次、升级、整场比赛。
 * 说明：本阶段的合法出牌生成器覆盖 单/对/三/炸弹/天王炸（足以驱动完整对局与流程测试）；
 *   顺子/连对/钢板/三带二/同花顺 的“主动成型出牌”将在阶段③(AI) 的完整生成器中加入。
 */
(function (root) {
  'use strict';
  const GD = (typeof module !== 'undefined' && module.exports) ? require('../engine/engine.js') : root.GD;
  const TYPE = GD.TYPE;

  const next = s => (s + 1) % 4;
  const teammate = s => (s + 2) % 4;
  const teamOf = s => (s % 2 === 0) ? 'A' : 'B';   // A={0,2} B={1,3}
  const LEVEL_SEQ = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];

  // ---------- 合法出牌生成（阶段②子集） ----------
  function genCandidates(hand, level) {
    const res = [];
    const wilds = hand.filter(c => GD.isWild(c, level));
    const W = wilds.length;
    const normal = hand.filter(c => !GD.isWild(c, level));
    const byRank = {};
    for (const c of normal) (byRank[c.rank] = byRank[c.rank] || []).push(c);
    // 单张
    for (const c of hand) res.push(mk([c], level));
    // 天王炸
    const bigs = hand.filter(c => c.rank === GD.BIG), smalls = hand.filter(c => c.rank === GD.SMALL);
    if (bigs.length >= 2 && smalls.length >= 2) res.push(mk([bigs[0], bigs[1], smalls[0], smalls[1]], level));
    // 各点数的 对/三/炸（含逢人配补齐）
    for (const r in byRank) {
      if (r === GD.SMALL || r === GD.BIG) continue;
      const cs = byRank[r];
      const maxSize = cs.length + W;
      for (let size = 2; size <= maxSize && size <= 8; size++) {
        const useNormal = Math.min(cs.length, size);
        const useWild = size - useNormal;
        if (useWild > W) continue;
        const cards = cs.slice(0, useNormal).concat(wilds.slice(0, useWild));
        const combo = GD.classify(cards, level);
        if (combo) res.push({ cards, combo });
      }
    }
    // 纯逢人配成对（=对级牌）
    if (W >= 2) { const cb = GD.classify(wilds.slice(0, 2), level); if (cb) res.push({ cards: wilds.slice(0, 2), combo: cb }); }
    return res;
  }
  function mk(cards, level) { return { cards, combo: GD.classify(cards, level) }; }

  function legalMoves(hand, top, level) {
    const cand = genCandidates(hand, level).filter(m => m.combo);
    if (!top) return cand;
    return cand.filter(m => GD.beats(m.combo, top, level));
  }

  // ---------- 单局驱动 ----------
  function removeCards(hand, cards) {
    const ids = new Set(cards.map(c => c.id));
    for (let i = hand.length - 1; i >= 0; i--) if (ids.has(hand[i].id)) hand.splice(i, 1);
  }
  function nextActive(state, s) { let t = next(s); while (!state.active[t]) t = next(t); return t; }
  function activeCount(state) { return state.active.filter(Boolean).length; }

  // deciders[seat](state, seat) → 返回 cards[] 出牌，或 'pass' 过牌
  function runDeal(level, hands, leader, deciders) {
    const state = {
      level, hands: hands.map(h => h.slice()), turn: leader,
      current: null, currentOwner: null, passes: 0,
      finished: [], active: [true, true, true, true], log: [],
      played: [],   // 公共信息：已打出的所有牌（AI 记牌用）
      playLog: []   // 公共信息：每手 {seat, cards}（宗师"记得谁出的"用）
    };
    let guard = 0;
    while (activeCount(state) > 1) {
      if (++guard > 200000) throw new Error('runDeal 死循环保护');
      const seat = state.turn;
      if (!state.active[seat]) { state.turn = next(seat); continue; }

      let move = deciders[seat](state, seat);
      const leading = state.current === null;

      if (move === 'pass' || !move) {
        if (leading) {                       // 领出不能过，兜底出第一手合法牌
          const lm = legalMoves(state.hands[seat], null, level);
          move = lm.length ? lm[0].cards : null;
          if (!move) { state.active[seat] = false; state.finished.push(seat); state.turn = nextActive(state, seat); continue; }
        } else {
          state.passes++;
          const others = activeCount(state) - (state.active[state.currentOwner] ? 1 : 0);
          if (state.passes >= others) { endTrick(state); continue; }
          state.turn = next(seat); continue;
        }
      }

      // 出牌
      const combo = GD.classify(move, level);
      if (!combo) throw new Error('非法牌型: ' + move.map(GD.cardLabel).join(','));
      if (state.current && !GD.beats(combo, state.current, level)) throw new Error('压不过当前牌');
      removeCards(state.hands[seat], move);
      state.current = combo; state.currentOwner = seat; state.passes = 0;
      for (const c of move) state.played.push(c);
      state.playLog.push({ seat, cards: move.slice() });
      state.log.push({ seat, type: combo.type, key: combo.key, n: move.length });
      if (state.hands[seat].length === 0) {
        state.finished.push(seat); state.active[seat] = false;
        if (activeCount(state) <= 1) break;
      }
      state.turn = next(seat);
    }
    // 收尾：剩余一家为末游
    const lastSeat = state.active.indexOf(true);
    const ranks = state.finished.concat(lastSeat >= 0 ? [lastSeat] : []);
    return { ranks, log: state.log };

    function endTrick(st) {
      const owner = st.currentOwner;
      let leadNext;
      if (st.active[owner]) leadNext = owner;
      else { const mate = teammate(owner); leadNext = st.active[mate] ? mate : nextActive(st, owner); }
      st.current = null; st.currentOwner = null; st.passes = 0; st.turn = leadNext;
    }
  }

  // ---------- 计分 / 升级 ----------
  function scoreDeal(ranks) {
    const head = ranks[0], partner = teammate(head);
    const pIdx = ranks.indexOf(partner);
    const gain = pIdx === 1 ? 3 : pIdx === 2 ? 2 : 1; // 双下+3 / 1·3名+2 / 1·4名+1
    return { head, headTeam: teamOf(head), gain, doubleDown: pIdx === 1 };
  }
  function advanceLevel(curIdx, gain, gotHead) {
    if (curIdx === 12 && gotHead) return { idx: 12, win: true };   // 在A且头游=过A胜
    return { idx: Math.min(curIdx + gain, 12), win: false };
  }

  // ---------- 进贡 / 还贡 / 抗贡 ----------
  function countBigJoker(hand) { return hand.filter(c => c.rank === GD.BIG).length; }
  function biggestCard(hand, level) {            // 最大牌（排除逢人配）
    let best = null;
    for (const c of hand) {
      if (GD.isWild(c, level)) continue;
      if (!best || GD.powerOfCard(c, level) > GD.powerOfCard(best, level)) best = c;
    }
    return best;
  }
  function returnCard(hand, level) {             // 还贡：一张 ≤10 点的牌（取最小）
    let pick = null;
    for (const c of hand) {
      if (GD.isJoker(c)) continue;
      const v = GD.naturalRank(c.rank);
      if (v > 10) continue;
      if (!pick || GD.powerOfCard(c, level) < GD.powerOfCard(pick, level)) pick = c;
    }
    if (!pick) for (const c of hand) if (!GD.isJoker(c)) { pick = pick || c; } // 兜底
    return pick;
  }
  function move1(fromHand, toHand, card) { removeCards(fromHand, [card]); toHand.push(card); }

  // 返回 {antiTribute, leader, moves:[...描述]}；直接在 hands 上完成进贡/还贡
  function resolveTribute(prevRanks, hands, level) {
    const head = prevRanks[0], second = prevRanks[1], third = prevRanks[2], last = prevRanks[3];
    const doubleDown = prevRanks.indexOf(teammate(head)) === 1;
    const moves = [];
    if (doubleDown) {
      const bj = countBigJoker(hands[third]) + countBigJoker(hands[last]);
      if (bj >= 2) return { antiTribute: true, leader: head, moves };
      // 双贡：末游、三游各上交最大牌；较大者给头游，较小者给二游
      const a = biggestCard(hands[last], level), b = biggestCard(hands[third], level);
      const aBig = GD.powerOfCard(a, level) >= GD.powerOfCard(b, level);
      const toHead = aBig ? { giver: last, card: a } : { giver: third, card: b };
      const toSecond = aBig ? { giver: third, card: b } : { giver: last, card: a };
      move1(hands[toHead.giver], hands[head], toHead.card);
      move1(hands[toSecond.giver], hands[second], toSecond.card);
      const r1 = returnCard(hands[head], level); move1(hands[head], hands[toHead.giver], r1);
      const r2 = returnCard(hands[second], level); move1(hands[second], hands[toSecond.giver], r2);
      moves.push({ tribute: toHead, to: head, ret: r1 }, { tribute: toSecond, to: second, ret: r2 });
      return { antiTribute: false, leader: last, moves };
    } else {
      if (countBigJoker(hands[last]) >= 2) return { antiTribute: true, leader: head, moves };
      const t = biggestCard(hands[last], level);
      move1(hands[last], hands[head], t);
      const r = returnCard(hands[head], level); move1(hands[head], hands[last], r);
      moves.push({ tribute: { giver: last, card: t }, to: head, ret: r });
      return { antiTribute: false, leader: last, moves };
    }
  }

  // ---------- 整场比赛 ----------
  function playMatch(deciders, opts) {
    opts = opts || {};
    const levels = { A: 0, B: 0 };           // 索引 0=级牌2 ... 12=A
    let prevRanks = null;
    let firstLeader = (opts.firstLeader != null) ? opts.firstLeader : 0;
    const deals = [];
    let dealNo = 0;
    while (true) {
      if (++dealNo > (opts.maxDeals || 60)) return { winner: null, reason: '超过最大局数', levels, deals };
      // 本局级牌 = 上一局头游方(=当前庄家方)的级；首局打2
      const dealTeam = prevRanks ? teamOf(prevRanks[0]) : 'A';
      const dealLevelIdx = prevRanks ? levels[dealTeam] : 0;
      const level = LEVEL_SEQ[dealLevelIdx];

      const seed = (opts.seed != null) ? (opts.seed + dealNo) : undefined;
      const hands = GD.deal(seed);
      let leader = firstLeader, tribute = null;
      if (prevRanks) { tribute = resolveTribute(prevRanks, hands, level); leader = tribute.leader; }

      const { ranks } = runDeal(level, hands, leader, deciders);
      const sc = scoreDeal(ranks);
      const adv = advanceLevel(levels[sc.headTeam], sc.gain, true);
      levels[sc.headTeam] = adv.idx;
      deals.push({ dealNo, level, ranks, headTeam: sc.headTeam, gain: sc.gain, doubleDown: sc.doubleDown,
                   antiTribute: tribute ? tribute.antiTribute : null, levels: { ...levels } });
      if (adv.win) return { winner: sc.headTeam, levels, deals, dealsPlayed: dealNo };
      prevRanks = ranks;
    }
  }

  // ---------- 内置基线决策（用于测试/弱AI占位） ----------
  function greedyDecider(state, seat) {
    const hand = state.hands[seat], level = state.level;
    const moves = legalMoves(hand, state.current, level);
    if (!state.current) {
      const singles = moves.filter(m => m.combo.type === TYPE.SINGLE).sort((a, b) => a.combo.key - b.combo.key);
      return (singles[0] || moves[0]).cards;
    }
    const nb = moves.filter(m => m.combo.bombScore === 0).sort((a, b) => a.combo.key - b.combo.key);
    return nb.length ? nb[0].cards : 'pass';
  }

  const API = {
    next, teammate, teamOf, LEVEL_SEQ,
    genCandidates, legalMoves, runDeal, scoreDeal, advanceLevel,
    resolveTribute, playMatch, greedyDecider, biggestCard, countBigJoker
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.GDGame = Object.assign(root.GDGame || {}, API);
})(typeof globalThis !== 'undefined' ? globalThis : this);
