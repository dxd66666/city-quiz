/* =========================================================================
 * tests/test.js —— 自动化测试（零依赖，node tests/test.js）
 * 覆盖：计分、二值化边界、编码顺序、四维和、输入校验、
 *       256 编码全量映射、12 城覆盖、确定性、平局规则、
 *       O 维度语义（Q21-24 高分=随性）、结果报告拼装。
 * ========================================================================= */
'use strict';

var assert = require('assert');
var Q = require('../js/questions.js');
var M = require('../js/matching.js');
var R = require('../js/reports.js');

var SUB_ORDER = Q.SUB_ORDER; // P S C A E O F U

var passed = 0;
var failed = 0;
var failures = [];

function check(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (err) {
    failed++;
    failures.push({ name: name, err: err });
    console.log('  ✗ ' + name);
    console.log('      ' + (err && err.message ? err.message : err));
  }
}

function section(title) {
  console.log('\n■ ' + title);
}

// —— 工具：由 8 位二进制码生成极值原始分数（bit1→12, bit0→0）——
function rawFromCode(code) {
  var s = {};
  for (var i = 0; i < SUB_ORDER.length; i++) s[SUB_ORDER[i]] = code[i] === '1' ? 12 : 0;
  return s;
}
function rawFromBits(bits) {
  var s = {};
  SUB_ORDER.forEach(function (d, i) { s[d] = bits[i]; });
  return s;
}
// 由 8 位二进制码生成 32 题答案（每个子维度 4 题都答同一极端选项）
function answersFromCode(code) {
  var out = [];
  Q.QUESTIONS.forEach(function (q) {
    var idx = SUB_ORDER.indexOf(q.dim);
    out.push(code[idx] === '1' ? 'A' : 'D'); // A=3(高) / D=0(低)
  });
  return out;
}

section('1. 输入校验（非 32 题 / 非法选项抛错）');
check('31 题抛错', function () { assert.throws(function () { M.scoreAnswers(new Array(31).fill('A')); }); });
check('33 题抛错', function () { assert.throws(function () { M.scoreAnswers(new Array(33).fill('A')); }); });
check('非数组抛错', function () { assert.throws(function () { M.scoreAnswers('AAAA'); }); });
check('非法选项 E 抛错', function () {
  var a = new Array(32).fill('A'); a[0] = 'E';
  assert.throws(function () { M.scoreAnswers(a); });
});
check('小写 a 视为非法抛错', function () {
  var a = new Array(32).fill('A'); a[3] = 'a';
  assert.throws(function () { M.scoreAnswers(a); });
});
check('matchCode 非 8 位抛错', function () { assert.throws(function () { M.matchCode('0101'); }); });
check('matchCode 含非 01 字符抛错', function () { assert.throws(function () { M.matchCode('0101abc1'); }); });

section('2. 计分范围与四维和');
check('每题 A=3 全 A 时各子维度=12', function () {
  var s = M.scoreAnswers(new Array(32).fill('A'));
  SUB_ORDER.forEach(function (d) { assert.strictEqual(s[d], 12, d + ' 应为 12'); });
});
check('每题 D=0 全 D 时各子维度=0', function () {
  var s = M.scoreAnswers(new Array(32).fill('D'));
  SUB_ORDER.forEach(function (d) { assert.strictEqual(s[d], 0, d + ' 应为 0'); });
});
check('子维度分数均在 0-12、四维均在 0-24（256 码抽查）', function () {
  for (var i = 0; i < 256; i++) {
    var s = rawFromCode(i.toString(2).padStart(8, '0'));
    SUB_ORDER.forEach(function (d) {
      assert.ok(s[d] >= 0 && s[d] <= 12);
    });
    var dims = M.computeDimensions(s);
    Object.keys(dims).forEach(function (k) { assert.ok(dims[k] >= 0 && dims[k] <= 24); });
  }
});

section('3. 二值化边界（5→0，6→1，12→1）');
check('边界值', function () {
  assert.strictEqual(M.toBit(0), 0);
  assert.strictEqual(M.toBit(5), 0);
  assert.strictEqual(M.toBit(6), 1);
  assert.strictEqual(M.toBit(12), 1);
});

section('4. 编码顺序 PSCAEOFU 与四维两两相加');
check('编码顺序固定', function () {
  assert.deepStrictEqual(SUB_ORDER, ['P', 'S', 'C', 'A', 'E', 'O', 'F', 'U']);
});
check('computeCode 按 PSCAEOFU 输出', function () {
  var s = rawFromBits([12, 0, 6, 0, 0, 6, 12, 0]); // P=12,S=0,C=6,A=0,E=0,O=6,F=12,U=0
  assert.strictEqual(M.computeCode(s), '10100110'); // P1 S0 C1 A0 E0 O1 F1 U0
});
check('四维=P+O/S+C/A+F/E+U', function () {
  var s = rawFromBits([10, 2, 8, 4, 1, 7, 11, 3]);
  var d = M.computeDimensions(s);
  assert.strictEqual(d.lifestyle, 10 + 7);       // P+O
  assert.strictEqual(d.social, 2 + 8);           // S+C
  assert.strictEqual(d.culture, 4 + 11);         // A+F
  assert.strictEqual(d.exploration, 1 + 3);      // E+U
});

section('5. 全部 256 种编码 → 唯一且有效的城市');
var distribution = {};
var allValid = true;
for (var code = 0; code < 256; code++) {
  var codeStr = code.toString(2).padStart(8, '0');
  var r1 = M.matchCode(codeStr);
  var r2 = M.matchCode(codeStr);
  if (M.CITY_IDS.indexOf(r1.cityId) === -1) allValid = false;
  if (r1.cityId !== r2.cityId) allValid = false; // 确定性
  distribution[r1.cityId] = (distribution[r1.cityId] || 0) + 1;
}
check('256 编码均有结果且为 12 城之一', function () { assert.ok(allValid); });
check('256 编码每次调用结果一致', function () {
  for (var i = 0; i < 256; i++) {
    var s = i.toString(2).padStart(8, '0');
    assert.strictEqual(M.matchCode(s).cityId, M.matchCode(s).cityId);
  }
});
check('12 座城市均可被匹配（分布无 0）', function () {
  M.CITY_IDS.forEach(function (id) { assert.ok(distribution[id] >= 1, id + ' 未出现'); });
});

section('6. 12 座城市原型编码精确匹配本城（距离 0）');
M.CITY_SIGNATURES.forEach(function (c) {
  check('原型 ' + c.code + ' → ' + c.name, function () {
    assert.strictEqual(M.matchCode(c.code).cityId, c.id);
    assert.strictEqual(M.matchCode(c.code).match.hammingDistance, 0);
    assert.strictEqual(M.matchCity(rawFromCode(c.code)).cityId, c.id);
  });
});

section('7. 平局规则（rawAffinity 决胜 / cityId 字典序）');
// 手工构造：用户码 01011110（与 amsterdam、barcelona 汉明距离均为 1）
function sample(P, S, C, A, E, O, F, U) {
  return rawFromBits([P, S, C, A, E, O, F, U]);
}
check('汉明相同但 rawAffinity 不同 → 高者胜（A=12,U=5 → 阿姆斯特丹）', function () {
  var s = sample(0, 6, 0, 12, 6, 6, 6, 5);
  assert.strictEqual(M.computeCode(s), '01011110');
  assert.strictEqual(M.matchCity(s).cityId, 'amsterdam');
});
check('汉明相同但 rawAffinity 不同 → 高者胜（A=6,U=0 → 巴塞罗那）', function () {
  var s = sample(0, 6, 0, 6, 6, 6, 6, 0);
  assert.strictEqual(M.computeCode(s), '01011110');
  assert.strictEqual(M.matchCity(s).cityId, 'barcelona');
});
check('汉明与 rawAffinity 均相同 → cityId 字典序（A=12,U=0 → 阿姆斯特丹）', function () {
  var s = sample(0, 6, 0, 12, 6, 6, 6, 0);
  assert.strictEqual(M.computeCode(s), '01011110');
  assert.strictEqual(M.matchCity(s).cityId, 'amsterdam'); // amsterdam < barcelona
});
check('rawAffinity 范围 0-96', function () {
  M.CITY_SIGNATURES.forEach(function (c) {
    var lo = M.rawAffinity(c.code, rawFromBits([0, 0, 0, 0, 0, 0, 0, 0]));
    var hi = M.rawAffinity(c.code, rawFromBits([12, 12, 12, 12, 12, 12, 12, 12]));
    assert.ok(lo >= 0 && lo <= 96 && hi >= 0 && hi <= 96);
  });
});

section('8. 相同 32 题答案重复 100 次结果一致');
check('重复 100 次严格相同', function () {
  var answers = [];
  Q.QUESTIONS.forEach(function (q, i) { answers.push(['A', 'B', 'C', 'D'][i % 4]); });
  var first = M.computeResult(answers);
  for (var i = 0; i < 100; i++) {
    var r = M.computeResult(answers);
    assert.strictEqual(r.cityId, first.cityId);
    assert.strictEqual(r.typeCode, first.typeCode);
  }
});

section('9. O 维度语义：Q21-24 高分 = 随性（而非秩序）');
check('Q21-24 全 A → O=12', function () {
  var a = new Array(32).fill('B'); // 其余题不影响 O
  for (var i = 20; i <= 23; i++) a[i] = 'A';
  assert.strictEqual(M.scoreAnswers(a).O, 12);
});
check('Q21-24 全 D → O=0', function () {
  var a = new Array(32).fill('B');
  for (var i = 20; i <= 23; i++) a[i] = 'D';
  assert.strictEqual(M.scoreAnswers(a).O, 0);
});
check('O 高分为“随性”，低分为“有计划”', function () {
  assert.strictEqual(Q.SUB_META.O.high, '随性');
  assert.strictEqual(Q.SUB_META.O.low, '有计划');
  assert.ok(Q.SUB_META.O.high !== '秩序');
});
check('O 高/低分文案方向正确', function () {
  assert.ok(R.SUB_SENTENCES.O.high.indexOf('即兴') !== -1);
  assert.ok(R.SUB_SENTENCES.O.low.indexOf('规划') !== -1);
});

section('10. 结果报告拼装与文案完整');
check('匹配 ID 与报告 ID 完全一致（不串城）', function () {
  assert.deepStrictEqual(
    M.CITY_IDS.slice().sort(),
    R.CITY_REPORTS.map(function (c) { return c.id; }).slice().sort()
  );
});
check('12 城报告字段齐全', function () {
  R.CITY_REPORTS.forEach(function (c) {
    assert.ok(c.tagline && c.intro && c.whyOpening && c.whyClosing && c.day && c.finalWords, c.id);
    assert.strictEqual(c.travel.days.length, 3, c.id + ' 应有 3 天');
    assert.ok(c.travel.food && c.travel.season && c.travel.transport && c.travel.notes, c.id);
  });
});
check('12 城均已删除参考预算', function () {
  R.CITY_REPORTS.forEach(function (c) {
    assert.ok(!('budget' in c.travel), c.id + ' 不应再有 budget');
  });
});
check('画像分段边界 0/3/4/8/9/12', function () {
  assert.strictEqual(R.band(0), 'low');
  assert.strictEqual(R.band(3), 'low');
  assert.strictEqual(R.band(4), 'mid');
  assert.strictEqual(R.band(8), 'mid');
  assert.strictEqual(R.band(9), 'high');
  assert.strictEqual(R.band(12), 'high');
});
check('O=12 解读为随性句、O=0 解读为计划句', function () {
  assert.strictEqual(R.subSentence('O', 12), R.SUB_SENTENCES.O.high);
  assert.strictEqual(R.subSentence('O', 0), R.SUB_SENTENCES.O.low);
});
check('PART03 取偏离 6 最远两项 + 平局按 PSCAEOFU', function () {
  var s = rawFromBits([12, 6, 6, 6, 6, 6, 6, 0]); // P 距 6 最远(6)，U 其次(6)
  assert.deepStrictEqual(R.pickTopTwo(s), ['P', 'U']);
  var s2 = rawFromBits([6, 6, 6, 6, 6, 6, 6, 6]); // 全部距离 0 → 按顺序取前二
  assert.deepStrictEqual(R.pickTopTwo(s2), ['P', 'S']);
});
check('PART04 按 U/S/E 各追加一句场景文案', function () {
  var s = rawFromBits([6, 6, 6, 6, 6, 6, 6, 6]);
  assert.strictEqual(R.sceneSentence('U', s.U), R.SCENE_SENTENCES.U.mid);
  assert.strictEqual(R.sceneSentence('S', s.S), R.SCENE_SENTENCES.S.mid);
  assert.strictEqual(R.sceneSentence('E', s.E), R.SCENE_SENTENCES.E.mid);
});
check('buildReport 产出完整结构', function () {
  var answers = [];
  Q.QUESTIONS.forEach(function (q, i) { answers.push(['A', 'B', 'C', 'D'][i % 4]); });
  var result = M.computeResult(answers);
  var report = R.buildReport(result);
  assert.strictEqual(report.city.id, result.cityId);
  assert.strictEqual(report.dimensions.length, 4);
  assert.strictEqual(report.topTraits.length, 2);
  assert.strictEqual(report.scenes.length, 3);
});
check('每城报告可被 buildReport 正确拼装', function () {
  M.CITY_SIGNATURES.forEach(function (c) {
    var result = M.matchCode(c.code);
    var report = R.buildReport(result);
    assert.strictEqual(report.city.id, c.id);
    assert.strictEqual(report.dimensions.length, 4);
    assert.strictEqual(report.topTraits.length, 2);
    assert.strictEqual(report.scenes.length, 3);
  });
});

section('结果：256 编码 → 12 城市分布');
console.log('');
M.CITY_IDS.forEach(function (id) {
  var name = M.CITY_SIGNATURES.filter(function (c) { return c.id === id; })[0].name;
  var bar = new Array(distribution[id] + 1).join('█');
  console.log('  ' + pad(id, 12) + pad(name, 7) + ' ' + pad(distribution[id], 3) + '  ' + bar);
});
console.log('  合计 ' + 256);

function pad(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }

console.log('\n==============================================');
console.log('通过 ' + passed + ' 项，失败 ' + failed + ' 项');
if (failed > 0) {
  console.log('\n失败明细：');
  failures.forEach(function (f) {
    console.log('  - ' + f.name + '：' + (f.err && f.err.message));
  });
  process.exit(1);
} else {
  console.log('全部测试通过 ✅');
}
