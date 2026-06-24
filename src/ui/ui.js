/* 掼蛋 H5 对局界面控制器（阶段④）· 依赖 engine.js / game.js / ai.js
 * 人类坐 0(南)，1=下家(东) 2=对家(北·队友) 3=上家(西)。事件驱动：人类回合等待操作，AI 回合自动推进。
 */
(function () {
  'use strict';
  const GD = window.GD, Game = window.GDGame, AI = window.GDAI;
  const LEVELS = GD.RANKS, DIFFS = ['入门', '中级', '高级', '大师', '宗师'];
  const SEAT_ID = { 0: 'S', 1: 'E', 2: 'N', 3: 'W' };
  const AI_DELAY = 650;
  const APP_VERSION = 'v8';   // 版本号（与 sw.js VERSION 一起递增）
  const $ = id => document.getElementById(id);
  const next = s => (s + 1) % 4, teammate = s => (s + 2) % 4, teamOf = s => (s % 2 === 0) ? 'A' : 'B';

  // ---------- 状态 ----------
  const M = { levels: { A: 0, B: 0 }, prevRanks: null, startLevelIdx: 0,
    diff: { 1: '中级', 2: '高级', 3: '中级' }, ais: {}, matchWon: null,
    sortMode: 'power', auto: false, dealNo: 0, autoAI: null, deep: false };
  let D = null;                 // 当前一局状态
  let sel = new Set();          // 选中的手牌 id
  let hint = { list: null, idx: -1, sig: '' };
  let groupCache = { sig: '', layout: null };

  // ---------- 工具 ----------
  function roleName(s) { return ['你', '下家', '对家', '上家'][s]; }
  function activeCount() { return D.active.filter(Boolean).length; }
  function nextActive(s) { let t = next(s); while (!D.active[t]) t = next(t); return t; }
  function myHandSorted() { return GD.sortHand(D.hands[0], D.level); }
  function buildAIs() { for (const s of [1, 2, 3]) M.ais[s] = AI.makeAI(M.diff[s], { deep: M.deep }); M.autoAI = null; }

  function toast(msg, ms) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), ms || 1900);
  }

  // ---------- 卡片渲染 ----------
  // ︎ = 文本变体选择符：强制矢量文字字形（清晰、可上色），避免被渲染成笨重 emoji
  const VS = '︎';
  const SM = { S: '♠' + VS, H: '♥' + VS, C: '♣' + VS, D: '♦' + VS };
  function cardEl(c, cls) {
    const el = document.createElement('div');
    el.className = 'card ' + (cls || '');
    if (GD.isJoker(c)) {
      const big = c.rank === 'b';
      el.classList.add('joker', big ? 'big' : 'small');
      el.innerHTML = '<span class="corner tl">' + (big ? '大' : '小') + '</span><span class="pip">'+'★'+VS+'</span><span class="jlb">' + (big ? '大王' : '小王') + '</span>';
    }
    else {
      if (c.suit === 'H' || c.suit === 'D') el.classList.add('red');
      if (GD.isWild(c, D.level)) el.classList.add('wild'); else if (c.rank === D.level) el.classList.add('lv');
      const s = SM[c.suit];
      el.innerHTML = '<span class="corner tl"><b>' + c.rank + '</b><i>' + s + '</i></span><span class="pip">' + s + '</span><span class="corner br"><b>' + c.rank + '</b><i>' + s + '</i></span>';
    }
    return el;
  }

  // ---------- 渲染 ----------
  function render() {
    // HUD
    $('hudlv').innerHTML = '本局打 <b>' + D.level + '</b>';
    $('hudteam').textContent = '我方 ' + LEVELS[M.levels.A] + ' · 对方 ' + LEVELS[M.levels.B];
    // 座位
    for (const s of [0, 1, 2, 3]) {
      const id = SEAT_ID[s];
      $('ct' + id).textContent = D.hands[s].length + ' 张';
      const seat = $('seat' + id);
      seat.classList.toggle('turn', D.phase === 'playing' && D.turn === s);
      seat.classList.toggle('out', !D.active[s]);
    }
    $('diffN').textContent = M.diff[2]; $('diffE').textContent = M.diff[1]; $('diffW').textContent = M.diff[3];
    // 出牌区
    for (const s of [0, 1, 2, 3]) {
      const box = $('play' + SEAT_ID[s]); box.innerHTML = '';
      const lp = D.lastPlayed[s];
      if (lp === 'pass') { const t = document.createElement('div'); t.className = 'pass-tag'; t.textContent = '不要'; box.appendChild(t); }
      else if (lp && lp.cards) { for (const c of GD.sortHand(lp.cards, D.level)) box.appendChild(cardEl(c, 'mini')); }
    }
    // 中央提示
    $('mid').innerHTML = D.phase === 'playing'
      ? (D.current ? '' : '<span class="big">' + (D.turn === 0 ? '请你领出' : roleName(D.turn) + ' 领出') + '</span>')
      : '';
    // 手牌（默认按点值横排；理牌后每个牌型一列纵向叠放）
    const hand = $('hand'); hand.innerHTML = '';
    const grouped = (M.sortMode === 'grouped' && D.active[0]);
    hand.classList.toggle('grouped', grouped);
    const mkCard = c => { const el = cardEl(c, sel.has(c.id) ? 'sel' : ''); el.dataset.id = c.id; el.addEventListener('click', () => onCardClick(c.id)); return el; };
    if (grouped) {
      for (const col of getGroupedLayout().cols) {
        const colEl = document.createElement('div'); colEl.className = 'col';
        for (const c of col) colEl.appendChild(mkCard(c));
        hand.appendChild(colEl);
      }
    } else {
      for (const c of myHandSorted()) hand.appendChild(mkCard(c));
    }
    updateControls();
  }

  function updateControls() {
    const myTurn = D && D.phase === 'playing' && D.turn === 0 && D.active[0] && !M.auto;
    $('btnPlay').disabled = !myTurn;
    $('btnHint').disabled = !myTurn;
    $('btnPass').disabled = !(myTurn && D.current);   // 领出不可不要
    $('turnhint').textContent = !D ? '' :
      (D.phase !== 'playing' ? '' :
        (M.auto && D.turn === 0 ? '托管中…（点「取消托管」收回操作）' :
        (D.turn === 0 && D.active[0] ? (D.current ? '轮到你 · 出更大的牌或点「不要」' : '轮到你 · 请领出任意牌型')
                       : roleName(D.turn) + ' 思考中…')));
  }

  // ---------- 自动理牌布局：每个牌型一列（纵向叠放） ----------
  function getGroupedLayout() {
    const sig = D.hands[0].map(c => c.id).slice().sort((a, b) => a - b).join(',');
    if (groupCache.sig === sig && groupCache.layout) return groupCache.layout;
    const dec = AI.decomposeHand(D.hands[0], D.level);
    const cols = [];
    for (const g of dec.groups) cols.push(GD.sortHand(g.cards, D.level));   // 每个组合一列
    for (const c of GD.sortHand(dec.singles, D.level)) cols.push([c]);       // 散张各自一列
    groupCache = { sig, layout: { cols, hands: dec.hands } };
    return groupCache.layout;
  }
  function onSort() {
    M.sortMode = (M.sortMode === 'grouped') ? 'power' : 'grouped';
    $('btnSort').classList.toggle('on', M.sortMode === 'grouped');
    $('btnSort').textContent = (M.sortMode === 'grouped') ? '🎴 原序' : '🎴 理牌';
    render();
    if (M.sortMode === 'grouped' && D && D.active[0]) toast('已整理：' + getGroupedLayout().hands + ' 手可走完');
  }
  function onAuto() {
    M.auto = !M.auto;
    $('btnAuto').classList.toggle('on', M.auto);
    $('btnAuto').textContent = M.auto ? '🤖 取消托管' : '🤖 托管';
    updateControls();
    if (M.auto) pump();
  }

  // ---------- 交互 ----------
  function onCardClick(id) {
    if (!(D.phase === 'playing' && D.turn === 0 && D.active[0])) return;
    if (sel.has(id)) sel.delete(id); else sel.add(id);
    hint.list = null;
    render();
  }
  function selectedCards() { return D.hands[0].filter(c => sel.has(c.id)); }

  function onPlay() {
    if (!(D.phase === 'playing' && D.turn === 0)) return;
    const cards = selectedCards();
    if (!cards.length) return toast('请先选牌');
    const combo = GD.classify(cards, D.level);
    if (!combo) return toast('不是合法牌型');
    if (D.current && !GD.beats(combo, D.current, D.level)) return toast('压不过当前的牌');
    sel.clear(); hint.list = null;
    doPlay(0, cards);
  }
  function onPass() {
    if (!(D.phase === 'playing' && D.turn === 0 && D.current)) return;
    sel.clear(); hint.list = null; doPass(0);
  }
  function onHint() {
    if (!(D.phase === 'playing' && D.turn === 0)) return;
    const hand = D.hands[0], lvl = D.level;
    let list = D.current ? AI.movesBeating(hand, lvl, D.current) : AI.allCombos(hand, lvl);
    list = list.filter(m => m.combo);
    if (!list.length) { sel.clear(); render(); return toast(D.current ? '没有能压的牌，可点「不要」' : '无牌可出'); }
    // 排序：非炸优先、点小优先（领出时单张/小对先提示）
    list.sort((a, b) => (a.combo.bombScore - b.combo.bombScore) || (a.combo.key - b.combo.key) || (a.cards.length - b.cards.length));
    const sig = D.current ? (D.current.type + D.current.key) : 'lead';
    if (hint.sig !== sig || !hint.list) { hint = { list, idx: 0, sig }; }
    else { hint.idx = (hint.idx + 1) % hint.list.length; }
    sel = new Set(hint.list[hint.idx].cards.map(c => c.id));
    render();
  }

  // ---------- 出牌 / 过牌 ----------
  function doPlay(seat, cards) {
    const combo = GD.classify(cards, D.level);
    const ids = new Set(cards.map(c => c.id));
    D.hands[seat] = D.hands[seat].filter(c => !ids.has(c.id));
    D.current = combo; D.currentOwner = seat; D.passes = 0;
    for (const c of cards) D.played.push(c);
    D.playLog.push({ seat, cards: cards.slice() });
    D.lastPlayed[seat] = { cards: cards.slice(), combo };
    if (D.hands[seat].length === 0) {
      D.finished.push(seat); D.active[seat] = false;
      if (activeCount() <= 1) { render(); return dealEnd(); }
    }
    D.turn = nextActive(seat); render(); pump();
  }
  function doPass(seat) {
    D.passes++; D.lastPlayed[seat] = 'pass';
    const others = activeCount() - (D.active[D.currentOwner] ? 1 : 0);
    if (D.passes >= others) { endTrick(); render(); return pump(); }
    D.turn = nextActive(seat); render(); pump();
  }
  function endTrick() {
    const owner = D.currentOwner;
    let leadNext = D.active[owner] ? owner : (D.active[teammate(owner)] ? teammate(owner) : nextActive(owner));
    D.current = null; D.currentOwner = null; D.passes = 0;
    D.lastPlayed = [null, null, null, null];
    D.turn = leadNext;
  }

  // ---------- AI 推进 ----------
  function pump() {
    if (!D || D.phase !== 'playing') return;
    updateControls();
    if (D.turn === 0 && D.active[0] && !M.auto) return;   // 等人类（未托管）
    setTimeout(aiStep, AI_DELAY);
  }
  function aiStep() {
    if (!D || D.phase !== 'playing') return;
    const seat = D.turn;
    if (!D.active[seat]) return;
    let decide;
    if (seat === 0) { if (!M.auto) return; decide = M.autoAI || (M.autoAI = AI.makeAI('大师', { deep: M.deep })); }
    else decide = M.ais[seat] || AI.makeAI(M.diff[seat], { deep: M.deep });
    let move;
    try { move = decide(D, seat); } catch (e) { move = 'pass'; }
    if (move === 'pass' || !move) {
      if (!D.current) {                                // 领出兜底
        const lm = AI.allCombos(D.hands[seat], D.level);
        move = lm.length ? lm[0].cards : D.hands[seat].slice(0, 1);
        doPlay(seat, move);
      } else doPass(seat);
    } else doPlay(seat, move);
  }

  // ---------- 一局开始 / 结束 ----------
  function startDeal() {
    const dealTeam = M.prevRanks ? teamOf(M.prevRanks[0]) : null;
    const lvIdx = M.prevRanks ? M.levels[dealTeam] : M.startLevelIdx;
    const level = LEVELS[lvIdx];
    const hands = GD.deal();
    let leader = 0, tributeMsg = '';
    if (M.prevRanks) {
      const tr = Game.resolveTribute(M.prevRanks, hands, level);
      leader = tr.leader;
      tributeMsg = describeTribute(tr);
    }
    D = { level, hands, turn: leader, current: null, currentOwner: null, passes: 0,
      finished: [], active: [true, true, true, true], played: [], playLog: [], lastPlayed: [null, null, null, null], phase: 'playing' };
    sel.clear(); hint.list = null; groupCache = { sig: '', layout: null };
    M.dealNo++; $('hudno').textContent = '第 ' + M.dealNo + ' 局';
    render();
    if (tributeMsg) toast(tributeMsg, 2600);
    pump();
  }

  function describeTribute(tr) {
    if (tr.antiTribute) return '末游手握双大王 · 抗贡！由头游先出';
    return tr.moves.map(m => roleName(m.tribute.giver) + '→' + roleName(m.to) + ' 进贡' + GD.cardLabel(m.tribute.card) + '，还贡' + GD.cardLabel(m.ret)).join('；');
  }

  function dealEnd() {
    const lastSeat = D.active.indexOf(true);
    const ranks = D.finished.concat(lastSeat >= 0 ? [lastSeat] : []);
    D.phase = 'dealEnd';
    const sc = Game.scoreDeal(ranks);
    const adv = Game.advanceLevel(M.levels[sc.headTeam], sc.gain, true);
    M.levels[sc.headTeam] = adv.idx;
    M.prevRanks = ranks;
    M.matchWon = adv.win ? sc.headTeam : null;
    // 座位名次标注
    const place = ['头游', '二游', '三游', '末游'];
    for (let i = 0; i < ranks.length; i++) $('rk' + SEAT_ID[ranks[i]]).textContent = place[i];
    render();
    showResult(ranks, sc, adv);
  }

  function showResult(ranks, sc, adv) {
    const place = ['头游 🥇', '二游', '三游', '末游'];
    const lines = ranks.map((s, i) => '<div class="' + (s === 0 ? 'me' : '') + '">' + place[i] + '　' + roleName(s) + (s === 0 ? '（你）' : '') + '</div>');
    const teamCN = sc.headTeam === teamOf(0) ? '我方' : '对方';
    lines.push('<div style="margin-top:8px">' + teamCN + '头游 ' + (sc.doubleDown ? '双下 ' : '') + '+' + sc.gain + ' 级　→　我方 ' + LEVELS[M.levels.A] + ' · 对方 ' + LEVELS[M.levels.B] + '</div>');
    $('reslist').innerHTML = lines.join('');
    if (M.matchWon) {
      $('resttl').textContent = (M.matchWon === teamOf(0)) ? '🎉 我方胜利（过 A）！' : '😖 对方胜利（过 A）';
      $('btnNext').textContent = '再来一整场';
    } else { $('resttl').textContent = '本局结算'; $('btnNext').textContent = '下一局'; }
    $('resmask').classList.add('show');
  }

  function onNext() {
    $('resmask').classList.remove('show');
    for (const s of [0, 1, 2, 3]) $('rk' + SEAT_ID[s]).textContent = '';
    if (M.matchWon) { M.matchWon = null; newMatch(); }
    else startDeal();
  }

  // ---------- 新整场 / 设置 ----------
  function newMatch() {
    M.levels = { A: 0, B: 0 }; M.prevRanks = null; M.matchWon = null; M.dealNo = 0; M.auto = false;
    $('btnAuto').classList.remove('on'); $('btnAuto').textContent = '🤖 托管';
    buildAIs();
    startDeal();
  }
  function openSettings() { $('chkDeep').checked = M.deep; $('setmask').classList.add('show'); }
  function applySettingsAndStart() {
    M.diff[2] = $('selN').value; M.diff[1] = $('selE').value; M.diff[3] = $('selW').value;
    M.startLevelIdx = LEVELS.indexOf($('selLv').value);
    M.deep = $('chkDeep').checked;
    $('setmask').classList.remove('show');
    newMatch();
  }

  // ---------- 初始化 ----------
  function fillSelect(id, opts, val) {
    const s = $(id); s.innerHTML = '';
    for (const o of opts) { const e = document.createElement('option'); e.textContent = o; if (o === val) e.selected = true; s.appendChild(e); }
  }
  function init() {
    $('appver').textContent = APP_VERSION;
    fillSelect('selN', DIFFS, M.diff[2]); fillSelect('selE', DIFFS, M.diff[1]); fillSelect('selW', DIFFS, M.diff[3]);
    fillSelect('selLv', LEVELS, '2');
    $('btnPlay').onclick = onPlay; $('btnPass').onclick = onPass; $('btnHint').onclick = onHint;
    $('btnSort').onclick = onSort; $('btnAuto').onclick = onAuto;
    $('btnNext').onclick = onNext;
    $('gear').onclick = openSettings; $('btnClose').onclick = () => $('setmask').classList.remove('show');
    $('btnNewMatch').onclick = applySettingsAndStart;
    buildAIs();
    newMatch();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
