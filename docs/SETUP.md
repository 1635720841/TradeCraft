# 本地环境安装与启动

本文档说明如何在 Windows 上从零搭建 MW 项目的本地开发环境。

## 前置要求

| 工具 | 版本 | 说明 |
|------|------|------|
| Node.js | ≥ 20 | [nodejs.org](https://nodejs.org/) |
| pnpm | ≥ 9 | `npm install -g pnpm` |
| Docker Desktop | 最新版 | 用于 PostgreSQL + Redis |

## 一、安装 Docker Desktop（Windows）

### 1. 下载安装

下载：[Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/)

安装时建议：

- ✅ 勾选 **Use WSL 2 based engine**
- ❌ 不勾选 **Allow Windows Containers**（本项目使用 Linux 镜像）

安装完成后若提示重启，请重启电脑。

### 2. 首次启动

1. 从开始菜单打开 **Docker Desktop**
2. 等待托盘图标显示 **Docker Desktop is running**
3. 新开一个终端，验证：

```powershell
docker compose version
```

若提示找不到 `docker` 命令：

- 关闭终端重新打开，或重启电脑
- 确认 PATH 包含：`C:\Program Files\Docker\Docker\resources\bin`

### 3. 安装失败：文件已存在

若报错类似：

```
当文件已存在时，无法创建该文件。
File: C:\Program Files\Docker\Docker.staging\7zr.exe
```

说明上次安装未完成，有残留文件。用**管理员 PowerShell** 执行：

```powershell
Stop-Process -Name "Docker Desktop Installer" -Force -ErrorAction SilentlyContinue
Stop-Process -Name "Docker Desktop" -Force -ErrorAction SilentlyContinue

Remove-Item -Path "C:\Program Files\Docker" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "$env:LOCALAPPDATA\Docker" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "$env:APPDATA\Docker" -Recurse -Force -ErrorAction SilentlyContinue
```

然后**以管理员身份**重新运行安装包。仍失败可参考 [Docker 官方卸载文档](https://docs.docker.com/desktop/uninstall/)。

### 4. 开机自启（可选）

Docker Desktop → Settings → General → ✅ Start Docker Desktop when you sign in

---

## 二、项目初始化

在项目根目录 `wm/` 执行：

```bash
# 1. 安装依赖
pnpm install

# 2. 配置环境变量（Prisma 读取 api 目录下的 .env）
cp .env.example apps/platform/api/.env
```

`apps/platform/api/.env` 中默认数据库连接：

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/wm_platform?schema=public
```

> 若本机已安装 PostgreSQL 并占用 5432 端口，需先停掉本机服务，或修改 `docker-compose.yml` 中的端口映射（如 `5433:5432`），并同步修改 `DATABASE_URL` 端口。

---

## 三、启动数据库（Docker）

确保 Docker Desktop 已运行，然后：

```bash
pnpm docker:up
```

将启动两个容器：

| 容器 | 镜像 | 端口 | 用途 |
|------|------|------|------|
| wm-postgres | postgres:16-alpine | 5432 | 主数据库 |
| wm-redis | redis:7-alpine | 6379 | 队列（后期 BullMQ 用） |

默认账号：`postgres` / `postgres`，库名：`wm_platform`

验证容器状态：

```bash
docker compose ps
```

两个服务均显示 `healthy` 即可继续。

### 初始化数据库表

```bash
pnpm db:generate   # 生成 Prisma Client
pnpm db:migrate    # 执行迁移，创建表结构
```

### Docker 常用命令

```bash
pnpm docker:up      # 后台启动
pnpm docker:down    # 停止容器
pnpm docker:logs    # 查看日志
docker compose down -v   # 停止并删除数据卷（慎用，会清空数据库）
```

---

## 四、启动应用

需要**两个终端**，均在项目根目录执行：

```bash
# 终端 1 — API
pnpm dev:api    # http://localhost:3000

# 终端 2 — 前端
pnpm dev:web    # http://localhost:5173
```

### 验证

| 地址 | 预期 |
|------|------|
| http://localhost:5173 | 前端登录页（Mock：admin / 任意密码） |
| http://localhost:5173/#/welcome | 登录后工作台（项目入口） |
| http://localhost:5173/#/org/projects | 企业管理 — 项目列表 |
| http://localhost:5173/#/console/overview | 平台运营 Console（超管/平台管理员） |
| http://localhost:3000/api/v1/health | API 健康检查 |

### 前端说明（pure-admin-thin）

- 基于 [pure-admin-thin](https://github.com/pure-admin/pure-admin-thin)，已纳入 monorepo 为 `apps/platform/web`
- **登录**：开发环境仍用 Mock（`/login`），用户名 `admin` 或 `common`，密码任意
- **业务 API**：`/api/v1/*` 经 Vite 代理到 NestJS（`http://localhost:3000`）
- **业务页面**：放 `src/views/platform/`（平台）或 `src/views/projects/seo-factory/`（插件）
- **路由**：静态路由加 `src/router/modules/*.ts`；动态菜单 Auth 接入后再改

---

## 五、数据库迁移

本项目用 **Prisma Migrate** 管理 PostgreSQL 表结构。Schema 唯一入口：

```
apps/platform/api/prisma/schema.prisma
```

迁移历史目录（需提交 Git）：

```
apps/platform/api/prisma/migrations/
```

### 日常改表（本地开发）

1. 修改 `schema.prisma`（加字段、加表、改索引等）
2. 确保 Docker 数据库在跑：`pnpm docker:up`
3. 生成并应用迁移：

```bash
pnpm db:migrate
```

4. 按提示输入迁移名称（英文、简短），例如 `add_article_job_error_message`
5. Prisma 会：
   - 在 `migrations/` 下新建一个文件夹 + `migration.sql`
   - 对本地库执行 SQL
   - 自动 `prisma generate` 更新 Client

> `pnpm db:migrate` 实际执行的是 `prisma migrate dev`，**仅用于开发环境**。

### 拉取他人迁移（协作）

同事提交了新的 `migrations/` 后，你本地执行：

```bash
pnpm docker:up
pnpm db:migrate    # 只应用未执行的迁移，不会改 schema
```

### 只改了 schema 但没生成 SQL？

若 `db:migrate` 提示没有变更，说明 `schema.prisma` 与数据库已同步。

若 Client 类型过期（IDE 报错找不到新字段），可单独执行：

```bash
pnpm db:generate
```

### 生产 / 预发环境

生产**不要用** `migrate dev`，用只应用、不交互的命令：

```bash
cd apps/platform/api
pnpm exec prisma migrate deploy
```

`migrate deploy` 只跑 `migrations/` 里尚未执行的 SQL，不会根据 schema 自动生成新迁移。

根目录也可执行：`pnpm db:deploy`

### 曾用 db push 导致迁移历史落后（漂移修复）

若本地库表结构已是最新（例如曾执行 `prisma db push`），但 `migrations/` 少了几条，**不要**再 push。按下面处理：

1. 拉取包含新迁移的代码
2. 若 `pnpm db:deploy` 报错「表/列已存在」，说明库结构已对齐，只需登记迁移历史：

```bash
cd apps/platform/api
pnpm exec prisma migrate resolve --applied <迁移文件夹名>
```

示例：`pnpm exec prisma migrate resolve --applied 20260614120000_sync_quota_prompt_keyword_cms`

3. 再执行 `pnpm exec prisma migrate status`，应显示 `Database schema is up to date`

**全新环境**（生产/CI/新同事空库）直接 `pnpm db:deploy` 即可，会按顺序跑完全部 `migrations/`。

### 约定

| 做法 | 说明 |
|------|------|
| ✅ 改 `schema.prisma` 再 `db:migrate` | 标准流程 |
| ✅ 把 `migrations/` 一并提交 Git | 团队共享同一份迁移历史 |
| ✅ 迁移名描述清楚 | 如 `add_user_last_login_at` |
| ❌ 手改已应用过的 `migration.sql` | 会导致历史与库不一致 |
| ❌ 直接改生产库表结构 | 绕过迁移，其他环境会对不上 |
| ❌ 删生产数据卷 `docker compose down -v` | 仅开发空库重置时用 |

### 常见场景示例

**加字段：**

```prisma
model ArticleJob {
  // ...
  errorMessage String? @db.Text
}
```

```bash
pnpm db:migrate
# 输入：add_article_job_error_message
```

**加新表：** 在 `schema.prisma` 增加 `model Xxx { ... }`，同样 `pnpm db:migrate`。

**加索引：** 在 model 上写 `@@index([organizationId, status])`，再迁移。

### 开发环境重置（慎用）

本地库数据可丢、想从零开始时：

```bash
pnpm docker:down
docker compose down -v          # 删除 Postgres 数据卷
pnpm docker:up
pnpm db:migrate                 # 重新应用全部迁移
```

若连迁移历史也要重做（仅 Phase 0 空项目适用）：删除 `prisma/migrations/` 后重新 `pnpm db:migrate`。

---

## 六、日常开发流程

每次开机后按顺序：

```
1. 打开 Docker Desktop（等托盘图标就绪）
2. pnpm docker:up          # 若容器未运行
3. pnpm dev:api            # 终端 1
4. pnpm dev:web            # 终端 2
```

改表结构时，在步骤 2 之后插入：`pnpm db:migrate`。

### E2E 冒烟（API 级）

覆盖：登录 → 建站点 → 创建任务（202 QUEUED）→ 队列消费后状态变更。

```bash
pnpm docker:up
pnpm db:deploy
pnpm db:seed
pnpm dev:api            # 另开终端，等 API 就绪

# 根目录或 apps/platform/api
pnpm test:e2e
```

环境变量（可选）：

| 变量 | 说明 |
|------|------|
| `E2E_API_BASE_URL` | 默认 `http://127.0.0.1:3000` |
| `E2E_SKIP=true` | 强制跳过 |
| `E2E_REQUIRED=true` | API 不可达时失败（CI 使用） |
| `E2E_STATUS_POLL_TIMEOUT_MS` | 等待状态变更超时，默认 90000 |

---

## 七、常见问题

### `ERR_CONNECTION_REFUSED` 访问 5173

前端开发服务器未启动。执行 `pnpm dev:web` 后再刷新浏览器。

### `EADDRINUSE: address already in use :::3000`

3000 端口被占用（可能是之前未退出的 API 进程）。

```powershell
# 查看占用 3000 端口的进程
netstat -ano | findstr ":3000"

# 结束对应 PID（将 12345 替换为实际 PID）
taskkill /PID 12345 /F
```

然后重新 `pnpm dev:api`。

### Serper / DeepSeek 报错 `fetch failed` 或连接超时

**现象**：任务失败，错误信息为 `Serper API 调用失败：fetch failed`，但 Serper 网页 Playground 能正常请求。

**原因**：浏览器会走系统/Clash 代理，Node.js 的 `fetch` **默认不走代理**，直连 `google.serper.dev` 会超时。

**处理**：在 `apps/platform/api/.env` 增加（Clash 默认端口 `7890`，按你的代理软件调整）：

```env
HTTPS_PROXY=http://127.0.0.1:7890
HTTP_PROXY=http://127.0.0.1:7890
NODE_USE_ENV_PROXY=1
```

然后重启 API：

```bash
pnpm dev:kill-api
pnpm dev:api
```

再**新建一条任务**（已失败的任务不会自动重试）。

### Semrush 共享号 RPA 查分

工作流在**本地 SEO ≥80 分**后，会经 Playwright 自动走 3ue 共享号登录 Semrush SEO Writing Assistant 查分。

**1. 安装 Chromium（首次）**

```bash
cd apps/platform/api
pnpm exec playwright install chromium
```

**2. 配置 `apps/platform/api/.env`**

```env
SEMRUSH_ENABLED=true
SEMRUSH_3UE_USERNAME=你的3ue用户名
SEMRUSH_3UE_PASSWORD=你的3ue密码
SEMRUSH_HEADLESS=true
```

凭证**不要提交 Git**。若使用 Clash，保留 `HTTPS_PROXY` 配置。

**3. 冒烟测试**

```bash
cd apps/platform/api
pnpm semrush:smoke
```

**4. 正式跑任务**

重启 API 后新建文章任务；状态会经过 `OPTIMIZING`，完成后详情页可看到 `semrushScore`（0–10 分制，通过线 9.5）。

调试 UI 时可设 `SEMRUSH_HEADLESS=false` 观察浏览器操作。登录 Cookie 缓存在 `apps/platform/api/.semrush-session/`（已 gitignore）。

### `docker` 命令找不到

安装 Docker 后需**新开终端**或重启电脑。也可手动将以下路径加入系统 PATH：

```
C:\Program Files\Docker\Docker\resources\bin
```

### `prisma generate` 报 EPERM

多为 Node 进程占用 Prisma 引擎文件。先关闭 `pnpm dev:api`，再执行：

```bash
pnpm db:generate
```

### 迁移报错 provider 不匹配（sqlite vs postgresql）

说明迁移历史与当前数据库类型不一致。全新环境可删除 `apps/platform/api/prisma/migrations/` 后重新迁移：

```bash
pnpm db:migrate
```

> 仅适用于开发环境空库，会丢失已有迁移记录。

### 浏览器无法访问 127.0.0.1:5173

Vite 已配置 `host: true`，同时监听 IPv4 和 IPv6。若仍有问题，尝试：

- http://localhost:5173
- 确认 `pnpm dev:web` 终端无报错

---

## 八、不装 Docker 的备选方案

| 方案 | 做法 |
|------|------|
| 本机 PostgreSQL | 安装 PG 16，创建库 `wm_platform`，修改 `DATABASE_URL` |
| 云数据库（Neon 等） | 注册免费实例，将连接串写入 `apps/platform/api/.env` |

Redis 在 Phase 1 接入 BullMQ 前可暂不配置；队列功能上线后需保证 `REDIS_URL` 可用。
