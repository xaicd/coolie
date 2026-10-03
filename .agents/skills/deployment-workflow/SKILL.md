---
name: deployment-workflow
description: 测试环境部署 SOP —— 本地构建镜像 + 发布到 tc-robin-claw (App-Web + 根 Next, 不含 Flutter APK)。包含完整 9 节流程 + 5 大事故硬约束 + APK 独立发布链 + cend-pc 静态制品链。触发场景：「部署」「发布」「打包」「镜像」「docker save」「docker compose up」「tag 翻转」「回滚」「rollback」「tc-robin-claw」「192.144.253.205」。
---

# 测试环境部署 SOP（tc-robin-claw / 192.144.253.205）

每次「部署 / 打包发布」走这条链。⚠️ = 历史事故硬约束，跳过必出故障。
详细坑位见项目 memory：`deploy-sop`、`tc-robin-claw-test-server-ops`、`test-env-api-encryption-key`、`commit-discipline-for-test-env`。

## 0. 判断部署类型（4 大链路 + 1 子链路）

> **核心原则**：每种产物的发布方式完全不同，**严禁混淆**。

| 改动范围 | 链路 | 章节 | 命令入口 |
|---|---|---|---|
| **SQL / Prisma migration** | 直接对生产 DB 执行 migration | **§11 SQL 变更链** | `npx prisma migrate deploy` 或 `psql -f migrations/xxx.sql` |
| **API / 后端代码** (`src/modules/**/backend/**`、`src/app/api/**`) | 走 docker 镜像链 (跟 Web H5 共用同一镜像) | **§3 本地 build + §5-6 传输 + tag 翻转 + 容器重启** | `bash scripts/app-build.sh` 不适用，必须 docker build |
| **H5 / SPA 代码** (`src/app/(c-end)/**`、`src/app/(platform-admin)/**`、`src/app/(merchant-console)/**`、`src/modules/**/frontend/**`) | 走 docker 镜像链 | **§3-6** | `bash scripts/app-build.sh` 是错的，必须 docker build |
| **cend-pc PC 门户** (`apps/cend-pc/**`) | **§9 静态制品链**，vhost 服务根域 `/`（Vite SPA 静态文件） | **§9** | `cd apps/cend-pc && npm run build && scp dist/...:/var/www/cend-pc/` |
| **Flutter APK** (`apps/mobile-c-end/**`) | `scripts/app-build.sh` + COS 直传 + AppRelease 增量更新 | **§10** | `bash scripts/app-build.sh cend android release` |

### 0.1 联级变更（一次发布会涉及多个产物）

| 场景 | 涉及链路 |
|---|---|
| 加新表 + 后端 API + 管理后台 UI | **§11 SQL 链** + **§3-6 docker 镜像链**（先 SQL 再镜像） |
| 后端 API + H5 调用 API | **§3-6 docker 镜像链**（一镜像含全部） |
| 后端 API + Flutter 调用 | **§3-6 docker 镜像链** + **§10 APK 链**（镜像先，APK 后） |
| 后端 API + cend-pc 调用 | **§3-6 docker 镜像链** + **§9 cend-pc 静态链**（镜像先，cend-pc 后） |
| 全栈变更（DB + API + H5 + cend-pc + APK） | **§11 SQL → §3-6 镜像 → §9 cend-pc → §10 APK**（强制顺序） |

### 0.2 单链路反例（禁止）

- ❌ **改 SQL 不跑 prisma migrate deploy** → Prisma Client 跟实际 schema 不同步 → 静默报错
- ❌ **改 API / H5 跑 `scripts/app-build.sh`** → scripts/app-build.sh 是 Flutter APK build，不是 docker 镜像 → 误以为 build 了实际没 build
- ❌ **改 cend-pc 跑 docker build** → docker 镜像只 COPY `.next/standalone` + `.next-app-web` + `public` + `prisma`，跟 `apps/cend-pc/` 无关
- ❌ **改 Flutter 跑 docker build** → docker 镜像不包含 `apps/mobile-c-end/`，跑错链路
- ❌ **跳过 emulator 验证直接 docker build** → 修了 bug 没验证就部署 → build 失败浪费时间（§11 #24）。**注**: docker build 只在本机 sandbox 跑（§3.2 ❌ #15 + §11 #1, 远端 tc-robin-claw 禁止 build, 磁盘 59GB 紧张会触发 no space left on device）
- ❌ **无脑重建 core-server**: 接口没变就别动 — core-server 跑的是根 `.next/standalone` (含 `/api/*` `/admin/*` `/merchant-console/*`), 重启 = 全站 503。判定标准见 §6.0 决策表
- ⚠️ **本地 build 用 background=true + notify=true**: sandbox 600s timeout, 后台跑即可, docker daemon CPU > 0 持续 5-10 min = 没死锁

> **只改 `apps/cend-pc/**` 时不要重建镜像**：镜像运行阶段只 COPY `.next/standalone`、`.next-app-web`、`public`、`prisma`，与 cend-pc 无关。反之只改 `src/**` 时也无需发 cend-pc。两者是互相独立的产物。
> **只改 C 端 UI 或部署配置时不要重建 core-server**：详见 §6.0 决策表（"接口没变就别动"）。

## 1. 部署前检查（必须 git pull）⚠️

- `git fetch --all`，确认本地 HEAD 已同步到 origin + gitee 远端（**注意：本地 origin 默认指向 github.com/townwenlv/wenlv-next，tc-robin-claw 端 origin 指向 gitee —— push 后必须在远端 fetch github**）。
- 部署依赖必须先提交并推双远端（origin + gitee）。**bug 教训**：本地 origin = github，但 tc-robin-claw 上 origin = gitee。如果只 push github，远端 gitee 看不到新代码。
- 分叉用 rebase/merge 收敛，切勿跳过。

## 2. 取加密 key ⚠️

```bash
KEY=$(ssh tc-robin-claw 'docker exec qloapps-core-server printenv API_ENCRYPTION_KEY' | tr -d '\n')
[ "${#KEY}" -ne 64 ] && { echo "❌ key 长度 ${#KEY}，应为 64"; exit 1; }
```

- 容器名是 `qloapps-core-server`（**不是** `qloapps-app`）。
- key 禁打印、禁落盘，只经 `$(...)` 传递。

## 3. 本地构建镜像 ⚠️

### 3.1 构建方式选择

- **本地 build**（默认，sandbox 600s 可能 timeout，需 long-running）:
  ```bash
  docker build --no-cache \
    --build-arg NEXT_PUBLIC_API_ENCRYPTION_KEY="$KEY" \
    --build-arg AUTH_URL="http://192.144.253.205" \
    --build-arg NEXTAUTH_URL="https://dayanwa.cn" \
    --build-arg APP_PUBLIC_URL="http://192.144.253.205" \
    -t wenlv-next-app:r<tag> .
  ```
  - **必须 4 个 `--build-arg`**（2026-09-23 教训，详见事故 §3.2 ❌ build 禁忌 #15）：`AUTH_URL/NEXTAUTH_URL/APP_PUBLIC_URL` 三者是 mobile-web SSR proxy.ts fetch /api/setup 的服务端权威 origin。Dockerfile 已声明对应 ARG/ENV，不传 → 容器 `process.env.AUTH_URL` 缺失 → proxy 退化到 fallback `localhost:3000` → fetch 自己 404 → 误判未初始化 → 全 307 /setup。
- ❌ **远端 tc-robin-claw build**（2026-09-27 用户明确指示"禁止远端 build，他是傻逼"）：tc-robin-claw 磁盘 59GB / RAM 7.5GB 紧张, docker build + `--no-cache` 必触发 `/var/lib/containerd/io.containerd.content.v1.content/ingest/` no space left on device, dockerd 卡在 commit layer, **就算 build 完 dockerd 也写不出 image ID**, 看着 BUILD_DONE_1 实际镜像没生成. 严重时反复 kill ssh 触发 sshd MaxStartups 限流, 后续 SSH banner exchange 拒连. **永远 ssh + docker build 在远端**, 哪怕有 layer cache 也不行. 修法: (a) 本机 sandbox background+notify build; (b) 或者 push commit 让远端 CI 跑; (c) 或者本地 build 后 `docker save | ssh docker load` 传输 (但 §4 也是 known-flaky). 推荐沙箱本地跑.

### 3.2.5 Turbopack Cache 实战优化（2026-09-21 调研 + 实施）

玻璃蛙调研 `deleg_a09dc487` Next.js 16 + Turbopack + Docker 8 大方案:
1. `turbopackFileSystemCacheForBuild` env (官方 Next.js 16 推荐)
2. Dockerfile `--mount=type=cache,target=/app/.next/cache` (BuildKit 专属)
3. `skipLibCheck: true` (tsconfig 已有)
4. Prisma generate 独立 stage (Dockerfile step 9 已独立)
5. `NODE_OPTIONS=--max-old-space-size=4096` (Dockerfile 已有)
6. docker buildx multi-arch (本项目不用, emulator + 真机 + arm64 已通过 `--target-platform` 覆盖)
7. `outputFileTracingIncludes` (Dockerfile 已有)
8. `@next/bundle-analyzer` (开发依赖, 生产 build 不影响速度)

**实施结果** (commit `f4308943`):
- ✅ Dockerfile 加 `ENV TURBOPACK_CACHE_DIR=/app/.next/cache` (legacy builder 兼容, 后续 step 命中)
- ✅ `RUN rm -rf /app/.next/cache` (减小镜像体积)
- ❌ `--mount=type=cache` 不适用 (本项目 buildx 未装, 改 DOCKER_BUILDKIT=0 走 legacy)
- ❌ SKIP_CHECK_STANDALONE 不能用 (JSON 字符串嵌套引号冲突, 改用其他方式)

**真实瓶颈** (本次实测, 5min 跑):
- Step 25 `next build` ~50s (root Next.js)
- Step 26 `next build` ~50s (cend-app-next 独立制品, 重新 compile)
- Step 24 (npm ci) 缓存命中秒过
- Step 9 (prisma generate) 缓存命中秒过

**Next.js build 优化受限**: Next.js 16 + Turbopack 编译时间主要取决于路由数 + 模块数 (343 表, 88 模块). 不通过 cache 优化能砍的只有 ~30s (check:standalone-runtime 跳过的 10s + cache 命中的 20s).

### 3.2 ❌ build 禁忌（2026-09-21 + 2026-09-23 事故总结）

| 禁忌 | 原因 | 正确做法 |
|---|---|---|
| ❌ sandbox 600s timeout 短轮询 | foreground timeout max 600s, build 12-15 min 必超时被 kill | ✅ background=true + notify=true 后台等 build 完成 |
| ❌ `docker buildx build` (项目未装 buildx) | `docker buildx version` 输出空 → DOCKER_BUILDKIT=1 会报 `BuildKit enabled but buildx missing`. 改用 `DOCKER_BUILDKIT=0` legacy 模式 | ✅ `DOCKER_BUILDKIT=0 docker build` 走经典 builder |
| ❌ 跳过 emulator 验证直接 docker build | 修了 bug 没验证就部署 → build 失败浪费时间。**注**: docker build 只在本机 sandbox 跑, 远端 tc-robin-claw 禁止 build（§0.2 + §3.1 ❌） | ✅ 顺序：emulator 装 APK 验证 → commit → docker build → tag 翻转 |
| ❌ 在死锁的 build 上等超过 10min | `futex_wait_queue` 死锁不会自动恢复 | ✅ 5min 无输出 + CPU<1% = `kill -9 <pid>` + 用 cache 重 build |
| ❌ **build-arg 只传 `NEXT_PUBLIC_API_ENCRYPTION_KEY` 一个**（2026-09-23 教训） | mobile-web SSR proxy.ts 需要 `AUTH_URL/NEXTAUTH_URL/APP_PUBLIC_URL` 3 个服务端 env 注入 image。漏传 → 容器 `process.env.AUTH_URL` 缺失 → proxy 退化到 fallback `localhost:3000` → fetch 自己 404 → 误判未初始化 → 全 307 /setup | ✅ 必须 4 个 `--build-arg` 一起传（详见 §3.1） |
| ❌ **远端 tc-robin-claw docker build**（2026-09-27 用户明确指示"禁止远端 build, 他是傻逼"） | 远端磁盘 59GB / RAM 7.5GB 紧张, build + `--no-cache` 触发 `no space left on device`, dockerd 卡 commit layer, image ID 写不出, 反复 kill ssh 触发 sshd MaxStartups 限流后续 SSH 拒连 | ✅ 本机 sandbox background+notify build; 或本地 build 后 `docker save \| ssh docker load` 传输; 或 push commit 让远端 CI 跑 |
| ❌ **Dockerfile builder 阶段产物缺失**（2026-10-03 audit §7.1 M3） | mobile-web 共享 image + 独立 basePath=/app (distDir=.next-app-web), runner `COPY .next-app-web/standalone ./app-web/` 缺失 = 容器 cd /app/app-web && exec node server.js ENOENT 隐形 30s 后 Exit 1, docker logs 没线索, 用户看 503 | ✅ Dockerfile builder 末尾加 `RUN test -f /app/.next/standalone/server.js` / `/app/.next-app-web/standalone/server.js` / `/app/.next-app-web/static` 三道校验 (audit §7.1 M3, 单测 `npm run check:dockerfile-multistage`) |
| ❌ **.env.test 里 KEY 长度/URL 合法/必填非空 缺校验**（2026-10-03 audit §7.1 S2） | `env-injection-lint` 只挡"结构" (变量定义/override 漂移/pgbouncer md5), 不挡"值". `.env.test` 里 `API_ENCRYPTION_KEY=tooshort` 或 `AUTH_URL=not-a-url` 或 `DATABASE_URL=localhost` 都能蒙混过 lint, 但部署后 SPA 解密静默失败/SSR proxy 404/容器连不上 service | ✅ `npm run check:env-schema` 部署前拦截 (守卫 0.6, 7 类规则). escape hatch `SKIP_ENV_SCHEMA=true`. 单测 `npm run check:env-schema:test` (12/12 PASS) |
| ❌ **pgbouncer AUTH_TYPE 漂移**（2026-10-03 audit §7.1 S3） | base 写 `md5` + override 兜底 `scram-sha-256`, 本机跑没事, 生产没 override → 全部 DB 连接 SASL 鉴权失败 → 502 (2026-09-25 漂移事故链) | ✅ `npm run check:pgbouncer-base` 部署前拦截 (守卫 0.7, 4 道门禁). 强制 base 唯一来源 `scram-sha-256` + override 不准碰 + 认证字面强制 `${POSTGRES_*}`. 单测 `npm run check:pgbouncer-base:test` (6/6 PASS) |

### 3.3 Tag 命名规则

- 定 tag：先看当天最大序号 `docker images wenlv-next-app --format '{{.Tag}}' | grep "^r$(date +%Y%m%d)"`
- tag = `r<YYYYMMDD>-<NN>`；**必须 `--no-cache`**（否则 ENV layer 命中旧空值 → 客户端 key 为空，静默失败）

### 3.3 ⚠️ 镜像 ID 验证（避免 rename 假 build）

```bash
docker images wenlv-next-app:r<tag> --format "{{.ID}}"
# 必须 != 上一个 tag 的 ID
# 真实 build: ID 会变（如 5c648b9f6944 → 7543c9b5b928）
# 假 build: ID 不变（仅 docker tag rename）
```

## 4. 传输镜像（仅本地 build 时需要）

```bash
docker save wenlv-next-app:r<tag> | gzip -1 | ssh tc-robin-claw "gunzip | docker load"
```

**Bug 教训**: docker save/load 经常失败（流截断、权限问题）。如果远端有现成镜像但 tag 错，可直接 `ssh` + `docker tag`。最稳的方式是**远端直接 build**（§3.1 第二种）。

## 5. tag 翻转（留回滚点）

```bash
ssh tc-robin-claw 'docker tag wenlv-next-app:latest wenlv-next-app:rollback-pre-$(date -u +%Y%m%dT%H%M%SZ)'
ssh tc-robin-claw 'docker tag wenlv-next-app:r<tag> wenlv-next-app:latest'
```

## 6. 重建容器 ⚠️⚠️⚠️（**必须先 stop+rm 再 up，不能用 --force-recreate，先读 §6.0 决策表**）

### 6.0 重建范围决策表 (2026-09-23 教训: "接口没变就别动")

> **核心原则**: `core-server` (`qloapps-core-server`) 跑的是根 `.next/standalone`, 承载 `/api/*` + `/admin/*` + `/merchant-console/*`。重启它 = 整站 503。
>
> `mobile-web` (`qloapps-mobile-web`) 跑的是独立 `.next-app-web/standalone`, 承载 C 端 `/app/*`。
>
> **判断: 本次 commit 改没改 core-server 业务代码?**

| 改动路径 | core-server 要重建吗? | mobile-web 要重建吗? | 原因 |
|---|---|---|---|
| `Dockerfile` / `docker-compose*.yml` / `.env*` | ❌ 不必 (除非 env 注入本身改了) | ✅ 必 | build-arg baked, mobile-web 编译产物变 |
| `src/app/(c-end)/**` / C 端 React 组件 | ❌ 不必 | ✅ 必 | mobile-web standalone 编译产物 |
| `src/modules/**/frontend/**` (C 端 UI) | ❌ 不必 | ✅ 必 | 同上 |
| `src/modules/shared/frontend/**` (共享 UI 组件) | ❌ 不必 | ✅ 必 | shared UI 组件, mobile-web 编译产物 |
| `src/app/api/**` / `src/app/(platform-admin)/**` / `src/app/(merchant-console)/**` | ✅ **必** | ✅ 必 | core-server 业务代码 |
| `src/modules/**/backend/**` / `src/modules/**/domain/**` | ✅ **必** | ✅ 必 | core-server 业务代码 (排除 frontend/ 与 shared/) |
| `prisma/schema.prisma` | ✅ **必** (+ §11 SQL migration) | ✅ 必 | DB schema 同步 |
| `next.config.*` | ✅ **必** (build 配置变了) | ✅ 必 | next.config 编译时生效 |
| `apps/cend-pc/**` / `apps/mobile-c-end/**` | ❌ 不必 (独立链路 §9 / §10) | ❌ 不必 | 不在镜像里 |
| `scripts/**` / `.agents/skills/**` / `.claude/**` / `.husky/**` / `docs/**` | ❌ 不必 | ❌ 不必 | 纯 SOP / 文档 |
| `package.json` / `package-lock.json` (只改 dev deps) | ⚠️ 看影响范围 | ✅ 看影响面 | npm ci 影响所有层 |
| `package.json` / `package-lock.json` (改了 prod deps) | ✅ 必 | ✅ 必 | production runtime 依赖变了 |

**自动判断机制** (build-and-publish.sh §10):
- 通过 `--build-arg GIT_COMMIT=$(git rev-parse HEAD)` 注入 commit SHA 到镜像 ENV
- 部署时拿上次 `rollback-pre-*` 镜像的 `GIT_COMMIT` → `git diff PREV_COMMIT..HEAD --name-only` 检查上面"必改"路径:
  - `src/app/api/` `src/app/(platform-admin)/` `src/app/(merchant-console)/`
  - `src/modules/**/backend/` `src/modules/**/domain/` (排除 frontend/ 与 shared/)
  - `prisma/schema.prisma` `next.config.*`
- 命中任一 → 重建 core-server; 否则跳过, 节省 30s 中断

### 6.1 执行 (mobile-web 必重建, core-server 按 6.0 表判断)

**推荐方式 (2026-10-03 整改, audit §7.1 M4)**:

```bash
# 一键重建 (自动 stop+rm+up, 留 rollback-pre-<ts> tag)
npm run recreate:container:test    # 重建 app + app-web + ws

# 单独重建
npm run recreate:container:test app        # 只重建 core-server
npm run recreate:container:test app-web    # 只重建 mobile-web
```

**传统手工方式** (保留兼容):

```bash
# mobile-web 永远重建 (C 端编译产物每次必变)
ssh tc-robin-claw 'cd ~/workspace/wenlv-next \
  && sudo docker compose stop app-web 2>&1 \
  && sudo docker rm -f qloapps-mobile-web 2>&1 \
  && sudo docker compose up -d --no-deps app-web 2>&1'

# core-server 按需重建 (默认跳过的命令, 仅接口/平台/商户后台改了才执行)
ssh tc-robin-claw 'cd ~/workspace/wenlv-next \
  && sudo docker compose stop app 2>&1 \
  && sudo docker rm -f qloapps-core-server 2>&1 \
  && sudo docker compose up -d --no-deps app 2>&1'
```

- 必须 `cd` 后**无 `-f`** 执行（否则跳过 docker-compose.override.yml → NextAuth UntrustedHost，全站会话挂）。
- ⚠️ **绝对不要 `docker compose up -d --force-recreate`**——`--force-recreate` 在已有同名容器时**不会重读 env**（2026-09-23 00:13 真实事故：用 `--force-recreate` 重 build mobile-web，override.yml 写了 `AUTH_URL`，但容器 env 仍缺失 → proxy.ts 退化 fallback → 全 307 /setup）。**必须先 stop + rm -f**。
- ⚠️ **绝对不要 `docker restart`**——只重启进程, image ID + env 都不变。
- 同名 service 跑两个容器时 `docker compose rm -f` 会失败，必须先 `stop` 才能 `rm`。
- ⚠️ **不要无脑重建 core-server**: 它跑的是根 `.next/standalone` (含 /api /admin /merchant-console), 重启 = 全站 503。如果本次 commit 只改 Dockerfile/C 端 UI, 跳过重建 (见 6.0 决策表)。

## 7. 验证

### 7.1 ⚠️ 强制 env 校验 + 路由验证（推荐跑 `scripts/deploy/post-deploy-verify.sh`）

> **2026-10-03 整改**（audit `docs/audit/2026-10-03/test-env-deployment-architecture-audit.md` §7.1 M6/M7）: 强制把以下 7 项门禁从"人工记" 升级为"一键脚本"。命令:
>
> ```bash
> # 一键校验 (会自动跑下面 §7.2-7.7 的 7 项)
> npm run post-deploy:verify:test
> ```
>
> 不通过 → 立即停止部署, 修复后再跑。脚本内部每项 fail 都给修复命令。

### 7.2 core-server env ≥ 6 个

```bash
ssh tc-robin-claw 'sudo docker exec qloapps-core-server env | awk -F= "{print \$1}" | grep -E "^(AUTH_URL|NEXTAUTH_URL|APP_PUBLIC_URL|API_ENCRYPTION_KEY|DATABASE_READ_URL|NEXT_PUBLIC_API_ENCRYPTION_KEY)$" | sort | uniq | wc -l'
# 必须 ≥ 6, 输出 <6 = env 注入失败, 立即 stop+rm+up 重做
```

### 7.3 mobile-web env ≥ 5 个（无 API_ENCRYPTION_KEY）

```bash
ssh tc-robin-claw 'sudo docker exec qloapps-mobile-web env | awk -F= "{print \$1}" | grep -E "^(AUTH_URL|NEXTAUTH_URL|APP_PUBLIC_URL|DATABASE_READ_URL|NEXT_PUBLIC_API_ENCRYPTION_KEY)$" | sort | uniq | wc -l'
# 必须 ≥ 5, 输出 <5 = mobile-web env 缺 (历史教训: 2026-09-22 22:41 + 2026-09-23 00:13 同根因 4h 内连踩 2 次)
```

### 7.4 /api/health 容器内 200

```bash
ssh tc-robin-claw 'sudo docker exec qloapps-core-server wget -q -O - http://127.0.0.1:3000/api/health' 2>/dev/null >/dev/null; echo $?
# 必须 0 (wget 0 = HTTP 200), exit != 0 = 服务没起来
```

### 7.5 /app 路由 (mobile-web basePath) 容器内 200

```bash
ssh tc-robin-claw 'sudo docker exec qloapps-mobile-web wget -q -O - http://127.0.0.1:3201/app' 2>/dev/null >/dev/null; echo $?
# 必须 0, exit != 0 = mobile-web 没起来 / basePath 错误
```

### 7.6 /socket.io/ ws 路由 200/400/426

```bash
curl -sS -o /dev/null -w '%{http_code}\n' http://192.144.253.205:3002/socket.io/
# 必须 200/400/426 (WebSocket handshake 200, polling fallback 400, upgrade 426 都正常)
```

### 7.7 外网 /api/v1/open/platform/portal-home 200

```bash
curl -sS -o /dev/null -w '%{http_code}\n' http://192.144.253.205/api/v1/open/platform/portal-home
# 必须 200, 200 之外的 code = DATABASE_READ_URL 没走 pgbouncer:6432
```

### 7.8 外网 /app/explore 200 (NOT 307)

```bash
curl -sS -o /dev/null -w '%{http_code}\n' http://192.144.253.205/app/explore
# 必须 200 (NOT 307), 307 = 全 307→/setup 隐形灾难 (mobile-web basePath 缺 env)
```

### 7.9 传统 ad-hoc 验证 (兼容老 SOP)

```bash
# 容器 healthy（等 ~8s）
ssh tc-robin-claw 'docker ps --filter name=qloapps-core-server --filter name=qloapps-mobile-web --format "{{.Names}} {{.Status}}"'

# 页面 200：App-Web basePath `/app` (容器内 3201), 根 Next `/` (容器内 3000)
curl -sS -o /dev/null -w '%{http_code}\n' http://192.144.253.205/app/explore
curl -sS -o /dev/null -w '%{http_code}\n' http://192.144.253.205/admin/dashboard

# 镜像 ID 变化: 远端 `latest` tag 的镜像 ID 应等于新 tag 的 ID
```

### 7.10 历史背景 (供回溯)

> ⚠️ mobile-web SSR 即使没 AUTH_URL 也会回 200, 但所有页面 307→/setup 是隐形灾难。仅看 HTTP 200 不够 (commit `d99834df` + `7c38244b` 教训)。这就是为什么 §7.1 强制跑 7 项门禁。

## 8. 回滚（需要时）

```bash
ssh tc-robin-claw 'docker tag wenlv-next-app:rollback-pre-<时间戳> wenlv-next-app:latest && \
  cd ~/workspace/wenlv-next && sudo docker compose stop app-web 2>&1 \
  && sudo docker rm -f qloapps-mobile-web 2>&1 \
  && sudo docker compose up -d --no-deps app app-web 2>&1'
```

## 9. cend-pc PC 门户静态发布（独立链，非镜像）

`apps/cend-pc`（Vite SPA）发布后服务根域 `/`，走**静态制品**：`/var/www/cend-pc/<release>/` + Host Nginx 的 `root`/`alias` 指向该目录。触发条件：`apps/cend-pc/**` 有改动。

### 9.1 构建（本地）

```bash
RELEASE=$(date +%Y%m%d%H%M%S)
KEY=$(ssh tc-robin-claw 'docker exec qloapps-core-server printenv API_ENCRYPTION_KEY' | tr -d '\n')
cd apps/cend-pc
NEXT_PUBLIC_API_ENCRYPTION_KEY="$KEY" LOCAL_TENANT_KEY=jinan-zhangqiu \
  VITE_RELEASE_ID=$RELEASE VITE_TENANT_KEY=jinan-zhangqiu npm run build
```

- `VITE_RELEASE_ID` 为 14 位时间戳，资产 base 变为 `/_assets/cend-pc/<release>/`。
- ⚠️ 产物必须内联 key（漏了 → 客户端解密静默失败）：`grep -rqsF "$KEY" dist/assets/*.js` 应为真（只输出布尔，禁打印 key）。
- 不要设 `VITE_BFF_BASE_PATH`（现网即空）；不要设 `CEND_PC_ENABLE_SRI=1`（明文 HTTP 链路会白屏）。
- 构建命令用 `sh`，`${PIPESTATUS[0]}` 会「Bad substitution」误判失败 —— 以 vite 的 `✓ built in` 为准。

### 9.2 上传

```bash
tar czf - -C apps/cend-pc/dist . | ssh tc-robin-claw \
  'sudo mkdir -p /var/www/cend-pc/<release> && sudo tar -xzf - -C /var/www/cend-pc/<release>/ && sudo chown -R ubuntu:ubuntu /var/www/cend-pc/<release>'
```

- 父目录非当前用户可写，必须 `sudo mkdir` + `sudo tar`（不要先 mkdir 再 sudo，会 permission denied）。

### 9.3 切 nginx（⚠️ 必须用字面路径，禁止在 ssh 里嵌变量）

```bash
ssh tc-robin-claw 'sudo cp /etc/nginx/sites-enabled/dayanwa.cn.conf /etc/nginx/sites-enabled/dayanwa.cn.conf.bak.$(date -u +%Y%m%dT%H%M%SZ)'
ssh tc-robin-claw "sudo sed -i 's|/var/www/cend-pc/<旧release>|/var/www/cend-pc/<新release>|g' /etc/nginx/sites-enabled/dayanwa.cn.conf"
ssh tc-robin-claw 'sudo nginx -t && sudo systemctl reload nginx'
```

- 共 **4 处**：80/443 两个 server 块的 `location /` 的 `root` + `location ^~ /pc` 的 `alias`。
- ⚠️ **字面量**。历史事故：`sed 's|/[0-9]*/|…|'` 的 `*` 被 ssh 转义层吞掉 → 不匹配；`$RELEASE` 嵌在 ssh 双引号里不展开 → nginx 出现字面 `$RELEASE` 变量 → reload 失败但旧进程仍跑（仍服务旧 release）。
- ⚠️ **只看 `nginx -t ok` 不够**（旧 root 同样合法）。必须 `grep -n "root /var/www/cend-pc\|alias /var/www/cend-pc/[0-9]" <conf>` 确认已是新 release。
- 已知 benign warn：`conflicting server name "www.dayanwa.cn" on [::]:443`。

### 9.4 验证（服务器本机 + cache-buster；nginx 对 `/` 有缓存）

```bash
ssh tc-robin-claw 'curl -s --noproxy "*" "http://127.0.0.1/?cb=$RANDOM" | grep -o "cend-pc/[0-9]\{14\}" | sort -u'
curl -s "https://www.dayanwa.cn/?cb=$RANDOM" | grep -o "cend-pc/[0-9]\{14\}" | sort -u
```

- 应输出新 release；`/_assets/cend-pc/<release>/assets/*`、`/pc/` 均 200。
- 外网 curl 可能命中透明代理缓存，服务器本机 `--noproxy "*"` 才是 nginx 真实输出。

### 9.5 回滚

```bash
ssh tc-robin-claw "sudo sed -i 's|/var/www/cend-pc/<新release>|/var/www/cend-pc/<旧release>|g' /etc/nginx/sites-enabled/dayanwa.cn.conf && sudo nginx -t && sudo systemctl reload nginx"
```

- 旧 release 目录保留即回退依据；**先恢复成已知工作的 release**，再尝试切换。

## 10. Flutter APK 发布 + AppRelease 增量更新（独立链）

**重要**: APK 上传走**腾讯云 COS（不是 MinIO）**。使用项目内置脚本 `scripts/app-release-cos.sh` 一键完成（直传 COS + 公网校验 + 自动登记 + 发布 + version-check 断言）。

### 10.1 准备

- `coscli` 已装: `which coscli` (本机 `/home/beye/.local/bin/coscli`)
- 腾讯云 COS 配置: `~/.cos.yaml`（SecretId/SecretKey 仅本地，禁入库）
- `.env.test` 已配:
  ```
  COS_APP_BUCKET=apps-1455492938
  COS_APP_REGION=ap-hongkong
  COS_APP_PUBLIC_BASE=https://dl.dayanwa.cn   # 备案域名（重要：COS 默认域名禁止 APK 分发）
  APP_RELEASE_API_BASE=http://192.144.253.205
  APP_RELEASE_ADMIN_PHONE=13800000001
  APP_RELEASE_ADMIN_PASSWORD=***            # 测试环境 superadmin 密码（禁提交）
  ```

### 10.2 构建 + 直传 + 登记（一键）

```bash
cd ~/workspace/zhuangyuan/wenlv-next

# 1) 构建 Multi-Arch APK（arm64 + x86_64 universal，emulator + 真机通用）
export PATH="/home/beye/workspace/devtool/flutter/bin:$PATH"
cd apps/mobile-c-end
flutter clean && flutter pub get
flutter build apk --release
unzip -l build/app/outputs/flutter-apk/app-release.apk | grep "lib/"
# 必须看到 lib/arm64-v8a/libflutter.so + lib/x86_64/libflutter.so
cd ../..

# 2) 一键直传 + 登记 + 发布 + version-check 断言
bash scripts/app-release-cos.sh \
  --version 0.1.71 \
  --apk /path/to/大眼蛙-0.1.71-release-xxx.apk \
  --app-type cend --platform android \
  --min-supported 0.1.31 --force-upgrade \
  --changelog "1. 修直播静音..." \
  --register
```

脚本自动完成:
1. **直传 COS** 到 `app-packages/cend/android/0.1.71/<filename>`
2. **设置对象公有读 ACL**
3. **公网 HEAD/GET 校验**（含 APK 魔数 PK 排除错误页伪装成功）
4. **管理后台登录**（MD5 无盐 + NextAuth csrf + credentials callback）
5. **AES 解密** 响应（API_ENCRYPTION_KEY）
6. **POST /api/admin/app-releases** 登记（DRAFT，外链模式 + 完整 metadata）
7. **POST /api/admin/app-releases/[id]/publish** 发布
8. **version-check 断言**: `latestVersion` + `downloadUrl` 必须命中本次发布

### 10.3 手动验证（应急/排查）

```bash
# 解密 version-check 响应（AES-256-CBC + MD5）
KEY=$(ssh tc-robin-claw 'docker exec qloapps-core-server printenv API_ENCRYPTION_KEY' | tr -d '\n')
RESP=$(curl -s "http://192.144.253.205/api/app/version-check?platform=ANDROID&currentVersion=0.1.70&appType=cend&deviceId=test")
PAYLOAD=$(echo "$RESP" | python3 -c 'import json,sys; print(json.load(sys.stdin)["payload"])')
echo "$PAYLOAD" | openssl enc -d -aes-256-cbc -md md5 -a -A -pass "pass:$KEY" 2>/dev/null | python3 -m json.tool
```

应返回 `latestVersion: "0.1.71"`, `forceUpgrade: true`, `downloadUrl`, `changelog`。

### 10.4 关键经验教训

| # | 坑 | 修复 |
|---|---|---|
| 1 | COS 默认域名对 APK 分发返回 `403 DownloadForbidden` | 必须用备案自定义域名（`dl.dayanwa.cn`）+ 设 `COS_APP_PUBLIC_BASE` |
| 2 | platform 枚举大小写 | URL `?platform=ANDROID`（大写），`?platform=android` 报 "Invalid option" |
| 3 | admin 登录密码明文被拒 | NextAuth CredentialsSignin 必须 MD5 无盐哈希 |
| 4 | API 响应是 AES 加密 payload | 用 openssl + API_ENCRYPTION_KEY 解密（key 仅内存传递） |
| 5 | `scripted cp` 容器间不通 | 用 `docker cp` 而不是 `docker exec ... cp` |
| 6 | `apps-1455492938` 是 bucket 实际名（不是 `dywapp-1455492938`，cos.yaml 里有两个 bucket 别名） | 看 `.env.test` 实际值 |
| 7 | **hermes-worker cgroup 2 GB 内存限制 vs Flutter build 需要 4 GB Java heap** | 本地 build 受 cgroup OOM 反复杀 (exit 143 SIGTERM, Gradle daemon disappeared). **老实方法**: 让用户 `sudo sh -c "echo max > /sys/fs/cgroup/user.slice/user-1000.slice/user@1000.service/app.slice/<scope>/memory.max"` 释放 cgroup 限制, 本机跑 build 必成功. **不推荐 agy 容器跑 build** (用户 2026-09-22 明确指示"验证最好在主机上,后续少用 agy") |
| 8 | **agy-ubuntu-e2e 容器没预装 Flutter SDK + 没 unzip** | apt-get update + apt-get install -y unzip; unzip 必须先 apt --fix-broken install -y (libpam-modules 依赖问题). 容器 dart SDK 227M 还要下载. 调试/部署**主用主机**, agy 备用 |
| 9 | **script line 80-91 拒 HTTP release** | 必须传位置参数 `bash scripts/app-build.sh cend android release` (cend/android/release). APP_ENV_FILE 用绝对路径避免 docker exec 默认 .env.app. IS_PRODUCTION=false 必设 |
| 10 | **🐸 docker-compose.yml 漏传 env 导致 SSR 抛 FORBIDDEN "门户暂未开放" (用户 2026-09-22)** | `docker-compose.yml` 的 `app-web` service 必须跟 `app` (core-server) 一样加 `env_file: - .env.test`. 因为: (a) `.env` 是本地开发 sandbox env (DATABASE_URL=localhost:5432/qloapps_disposable), 缺 `PORTAL_TEST_IP_TENANT_KEY` + `APP_ENVIRONMENT=test` + `IS_PRODUCTION=false`; (b) mobile-web 容器 SSR 走 `resolvePublicTenantHostContext(headers().get("host"))`, 没 env → 抛 → SPA catch 返 null → 渲染 EmptyState. 修法: app-web service 加 `env_file: - .env.test`. **每次改 compose 后必须 diff app/app-web 两 service 的 env (不能只复制)** |
| 11 | **🐸 开发少用 fallback 难定位问题 (用户 2026-09-22 "之前为啥没问题")** | `loadPortalHome() { try { ... } catch { return null } }` 这种 catch-all 把真错埋掉, 只显示"门户暂未开放". 之前能用是因为旧 tenant 配过 / 现在没配. **必须改**: (a) catch 里 log 真错 (stderr / logger.error); (b) 不返 null 而是抛特定 error code. **开发期禁止 catch-all 吞异常** — 至少 development env 返 raw error |
| 12 | **🐸 docker-compose.yml DATABASE_URL 用 `${VAR:***}` 占位符 + 错误改"密码"(用户 2026-09-22 "你他妈的, 瞎搞什么")** | 之前 core-server 是手动 `docker run -e` 启的, 没走过 compose 解析 — 所以 DATABASE_URL 字面 `***` (真值) 一直 work. 我自作主张改 `postgres:postgres` 错了: 真密码就是 `postgres:***` 字面 3 个星号 (`qloapps-postgres POSTGRES_PASSWORD=***`). **必做**: (a) `grep -r POSTGRES_PASSWORD qloapps-postgres` 看真值再改 compose; (b) compose 之前怎么起容器, 老实按 history 看 (InspectCommand CreatedAt + Labels); (c) 不要看到错误就自作主张改, 老实按 skill §8 回滚 + 老实汇报 |
| 13 | **🐸 compose yaml 解析失败 (env_file 重复) 但 core-server 跑得起来** | 之前 `qloapps-core-server` 是历史 `docker compose up` 启的 (labels 显示 `com.docker.compose.service=app`), compose 改 yaml 后 parse fail 但老容器还能跑 (容器不重启). **必做**: 不要看到 compose parse fail 就觉得是"环境配置错", 老实看 `docker compose ps` 真实错误. 任何 compose yaml 改动后必须跑 `docker compose config` 验证 |
| 14 | **🐸 每个 build 必须关联 commit (用户 2026-09-22 "每个部署打包最好要有提交, 不然丢版本了")** | build APK / docker image 前必须先 `git commit` 当前代码 (working tree 干净). 推荐: (a) `git tag` 打 build 标签 (`v0.1.98+744f5120`); (b) build 时 `--build-arg GIT_COMMIT=$(git rev-parse HEAD)` 把 commit SHA 注入 image; (c) 部署后 `docker inspect <image>` 验证 commit SHA. **防止"build 出来的 image 跟当前代码不一致, 丢版本"** — 之前 0.1.95→0.1.98 多次 build 没每次 commit + tag, 部署跟 git log 关联弱 |
| 15 | **🐸 不能再搞丢功能 (用户 2026-09-23 "我的设置功能丢了")** | PublicPageHeader (`modules/shared/frontend/components/public/PageHeader.tsx`) 用了 `<h1 -ml-9>` + `<div min-w-9>` 推 title 推 actions — 标题长 + 窄屏 + actions 多时 actions 被推出 viewport. 修复: (a) 删 title `-ml-9/-ml-16`, 改 `px-2` 让 title 自身内边距居中; (b) actions 段 `min-w-[44px]` 兜底保证始终可见. **必修 `<PublicLayoutClient>` main `pt-[var(--app-safe-top,env(safe-area-inset-top,44px))]` 兜底 44px** — 没注入 `--app-safe-top` 跟没 safe-area 设备时 main 让出 0 = hero 被 header 覆盖. **每次改 PublicPageHeader / PublicLayoutClient 必须 grep 全 (c-end) 路由看 hero 是否被遮**. **每次改 hero paddingTop 必须 grep 所有用 `bg-gradient` 的 (c-end) 页面看是否被 PublicPageHeader 覆盖** |
| 16 | **🐸 amend 后必须 kill 老 build proc 重 build (用户 2026-09-23)** | `git commit --amend` 改了 commit hash 后, 老 build proc (proc 2117040 / proc 2116229 等) 还在按老 GIT_COMMIT build — 浪费 12 分钟. **必做**: amend 后立刻 `ps -ef \| grep "docker build" \| awk '{print $2}' \| xargs kill -9`, 然后重新 `docker build --no-cache`. **不能再 amend 后等老 proc 跑完** |
| 17 | **🐸 force push 后才能保证 deploy 跟当前代码一致 (用户 2026-09-23)** | amend 后 commit hash 变, 老 hash 已经在远端 origin/gitee — `git push` 报 stale info. **必做**: amend 后 `git push origin master --force-with-lease` (双远端都 force). 不能 `git push` (普通 push 被 stale info 拒). **先 amend → 然后立刻 force push 双远端 → 然后立刻 kill 老 proc → 然后重 build** |
| 18 | **🐸 顶部贴顶方案 3 种方案不混用 (用户 2026-09-23 "学首页吧" + "多了个白条")** | C 端 (c-end) 页面顶部只有 3 种方案, 选一种用到底, 不要混用: **(A) 首页流式** = `<header relative z-10>` + `pt-[calc(0.75rem+max(env(...,44px),var(...,44px)))]` 让出 safe-top, hero `paddingTop:0` 紧贴 (跟 PortalHomeView 一致); **(B) 直播流式** = `<header absolute z-30 top:safeTopPx>` + hero `paddingTop:${safeTopPx+42}px` 让出 (inline header 紧凑 42px, /app/live 用); **(C) PublicPageHeader 绝对** = `<PublicPageHeader absolute z-30>` 渲染高 101px, hero `paddingTop:${safeTopPx+42}px` 让出 (50 个页面在用). **真因 (我的页多了白条)**: 混用 (A) + (C) = header 用 relative 不让 safe-top, 但 main pt-[var(--app-safe-top,env(...,44px))] 让出 44px = header 底部到 hero 顶部空 30-50px 漏 main `bg-slate-50` 背景 = "白条"。**修法**: 改方案 (A) 时, header 必须 `pt-[calc(0.75rem+max(env(...,44px),var(...,44px)))]` 让出 safe-top, hero `paddingTop:0`; 颜色 header 跟 hero 必须一致 (都用 `from-slate-900 via-primary-950 to-slate-900` 渐变方向一致)。**不要轻易改 50 个页面** (用户 2026-09-23 反馈"效果挺好, 不要扩大改动") |
| 19 | **🐸 core-server 跟 mobile-web 必须同步重启 (用户 2026-09-23 "APP 升级时机")** | version-check API 由 core-server 跑, h5Version 由 NEXT_PUBLIC_H5_VERSION 注入. **core-server 跑老 image 时 version-check 返 h5Version: r<老 tag> 跟 mobile-web 跑 r<新 tag> 不一致, 真机 version-check 显示老值**。**修法**: 部署 mobile-web 后必须 `docker compose stop app && docker rm -f qloapps-core-server && docker compose up -d --no-deps app` 让 core-server 重启 (compose 用 latest tag)。**验证**: `docker exec qloapps-core-server printenv NEXT_PUBLIC_H5_VERSION` 应该跟 mobile-web 一致 |
| 20 | **🐸 磁盘 100% 导致 Postgres PANIC → portal-home 500 → "门户暂未开放" (用户 2026-09-23 23:54 "又犯错了")** | tc-robin-claw `/var/lib/docker` 只有 59GB, 但每部署一次 docker image (3.89GB) + /tmp/r*.tar (1.17GB) 都会占盘. **连续部署 8 次 = 11 个 tar (43GB) + 11 个 rollback tag (43GB) + 7 个老 r202 tag (27GB) = 110GB+ 占盘 = 100% Use% → postgres PANIC `No space left on device` 写 checkpoint → recovery mode 反复重启 → core-server 连不上 DB → /api/v1/open/platform/portal-home 返 500 → SPA 显示"门户暂未开放"空态**. **修法 (3 步必做)**: (a) **每个 build 后立刻 `rm -f /tmp/r*.tar`** (已经做了但偶尔漏); (b) **部署后保留最近 2 个 rollback tag, 其余 `docker rmi`** (脚本化); (c) **远端 crontab 定时清理**: `0 */6 * * * /usr/local/bin/qloapps-disk-clean.sh` (保留最新 5 个 rollback tag, 清 24h+ 老镜像). **预防门禁**: 每次部署前 `df -h /var/lib/docker` Use% >= 85% 时先清理再 build. **磁盘警报**: 写入 `crontab` 监控, Use% >= 90% 时邮件/钉钉报警 |
| 21 | **🐸 反复改同一处 = 必踩坑 (用户 2026-09-23 24:00 "反反复复")** | 同一处代码 (hero/header 让出空间) 我 Sep 23 18:00-24:00 反复改了 10 次 (calc(101+8) / calc(safeTopPx + 42) / calc(safeTopPx + 101 + 8) / pt-4 / pt-0 / pt-3.5 / pt-[max(env,var)] / hero 颜色 gradient-to-b vs gradient-to-br / 学首页流式 / PublicPageHeader / header relative vs absolute ...), 每次都修一个问题又冒出新问题. **真因**: 反复改同一处 = 没真正理解根因 = 闭眼瞎试 = 一定踩坑. **修法**: (a) **同一处只改 2 次 (改 + 撤回老版本)**, 第 3 次立刻停下来**老老实实**写 audit + 重新看 issue + grep 全 (c-end) 看其他页面是否同问题; (b) **改完立刻截图 + 验证, 不立刻 commit (用 Playwright headless 截图比 Playwright 自动化)**; (c) **用户反馈"反反复复"立即 git reset --hard 回到用户"效果挺好"那个 commit + 沉淀 SKILL 永久规则 + 不再触碰同处**. **本案例**: 用户 Sep 23 23:57 "效果挺好" 之后我又改了 3 次 (顶部贴顶 / icon 调整 / 顶部白条), 用户 00:23 反馈 "反反复复" = 立刻 git reset --hard 0bb8e9ef (用户"效果挺好"那个) + 沉淀 #21 永久规则 + 不再动 hero/header. **绝对禁止**: 同一处改 3 次以上必须停下来审计 |

### 10.5 来源

完整脚本 `scripts/app-release-cos.sh` (339 行) — 已实测成功:
- 0.1.71 → releaseId=`cmuahhh580002g26gbf0uyx96`, URL=`https://dl.dayanwa.cn/...`, SHA256=`5cfaacd1...`
- 部署耗时: COS 上传 18s + 登记+发布+version-check 验证 < 5s = 总计 ~25s

### 10.6 APK 增量更新触发 AppRelease

`scripts/app-release-cos.sh` 自动调用 `POST /api/admin/app-releases/[id]/publish` 让 AppRelease 状态 PUBLISHED + `forceUpgrade` + `minSupportedVersion`。App 内 VersionGate 启动时调 `/api/app/version-check` 触发升级弹窗。

---

## 11. SQL 变更链（Prisma migration）

> **改动范围**：`prisma/schema.prisma` 或新建 `prisma/migrations/xxx/*.sql` 时使用本链。
> **严禁**：改 schema 不跑 `prisma migrate deploy` → client 代码跟实际表结构不同步 → 静默 `Column does not exist` 报错。

### 11.1 流程

```bash
# 1. 本地开发：改 prisma/schema.prisma 后生成 migration
npx prisma migrate dev --name <name>
# 自动生成 prisma/migrations/<timestamp>_<name>/migration.sql + 重置本地 DB

# 2. 提交 migration + schema 改到 git
git add prisma/schema.prisma prisma/migrations/<timestamp>_<name>/
git commit -m "feat(db): <name>"

# 3. 部署到测试服务器 (走 ssh 进 tc-robin-claw 跑 migration)
ssh tc-robin-claw 'cd ~/workspace/wenlv-next &&   sudo docker exec qloapps-core-server npx prisma migrate deploy 2>&1'

# 4. 验证 (看 _prisma_migrations 表 + 应用 query 正常)
ssh tc-robin-claw 'sudo docker exec qloapps-postgres psql -U postgres -d qloapps -c   "SELECT migration_name, applied_steps_count FROM _prisma_migrations ORDER BY started_at DESC LIMIT 5;"'
```

### 11.2 关键坑

| # | 坑 | 修复 |
|---|---|---|
| 1 | `prisma migrate deploy` 跑在容器内必须用 `qloapps-core-server`（不是 `qloapps-postgres`） | postgres 容器只有 psql client, prisma binary 在 core-server 镜像 |
| 3 | 新加 column 带 NOT NULL 没 default → migration 失败 | 加 `DEFAULT '...'` 或 `DEFAULT 0` 或 backfill 再加约束 |
| 4 | rename column → Prisma 视为 drop+create → 数据丢 | 用 `migrate.sql` 手写 `ALTER TABLE ... RENAME COLUMN` |
| 5 | 删除 enum value → Prisma 报错 | enum 加新 value + application 兼容 + 双写期 + 删旧 value |
| 6 | 跑 migration 时应用还在跑 → query race condition | 让 core-server 重启前先 stop (但 k8s rolling 不用) |

### 11.3 紧急回滚

```bash
# 1. 看历史 migration
ssh tc-robin-claw 'sudo docker exec qloapps-postgres psql -U postgres -d qloapps -c   "SELECT migration_name FROM _prisma_migrations ORDER BY started_at DESC LIMIT 10;"'

# 2. 如果只是新加表/列，删掉即可
ssh tc-robin-claw 'sudo docker exec qloapps-postgres psql -U postgres -d qloapps -c   "DROP TABLE IF EXISTS new_table CASCADE;"'

# 3. 如果改了重要字段 + 数据已写入，restore DB backup
ssh tc-robin-claw 'sudo docker exec qloapps-postgres bash -c   "pg_restore -U postgres -d qloapps /var/backups/qloapps-<timestamp>.sql"'
```

### 11.4 跟其他链的联动

- 加字段 → §11 SQL → §3-6 docker 镜像（应用代码需要新 schema 才能启动）
- 加 enum value → §11 SQL → §3-6 镜像（应用代码 switch 需要新 value 编译）
- 加新表 → §11 SQL（不需要镜像重 build，Prisma client 会 lazy load schema）

---

## 12. 16 大历史事故硬约束（不要跳过）

## 11. 16 大历史事故硬约束（不要跳过）

| # | 事故 / 错误 | 永久规则 |
|---|---|---|
| 1 | 本地 build 时 sandbox 600s timeout + docker save/load 流截断 | **本机 sandbox background+notify build**（sandbox 600s cap 之后会迁到 background+notify=true, 等通知）。**不推荐远端 build**（磁盘 59GB 紧张 + RAM 7.5GB, build + `--no-cache` 必触发 no space left on device, dockerd 卡 commit layer 写不出 image ID） |
| 2 | `docker save/load` 失败后用 `docker tag` rename 假装新镜像（但 ID 没变） | **必须 `docker images` 验证镜像 ID 真的变了**（ID 不变 = 假 build） |
| 3 | 本地 push 到 github.com/townwenlv/wenlv-next，但 tc-robin-claw 上 origin = gitee | **远端必须 `git fetch github feat/<branch>:<branch>` + `git reset --hard github/<branch>`** 拉取 |
| 4 | `docker build --no-cache` 必须保留，否则 ENV layer 命中旧空值导致客户端 key 为空（静默解密失败） | 永久 `--no-cache` 必传（本机 sandbox + 远端都传）, 不能因为"远端有 cache"省略 |
| 5 | `docker compose up` 必须 `cd ~/workspace/wenlv-next` 后无 `-f` 执行，否则 NextAuth UntrustedHost 全站会话挂 | 命令字面量固定 |
| 6 | `git tag` 在 detached HEAD 上做 commit → push 不进分支 | **commit 前必须 `git checkout <branch>` + `git log <branch>` 确认** |
| 7 | COS 默认域名对 APK 分发返回 `403 DownloadForbidden` | **必须用备案自定义域名**（`dl.dayanwa.cn`）+ 设 `COS_APP_PUBLIC_BASE` |
| 8 | NextAuth admin 登录密码明文被 `CredentialsSignin` 拒绝 | **必须 MD5 无盐哈希**：`printf '%s' "$PWD" | md5sum` |
| 9 | API 响应是 AES 加密 `{payload: "..."}`，直接 jq 看不到数据 | **必须 openssl 解密**：`openssl enc -d -aes-256-cbc -md md5 -a -A -pass "pass:$API_ENCRYPTION_KEY"` |
| 10 | `version-check?platform=android` 报 `Invalid option` | **枚举 query 参数必须大写**：`platform=ANDROID` 不是 `android` |
| 11 | `adb install -r` arm64-only APK 到 x86_64 emulator → `dlopen failed: libflutter.so is for EM_AARCH64` | **emulator APK 必须含 x86_64**：`flutter build apk --release` (universal) |
| 12 | `flutter build apk --target-platform=android-arm64 --split-per-abi` 只生 arm64，emulator 装不上 | **默认 `flutter build apk --release`**（universal 多架构） |
| 13 | sed 在 ssh 双引号里嵌 `$VAR` → 字面量不展开 → nginx 出现字面 `$VAR` | **nginx sed 必须字面量，禁止 ssh 双引号嵌变量** |
| 14 | `docker ps` 看 Up X hours 误以为是新容器（实际是累加） | **新容器标志：`Up <duration> (health: starting)`** 表示 seconds-old |
| 15 | 远端 `docker images r<tag>` 看到旧 ID，build 卡在 step 24 久没新输出 | **Step 24 Next.js 编译需 5-10 min 不是 hang**，看 `docker stats <container>` 看 CPU 是否>0 |
| 16 | `subprocess.run(['cd', dir, '&&', 'cmd'])` 因 `'cd'` 是 shell builtin 找不到 | **Python 用 `workdir=` 参数**或 `cwd=` 或 `os.chdir` |
| 17 | `AppConfig.apiBaseUrl` 默认值 `'http://10.0.2.2:3000'` (emulator localhost) → 真机用户 version-check 永远打不通 → **永远不会触发 forceUpgrade 弹窗** | **默认必须为真测试域名 `http://192.144.253.205`**（保证未 dart-define 编译的老 APK 也能直连测试环境） | 2026-09-21 |
| 18 | `AppConfig.apiEncryptionKey` 默认值 `'qloapps_api_secret_key_2026_!@'` 与服务端真 64 字符 key 不匹配 → CryptoInterceptor 解密失败 → **version-check 响应静默解不出 data → 不弹窗** | **build 必须传 `--dart-define=API_ENCRYPTION_KEY=<真key>`**（脚本 `scripts/app-build.sh` line 102-104 已自动从容器取）。生产强制升级链路依赖此。 | 2026-09-21 |
| 19 | Flutter `String.fromEnvironment` 默认值在常量池，cache invalidation 不彻底 — 旧 build 的默认值字符串 (`10.0.2.2:3000`) 仍嵌在 APK 中 | **强制 flutter clean + 看 APK strings 验证 dart-define 真生效**（不应含旧默认值） | 2026-09-21 |
| 20 | `web_shell_page.dart` line 87/149 硬编码 `'http://192.144.253.205'` 而非 `AppConfig.webBaseUrl` | **不影响 version-check**，但容易让人误以为 app 已经 dart-define 化了。实际上 web 走硬编码，API 走 dart-define。 | 长期 (未修) |
| 21 | `subprocess.run(['cd', ...])` 跑脚本不传 `cwd=` → cwd 不对导致 `.env.test` source 失败 → `API_BASE_URL` 用错默认值 | **subprocess 必须显式传 `cwd=` + `env=...` + 把 env vars 显式 export**（不要依赖 shell 继承） | 2026-09-21 |
| 22 | **不能在测试服务器 tc-robin-claw 上 docker build**：磁盘仅 59G（96% 满）+ 内存 7.7G → Next.js 16 build 死锁 (`futex_wait_queue` step 25 `npm run build:cend-app-next` 卡死)+ aliyun apk mirror 慢/挂。 | **build 必须本地**（有 666G free + 32G mem），然后 `docker save \| gzip \| ssh tc-robin-claw 'gunzip \| docker load'` 传镜像。**禁止 ssh ... docker build**。 | 2026-09-21 |
| 23 | docker build step 24 `RUN npm run build` 死锁 → 看 `docker stats <container>` 显示 CPU 0% + log 0 增长 = 真死锁（不是慢）→ `kill -9 <pid>` 后重 build 用 cache 命中 step 1-23 即可秒过 | **死锁判定标准**：CPU 持续 < 1% + log size 30s 内不增 + elapsed > 5min + step 在 `RUN npm run build` / `next build` → 直接 kill 重 build（cache 跳过前 23 步只要 1-3 min） | 2026-09-21 |
| 24 | 部署前必须先修复 bug + 验证（emulator 装 APK + 截图）再部署 SPA，不能先部署后验证 | **部署顺序强制**：① Flutter APK 重 build + emulator 装机验证 ② SPA commit push ③ 远端 docker build + tag 翻转 ④ 验证 `version-check` 200 + curl 200。**禁止跳过 emulator 验证直接 docker build** | 2026-09-21 |
| 25 | Flutter native_tab_hide 切到 AI 蛙宝 Tab 时直播视频仍在后台播放（声音 + 画面） | `_triggerAiPanel` 必须 `el.pause() + el.muted = true`（not just pause，muted 阻止数据下载），所有 `document.querySelectorAll('video, audio')` 都要 try/catch 包装 | 2026-09-21 |
| 26 | AI 蛙宝全屏 + SPA BottomNav 没 hide + AiChatWidget 浮窗叠加 → 用户感觉「底部导航都没了」 | `PublicLayoutClient` 的 `hideBottomNav` + `isImmersivePage` 必须包含 `/chat/wabao` + `/app/chat/wabao` 两条（SPA nav 自动隐 + AiChatWidget 不叠加） | 2026-09-21 |
| 27 | emulator (`-no-window`) 装 APK 时 GPU/资源冲突会反复 offline → adb device 'not found' → 必须重启 emulator + 重装 + 重试，**最多重试 3 次**还不成就提交代码层验证 + 用户真机测试 | **emulator 不稳是已知问题**：装 APK 前 sleep 30s 等 boot 完成；adb 失败立即重连；emulator 不影响 code review 与真机部署 | 2026-09-21 |
| 28 | **盲目重建 core-server**: 用户报告 "core-server 还在 r20260921-13 镜像 (24h 前), 应该升上去" — 实际上 `r20260921-13` 是当时最新业务代码, 之后 24h 的 commit 全是 Dockerfile/build-arg/C 端 Flutter/部署脚本, **没有任何 `src/app/api/**` 或 `src/modules/**/backend/**` 改动**。盲目重建 core-server = 镜像 digest 换 + 重启期间 `/api/* /admin/* /merchant-console/*` 全 503 30s + 0 业务收益 | **判断标准**: "接口没变就别动"。core-server 跑的是根 `.next/standalone`, 业务代码改了才需要重建。判定方法: (a) `git diff <prev-commit>..HEAD --name-only` 检查 `src/app/api/` `src/app/(platform-admin)/` `src/app/(merchant-console)/` `src/modules/**/backend/` `src/modules/**/domain/` `prisma/schema.prisma` `next.config.*`; (b) 命中任一 → 重建; (c) 否则跳过, 节省中断。**自动化**: `build-and-publish.sh` 通过 `--build-arg GIT_COMMIT=$(git rev-parse HEAD)` 注入 commit SHA, 部署时拿上次 `rollback-pre-*` 镜像的 GIT_COMMIT 做 diff。详见 §6.0 决策表 | 2026-09-23 |

## 11.1 ⚠️ 2026-09-21 新增: docker-compose.yml app-web service 必须传 NEXT_PUBLIC_API_ENCRYPTION_KEY

**事故**: SPA bundle 在 docker build 时没拿到 key (app-web service env 没传), 客户端 `process.env.NEXT_PUBLIC_API_ENCRYPTION_KEY = ""`, `decryptApiResponse(raw, "")` → key 是 `""` 时 `if (!key) return raw` 走 raw 分支 → `data.success` undefined → throw ApiError → 显示"加载失败 - 网络似乎开小差了"。

**症状**: API 返 200 + 加密 payload, 但所有 SPA 页 (profile/following, profile/liked-videos, live/state, ... ) 都显示"加载失败"。

**修复**: docker-compose.yml app-web service environment 必须加:
```yaml
environment:
  - NEXT_PUBLIC_API_ENCRYPTION_KEY=${NEXT_PUBLIC_API_ENCRYPTION_KEY:-}
```
(跟 `app` service 一致, 缺一不可)

**验证**: 重 build 后 `docker exec qloapps-mobile-web printenv NEXT_PUBLIC_API_ENCRYPTION_KEY | wc -c` 应输出 65 (64 + 换行)。

**Flutter 兜底修复 (commit 6ddb9cd4)**: Flutter 端 web_shell_page.dart 加 `_injectApiEncryptionKey()` 运行时注入 `window.__apiEncryptionKey`, SPA 端 api-encryption.ts `decryptApiResponse` 优先用 build-time key, 缺失时 fallback 到 window 全局变量。

## 收尾

- 汇报：发布内容、镜像 tag、回滚点 tag、cend-pc release（如发布）、验证结果。
- 踩了新坑 → 追加到本 skill 或对应坑记忆文件 (`deploy-sop`)。

---

**与 `comprehensive-testing-workflow` 联动**:
- 本 skill §6-9 部署完成 → 综合测试 skill §6.1.3 验证 → §6.1.4 触发 APK 增量更新
- 完整链路: 需求(feature-dev) → 开发 → 构建(deployment) → 测试(comprehensive-testing) → 验证 PASS → 增量更新

**与 `feature-development-workflow` 联动**:
- 业务功能按 feature-development-workflow §0-§8 推进 → 部署阶段走本 skill
- §0.3 移动端 C 端红线 5 条 + §5.1.5 Skills 索引表 + AGENTS.md 索引
## §12 蛙宝工作流标准 (2026-09-21 用户反馈: "每个需求都要分析 + skill 筛选")

**核心原则**: 每次用户给需求, 必须按顺序做:
1. 接收需求 → 显式声明分析 (类型 + 涉及模块)
2. 列可能相关的 skills (至少 1 个, 最多 3 个)
3. 加载 skill + 读完整 SKILL.md 内容
4. 按 skill 走流程 (复用之前跑通的命令/参数)
5. 验证 + 给证据 (截图/SHA/curl/log)

**禁止**:
- ❌ 瞎想新方案 (用 skill 沉淀的)
- ❌ 改一处看不到完整链路 (复合 bug 容易搞出新问题)
- ❌ 之前淀的经验不用 (复用 commit + SHA + 命令)
- ❌ 不用 skill 就直接动手

**项目内 skill 触发映射**:
| 场景 | 加载的 skill |
|---|---|
| 修 Flutter / SPA bug | cend-app-build-deploy-verify |
| 发布新 APK / 触发升级 | cend-app-build-deploy-verify + deployment-workflow §10 |
| 部署 mobile-web 镜像 | deployment-workflow + cend-app-build-deploy-verify §2 |
| git 回退 / 合并冲突 | wenlv-git-sop |
| 发版 (C 端 APK 版本号) | wenlv-version-sop |
| 多端联级部署 (DB+API+H5+APK) | deployment-workflow + feature-development-workflow |
