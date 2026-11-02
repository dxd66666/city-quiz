/* =========================================================================
 * server.js —— 《你的灵魂适合哪座城市？》后端（零依赖，Node 内置模块）
 *
 * 职责：
 *   - 静态站点服务（首页 / 答题 / 结果 / 管理后台 /admin）
 *   - 用户端资格接口：POST /api/quiz/start 、POST /api/quiz/submit
 *   - 管理端接口（全部需 Bearer 会话）：login / generate / tokens / disable / reset
 *   - 数据库访问仅在服务端完成；Supabase service_role 绝不进入前端。
 *
 * 注意：不在任何日志中打印 Token、密钥、请求体或查询串（只打印方法 + 路径）。
 * ========================================================================= */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const Q = require('./js/questions.js');
const M = require('./js/matching.js');
const { createStore } = require('./lib/store.js');
const T = require('./lib/token.js');

const ROOT = __dirname;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon'
};
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 小时
const MAX_BODY = 1024 * 1024; // 1 MiB

function sha256hex(s) { return crypto.createHash('sha256').update(String(s), 'utf8').digest('hex'); }
function safeEqualHex(a, b) {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}
function aesKey(secret) {
  const s = String(secret);
  if (/^[0-9a-fA-F]{64}$/.test(s)) return Buffer.from(s, 'hex');
  return crypto.createHash('sha256').update('token-enc|' + s).digest();
}
function sessionKey(secret) {
  return crypto.createHash('sha256').update('session|' + String(secret)).digest();
}

function sendJson(res, status, obj) {
  if (res.headersSent) return;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function readJson(req) {
  return new Promise(function (resolve, reject) {
    let size = 0;
    const chunks = [];
    req.on('data', function (c) {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', function () {
      if (!chunks.length) return resolve(null);
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (e) { reject(new Error('invalid json')); }
    });
    req.on('error', reject);
  });
}

function createHandler(options) {
  const opts = options || {};
  const env = opts.env || process.env;
  const store = opts.store || createStore(env);
  const logger = opts.logger || console;

  const ADMIN_PASSWORD = env.ADMIN_PASSWORD || '';
  const APP_SECRET = env.APP_SECRET || '';
  if (!APP_SECRET) logger.warn('[warn] 未设置 APP_SECRET，正在使用仅供本地开发的默认密钥，切勿用于生产。');
  if (!ADMIN_PASSWORD) logger.warn('[warn] 未设置 ADMIN_PASSWORD，正在使用仅供本地开发的默认口令，切勿用于生产。');

  const encKey = aesKey(APP_SECRET || 'dev-secret-local-only');
  const sessKey = sessionKey(APP_SECRET || 'dev-secret-local-only');

  function baseUrl(req) {
    if (env.BASE_URL) return String(env.BASE_URL).replace(/\/+$/, '');
    const proto = (String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim()) || 'http';
    const host = req.headers['host'] || ('localhost:' + (env.PORT || 8080));
    return proto + '://' + host;
  }

  function requireAdmin(req, res) {
    const h = req.headers['authorization'] || '';
    const m = /^Bearer\s+(.+)$/i.exec(h);
    if (!m || !T.verifySession(m[1], sessKey)) {
      sendJson(res, 401, { ok: false, error: 'unauthorized' });
      return false;
    }
    return true;
  }

  // —— 用户端 ——
  async function handleQuizStart(req, res) {
    const body = await readJson(req);
    const token = body && body.token;
    if (typeof token !== 'string' || !token) return sendJson(res, 400, { ok: false, state: 'bad_request' });
    let r;
    try { r = await store.start(T.hashToken(token)); }
    catch (e) { logger.error('[start] ' + (e && e.message)); return sendJson(res, 500, { ok: false, state: 'error' }); }
    if (r.ok) return sendJson(res, 200, { ok: true, state: 'ready' });
    const status = r.state === 'invalid' ? 404 : (r.state === 'disabled' ? 403 : 200);
    return sendJson(res, status, { ok: false, state: r.state });
  }

  async function handleQuizSubmit(req, res) {
    const body = await readJson(req);
    const token = body && body.token;
    const answers = body && body.answers;
    if (typeof token !== 'string' || !token) return sendJson(res, 400, { ok: false, state: 'bad_request' });

    // 答案与结果由服务端重新计算，不信任前端结论（复用现有计分 / 匹配算法）
    let computed;
    try { computed = M.computeResult(answers); }
    catch (e) { return sendJson(res, 400, { ok: false, state: 'bad_answers' }); }

    let r;
    try { r = await store.complete(T.hashToken(token), computed.typeCode, computed.cityId, answers); }
    catch (e) { logger.error('[submit] ' + (e && e.message)); return sendJson(res, 500, { ok: false, state: 'error' }); }

    if (r.ok) {
      return sendJson(res, 200, {
        ok: true,
        state: 'completed',
        result: { code: computed.typeCode, cityId: computed.cityId, cityName: computed.cityName }
      });
    }
    const status = r.state === 'invalid' ? 404 : (r.state === 'disabled' ? 403 : 200);
    return sendJson(res, status, { ok: false, state: r.state });
  }

  // —— 管理端 ——
  async function handleAdminLogin(req, res) {
    const body = await readJson(req);
    const pw = body && body.password;
    if (typeof pw !== 'string' || !pw) return sendJson(res, 400, { ok: false, error: 'bad_request' });
    if (!safeEqualHex(sha256hex(pw), sha256hex(ADMIN_PASSWORD || 'admin-dev'))) {
      return sendJson(res, 401, { ok: false, error: 'invalid_password' });
    }
    const session = T.signSession({ role: 'admin', exp: Date.now() + SESSION_TTL_MS }, sessKey);
    return sendJson(res, 200, { ok: true, token: session });
  }

  async function handleAdminGenerate(req, res) {
    const body = await readJson(req);
    let count = parseInt(body && body.count, 10);
    if (!Number.isFinite(count)) count = 10;
    count = Math.max(1, Math.min(200, count));

    const rows = [];
    const links = [];
    const base = baseUrl(req);
    for (let i = 0; i < count; i++) {
      const token = T.generateToken();
      rows.push({ tokenHash: T.hashToken(token), tokenCiphertext: T.encryptToken(token, encKey) });
      links.push({ token: token, url: base + '/?token=' + encodeURIComponent(token) });
    }
    try { await store.createMany(rows); }
    catch (e) { logger.error('[generate] ' + (e && e.message)); return sendJson(res, 500, { ok: false, error: 'db_error' }); }
    return sendJson(res, 200, { ok: true, count: count, links: links });
  }

  async function handleAdminList(req, res) {
    let rows;
    try { rows = await store.list(); }
    catch (e) { logger.error('[list] ' + (e && e.message)); return sendJson(res, 500, { ok: false, error: 'db_error' }); }

    const base = baseUrl(req);
    const nameById = {};
    M.CITY_SIGNATURES.forEach(function (c) { nameById[c.id] = c.name; });

    const tokens = rows.map(function (r) {
      const item = {
        id: r.id,
        hashPrefix: (r.tokenHash || '').slice(0, 10),
        status: r.status,
        createdAt: r.createdAt,
        startedAt: r.startedAt,
        completedAt: r.completedAt,
        resultCode: r.resultCode,
        resultCity: r.resultCity,
        resultCityName: r.resultCity ? (nameById[r.resultCity] || r.resultCity) : null,
        token: null,
        url: null
      };
      if (r.status === 'unused') {
        try {
          const plain = T.decryptToken(r.tokenCiphertext, encKey);
          item.token = plain;
          item.url = base + '/?token=' + encodeURIComponent(plain);
        } catch (e) { /* 密钥变更导致无法解密：跳过，避免误导出 */ }
      }
      return item;
    });
    return sendJson(res, 200, { ok: true, tokens: tokens });
  }

  async function handleAdminDisable(req, res) {
    const body = await readJson(req);
    const id = body && body.id;
    if (!id) return sendJson(res, 400, { ok: false, error: 'bad_request' });
    try {
      const r = await store.disable(id);
      if (!r) return sendJson(res, 404, { ok: false, error: 'not_found' });
      return sendJson(res, 200, { ok: true, token: { id: r.id, status: r.status } });
    } catch (e) { logger.error('[disable] ' + (e && e.message)); return sendJson(res, 500, { ok: false, error: 'db_error' }); }
  }

  async function handleAdminReset(req, res) {
    const body = await readJson(req);
    const id = body && body.id;
    if (!id) return sendJson(res, 400, { ok: false, error: 'bad_request' });
    try {
      const r = await store.reset(id);
      if (!r) return sendJson(res, 404, { ok: false, error: 'not_found' });
      return sendJson(res, 200, { ok: true, token: { id: r.id, status: r.status } });
    } catch (e) { logger.error('[reset] ' + (e && e.message)); return sendJson(res, 500, { ok: false, error: 'db_error' }); }
  }

  async function route(req, res, pathname, method) {
    if (pathname === '/api/health' && method === 'GET') return sendJson(res, 200, { ok: true });

    if (pathname === '/api/quiz/start' && method === 'POST') return handleQuizStart(req, res);
    if (pathname === '/api/quiz/submit' && method === 'POST') return handleQuizSubmit(req, res);

    if (pathname === '/api/admin/login' && method === 'POST') return handleAdminLogin(req, res);
    if (pathname.indexOf('/api/admin/') === 0) {
      if (!requireAdmin(req, res)) return;
      if (pathname === '/api/admin/generate' && method === 'POST') return handleAdminGenerate(req, res);
      if (pathname === '/api/admin/tokens' && method === 'GET') return handleAdminList(req, res);
      if (pathname === '/api/admin/disable' && method === 'POST') return handleAdminDisable(req, res);
      if (pathname === '/api/admin/reset' && method === 'POST') return handleAdminReset(req, res);
      return sendJson(res, 404, { ok: false, error: 'not_found' });
    }
    if (pathname.indexOf('/api/') === 0) return sendJson(res, 404, { ok: false, error: 'not_found' });

    serveStatic(req, res, pathname);
  }

  function serveStatic(req, res, pathname) {
    let p = pathname;
    if (p === '/') p = '/index.html';
    if (p === '/admin') p = '/admin.html';

    const filePath = path.normalize(path.join(ROOT, p));
    if (filePath !== ROOT && filePath.indexOf(ROOT + path.sep) !== 0) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }
    fs.readFile(filePath, function (err, data) {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(data);
    });
  }

  async function handle(req, res) {
    let pathname = '/';
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname || '/'); }
    catch (e) { pathname = '/'; }
    const method = req.method || 'GET';
    logger.info(method + ' ' + pathname);
    try {
      await route(req, res, pathname, method);
    } catch (e) {
      logger.error('[error] ' + (e && e.message));
      if (!res.headersSent) sendJson(res, 500, { ok: false, error: 'internal' });
      else res.end();
    }
  }

  handle.store = store;
  handle._env = env;
  return handle;
}

function start(options) {
  const opts = options || {};
  const env = opts.env || process.env;
  const handler = createHandler({ env: env, store: opts.store, logger: opts.logger });
  const server = http.createServer(handler);
  const port = opts.port != null ? opts.port : (env.PORT ? parseInt(env.PORT, 10) : 8080);
  return new Promise(function (resolve, reject) {
    server.on('error', reject);
    server.listen(port, function () {
      const addr = server.address();
      resolve({
        server: server,
        port: addr.port,
        url: 'http://localhost:' + addr.port,
        store: handler.store,
        close: function () { return new Promise(function (r) { server.close(r); }); }
      });
    });
  });
}

if (require.main === module) {
  start().then(function (s) {
    console.log('《你的灵魂适合哪座城市？》已启动: ' + s.url);
    console.log('管理后台: ' + s.url + '/admin');
  }).catch(function (e) {
    console.error('启动失败: ' + (e && e.message));
    process.exit(1);
  });
}

module.exports = { createHandler, start, createStore };
