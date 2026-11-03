/* =========================================================================
 * lib/store.js —— 测试资格数据层
 *
 * 提供统一接口（async）：
 *   findByHash(tokenHash) -> row | null
 *   start(tokenHash)      -> { ok, state:'ready'|'completed'|'disabled'|'invalid', row? }
 *   complete(hash, code, city, answers) -> { ok, state, row? }  （原子：最多一次成功）
 *   createMany(rows)      -> number
 *   list()                -> row[]
 *   disable(id) / reset(id)
 *
 * 两种实现：
 *   - SupabaseStore：生产用，走 Supabase PostgREST（service_role 仅在服务端使用）。
 *     关键并发控制用「条件 UPDATE（WHERE status=...）」，由 PostgreSQL 行级锁保证原子。
 *   - LocalStore：本地开发 / 自动化测试用，文件持久化；Node 单线程下同步读-改-写天然串行。
 *
 * row 字段（JS 端驼峰）：id / tokenHash / tokenCiphertext / status / createdAt /
 *                       startedAt / completedAt / resultCode / resultCity / answers
 * ========================================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// —— 本地文件存储（开发 / 测试）——
class LocalStore {
  constructor(file) {
    this.file = file;
    this._ensure();
  }

  _ensure() {
    try { fs.mkdirSync(path.dirname(this.file), { recursive: true }); } catch (e) {}
    if (!fs.existsSync(this.file)) this._write({ tokens: [] });
  }
  _read() {
    try { return JSON.parse(fs.readFileSync(this.file, 'utf8')); }
    catch (e) { return { tokens: [] }; }
  }
  _write(data) {
    fs.writeFileSync(this.file, JSON.stringify(data, null, 2), 'utf8');
  }
  _clone(row) { return JSON.parse(JSON.stringify(row)); }

  findByHash(hash) {
    const d = this._read();
    const row = d.tokens.find(function (t) { return t.tokenHash === hash; });
    return Promise.resolve(row ? this._clone(row) : null);
  }

  start(hash) {
    const d = this._read();
    const idx = d.tokens.findIndex(function (t) { return t.tokenHash === hash; });
    if (idx < 0) return Promise.resolve({ ok: false, state: 'invalid' });
    const row = d.tokens[idx];
    if (row.status === 'completed') return Promise.resolve({ ok: false, state: 'completed' });
    if (row.status === 'disabled') return Promise.resolve({ ok: false, state: 'disabled' });
    if (row.status === 'in_progress') return Promise.resolve({ ok: true, state: 'ready', row: this._clone(row) });
    // unused -> in_progress
    row.status = 'in_progress';
    row.startedAt = new Date().toISOString();
    this._write(d);
    return Promise.resolve({ ok: true, state: 'ready', row: this._clone(row) });
  }

  complete(hash, resultCode, resultCity, answers) {
    const d = this._read();
    const idx = d.tokens.findIndex(function (t) { return t.tokenHash === hash; });
    if (idx < 0) return Promise.resolve({ ok: false, state: 'invalid' });
    const row = d.tokens[idx];
    if (row.status === 'completed') return Promise.resolve({ ok: false, state: 'completed' });
    if (row.status === 'disabled') return Promise.resolve({ ok: false, state: 'disabled' });
    // unused / in_progress -> completed（一次成功）
    row.status = 'completed';
    const now = new Date().toISOString();
    if (!row.startedAt) row.startedAt = now;
    row.completedAt = now;
    row.resultCode = resultCode;
    row.resultCity = resultCity;
    row.answers = answers;
    this._write(d);
    return Promise.resolve({ ok: true, state: 'completed', row: this._clone(row) });
  }

  createMany(rows) {
    const d = this._read();
    const now = new Date().toISOString();
    rows.forEach(function (r) {
      d.tokens.push({
        id: crypto.randomUUID(),
        tokenHash: r.tokenHash,
        tokenCiphertext: r.tokenCiphertext,
        status: 'unused',
        createdAt: now,
        startedAt: null,
        completedAt: null,
        resultCode: null,
        resultCity: null,
        answers: null
      });
    });
    this._write(d);
    return Promise.resolve(rows.length);
  }

  list() {
    const d = this._read();
    return Promise.resolve(
      d.tokens.map(function (t) { return JSON.parse(JSON.stringify(t)); })
        .sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; })
    );
  }

  disable(id) {
    const d = this._read();
    const idx = d.tokens.findIndex(function (t) { return t.id === id; });
    if (idx < 0) return Promise.resolve(null);
    d.tokens[idx].status = 'disabled';
    this._write(d);
    return Promise.resolve(this._clone(d.tokens[idx]));
  }

  reset(id) {
    const d = this._read();
    const idx = d.tokens.findIndex(function (t) { return t.id === id; });
    if (idx < 0) return Promise.resolve(null);
    const row = d.tokens[idx];
    row.status = 'unused';
    row.startedAt = null;
    row.completedAt = null;
    row.resultCode = null;
    row.resultCity = null;
    row.answers = null;
    this._write(d);
    return Promise.resolve(this._clone(row));
  }
}

// —— Supabase PostgREST 存储（生产）——
// 归一化 REST 基地址：去掉末尾斜杠，并去掉可能已带的 /rest/v1，
// 避免 SUPABASE_URL 已含 /rest/v1 时重复拼接，导致 PostgREST 返回 PGRST125。
function normalizeRestBase(url, table) {
  const base = String(url == null ? '' : url).trim()
    .replace(/\/+$/, '')
    .replace(/\/rest\/v1$/i, '');
  return base + '/rest/v1/' + (table || 'quiz_tokens');
}

class SupabaseStore {
  constructor(url, key, table) {
    this.base = normalizeRestBase(url, table);
    this.key = key;
  }

  _headers(extra) {
    const h = {
      'apikey': this.key,
      'Authorization': 'Bearer ' + this.key,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };
    if (extra) Object.assign(h, extra);
    return h;
  }

  async _req(method, pathQuery, body) {
    const res = await fetch(this.base + pathQuery, {
      method: method,
      headers: this._headers(),
      body: body == null ? undefined : JSON.stringify(body)
    });
    if (!res.ok) {
      let txt = '';
      try { txt = await res.text(); } catch (e) {}
      throw new Error('Supabase ' + res.status + ': ' + String(txt).slice(0, 200));
    }
    const ct = res.headers.get('content-type') || '';
    if (ct.indexOf('json') === -1) return null;
    return res.json();
  }

  _map(row) {
    if (!row) return null;
    return {
      id: row.id,
      tokenHash: row.token_hash,
      tokenCiphertext: row.token_ciphertext,
      status: row.status,
      createdAt: row.created_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      resultCode: row.result_code,
      resultCity: row.result_city,
      answers: row.answers
    };
  }

  async findByHash(hash) {
    const rows = await this._req('GET', '?token_hash=eq.' + encodeURIComponent(hash) + '&limit=1');
    return this._map(rows && rows[0]);
  }

  async start(hash) {
    const cur = await this.findByHash(hash);
    if (!cur) return { ok: false, state: 'invalid' };
    if (cur.status === 'completed') return { ok: false, state: 'completed' };
    if (cur.status === 'disabled') return { ok: false, state: 'disabled' };
    if (cur.status === 'in_progress') return { ok: true, state: 'ready', row: cur };
    // unused -> in_progress（原子条件更新，started_at 只写一次）
    const rows = await this._req('PATCH',
      '?token_hash=eq.' + encodeURIComponent(hash) + '&status=eq.unused',
      { status: 'in_progress', started_at: new Date().toISOString() });
    if (rows && rows.length) return { ok: true, state: 'ready', row: this._map(rows[0]) };
    const again = await this.findByHash(hash);
    if (!again) return { ok: false, state: 'invalid' };
    if (again.status === 'in_progress') return { ok: true, state: 'ready', row: again };
    return { ok: false, state: again.status };
  }

  async complete(hash, resultCode, resultCity, answers) {
    // 原子：仅当 status 仍为 unused/in_progress 时才置为 completed（并发最多一次成功）
    const rows = await this._req('PATCH',
      '?token_hash=eq.' + encodeURIComponent(hash) + '&status=in.(unused,in_progress)',
      {
        status: 'completed',
        completed_at: new Date().toISOString(),
        result_code: resultCode,
        result_city: resultCity,
        answers: answers
      });
    if (rows && rows.length) return { ok: true, state: 'completed', row: this._map(rows[0]) };
    const cur = await this.findByHash(hash);
    if (!cur) return { ok: false, state: 'invalid' };
    return { ok: false, state: cur.status };
  }

  async createMany(rows) {
    const body = rows.map(function (r) {
      return { token_hash: r.tokenHash, token_ciphertext: r.tokenCiphertext, status: 'unused' };
    });
    const created = await this._req('POST', '', body);
    return Array.isArray(created) ? created.length : 0;
  }

  async list() {
    const rows = await this._req('GET', '?select=*&order=created_at.desc');
    return (rows || []).map((r) => this._map(r));
  }

  async disable(id) {
    const rows = await this._req('PATCH', '?id=eq.' + encodeURIComponent(id), { status: 'disabled' });
    return this._map(rows && rows[0]);
  }

  async reset(id) {
    const rows = await this._req('PATCH', '?id=eq.' + encodeURIComponent(id), {
      status: 'unused',
      started_at: null,
      completed_at: null,
      result_code: null,
      result_city: null,
      answers: null
    });
    return this._map(rows && rows[0]);
  }
}

function createStore(env) {
  env = env || {};
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    return new SupabaseStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, env.SUPABASE_TABLE);
  }
  const file = env.DATA_FILE || path.join(__dirname, '..', 'data', 'tokens.json');
  return new LocalStore(file);
}

module.exports = { createStore, LocalStore, SupabaseStore };
