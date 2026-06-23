/* 牌局流程测试（node test/game.test.js）*/
const GD = require('../src/engine/engine.js');
const G = require('../src/game/game.js');

let pass = 0, fail = 0, _id = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + ' (得到 ' + JSON.stringify(a) + ')'); }
function C(spec) {
  if (spec === 'sj') return { id: _id++, rank: 's', suit: '' };
  if (spec === 'bj') return { id: _id++, rank: 'b', suit: '' };
  return { id: _id++, rank: spec.slice(1), suit: spec[0] };
}
function H(...s) { return s.map(C); }

console.log('== 计分 scoreDeal ==');
eq(G.scoreDeal([0,2,1,3]).gain, 3, '双下(1·2名同队) +3');
ok(G.scoreDeal([0,2,1,3]).doubleDown === true, '双下标记');
eq(G.scoreDeal([0,1,2,3]).gain, 2, '1·3名 +2');
eq(G.scoreDeal([0,1,3,2]).gain, 1, '1·4名 +1');
eq(G.scoreDeal([1,3,0,2]).headTeam, 'B', '头游为座1→B队');

console.log('== 升级 advanceLevel（含过A）==');
eq(G.advanceLevel(0, 3, true), { idx: 3, win: false }, '打2升3级→5(idx3)');
eq(G.advanceLevel(11, 3, true), { idx: 12, win: false }, 'K+3封顶到A、未过A');
eq(G.advanceLevel(12, 2, true), { idx: 12, win: true }, '在A且头游=胜');
eq(G.advanceLevel(12, 1, false).win, false, '在A但非头游不胜');

console.log('== 进贡/还贡/抗贡 ==');
// 单贡：head=0, last=3（非双下，partner=2在第3位）
(function () {
  const hands = [ H('S5','S6'), H('S7'), H('S8'), H('bj','S4','S9') ];
  const r = G.resolveTribute([0,1,2,3], hands, '2');
  ok(r.antiTribute === false, '单贡非抗贡');
  ok(hands[0].some(c => c.rank === 'b'), '头游收到大王(末游最大牌)');
  ok(!hands[3].some(c => c.rank === 'b'), '末游交出大王');
  ok(hands[3].some(c => GD.naturalRank(c.rank) <= 10), '末游收到还贡(≤10)');
  ok(r.leader === 3, '进贡方(末游)先出');
})();
// 抗贡：末游手握 2 大王
(function () {
  const hands = [ H('S5'), H('S7'), H('S8'), H('bj','bj','S4') ];
  const r = G.resolveTribute([0,1,2,3], hands, '2');
  ok(r.antiTribute === true, '末游2大王→抗贡');
  ok(r.leader === 0, '抗贡后头游先出');
})();
// 双贡：1·2名同队(head=0,partner=2 在第2位)，对手3游4游各进贡
(function () {
  const hands = [ H('S5'), H('S6'), H('S7'), H('S8') ];
  // ranks=[0,2,1,3]：head0,second2,third1,last3
  const big3 = H('bj','S3')[0]; // 给座1一张大牌
  hands[1] = H('bj','S3'); hands[3] = H('SA','D4');
  const r = G.resolveTribute([0,2,1,3], hands, '2');
  ok(r.antiTribute === false, '双贡(无2大王)');
  ok(hands[0].some(c => c.rank === 'b'), '较大贡(大王)给头游');
  ok(hands[2].some(c => c.rank === 'A'), '较小贡(A)给二游');
})();

console.log('== 单局 runDeal（贪心决策跑通）==');
(function () {
  const hands = GD.deal(12345);
  const deciders = [G.greedyDecider, G.greedyDecider, G.greedyDecider, G.greedyDecider];
  const { ranks } = G.runDeal('2', hands, 0, deciders);
  eq(ranks.slice().sort().join(''), '0123', '名次是 0123 的排列');
  ok(ranks.length === 4, '产生4个名次');
})();

console.log('== 整场 playMatch（贪心，固定种子，应分出胜负）==');
(function () {
  const deciders = [G.greedyDecider, G.greedyDecider, G.greedyDecider, G.greedyDecider];
  const res = G.playMatch(deciders, { seed: 777, maxDeals: 80 });
  ok(res.winner === 'A' || res.winner === 'B', '分出胜方: ' + res.winner + '（' + res.dealsPlayed + ' 局，A=' + GD.RANKS[res.levels.A] + ' B=' + GD.RANKS[res.levels.B] + '）');
  ok(res.deals.every(d => d.ranks.slice().sort().join('') === '0123'), '每局名次均为合法排列');
})();

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
