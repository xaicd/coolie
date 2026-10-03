---
name: docker-compose-env-discipline
description: 改 docker-compose.yml / override / Dockerfile 时的强制 env 注入门禁。覆盖 4 类常踩坑：(1) image baked env 缺失；(2) container runtime env 不重读；(3) compose interpolation `${VAR}` 误改成字面量；(4) env_file 与 environment 字段混淆。触发：任何 PR 触及 docker-compose*.yml / Dockerfile。
license: project-internal
---

# Docker Compose Env 注入纪律

> **Why**: 2026-09-22 22:41 + 2026-09-23 00:13 同根因 4h 内连踩两次 (mobile-web 缺 AUTH_URL 全 307 /setup)。Hermes 改了 compose 但 image baked env 没注入, 重建容器时 `--force-recreate` 不重读 env。

## 0. Env 的 3 个生命周期阶段

| 阶段 | 谁注入 | 时机 | 漏注入的后果 |
|---|---|---|---|
| **A. image baked env** | Dockerfile `ARG/ENV` 或 `docker build --build-arg` | build 时 | 镜像内 `process.env.X` 永远缺失 |
| **B. container runtime env** | docker-compose `environment:` / `env_file:` | container 启动时 | 容器内 `process.env.X` 缺失（但镜像可能有）|
| **C. request-time env** | K8s configmap / container runtime 更新 | 请求处理时 | 同 B |

**关键陷阱**：**A 和 B 是两件事**。改了 B（compose）不等于改了 A（image）。

## 1. 改 compose 文件前的 4 问

| 问 | 必须有答案 |
|---|---|
| Q1. 这个 env 是 SSR server 用的还是 client 用的？ | server → 必须走 A + B 双注入；client → 只走 A (NEXT_PUBLIC_*) |
| Q2. image 里的 baked env 是否已经覆盖？ | 看 Dockerfile 的 `ARG/ENV` 段 |
| Q3. 如果改的是 `environment:`, 是否会触发 image rebuild？ | **不会**——只重启容器，但要看下面 Q4 |
| Q4. `docker compose up -d --force-recreate` 是否会重读 env？ | **不会**——已有容器 env 不变 |

## 2. 强制门禁（4 选 1 + 都得跑）

### 2.1 改 Dockerfile 前

```bash
# dry-run: compose config 必须能解析
docker compose -f docker-compose.yml -f docker-compose.override.yml config > /dev/null

# dry-run: ARG/ENV 配对是否完整
grep -E "^ARG [A-Z_]+=\"\"$" Dockerfile | awk '{print $2}' | sed 's/=//' | while read var; do
  grep -q "^ENV $var=\${$var}$" Dockerfile || { echo "❌ ARG $var 缺对应 ENV"; exit 1; }
done
```

### 2.2 改 docker-compose.yml 前

```bash
# 关键 var 必须在 environment/env_file 段出现 (不区分 server/client)
for v in API_ENCRYPTION_KEY AUTH_URL NEXTAUTH_URL APP_PUBLIC_URL DATABASE_URL; do
  grep -q "$v" docker-compose.yml docker-compose.override.yml 2>/dev/null \
    || { echo "❌ $v 在 compose 中找不到"; exit 1; }
done

# interpolation 格式校验
docker compose config 2>&1 | grep -E "invalid interpolation|error" && exit 1

# 真值校验 (强制 ${POSTGRES_USER:-postgres} 这类 default fallback 存在)
grep -nE "\\\${[A-Z_]+:-" docker-compose.yml | head
```

### 2.3 改 env_file (.env / .env.test) 前

```bash
# ❌ 反例 1: .env.test 含 ${POSTGRES_USER:-...} 直接 docker compose up → interpolation error
# ✅ 正确: docker-compose 用 env_file 字段而非 environment 注入 .env
# ✅ 正确: .env 文件值用 : 而非 = 转义

# 真值校验
[ -f .env ] && for v in POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB API_ENCRYPTION_KEY; do
  grep -q "^$v=" .env || echo "⚠️  $v 不在 .env"
done
```

### 2.4 改 override.yml 前

```bash
# override 必须与 base 同名 service 名
for svc in app app-web; do
  grep -q "^  $svc:" docker-compose.override.yml || echo "❌ override 缺 $svc service"
done

# override 的 environment 与 base 不冲突 (Docker compose 行为: 后写覆盖前写)
docker compose -f docker-compose.yml -f docker-compose.override.yml config --format json 2>/dev/null \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('OK', len(d['services']))" \
  || exit 1
```

## 3. 部署 SOP（来自 deployment-workflow skill §6）

```bash
# ⚠️ 绝对不要: docker compose up -d --force-recreate (它不重读 env)
# ⚠️ 绝对不要: docker restart (只重启进程, env 不变)
# ✅ 必须先 stop + rm -f:

# 推荐一键 (2026-10-03 整改, audit §7.1 M4)
npm run recreate:container:test app-web
# 内部: tag latest → rollback-pre-<ts>; stop + rm -f + up --no-deps

# 传统手工方式 (保留兼容)
ssh tc-robin-claw 'cd ~/workspace/wenlv-next \
  && sudo docker compose stop app-web 2>&1 \
  && sudo docker rm -f qloapps-mobile-web 2>&1 \
  && sudo docker compose up -d --no-deps app-web 2>&1'
```

## 4. 部署后自动校验（CI 友好）

### 4.1 一键脚本（2026-10-03 整改）

```bash
# 一键跑 7 项校验: 2 个 env 数量 + 5 个 curl (audit §7.1 M6/M7)
npm run post-deploy:verify:test
```

不通过 → 立即停止部署, 修复后再跑。详见 `scripts/deploy/post-deploy-verify.sh`。

### 4.2 静态门禁（CI 必跑）

```bash
# 静态扫描 compose ${VAR} / pgbouncer AUTH_TYPE / override 漂移 (audit §4.2 P0)
npm run check:env-injection-lint
```

违规分两类:
- **ERROR** (exit 1): UNDEFINED_ENV_VAR / LOCALHOST_LITERAL_DEFAULT / OVERRIDE_ORPHAN_SERVICE / PGBOUNCER_AUTH_TYPE_MD5
- **WARN** (exit 0): EMPTY_DEFAULT — SECRET/KEY 类空 fallback 是历史故意 (image baked env 必须 build-arg 强传)

详见 `scripts/guardrails/env-injection-lint.guard.ts` + 对应 `.guard.test.ts`。

### 4.3 传统手工方式（保留兼容）

```bash
# 强校验: 每个 service 的关键 env 是否在 container 内出现
check_container_env() {
  local svc="$1" container="$2" expected_vars="$3"
  ssh tc-robin-claw "sudo docker exec $container env | awk -F= '{print \$1}' | grep -E '^($expected_vars)\$' | wc -l"
}

# mobile-web 必须有 3 个 URL env
got=$(check_container_env app-web qloapps-mobile-web 'AUTH_URL|NEXTAUTH_URL|APP_PUBLIC_URL')
[ "$got" -eq 3 ] || { echo "❌ mobile-web env 缺 (got=$got, expect=3)"; exit 1; }

# core-server 必须有 4 个 (URL+KEY)
got=$(check_container_env app qloapps-core-server 'AUTH_URL|NEXTAUTH_URL|API_ENCRYPTION_KEY|DATABASE_URL')
[ "$got" -eq 4 ] || { echo "❌ core-server env 缺"; exit 1; }

# 路由真值校验 (mobile-web SSR 即使没 AUTH_URL 也会回 200, 但所有页面 307→/setup)
curl -sS -o /dev/null -w '/app/explore %{http_code}\n' http://192.144.253.205/app/explore | grep -q 200 \
  || { echo "❌ /app/explore 路由异常 (期望 200)"; exit 1; }
```

## 5. 4 类常踩坑速查

| 错 | 表现 | 修复 |
|---|---|---|
| Dockerfile 没 `ARG X / ENV X` | image baked env 永久缺失 | Dockerfile 加 ARG/ENV 配对 |
| docker-compose 改了 environment 但 image 是旧的 | 容器重启后 env 仍缺失 | 必须 rebuild image (重新 baked) |
| `docker compose up --force-recreate` | 跳过 env 重读 | 改用 `stop + rm + up` |
| `${VAR:-default}` 改成 `${VAR:***` | compose parse error | 恢复 `:-` 形式 (Hermes 错 B) |

## 5.1 env-schema 强校验 (audit §7.1 S2)

`env-injection-lint` 校验**结构**(compose ${VAR} 有没有定义 / override 漂移 / pgbouncer md5),
但**不校验值正确性**。`env-schema` 是姊妹守卫, 校验**值**:

```bash
npm run check:env-schema          # 守卫脚本
npm run check:env-schema:test     # 12 个单元测试 (7 类规则 + 4 sanity)
```

7 类规则 (跟 audit §7.1 S2 一一对应):

| ID | 规则 | 严重度 | 历史事故 |
|:---|:---|:---|:---|
| **S2-R1** | `API_ENCRYPTION_KEY` 必须 64 字符 (NEXT_PUBLIC_* >=16) | `.env.test`=ERROR / `.env`=ERROR / `.env.base`=WARN | 空 key → SPA decryptApiResponse 静默失败 |
| **S2-R2** | `*_URL` 必须合法 URL + 含 scheme + `.env.test` 下 INTERNAL_URL 必须非 localhost | `.env.test`=ERROR / `.env`=WARN / `.env.base`=WARN | `AUTH_URL=localhost` → SSR proxy fetch 自己 404 |
| **S2-R3** | `DATABASE_URL/REDIS_URL/S3_ENDPOINT` 必须含 scheme:// | ERROR | `localhost:5432` 容器连不上 |
| **S2-R4** | `NEXT_PUBLIC_API_ENCRYPTION_KEY` 与 `API_ENCRYPTION_KEY` 长度差 <= 16 | ERROR | 一半边有半边无 → SPA 用空 key 解密 |
| **S2-R5** | 必填 key (`NEXT_PUBLIC_*, API_*, AUTH_*`) 不允许空值 | ERROR | `API_ENCRYPTION_KEY=""` → SPA 解密失败 |
| **S2-R6** | `AUTH_URL/APP_PUBLIC_URL` path 应以 `/app` 或 `/app/` 开头 (mobile-web basePath=/app) | WARN | SSR proxy 路径错配 → 404 |
| **S2-R7** | `NEXT_PUBLIC_*` 与服务端同名 var 必须成对存在 | WARN | 镜像对错 |

**部署前拦截**: `scripts/deploy/build-and-publish.sh` 守卫 0.6 自动跑 `check:env-schema`,
违规即 exit 1。escape hatch: `SKIP_ENV_SCHEMA=true` (不推荐)。

严重度分级:
- **`.env.test`** (部署目标) = ERROR — 任何违规阻断 CI/部署
- **`.env`** (本地开发) = 混合 — 空必填/URL 错仍是 ERROR, basePath 是 WARN
- **`.env.base`** (dev 模板) = WARN — dev key 短/host 是 localhost 是预期

## 6. pgbouncer AUTH_TYPE base 化 (audit §7.1 S3)

**历史事故** (2026-09-25 pgbouncer 漂移事故链):
1. 有人把 base 的 `AUTH_TYPE: scram-sha-256` 误改成 `md5` (postgres:16 默认 SCRAM, md5 不匹配)
2. override 又写一份 `AUTH_TYPE: scram-sha-256` 兜底, 本机跑没事
3. 生产环境没 override, 直接用 base 的 `md5` → 所有 DB 连接 SASL 鉴权失败 → 502

**S3 整改目标**: base 唯一来源 + override 不准碰 + 认证字面强制 `${POSTGRES_*}`。

```bash
npm run check:pgbouncer-base          # 4 道守卫 (exit 0-5)
npm run check:pgbouncer-base:test     # 6 个反例 (T1 真实仓库 / T2-T6 5 类违规)
```

**4 道守卫**:

| 门禁 | 检查 | 退出码 |
|:---|:---|:---|
| 1 | base pgbouncer 段存在 | exit 4 (缺失) |
| 2 | base `AUTH_TYPE=scram-sha-256` 强制 | exit 1 (缺失) / exit 2 (值错) |
| 3 | override **禁止**重定义 AUTH_TYPE | exit 3 (重复定义) |
| 4 | base `DB_USER/DB_PASSWORD/DB_NAME` 必须 `${POSTGRES_*}` | exit 5 (硬编码字面) |

> 注: `DB_HOST/DB_PORT` 是内网 service 寻址 (`postgres:5432`), 不需要 `${}`, 只挡认证 3 key。

**部署前拦截**: `scripts/deploy/build-and-publish.sh` 守卫 0.7 自动跑 `check:pgbouncer-base`。
escape hatch: `SKIP_PGBOUNCER_CHECK=true` (不推荐)。

**互补 lint**: env-injection-lint.guard.ts 的 R4 只挡 `md5`, 不能挡:
- base 写 `trust` / 任意值 (S3 exit 2 补上)
- override 重复定义 (S3 exit 3 补上)
- 硬编码字面 (S3 exit 5 补上)

**已落地修复** (本次 commit):
- `docker-compose.override.yml` 删除重复 `AUTH_TYPE: scram-sha-256` (一行), 注释更新为 "S3 防 base 改了生产不感知"
- 保留 `LISTEN_PORT: "6432"` (这才是 override 该做的: 内网寻址调)

## 7. 与其他 skill 协同

- `incident-postmortem/` — 踩坑后强制沉淀
- `deployment-workflow/` §3 §6 §7 — 本 skill 是其细化
- `rollback-discipline/` — env 错配时的回滚 SOP
- `nextjs-basepath-gotcha/` — 为什么 mobile-web env 缺失是隐形灾难