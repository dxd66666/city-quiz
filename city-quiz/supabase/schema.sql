-- =========================================================================
-- 测试资格系统建表 SQL（在 Supabase SQL Editor 中执行一次即可）
--
-- 注意：
--   1. 本表只存令牌「哈希 + 可恢复密文」，绝不存明文令牌。
--   2. 所有读写都通过你的 Node 服务端（server.js）使用 service_role 密钥完成，
--      该密钥绝不能放到前端 / 公开仓库。
--   3. 以下字段满足最低要求：token_hash / status / created_at / started_at /
--      completed_at / result_code / result_city；另加 token_ciphertext（加密令牌，
--      供管理员复制/导出未使用链接）与 answers（完整答案，仅供审计，不对外返回）。
-- =========================================================================

create table if not exists public.quiz_tokens (
  id               uuid primary key default gen_random_uuid(),
  token_hash       text not null unique,
  token_ciphertext text not null,
  status           text not null default 'unused'
                   check (status in ('unused', 'in_progress', 'completed', 'disabled')),
  created_at       timestamptz not null default now(),
  started_at       timestamptz,
  completed_at     timestamptz,
  result_code      text,
  result_city      text,
  answers          jsonb
);

create index if not exists quiz_tokens_status_idx  on public.quiz_tokens (status);
create index if not exists quiz_tokens_created_idx on public.quiz_tokens (created_at desc);

-- 可选加固：如果希望即使 service_role 泄露也无法直接通过 REST 读写，可启用 RLS 并拒绝所有行。
-- （server.js 使用 service_role，默认绕过 RLS；若启用下面策略，请改用受限密钥并自行设计策略。）
-- alter table public.quiz_tokens enable row level security;
-- create policy "deny_all" on public.quiz_tokens for all using (false);
