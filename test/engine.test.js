/* 引擎单元测试（node test/engine.test.js）*/
const GD = require('../src/engine/engine.js');
const { classify, beats, TYPE } = GD;

let pass = 0, fail = 0;
function eq(actual, expect, msg) {
  const ok = JSON.stringify(actual) === JSON.stringify(expect);
  if (ok) { pass++; }
  else { fail++; console.log('  ✗ ' + msg + '  期望=' + JSON.stringify(expect) + ' 实际=' + JSON.stringify(actual)); }
}
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('  ✗ ' + msg); } }

// 造牌：'S5'(黑桃5) 'H2'(红桃2) 'C10' 'DA'，'sj'小王 'bj'大王
let _id = 0;
function C(spec) {
  if (spec === 'sj') return { id: _id++, rank: 's', suit: '' };
  if (spec === 'bj') return { id: _id++, rank: 'b', suit: '' };
  const suit = spec[0], rank = spec.slice(1);
  return { id: _id++, rank, suit };
}
function H(...specs) { return specs.map(C); }
function t(cards, level) { const c = classify(cards, level); return c ? { type: c.type, key: c.key, bombScore: c.bombScore, len: c.len } : null; }

const L = '2'; // 默认打2

console.log('== 基础牌型（打2）==');
eq(t(H('SA'), L), { type: TYPE.SINGLE, key: 14, bombScore: 0, len: 1 }, '单张A');
eq(t(H('S2'), L), { type: TYPE.SINGLE, key: 15, bombScore: 0, len: 1 }, '单张级牌2(power15)');
eq(t(H('bj'), L), { type: TYPE.SINGLE, key: 17, bombScore: 0, len: 1 }, '单张大王');
ok(beats(classify(H('S2'), L), classify(H('SA'), L), L), '级牌2 压 A');
ok(beats(classify(H('bj'), L), classify(H('S2'), L), L), '大王 压 级牌');

eq(t(H('S5','C5'), L), { type: TYPE.PAIR, key: 5, bombScore: 0, len: 2 }, '对5');
eq(t(H('S5','H2'), L), { type: TYPE.PAIR, key: 5, bombScore: 0, len: 2 }, '对5(逢人配补)');
eq(t(H('H2','H2'), L), { type: TYPE.PAIR, key: 15, bombScore: 0, len: 2 }, '两张逢人配=对级牌');
eq(t(H('S7','C7','H2'), L), { type: TYPE.TRIPLE, key: 7, bombScore: 0, len: 3 }, '三条7(逢人配补)');

console.log('== 三带二 / 顺子 / 连对 / 钢板 ==');
eq(t(H('S3','C3','D3','S6','C6'), L), { type: TYPE.TRIPLE_PAIR, key: 3, bombScore: 0, len: 5 }, '三带二 333+66');
eq(t(H('S3','C3','S6','C6','H2'), L), { type: TYPE.TRIPLE_PAIR, key: 3, bombScore: 0, len: 5 }, '三带二(逢人配补三条)');
eq(t(H('S3','C4','D5','S6','H7'), L), { type: TYPE.STRAIGHT, key: 7, bombScore: 0, len: 5 }, '顺子34567');
eq(t(H('SA','S2','S3','S4','S5'), L), { type: TYPE.STRAIGHT_FLUSH, key: 5, bombScore: 5.5, len: 5 }, 'A2345同花顺(顶5)');
eq(t(H('CA','S2','D3','S4','H5'), L), { type: TYPE.STRAIGHT, key: 5, bombScore: 0, len: 5 }, 'A2345普通顺子');
eq(t(H('S10','SJ','SQ','SK','SA'), L), { type: TYPE.STRAIGHT_FLUSH, key: 14, bombScore: 5.5, len: 5 }, '10JQKA同花顺(顶A)');
eq(t(H('S3','C4','H2','S6','H7'), L), { type: TYPE.STRAIGHT, key: 7, bombScore: 0, len: 5 }, '顺子(逢人配补5)');
eq(t(H('S3','C3','S4','C4','S5','C5'), L), { type: TYPE.TUBE, key: 5, bombScore: 0, len: 6 }, '三连对334455');
eq(t(H('S3','C3','S4','C4','S5','H2'), L), { type: TYPE.TUBE, key: 5, bombScore: 0, len: 6 }, '三连对(逢人配补)');
eq(t(H('S3','C3','D3','S4','C4','D4'), L), { type: TYPE.PLATE, key: 4, bombScore: 0, len: 6 }, '钢板333444');

console.log('== 炸弹体系 ==');
eq(t(H('S9','H9','C9','D9'), L), { type: TYPE.BOMB, key: 9, bombScore: 4, len: 4 }, '四张炸9');
eq(t(H('S9','C9','D9','H2'), L), { type: TYPE.BOMB, key: 9, bombScore: 4, len: 4 }, '四张炸(逢人配补)');
eq(t(H('S9','H9','C9','D9','S9'), L), { type: TYPE.BOMB, key: 9, bombScore: 5, len: 5 }, '五张炸9');
eq(t(H('S9','H9','C9','D9','S9','H9'), L), { type: TYPE.BOMB, key: 9, bombScore: 6, len: 6 }, '六张炸9');
eq(t(H('bj','bj','sj','sj'), L), { type: TYPE.KING_BOMB, key: 100, bombScore: 100, len: 4 }, '天王炸');

console.log('== 压牌比较 ==');
ok(beats(classify(H('S6','C6'), L), classify(H('S5','C5'), L), L), '对6 压 对5');
ok(!beats(classify(H('S5','C5'), L), classify(H('S6','C6'), L), L), '对5 不压 对6');
ok(!beats(classify(H('S5','C5'), L), classify(H('SA'), L), L), '对子不能压单张(异型)');
ok(beats(classify(H('S9','H9','C9','D9'), L), classify(H('SA'), L), L), '炸弹 压 单张');
ok(beats(classify(H('S9','H9','C9','D9'), L), classify(H('S3','C4','D5','S6','H7'), L), L), '炸弹 压 顺子');
ok(beats(classify(H('S9','H9','C9','D9','S9'), L), classify(H('SK','HK','CK','DK'), L), L), '五张炸 压 四张炸(不论点数)');
ok(beats(classify(H('S3','S4','S5','S6','S7'), L), classify(H('SK','HK','CK','DK'), L), L), '同花顺(5.5) 压 四张炸');
ok(beats(classify(H('S3','S4','S5','S6','S7'), L), classify(H('SK','HK','CK','DK','SK'), L), L), '同花顺(5.5) 压 五张炸');
ok(beats(classify(H('S8','H8','C8','D8','S8','H8'), L), classify(H('S3','S4','S5','S6','S7'), L), L), '六张炸 压 同花顺');
ok(beats(classify(H('bj','bj','sj','sj'), L), classify(H('S8','H8','C8','D8','S8','H8','C8','D8'), L), L), '天王炸 压 八张炸');
ok(beats(classify(H('SQ','HQ','CQ','DQ'), L), classify(H('S5','H5','C5','D5'), L), L), '同为四张炸 比点数 Q>5');

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
