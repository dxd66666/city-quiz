/* =========================================================================
 * tests/server.test.js —— 一次性测试资格系统（后端）测试
 * 零依赖；使用本地文件存储 + 内嵌 HTTP 服务器，不访问网络 / 不依赖 Supabase。
 *
 * 运行：node tests/server.test.js
 * 覆盖：令牌生成/哈希/加密、管理员会话签名校验、本地存储原子完成、
 *       服务端结果重算、完整 HTTP 流程（登录/生成/开始/提交/并发/禁用/重置）。
 * ========================================================================= */
'use strict';

const assert = require('assert');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const T = require('../lib/token.js');
const { LocalStore } = require('../lib/store.js');
const { start } = require('../server.js');
const M = require('../js/matching.js');

const APP_SECRET = crypto.randomBytes(32).toString('hex');
const ADMIN_PASSWORD = 'test-admin-password';
const encKey = Buffer.from(APP_SECRET, 'hex');

let passed = 0, failed = 0;
const failures = [];

function section(title) { console.log('\n■ ' + title); }
async function check(name, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { failed++; failures.push({ name, err }); console.log('  ✗ ' + name); console.log('      ' + (err && err.message)); }
}

function tmpfile() {
  return path.join(os.tmpdir(), 'cq-tokens-' + process.pid + '-' + Date.now() + '-' + Math.random().toString(16).slice(2) + '.json');
}

function post(base, path, body, headers) {
  return fetch(base + path, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}),
    body: JSON.stringify(body === undefined ? {} : body)
  }).then(function (r) { return r.json(); });
}
function get(base, path, headers) {
  return fetch(base + path, { headers: headers || {} }).then(function (r) { return r.json(); });
}

async function main() {
  // —— 1. 令牌工具 ——
  section('1. 令牌生成 / 哈希 / 加密 / 会话签名');
  await check('generateToken 每次不同且 URL 安全', function () {
    const a = T.generateToken(), b = T.generateToken();
    assert.notStrictEqual(a, b);
    assert.ok(/^[A-Za-z0-9_-]+$/.test(a), '应只含 base64url 字符');
    assert.strictEqual(a.length, 32);
  });
  await check('hashToken 确定性且不等同明文', function () {
    const t = 'abc';
    assert.strictEqual(T.hashToken(t), T.hashToken(t));
    assert.notStrictEqual(T.hashToken(t), t);
    assert.strictEqual(T.hashToken(t).length, 64);
  });
  await check('encrypt/decrypt 往返一致，密文不含明文', function () {
    const t = 'tok-plain-' + Math.random();
    const c = T.encryptToken(t, encKey);
    assert.ok(c.indexOf(t) === -1, '密文不应包含明文');
    assert.strictEqual(T.decryptToken(c, encKey), t);
  });
  await check('解密被篡改密文抛错', function () {
    const c = T.encryptToken('hello', encKey);
    const parts = c.split('.');
    parts[1] = parts[1].slice(0, -2) + 'aa';
    assert.throws(function () { T.decryptToken(parts.join('.'), encKey); });
  });
  await check('会话签名可验证，篡改/过期被拒绝', function () {
    const key = crypto.createHash('sha256').update('session|' + APP_SECRET).digest();
    const tok = T.signSession({ role: 'admin', exp: Date.now() + 60000 }, key);
    assert.strictEqual(T.verifySession(tok, key).role, 'admin');
    const bad = tok.slice(0, -2) + 'xx';
    assert.strictEqual(T.verifySession(bad, key), null);
    const expired = T.signSession({ role: 'admin', exp: Date.now() - 1 }, key);
    assert.strictEqual(T.verifySession(expired, key), null);
  });

  // —— 2. 本地存储原子完成 ——
  section('2. LocalStore 原子完成（最多一次成功）');
  await check('并发 complete 同一 token 仅一次成功', function () {
    const store = new LocalStore(tmpfile());
    const token = T.generateToken();
    const hash = T.hashToken(token);
    return store.createMany([{ tokenHash: hash, tokenCiphertext: T.encryptToken(token, encKey) }]).then(function () {
      return store.start(hash);
    }).then(function () {
      return Promise.all([
        store.complete(hash, '11111111', 'new_york', new Array(32).fill('A')),
        store.complete(hash, '00000000', 'copenhagen', new Array(32).fill('D'))
      ]).then(function (res) {
        const oks = res.filter(function (r) { return r.ok; });
        assert.strictEqual(oks.length, 1, '应恰好一次成功');
        return store.complete(hash, '00000000', 'copenhagen', new Array(32).fill('D')).then(function (r) {
          assert.strictEqual(r.ok, false);
          assert.strictEqual(r.state, 'completed');
        });
      });
    });
  });

  // —— 3. 服务端结果重算 ——
  section('3. 服务端结果重算（复用计分/匹配算法）');
  await check('全 A → 纽约(11111111)', function () {
    const r = M.computeResult(new Array(32).fill('A'));
    assert.strictEqual(r.typeCode, '11111111');
    assert.strictEqual(r.cityId, 'new_york');
  });
  await check('非法答案抛错', function () {
    assert.throws(function () { M.computeResult(new Array(31).fill('A')); });
    const bad = new Array(32).fill('A'); bad[0] = 'E';
    assert.throws(function () { M.computeResult(bad); });
  });

  // —— 4. 完整 HTTP 流程 ——
  section('4. 完整 HTTP 流程（登录 / 生成 / 开始 / 提交 / 并发 / 禁用 / 重置）');

  const env = { DATA_FILE: tmpfile(), ADMIN_PASSWORD: ADMIN_PASSWORD, APP_SECRET: APP_SECRET };
  const server = await start({
    port: 0,
    env: env,
    logger: { info: function () {}, warn: function () {}, error: function () {} }
  });

  await check('健康检查', function () {
    return get(server.url, '/api/health').then(function (r) { assert.strictEqual(r.ok, true); });
  });
  await check('无有效 token 不能开始（随机 token → invalid）', function () {
    return post(server.url, '/api/quiz/start', { token: 'no-such-token' }).then(function (r) {
      assert.strictEqual(r.ok, false);
      assert.strictEqual(r.state, 'invalid');
    });
  });
  await check('管理员未授权访问被拒绝（401）', function () {
    return get(server.url, '/api/admin/tokens').then(function (r) {
      assert.strictEqual(r.ok, false);
      assert.strictEqual(r.error, 'unauthorized');
    });
  });
  await check('管理员口令错误被拒绝', function () {
    return post(server.url, '/api/admin/login', { password: 'wrong' }).then(function (r) {
      assert.strictEqual(r.ok, false);
    });
  });

  let adminSession;
  await check('管理员正确登录取得会话', function () {
    return post(server.url, '/api/admin/login', { password: ADMIN_PASSWORD }).then(function (r) {
      assert.strictEqual(r.ok, true);
      assert.ok(r.token);
      adminSession = { Authorization: 'Bearer ' + r.token };
    });
  });

  let generated = [];
  await check('管理员生成 100 条互不相同的链接', function () {
    return post(server.url, '/api/admin/generate', { count: 100 }, adminSession).then(function (r) {
      assert.strictEqual(r.ok, true);
      assert.strictEqual(r.count, 100);
      assert.strictEqual(r.links.length, 100);
      generated = r.links;
      const tokens = r.links.map(function (l) { return l.token; });
      assert.strictEqual(new Set(tokens).size, 100, '100 条 token 应互不相同');
      r.links.forEach(function (l) { assert.ok(l.url.indexOf('token=') !== -1); });
    });
  });

  await check('列表 100 条，未使用链接含明文与 URL', function () {
    return get(server.url, '/api/admin/tokens', adminSession).then(function (r) {
      assert.strictEqual(r.ok, true);
      assert.strictEqual(r.tokens.length, 100);
      const unused = r.tokens.filter(function (t) { return t.status === 'unused'; });
      assert.strictEqual(unused.length, 100);
      unused.forEach(function (t) { assert.ok(t.token && t.url, '未使用链接应含明文'); });
    });
  });

  const testToken = generated[0].token;
  await check('有效 token 开始 → ready', function () {
    return post(server.url, '/api/quiz/start', { token: testToken }).then(function (r) {
      assert.strictEqual(r.ok, true);
      assert.strictEqual(r.state, 'ready');
    });
  });
  await check('重复开始同一 token（恢复进度）→ 仍 ready', function () {
    return post(server.url, '/api/quiz/start', { token: testToken }).then(function (r) {
      assert.strictEqual(r.ok, true);
      assert.strictEqual(r.state, 'ready');
    });
  });
  await check('非法答案提交被拒且不消耗资格', function () {
    return post(server.url, '/api/quiz/submit', { token: testToken, answers: new Array(31).fill('A') }).then(function (r) {
      assert.strictEqual(r.ok, false);
      assert.strictEqual(r.state, 'bad_answers');
    }).then(function () {
      return post(server.url, '/api/quiz/start', { token: testToken }).then(function (r) {
        assert.strictEqual(r.ok, true, '资格不应被消耗');
      });
    });
  });
  await check('提交有效答案 → completed 且结果正确', function () {
    return post(server.url, '/api/quiz/submit', { token: testToken, answers: new Array(32).fill('A') }).then(function (r) {
      assert.strictEqual(r.ok, true);
      assert.strictEqual(r.state, 'completed');
      assert.strictEqual(r.result.cityId, 'new_york');
      assert.strictEqual(r.result.code, '11111111');
    });
  });
  await check('完成后再次提交 / 开始均被拒绝', function () {
    return post(server.url, '/api/quiz/submit', { token: testToken, answers: new Array(32).fill('A') }).then(function (r) {
      assert.strictEqual(r.ok, false);
      assert.strictEqual(r.state, 'completed');
    }).then(function () {
      return post(server.url, '/api/quiz/start', { token: testToken }).then(function (r) {
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.state, 'completed');
      });
    });
  });
  await check('完成链接不泄露明文与答案（隐私）', function () {
    return get(server.url, '/api/admin/tokens', adminSession).then(function (r) {
      const done = r.tokens.find(function (t) { return t.status === 'completed' && t.resultCity === 'new_york'; });
      assert.ok(done, '应存在一条已完成记录');
      assert.strictEqual(done.token, null, '已完成链接不应返回明文');
      assert.ok(done.answers === undefined, '列表不应返回 answers');
      assert.strictEqual(done.resultCityName, '纽约');
    });
  });

  await check('两个客户端同时提交同一 token 最多一次成功', function () {
    const tok = generated[1].token;
    return post(server.url, '/api/quiz/start', { token: tok }).then(function () {
      return Promise.all([
        post(server.url, '/api/quiz/submit', { token: tok, answers: new Array(32).fill('A') }),
        post(server.url, '/api/quiz/submit', { token: tok, answers: new Array(32).fill('D') })
      ]).then(function (res) {
        const oks = res.filter(function (r) { return r.ok; });
        assert.strictEqual(oks.length, 1, '并发提交应恰好一次成功，实际 ' + oks.length);
      });
    });
  });

  await check('禁用后不能开始，重置后恢复可用', function () {
    const tok = generated[2].token;
    // 先从未使用状态取得该行 id
    return get(server.url, '/api/admin/tokens', adminSession).then(function (list) {
      const row = list.tokens.find(function (t) { return t.token === tok; });
      assert.ok(row && row.id, '应能找到未使用链接的 id');
      return row.id;
    }).then(function (id) {
      return post(server.url, '/api/quiz/start', { token: tok }).then(function () {
        return post(server.url, '/api/admin/disable', { id: id }, adminSession);
      }).then(function (r) {
        assert.strictEqual(r.ok, true);
        return post(server.url, '/api/quiz/start', { token: tok });
      }).then(function (s) {
        assert.strictEqual(s.ok, false);
        assert.strictEqual(s.state, 'disabled');
        return post(server.url, '/api/admin/reset', { id: id }, adminSession);
      }).then(function (rr) {
        assert.strictEqual(rr.ok, true);
        return post(server.url, '/api/quiz/start', { token: tok });
      }).then(function (s) {
        assert.strictEqual(s.ok, true, '重置后应可再次开始');
        assert.strictEqual(s.state, 'ready');
      });
    });
  });

  await server.close();

  // —— 汇总 ——
  console.log('\n==============================================');
  console.log('通过 ' + passed + ' 项，失败 ' + failed + ' 项');
  if (failed > 0) {
    console.log('\n失败明细：');
    failures.forEach(function (f) { console.log('  - ' + f.name + '：' + (f.err && f.err.message)); });
    process.exit(1);
  } else {
    console.log('全部测试通过 ✅');
  }
}

main().catch(function (e) {
  console.error('测试运行异常: ' + (e && e.message));
  console.error(e && e.stack);
  process.exit(1);
});
