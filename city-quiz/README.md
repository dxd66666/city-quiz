# 你的灵魂适合哪座城市？

32 道选择题、8 个子维度、256 种人格编码 → 12 座城市之一。零 npm 依赖、无 AI 调用。

现已加入**一次性测试资格系统**：付款后由管理员批量生成专属链接，用户凭 `?token=` 链接即可答题，无需登录或兑换码，每条链接只允许成功提交一次。

## 目录结构

```
index.html             页面入口（答题 / 结果）
admin.html             管理后台入口（/admin）
css/style.css          视觉样式（奶白 / 浅米 / 柔和灰，移动优先）
js/questions.js        32 道题原文 + 子维度元数据
js/matching.js         评分 + 城市匹配（确定性规则，单独存放）
js/reports.js          12 座城市结果报告 + 动态拼装规则
js/app.js              答题 / 结果页界面逻辑
js/access.js           资格门禁（token 校验、进度 / 结果本地保存）
js/admin.js            管理后台逻辑
server.js              后端（静态 + 资格 API + 管理 API，零依赖）
lib/token.js           令牌生成 / 哈希 / 加密 / 会话签名
lib/store.js           数据层（Supabase 或本地文件存储，原子完成）
supabase/schema.sql    建表 SQL（在 Supabase 执行一次）
tests/test.js          题库 / 计分 / 匹配自动化测试
tests/server.test.js   资格系统后端自动化测试
render.yaml            Render 部署配置
.env.example           环境变量清单
```

## 计分与匹配规则（要点）

- 每题 A=3 / B=2 / C=1 / D=0；每个子维度 4 题，满分 12。
- 8 个子维度顺序：`P S C A E O F U`（生活节奏 / 社交偏好 / 事业追求 / 审美倾向 / 探索欲望 / 生活秩序 / 情感表达 / 环境偏好）。
- 二值化：0–5 → 0，6–12 → 1（6 归 1），拼成 8 位编码，共 256 种。
- 城市匹配优先级：**汉明距离 ASC → rawAffinity DESC → cityId 字典序 ASC**（详见 `js/matching.js`）。
- 四个综合维度（仅展示，不参与匹配）：生活方式=P+O、社会取向=S+C、文化气质=A+F、探索环境=E+U。
- 结果由服务端用同一套算法（`js/matching.js`）从 32 题答案重新计算，不信任前端结论。

## 一次性测试资格系统

- 链接形式：`https://<站点>/?token=<随机令牌>`。
- 令牌只存「SHA-256 哈希」+「AES-256-GCM 密文」，绝不存明文；密文仅用于管理员复制 / 导出未使用链接。
- 状态机：`unused → in_progress → completed`，另有 `disabled`。完成时用**条件 UPDATE** 原子地锁定，并发提交最多一次成功。
- 用户中途退出后，答题进度保存在本浏览器（localStorage），用原链接可恢复；完成后仅本浏览器可回看报告。
- 数据库访问只走服务端；Supabase `service_role` 密钥绝不进入前端。
- 管理员会话为服务端 HMAC 签名令牌，所有 `/api/admin/*` 接口服务端鉴权。

### 管理后台（/admin）

登录后可：批量生成 10 / 50 / 100 条专属链接、查看链接状态（未使用 / 测试中 / 已完成 / 已禁用）、一键复制未使用链接、导出未使用链接 CSV、手动禁用、重置异常资格。

## 本地运行

> 资格系统需要后端，请用下面的方式启动（不再支持直接双击 `index.html`）。

```bash
npm start        # 启动后浏览器访问 http://localhost:8080
```

- 答题入口：`http://localhost:8080`
- 管理后台：`http://localhost:8080/admin`
- 未配置 Supabase 时，后端自动使用本地文件存储（`data/tokens.json`），仅用于本地开发 / 测试。

## 本地测试

```bash
npm test              # 题库 / 计分 / 匹配（47 项）
npm run test:server   # 资格系统后端（23 项）
npm run test:all      # 两者都跑
```

## 部署到 Render

本机没有 Render 登录权限，因此**不提供编造的网址**。请按以下步骤操作。

### 第 0 步：准备 Supabase

1. 到 https://supabase.com 创建项目。
2. 在 **SQL Editor** 中执行 `supabase/schema.sql`。
3. 在 **Project Settings → API** 复制两个值：
   - `Project URL` → 作为 `SUPABASE_URL`
   - `service_role`（注意：是 service_role，不是 anon）→ 作为 `SUPABASE_SERVICE_ROLE_KEY`

### 第 1 步：生成密钥

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

得到的 64 位十六进制串作为 `APP_SECRET`；再自拟一个长随机串作为 `ADMIN_PASSWORD`。

### 第 2 步：推送到 GitHub

```bash
git init
git add .
git commit -m "city quiz with one-time access"
git branch -M main
git remote add origin https://github.com/<你的用户名>/city-quiz.git
git push -u origin main
```

### 第 3 步：在 Render 创建 Web Service

1. 打开 https://dashboard.render.com → **New +** → **Web Service**（或 **Blueprint**，选仓库即可）。
2. 选择 `city-quiz` 仓库；Start Command 填 `node server.js`（`render.yaml` 已写好）。

### 第 4 步：配置环境变量

| 变量 | 值 |
|---|---|
| `SUPABASE_URL` | 第 0 步的 Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | 第 0 步的 service_role |
| `ADMIN_PASSWORD` | 管理员登录口令 |
| `APP_SECRET` | 第 1 步生成的 64 位十六进制 |
| `BASE_URL` | 可选，如 `https://你的应用.onrender.com`（用于生成链接的域名） |

### 第 5 步：部署与使用

- 部署完成后打开 `https://<你的应用>.onrender.com/admin` 登录并生成专属链接。
- 资格数据保存在 Supabase，Render 重新部署后仍然存在（`APP_SECRET` 需保持稳定，否则旧链接无法被管理员复制/导出）。

## 说明

- 结果页不展示二进制编码、内部算法或匹配分数。
- 旅行攻略中的路线、美食与季节为参考，开放时间、交通及签证等请出行前核对官方信息。
- 城市人格描述为产品创意设定，不宣称城市居民人格事实或心理学效度。
