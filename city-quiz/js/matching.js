/* =========================================================================
 * matching.js —— 评分与城市匹配（纯函数、确定性、零网络 / 零随机 / 零 AI）
 *
 * 匹配规则（优先级严格为）：
 *   1. 汉明距离 ASC（8 位编码与城市原型编码不同的位数，0-8）
 *   2. rawAffinity DESC（原始分数细分，0-96）
 *   3. cityId ASC（ASCII 字典序，最后一道确定性平局规则）
 *
 * 该文件单独存放城市原型编码与匹配逻辑，不散落在页面组件中。
 * ========================================================================= */
(function (root, factory) {
  var questions = (typeof module === 'object' && module.exports)
    ? require('./questions.js')
    : root.CityQuizQuestions;
  var api = factory(questions);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.CityQuizMatching = api;
  }
})(typeof self !== 'undefined' ? self : this, function (Q) {
  'use strict';

  var SUB_ORDER = Q.SUB_ORDER; // ['P','S','C','A','E','O','F','U']

  // 12 座城市的唯一原型编码（产品创意设定，不宣称心理学效度）
  var CITY_SIGNATURES = [
    { id: 'amsterdam',   name: '阿姆斯特丹', code: '01011111' },
    { id: 'barcelona',   name: '巴塞罗那',   code: '01001110' },
    { id: 'copenhagen',  name: '哥本哈根',   code: '00000000' },
    { id: 'istanbul',    name: '伊斯坦布尔', code: '01001100' },
    { id: 'london',      name: '伦敦',       code: '10101001' },
    { id: 'melbourne',   name: '墨尔本',     code: '00011100' },
    { id: 'new_york',    name: '纽约',       code: '11111111' },
    { id: 'paris',       name: '巴黎',       code: '01001111' },
    { id: 'rome',        name: '罗马',       code: '01000110' },
    { id: 'seoul',       name: '首尔',       code: '11110011' },
    { id: 'tokyo',       name: '东京',       code: '10111001' },
    { id: 'zurich',      name: '苏黎世',     code: '00100000' }
  ];

  var CITY_IDS = CITY_SIGNATURES.map(function (c) { return c.id; });

  function validateAnswers(answers) {
    if (!Array.isArray(answers) || answers.length !== Q.QUESTION_COUNT) {
      throw new Error('答案数量必须恰好为 ' + Q.QUESTION_COUNT + ' 题，实际收到 ' +
        (Array.isArray(answers) ? answers.length : typeof answers));
    }
    for (var i = 0; i < answers.length; i++) {
      var a = answers[i];
      if (typeof a !== 'string' || !Object.prototype.hasOwnProperty.call(Q.OPTION_SCORES, a)) {
        throw new Error('第 ' + (i + 1) + ' 题答案非法：' + JSON.stringify(a) + '（仅允许 A/B/C/D）');
      }
    }
  }

  // 原始子维度分数（0-12）
  function scoreAnswers(answers) {
    validateAnswers(answers);
    var subScores = {};
    SUB_ORDER.forEach(function (d) { subScores[d] = 0; });
    Q.QUESTIONS.forEach(function (q, i) {
      subScores[q.dim] += Q.OPTION_SCORES[answers[i]];
    });
    return subScores;
  }

  // 二值化：0-5 → 0，6-12 → 1（6 必须归 1）
  function toBit(score) {
    return score >= 6 ? 1 : 0;
  }

  // 8 位编码，顺序 P S C A E O F U
  function computeCode(subScores) {
    return SUB_ORDER.map(function (d) { return toBit(subScores[d]); }).join('');
  }

  function hammingDistance(a, b) {
    var d = 0;
    for (var i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) d++;
    }
    return d;
  }

  // 原始分数细分：原型位为 1 贡献 rawScore；为 0 贡献 12 - rawScore
  function rawAffinity(cityCode, subScores) {
    var sum = 0;
    for (var i = 0; i < SUB_ORDER.length; i++) {
      var raw = subScores[SUB_ORDER[i]];
      sum += (cityCode[i] === '1') ? raw : (12 - raw);
    }
    return sum;
  }

  function computeDimensions(subScores) {
    var out = {};
    Object.keys(Q.DIM_GROUPS).forEach(function (key) {
      out[key] = Q.DIM_GROUPS[key].subs.reduce(function (acc, d) { return acc + subScores[d]; }, 0);
    });
    return out;
  }

  // 主匹配函数：输入子维度原始分数，输出唯一城市
  function matchCity(subScores) {
    var userBits = computeCode(subScores);
    var best = null;
    for (var i = 0; i < CITY_SIGNATURES.length; i++) {
      var city = CITY_SIGNATURES[i];
      var d = hammingDistance(userBits, city.code);
      var ra = rawAffinity(city.code, subScores);
      if (best === null ||
          d < best.d ||
          (d === best.d && ra > best.ra) ||
          (d === best.d && ra === best.ra && city.id < best.id)) {
        best = { city: city, d: d, ra: ra };
      }
    }
    return {
      cityId: best.city.id,
      cityName: best.city.name,
      typeCode: userBits,
      subScores: subScores,
      dimensions: computeDimensions(subScores),
      match: { hammingDistance: best.d, rawAffinity: best.ra }
    };
  }

  // 独立映射函数：直接输入 8 位二进制编码 → 唯一城市
  // （用极值 rawScore 12/0 代表 bit 1/0，使 rawAffinity 与汉明距离一致，仅作为测试/校验入口）
  function matchCode(typeCode) {
    if (typeof typeCode !== 'string' || !/^[01]{8}$/.test(typeCode)) {
      throw new Error('typeCode 必须为 8 位 01 字符串，收到：' + JSON.stringify(typeCode));
    }
    var subScores = {};
    SUB_ORDER.forEach(function (d, i) { subScores[d] = typeCode[i] === '1' ? 12 : 0; });
    return matchCity(subScores);
  }

  // 一次性从 32 题答案得到完整结果
  function computeResult(answers) {
    var subScores = scoreAnswers(answers);
    return matchCity(subScores);
  }

  return {
    CITY_SIGNATURES: CITY_SIGNATURES,
    CITY_IDS: CITY_IDS,
    SUB_ORDER: SUB_ORDER,
    validateAnswers: validateAnswers,
    scoreAnswers: scoreAnswers,
    toBit: toBit,
    computeCode: computeCode,
    hammingDistance: hammingDistance,
    rawAffinity: rawAffinity,
    computeDimensions: computeDimensions,
    matchCity: matchCity,
    matchCode: matchCode,
    computeResult: computeResult
  };
});
