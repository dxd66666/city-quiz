/* =========================================================================
 * lib/token.js —— 令牌生成 / 哈希 / 加密 / 管理员会话签名（零依赖，Node 内置 crypto）
 *
 * 安全要点：
 *  - 令牌只存「哈希」（token_hash）与「可恢复密文」（token_ciphertext，AES-256-GCM），
 *    绝不存明文。密文仅用于管理员复制 / 导出未使用链接，密钥来自环境变量 APP_SECRET。
 *  - 管理员会话为无状态 HMAC 签名令牌，服务端校验，不依赖前端隐藏页面。
 * ========================================================================= */
'use strict';

const crypto = require('crypto');

// 生成不可预测的随机令牌（24 字节 → 32 位 base64url，URL 安全）
function generateToken() {
  return crypto.randomBytes(24).toString('base64url');
}

// SHA-256 哈希（数据库只存此哈希用于查找 / 校验）
function hashToken(token) {
  return crypto.createHash('sha256').update(String(token), 'utf8').digest('hex');
}

// AES-256-GCM 加密（key 须为 32 字节 Buffer）；返回 "iv.密文.tag" 的 base64url 串
function encryptToken(plaintext, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return iv.toString('base64url') + '.' + ct.toString('base64url') + '.' + tag.toString('base64url');
}

// 解密（与 encryptToken 互逆）
function decryptToken(payload, key) {
  const parts = String(payload).split('.');
  if (parts.length !== 3) throw new Error('密文格式错误');
  const iv = Buffer.from(parts[0], 'base64url');
  const ct = Buffer.from(parts[1], 'base64url');
  const tag = Buffer.from(parts[2], 'base64url');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

// 管理员会话：HMAC-SHA256 签名（无状态）。payload 需含 { role:'admin', exp: 毫秒时间戳 }
function signSession(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return body + '.' + sig;
}

// 校验会话；非法 / 篡改 / 过期 / 角色不符 → null
function verifySession(token, secret) {
  try {
    if (typeof token !== 'string') return null;
    const i = token.lastIndexOf('.');
    if (i < 0) return null;
    const body = token.slice(0, i);
    const sig = token.slice(i + 1);
    const expect = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expect);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload || payload.role !== 'admin') return null;
    if (typeof payload.exp !== 'number' || payload.exp <= Date.now()) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

module.exports = { generateToken, hashToken, encryptToken, decryptToken, signSession, verifySession };
