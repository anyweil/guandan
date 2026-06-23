/* AI 与生成器测试（node test/ai.test.js）*/
const GD = require('../src/engine/engine.js');
const G = require('../src/game/game.js');
const AI = require('../src/ai/ai.js');

let pass = 0, fail = 0, _id = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }
function C(spec) { if (spec === 'sj') return { id: _id++, rank: 's', suit: '' }; if (spec === 'bj') return { id: _id++, rank: 'b', suit: '' }; return { id: _id++, rank: spec.slice(1), suit: spec[0] }; }
function H(...s) { return s.map(C); }
function has(combos, type, key) { return combos.some(m => m.combo.type === type && m.combo.key === key); }

console.log('== 完整生成器（打2）==');
let cb;
cb = AI.allCombos(H('S3','C4','D5','H6','S7'), '2');
ok(has(cb, GD.TYPE.STRAIGHT, 7), '生成顺子34567');
cb = AI.allCombos(H('S3','C4','H2','S6','S7'), '2');
ok(has(cb, GD.TYPE.STRAIGHT, 7), '生成顺子(逢人配补5)');
cb = AI.allCombos(H('S3','S4','S5','S6','S7'), '2');
ok(has(cb, GD.TYPE.STRAIGHT_FLUSH, 7), '生成同花顺');
cb = AI.allCombos(H('S3','C3','S4','C4','S5','C5'), '2');
ok(has(cb, GD.TYPE.TUBE, 5), '生成三连对(木板)');
cb = AI.allCombos(H('S3','C3','D3','S4','C4','D4'), '2');
ok(has(cb, GD.TYPE.PLATE, 4), '生成钢板');
cb = AI.allCombos(H('S9','C9','D9','S6','C6'), '2');
ok(has(cb, GD.TYPE.TRIPLE_PAIR, 9), '生成三带二');
cb = AI.allCombos(H('S9','H9','C9','D9'), '2');
ok(has(cb, GD.TYPE.BOMB, 9), '生成四张炸');
cb = AI.allCombos(H('bj','bj','sj','sj'), '2');
ok(has(cb, GD.TYPE.KING_BOMB, 100), '生成天王炸');

// 生成器自洽：每个组合都能被引擎正确识别
(function () {
  const hand = GD.deal(999)[0];
  const list = AI.allCombos(hand, '5');
  let bad = 0;
  for (const m of list) { const c = GD.classify(m.cards, '5'); if (!c || c.type !== m.combo.type || c.key !== m.combo.key) bad++; }
  ok(bad === 0, '生成器自洽(27张手牌, ' + list.length + ' 个组合全部可被识别)');
})();

console.log('== 自动理牌 decomposeHand ==');
(function () {
  // 33445567 + 99 9 + 单张：应整理出 顺子/连对/三条/对子，覆盖全部牌
  const hand = H('S3','C3','S4','C4','S5','C5','S6','C9','C9','D9','SA','HK');
  const dec = AI.decomposeHand(hand, '2');
  const used = dec.groups.reduce((n, g) => n + g.cards.length, 0) + dec.singles.length;
  ok(used === hand.length, '理牌覆盖全部手牌(' + used + '/' + hand.length + ')');
  ok(dec.hands === dec.groups.length + dec.singles.length, '手数=组数+散张');
  // 含三连对(木板) 33 44 55 应被识别为一组
  ok(dec.groups.some(g => g.combo.type === GD.TYPE.TUBE) || dec.groups.some(g => g.combo.type === GD.TYPE.STRAIGHT), '能成型连对/顺子');
  // 整张手牌随机：理牌后每组都是合法牌型
  const rh = GD.deal(7)[0];
  const d2 = AI.decomposeHand(rh, '5');
  ok(d2.groups.every(g => GD.classify(g.cards, '5')), '随机手牌理牌后各组均合法');
  ok(d2.groups.reduce((n,g)=>n+g.cards.length,0)+d2.singles.length === rh.length, '随机手牌理牌无丢牌');
})();

console.log('== 对局合法性（各档 AI 跑整场不报错）==');
['入门','中级','高级','大师','宗师'].forEach(name => {
  try {
    const d = [AI.makeAI(name), AI.makeAI(name), AI.makeAI(name), AI.makeAI(name)];
    const r = G.playMatch(d, { seed: 100 + AI.TIER[name], maxDeals: 80 });
    ok(r.winner === 'A' || r.winner === 'B' || r.winner === null, name + ' 同档自对局完成(胜方' + r.winner + ', ' + (r.dealsPlayed||'-') + '局)');
  } catch (e) { ok(false, name + ' 对局抛错: ' + e.message); }
});

console.log('== 强度梯度（多场对抗胜率）==');
function tourney(teamA, teamB, n) {
  // A 队(座0,2)=teamA  B 队(座1,3)=teamB
  let aw = 0, bw = 0, draw = 0;
  for (let i = 0; i < n; i++) {
    const d = [AI.makeAI(teamA), AI.makeAI(teamB), AI.makeAI(teamA), AI.makeAI(teamB)];
    const r = G.playMatch(d, { seed: 5000 + i * 7, maxDeals: 80, firstLeader: i % 4 });
    if (r.winner === 'A') aw++; else if (r.winner === 'B') bw++; else draw++;
  }
  return { aw, bw, draw, n };
}
const N = 40;
let t;
t = tourney('宗师', '入门', N);
console.log(`  宗师 vs 入门 : 宗师胜 ${t.aw} / 入门胜 ${t.bw} / 平 ${t.draw}（共${N}场）`);
ok(t.aw > t.bw, '宗师 明显强于 入门');
t = tourney('高级', '中级', N);
console.log(`  高级 vs 中级 : 高级胜 ${t.aw} / 中级胜 ${t.bw} / 平 ${t.draw}`);
ok(t.aw >= t.bw, '高级 不弱于 中级');
t = tourney('大师', '入门', N);
console.log(`  大师 vs 入门 : 大师胜 ${t.aw} / 入门胜 ${t.bw} / 平 ${t.draw}`);
ok(t.aw > t.bw, '大师 明显强于 入门');

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
