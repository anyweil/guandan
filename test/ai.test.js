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

console.log('== 强度梯度（复式对局：同一副牌强弱方各打一遍，运气抵消，只比水平）==');
// 复式法：每副固定牌让 strong 队分别坐 {0,2} 与 {1,3} 各打一遍，统计 strong 拿头游的比例。
function dupHeadRate(strong, weak, n) {
  const levels = ['2', '5', '8', 'J', 'A'];
  let sH = 0, tot = 0;
  for (let i = 0; i < n; i++) {
    const seed = 12345 + i * 101, level = levels[i % levels.length], leader = i % 4;
    const base = GD.deal(seed);
    const r1 = G.runDeal(level, base.map(h => h.slice()), leader,
      [AI.makeAI(strong), AI.makeAI(weak), AI.makeAI(strong), AI.makeAI(weak)]);
    const r2 = G.runDeal(level, base.map(h => h.slice()), leader,
      [AI.makeAI(weak), AI.makeAI(strong), AI.makeAI(weak), AI.makeAI(strong)]);
    if (r1.ranks[0] === 0 || r1.ranks[0] === 2) sH++;       // run1: strong 坐 0/2
    if (r2.ranks[0] === 1 || r2.ranks[0] === 3) sH++;       // run2: strong 坐 1/3（同一副牌）
    tot += 2;
  }
  return sH / tot * 100;
}
const N = 300;
// 有记忆各档对“无记忆”的入门应有明显优势（>52%）
for (const name of ['中级', '高级', '大师', '宗师']) {
  const r = dupHeadRate(name, '入门', N);
  console.log(`  ${name} vs 入门 : ${r.toFixed(1)}% 头游`);
  ok(r > 52, name + ' 明显强于 入门(无记忆)');
}
// 记忆越多不应更差：相邻档单调非降（容忍噪声 ±2.5%）
const ladder = ['入门', '中级', '高级', '大师', '宗师'];
for (let i = 1; i < ladder.length - 1; i++) {
  const r = dupHeadRate(ladder[i + 1], ladder[i], N);
  console.log(`  ${ladder[i + 1]} vs ${ladder[i]} : ${r.toFixed(1)}%`);
  ok(r >= 47.5, ladder[i + 1] + ' 不弱于 ' + ladder[i]);
}

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
