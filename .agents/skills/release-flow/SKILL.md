---
name: release-flow
description: 记录 Coolie fork 四类资产的发布方式（SQL schema / API server / H5 web / APP client）。Use when 派活发版、改 db schema、改 server code、改 h5、改 expo app、或老板问"怎么发布 X"。让新匠人按本 skill 知道改完后要走哪条发布链路。
---

# Release Flow (Coolie Fork)

> 老板原话：「部署 skill 要记录SQL, api, h5, app 各自的发布方式吧」

## 1. 四类资产 + 发布方式

| 资产 | 路径 | 发布方式 | 触发的脚本 | 频率 |
|---|---|---|---|---|
| **SQL schema** | `packages/db/src/schema/*.ts` | Drizzle generate → 迁移 → 应用到生产 PGlite/postgres | `pnpm db:generate` + `pnpm db:migrate` + `ssh tc-coolie-claw ... migrate` | 改 schema 时 |
| **API server** | `server/src/**` | pnpm build → rsync 到 tc-coolie-claw → systemd restart coolie | `pnpm --filter @paperclipai/server build` + `scripts/deploy-tc-coolie-claw.sh` | 改 server 时 |
| **H5 web** | `clients/h5/src/**` | vite build → dist/ → rsync 到 tc-coolie-claw ui/dist/h5/ | `pnpm --filter @coolie/h5 build` + `scripts/prepare-server-ui-dist.sh` | 改 h5 时 |
| **APP client** | `clients/expo/src/**` | expo export → OTA bundle（runtimeVersion 不变）OR gradle assembleRelease + coscli（runtimeVersion 变）| `scripts/publish-ota.sh`（JS-only）/ `scripts/release-app.sh`（原生）| 改 expo 时 |

## 发版前必跑（⛔ 前置门禁）

**任何发版前必须跑 [`docs-coolie/PM-RELEASE-CHECKLIST.md`](../../../docs-coolie/PM-RELEASE-CHECKLIST.md) 全部 gate（26 项实列 + H1-H4 / I1 / J1-J3 = 34 项）**：
A1-A6 / B1-B4 / C1-C4 / D1-D3 / E1-E4 / F1-F3 / G1-G2 + H1-H4 / I1 + J1-J3。

跳过任何一项 ⛔ = **不发版**。PM 跑完签字。

### 之前发版的问题（反思）

- wave26 0.5.15 release commit 只 bump version，没 typecheck / test / export / build APK
- 导致 0.5.15 APK 没真发（wave27 披露）
- 修法：现在 wave26 之后任何 release commit 必须先跑 PM-RELEASE-CHECKLIST

> 每个被改的资产还要在发版前更新自己的 CHANGELOG 顶部（H1-H4）：
> `clients/expo/CHANGELOG.md`（App）/ `clients/expo-paperclip-web/CHANGELOG.md`（Coolie Web）/ `clients/h5/CHANGELOG.md`（h5）。

## commit 强制（boss 09-22 23:59 OOB）

任何发布物 (APK / OTA / h5) 必须有对应 git commit，否则版本丢失（无法回溯 / 重发）：

```
1. 发版前 git status 干净 (no modified tracked files)
2. commit hash 记入 version.json 的 commitSha 字段
3. commit push 到 origin
4. release-app.sh / publish-ota.sh / publish-h5.sh 在 bump version 前 sanity check
```

- `release-app.sh` 第 1.5 步：tracked 有改动即 abort（不发脏版本），untracked 只警告。
- `publish-ota.sh` / `publish-h5.sh`：工作区脏时仍发布，但打印 `[warning]` 提示先 commit。

> wave26 0.5.15 是真实案例：release commit 只 bump version，没 typecheck / build APK → APK 没真发（老板说「丢版本」）。
> 修法：现在每个发版 `release-app.sh` 第 1.5 步强制 sanity check。

## 2. SQL schema 发布（最易踩坑）

### 2.1 改 schema 流程

```
# 1. 编辑 packages/db/src/schema/<file>.ts
# 2. 导出 schema
pnpm --filter @paperclipai/db build

# 3. 生成迁移
pnpm db:generate
# → packages/db/drizzle/<timestamp>_<name>.sql 自动产生

# 4. 本地 PGlite 验证 (dev mode)
rm -rf data/pglite
pnpm dev
#   期望启动无 schema 错误

# 5. 测试运行
pnpm -r typecheck
pnpm test

# 6. 生产部署
ssh tc-coolie-claw
cd /opt/coolie/server
psql coolie < /path/to/new/migration.sql
# 或:   pnpm db:migrate

# 7. 重启服务
sudo systemctl restart coolie
```

### 2.2 注意

- 永远先在 dev PGlite 上跑一遍再上生产
- 改 schema 不许删除列，只能加列（数据迁移友好）
- 每次 schema 改都写 `packages/db/CHANGELOG.md` 一行

### 2.3 rollback

```
ssh tc-coolie-claw
#   看上次成功的迁移： ls /opt/coolie/db/migrations/
#   手动回滚
psql coolie < /opt/coolie/db/migrations/<previous>.sql
sudo systemctl restart coolie
```

## 3. API server 发布

### 3.1 改 server 流程

```bash
# 1. tsc 验证
pnpm -r typecheck   # 必须 0 errors

# 2. 单测
pnpm test

# 3. build
pnpm --filter @paperclipai/server build
# 产出 dist/

# 4. rsync 到生产
bash scripts/deploy-tc-coolie-claw.sh
# 内部: rsync server/ + 重启 systemd coolie

# 5. 烟测
curl -fsS https://xrobinai.cn/api/health
# 期望 200
```

### 3.2 rollback

- 服务端有 `scripts/rollback-latest.sh`（回滚到上一个 commit 版本）
- 紧急：ssh + `sudo systemctl restart coolie` + 改 systemd ExecStart 指 git HEAD~1

## 4. H5 web 发布

### 4.1 改 h5 流程

```bash
# 1. typecheck
pnpm --filter @coolie/h5 typecheck

# 2. build
pnpm --filter @coolie/h5 build
#   产出 clients/h5/dist/

# 3. rsync 到生产
bash scripts/prepare-server-ui-dist.sh
# 内部: 把 dist/ 拷到 /opt/coolie/ui/dist/h5/
#       Caddy 反代 /h5/* 到 ui/dist/h5/

# 4. 烟测
curl -fsS https://xrobinai.cn/h5/
# 期望 200 HTML
```

### 4.2 注意

- h5 单独 dev server `pnpm --filter @coolie/h5 dev` (localhost:5173)
- 生产走 Caddy 反代 `/h5/*`
- h5 与 expo **共享同 API**（`@coolie/api-client`），API 一变两端同时坏

### 4.3 rollback

- rsync 上一次成功的 dist/ 回去
- 或 `git checkout <last-green-commit> -- clients/h5/dist/`（dist 是 build artifact，gitignored，需要重 build）

## 5. APP client 发布

### 5.1 JS-only 改动（最常见）

```bash
# 1. expo export
pnpm --filter @coolie/expo export --platform android
# 产出 dist/ 或 .expo/

# 2. publish-ota
bash scripts/publish-ota.sh android
# 内部:
#   - expo export
#   - rsync 到 tc-coolie-claw:/opt/coolie/ui/ota/
#   - 服务端再生成 manifest (runtimeVersion 不变)

# 3. 烟测
curl -fsS https://xrobinai.cn/ota/manifest | jq '.createdAt'
# 期望是刚才的时间
```

**注意：runtimeVersion 不变 = expo-updates 接受新 bundle 作为 patch，不 bump version.json。**

> `runtimeVersion` 必须与**装机 APK 的原生值**一致，否则 bundle 只下载不加载 —— 口径与
> 门禁见 skill `ota-runtime-version-consistency`（`runtime-version.mjs` 是唯一来源）。

### 5.2 原生改动（gradle / keystore / 新权限）

```bash
# 1. bump version (script 自动)
bash scripts/release-app.sh
# 内部:
#   - app.json 0.5.0 → 0.5.1
#   - android/app/build.gradle versionCode 500 → 501
#   - gradle assembleRelease
#   - coscli upload cos://gzbucket/coolie/app/0.5.1/coolie-release.apk
#   - version.json → 0.5.1 / 501
#   - OTA bundle → runtimeVersion 0.5.1（原生 runtime 同值，release-app 会断言，见 ota-runtime-version-consistency）
#   - CHANGELOG 加段
#   - commit + push

# 2. 烟测
curl -fsS https://dls.xrobinai.cn/coolie/app/0.5.1/coolie-release.apk -I | head -3
# 期望 200
curl -fsS https://xrobinai.cn/version.json
# 期望 version=0.5.1, versionCode=501
```

### 5.3 rollback

- **OTA 坏**：ssh + 回滚 bundle 到上一个（`/opt/coolie/ui/ota/` 备份）
- **APK 坏**：coscli 改 version.json 指回旧 APK URL
- **完全坏**：重发上一个版本（`scripts/rollback-latest.sh` 类似 server）

## 6. PM 派单前的发布决策树

```
老板说「改 X」
   ↓
X 改的是什么层？
├── SQL schema      → 走 §2 Drizzle 流程
├── API server      → 走 §3 build + rsync + restart
├── H5 web          → 走 §4 build + dist rsync
└── APP client
   ├── 仅 JS 改      → 走 §5.1 publish-ota
   ├── 原生 + 权限  → 走 §5.2 release-app
   └── 大版本       → 走 §5.2 release-app + version.json bump
```

## 7. 关键纪律

1. **生产前必跑 typecheck + test**（不允许跳）
2. **schema 改先 PGlite 验证**（不允许直接上生产）
3. **bundle/dist 不入 git**（`.gitignore` 已加）
4. **不发版不发 OTA 不 rsync 不重启** = 没交付
5. **每次发布 PM 签字**（PM-RELEASE-CHECKLIST 34 项 gate）

## 8. 跨类发布冲突场景

| 场景 | 处理 |
|---|---|
| 改 schema + 改 server | 先 §2 发布迁移 → 再 §3 发 server（新代码依赖新 schema） |
| 改 h5 + 改 app 共享 component | 先两端 typecheck，再 §5.1 OTA 一次（runtimeVersion 不变 = 两端 JS bundle 都拉）|
| 改 server + 改 app 共享 API 契约 | 先 §3 发 server → 再 §5.1 OTA app（app 用新契约，但兼容 stub）|
| bump APK + 同时 JS 改 | 先 §5.2 release-app（包含 OTA）|

## 9. 文件引用

- `scripts/publish-ota.sh` —— OTA JS-only 发布
- `clients/expo/scripts/runtime-version.mjs` —— runtimeVersion 唯一口径（APK 真值优先）
- `clients/expo/scripts/verify-ota-runtime-consistency.mjs` —— 三处一致性门禁
- `scripts/release-app.sh` —— APK + OTA + version.json 一起发
- `scripts/release-lib.sh` —— 共享发布工具
- `scripts/release.sh` —— 通用发布入口
- `scripts/deploy-tc-coolie-claw.sh` —— 生产部署
- `scripts/prepare-server-ui-dist.sh` —— h5 dist 同步
- `scripts/rollback-latest.sh` —— 紧急回滚
- `docs-coolie/PM-RELEASE-CHECKLIST.md` —— 34 项 gate
- `docs-coolie/Coolie-FORK-BOUNDARY.md` —— 哪些动哪些不动

## 10. 测试

跑过 release-flow 的可参照 commit：

- `8a9e984a5` v0.5.0 完整 release（§5.2 路径）
- `c416bd380` screenshots ignore（gitignore 改）
- `74c785402` 测试员工改派 cmd（claude catalog 错误）
- `d51c7a4e6` OTA publish wave1（§5.1 路径）