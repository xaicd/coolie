# wave233 QA 报告 — 自动化发版链 (App + Server + Web 同步)

> **波次**: wave233
> **日期**: 2026-09-30
> **范围**: 纯脚本 — `scripts/release-app.sh` / `scripts/publish-ota.sh` / `scripts/auto-deploy-all.sh`(新) / `scripts/lib/auto-deploy.sh`(新) / `scripts/__tests__/auto-deploy.test.mjs`(新) / `scripts/fork-surface.json`
> **不动**: server / ui / clients/expo 已发版的 0.6.8 APK + OTA bundle (纯脚本改动, 不带任何代码 deploy)
> **commit type**: `chore(auto-deploy-all)` (按 brief)

---

## 1. 真因 (老板原话 PM 反讲完 OK)

> "打包升级会先更新服务器的版本吗? app 在升级, 后端 web 是否该一起升级"

之前 wave218 APK 0.6.8 已发, 但 server 没 deploy (PM 漏跑 `deploy-tc-coolie-claw.sh`).
server 还跑老代码 (启动 19:40, 早于 wave215 push 20:29). App 0.6.8 + Server 0.6.5 版本不一致.

---

## 2. 改动汇总

### 2.1 `scripts/release-app.sh` (+63 / -7)

| 段 | 改动 |
|---|---|
| 顶部注释 | 加 `--with-server-deploy / --skip-server-deploy / --with-4-guard / --skip-4-guard` 4 flag 说明 |
| step `[10/11]` | 默认 server deploy (历史 step 10 不变, 改为 step 10/11 流程号) |
| step `[11/11]` | 新增 4 护栏, `--with-4-guard` 启用, 默认 OFF (老用法兼容) |
| 顶部 source | `scripts/lib/auto-deploy.sh` (共享 lib) |
| flag parsing | 加 `--with-server-deploy` / `--with-4-guard` 正向 flag |
| 汇总输出 | 加 "4 护栏" 行 |

净新增 `+63 / -7` (扣掉 step 10 改 step 10/11 重命名 + 顶部注释扩写)

### 2.2 `scripts/publish-ota.sh` (+63 / -0)

| 段 | 改动 |
|---|---|
| 顶部注释 | 加 `--server-deploy / --4-guard` flag 说明 |
| flag parsing | 加 `SERVER_DEPLOY` / `RUN_4_GUARD` 两个变量, 默认 OFF |
| 底部 | `if SERVER_DEPLOY=1 → deploy-tc-coolie-claw.sh --skip-build` |
| 底部 | `if RUN_4_GUARD=1 → ad_guard_4`, APK_URL 从远端 `version.json.downloadUrl` 读 |

注: 默认 OFF 是有意 — publish-ota.sh 历史是 "OTA-only" 出口 (JS 增量, 不改 server).
加 flag 让 "改 shared/schema 后想一锅出" 场景能用同一入口, 但不破现有 PM SOP.

### 2.3 `scripts/auto-deploy-all.sh` (新, +215)

PM 调度一锅端 — 把 release-app.sh + publish-ota.sh + (idempotent) server deploy +
version.json 重推 + 4 护栏 串成一条链. 6 步. 6 个 flag.

不替换 release-app.sh / publish-ota.sh, 是 wrapper — 调用它们. 这样老用法 (老板手动跑
release-app.sh) 100% 不变, PM 调度新增 `auto-deploy-all.sh`.

### 2.4 `scripts/lib/auto-deploy.sh` (新, +236)

共享 bash lib:
- `ad_log` / `ad_die` / `ad_run` / `ad_step` — 基础 helper
- `ad_guard_4` — 4 护栏核心, version.json / ota/manifest / APK HEAD / /api/health,
  每个 guard 写 evidence 文件 + 返回 PASS/FAIL

跟 scripts/lib/mcp-install-common.sh 同位 (wave228 的 fork-owned bash lib 模块),
同一理由 — `scripts/lib/` 是 fork-owned, 见 scripts/check-fork-surface.mjs OWNED_PREFIXES.

### 2.5 `scripts/__tests__/auto-deploy.test.mjs` (新, +165)

node:test 11 case — `--help` 文本 / bash -n / flag 互斥 / bad version 拒绝 / dry-run end-to-end / 4-guard PASS 行.

跟 `install-mcp-shims.test.mjs` (wave228) 同 pattern.

### 2.6 `scripts/fork-surface.json` (+36 / -6)

| 段 | 改动 |
|---|---|
| `scripts/publish-ota.sh` | budget 30→80, maxTotal 40→120, reason 加 wave233 说明 |
| `scripts/release-app.sh` | budget 250→320, maxTotal 420→500, reason 加 wave233 说明 |
| `scripts/lib/auto-deploy.sh` | 新 entry (maxNet 240, maxTotal 240) |
| `scripts/auto-deploy-all.sh` | 新 entry (maxNet 240, maxTotal 240) |
| `scripts/__tests__/auto-deploy.test.mjs` | 新 entry (maxNet 200, maxTotal 200) |

---

## 3. 4 护栏 (本波定义 + 实测)

### 3.1 4 护栏定义 (scripts/lib/auto-deploy.sh `ad_guard_4`)

| # | 名称 | 检查项 | 期望 |
|---|---|---|---|
| 1 | version.json | `GET https://xrobinai.cn/version.json` | HTTP 200 + body JSON 有 `version` 键 |
| 2 | ota/manifest | `GET https://xrobinai.cn/ota/manifest` | HTTP 200 + body JSON 有 `runtimeVersion` 键 |
| 3 | APK HEAD 直链 | `HEAD <APK_URL>` (默认 `https://dls.xrobinai.cn/coolie/app/<VERSION>/coolie-release.apk`) | HTTP 200 或 206 |
| 4 | api/health | `GET https://xrobinai.cn/api/health` | HTTP 200 + body JSON `status == "ok"` |

每护栏都写 evidence:
- `version.json` ← 第 1 护栏 raw response (743 B, 字段全)
- `ota-manifest.json` ← 第 2 护栏 raw response (6.7 KB)
- `apk-headers.txt` ← 第 3 护栏 curl -D 头 (436 B, 含 Content-Length + ETag)
- `api-health.json` ← 第 4 护栏 raw response (240 B)

跟 wave218 证据格式 100% 一致 (同一 4 护栏定义, 同样 4 文件). 证据文件落 `$AUTO_DEPLOY_EVIDENCE_DIR`,
默认 `./docs-coolie/evidence/wave233/`. PM 调度脚本可换 `--evidence-dir`.

### 3.2 实测 (本机 dry-run + 真网络)

#### 3.2.1 lib 真实网络跑 4 护栏

```sh
VERSION=0.6.8 bash -c '
. scripts/lib/auto-deploy.sh
ad_guard_4 docs-coolie/evidence/wave233
'
```

输出:
```
─── 4 护栏汇总 ─────────────────────────────────
  PASS  version.json     https://xrobinai.cn/version.json
  PASS  ota/manifest     https://xrobinai.cn/ota/manifest
  PASS  apk-head         https://dls.xrobinai.cn/coolie/app/0.6.8/coolie-release.apk  (200)
  PASS  api/health       https://xrobinai.cn/api/health
─────────────────────────────────────────────────
```

证据文件:
- `version.json` (743 B) — version=0.6.8, versionCode=608, commitSha=6dc0f0dc14e7921d9cf36beae4b8c2aea41296aa
- `ota-manifest.json` (6.7 KB) — runtimeVersion=0.6.8
- `apk-headers.txt` (436 B) — HTTP 200, Content-Length=83811810
- `api-health.json` (240 B) — status=ok

#### 3.2.2 失败路径 (模拟 99.99.99 假 APK)

```sh
VERSION=99.99.99 bash -c '
. scripts/lib/auto-deploy.sh
ad_guard_4 /tmp/wave233-fail
'
```

输出:
```
[auto-deploy] 护栏 3 失败: APK HEAD HTTP=404 (期望 200/206) — COS 对象可能没上传成功

─── 4 护栏汇总 ─────────────────────────────────
  PASS  version.json     https://xrobinai.cn/version.json
  PASS  ota/manifest     https://xrobinai.cn/ota/manifest
  FAIL  apk-head         HTTP=404
  PASS  api/health       https://xrobinai.cn/api/health
─────────────────────────────────────────────────
[auto-deploy] 失败: 4 护栏未全绿 — 拒绝确认发版成功. 见上方 FAIL 行 + 证据目录 /tmp/wave233-fail
```

exit code = 1. fail-loud 设计 OK.

---

## 4. 验证清单

### 4.1 必跑 (本波 spec)

```sh
# QA 要求 1: scripts/release-app.sh --help 显示 --with-server-deploy / --skip-server-deploy
bash scripts/release-app.sh --help
# ✓ 输出含 --with-server-deploy / --skip-server-deploy / --with-4-guard / --skip-4-guard 4 行

# QA 要求 2: scripts/auto-deploy-all.sh --dry-run 真跑
bash scripts/auto-deploy-all.sh --dry-run 9.9.9 "wave233 sanity" --skip-app-build --skip-ota --skip-server --skip-4-guard
# ✓ 6 step 顺序打印, exit 0, evidence dir 创建 (dry-run 不真写文件)

# QA 要求 3: typecheck pass
pnpm -r typecheck
# ✓ Done (zero errors)

# QA 要求 4: 报告 docs-coolie/evidence/wave233/QA-REPORT.md
# ✓ 本文件
```

### 4.2 加跑 (自动测试)

```sh
node --test scripts/__tests__/auto-deploy.test.mjs
# ✓ 11/11 PASS in 178ms
```

11 case:
1. release-app.sh --help shows new wave233 flags
2. release-app.sh bash -n parses cleanly
3. release-app.sh --with-server-deploy + --skip-server-deploy are mutually exclusive at parse time (last wins)
4. publish-ota.sh --help shows new wave233 flags
5. publish-ota.sh bash -n parses cleanly
6. auto-deploy-all.sh --help shows all wave233 flags
7. auto-deploy-all.sh bash -n parses cleanly
8. auto-deploy-all.sh rejects bad version
9. auto-deploy-all.sh dry-run end-to-end with all skip flags
10. auto-deploy.sh lib ad_guard_4 in dry-run prints 4 PASS lines
11. auto-deploy.sh lib bash -n parses cleanly

### 4.3 加跑 (跟 wave228 共跑, 不冲突)

```sh
node --test scripts/__tests__/install-mcp-shims.test.mjs scripts/__tests__/auto-deploy.test.mjs
# ✓ 22/22 PASS in 1848ms (11 + 11)
```

### 4.4 fork-surface gate

```sh
node scripts/check-fork-surface.mjs --range=HEAD
# ✓ PASS — 7 declared upstream file(s) within budget (含 wave228/231 残留的 check-fork-surface.mjs)
```

5 个新/改文件预算:
- `scripts/release-app.sh`: 70/320 ✓
- `scripts/publish-ota.sh`: 63/80 ✓
- `scripts/auto-deploy-all.sh`: 215/240 ✓
- `scripts/lib/auto-deploy.sh`: 236/240 ✓
- `scripts/fork-surface.json`: 42/200 ✓

---

## 5. 不动 (明确边界)

- ❌ 不动 `server/` — 0.6.5 已发版, 无新代码
- ❌ 不动 `ui/` — 0.6.8 已发版, 无新代码
- ❌ 不动 `clients/expo` — 0.6.8 APK / OTA bundle 已发, 无新代码
- ❌ 不 bump version.json — 本波纯脚本改动, 不动 App 版本号
- ❌ 不动 wave230 chip / wave231 DS / wave232 skills / wave225-229 docs
- ❌ 不发 APK — brief 明确 "纯脚本"

---

## 6. 老板拍板材料

### 拍板点 1: 默认 server 联动 — 走 wave233 默认开 (PM 倾向)

**选项 A**: `release-app.sh` 默认 server 联动 (本波已实现, `--skip-server-deploy` 跳过)
**选项 B**: `release-app.sh` 默认不联动, 显式 `--with-server-deploy` 才跑

PM 倾向 **A**, 理由:
- 跨端变更只发客户端的 404 bug (wave105) 是已知的真实事故, 默认联动是最便宜的预防
- 老板手动跑 server 时, 加 `--skip-server-deploy` 一行即可
- 老板原话 "App 升级后端 web 是否该一起升级" — 默认联动直接回答 "是的"

### 拍板点 2: 4 护栏默认 ON 还是 OFF — 走 wave233 默认 OFF (PM 倾向)

**选项 A**: 默认 OFF, `--with-4-guard` 启用 (本波实现)
**选项 B**: 默认 ON, `--skip-4-guard` 跳过

PM 倾向 **A**, 理由:
- 默认 OFF 100% 兼容 wave218 之前的发版 SOP, 不破任何老用法
- 老板手动跑发版可加 `--with-4-guard` 出验收报告 (PM 调度场景)
- 默认 ON 会让每次发版多 30s 网络 IO, 老板手动发版不一定要这一层

### 拍板点 3: `auto-deploy-all.sh` 是否常驻 Paperclip schedule

**选项 A**: 现在只挂在 brief, 老板手动用
**选项 B**: 接 Paperclip 自动调度 (heartbeat / cron) — 每天 09:00 自动发?

PM 倾向 **A**, 理由:
- 本波 brief 是 "提供工具", 不是 "自动定时"
- 接调度 = wave234+1 议题, 要先有 DS 投产一票否决 (已在 release-app.sh step 0/9)

---

## 7. 风险评估

| 风险 | 缓解 |
|---|---|
| `ad_guard_4` 跟 wave218 老 manual 4 护栏有微小差异 (e.g. 解析 JSON 用 python3 vs jq) | 都生成 4 个 evidence 文件 (同名), 字段一致. wave218 evidence (`docs-coolie/evidence/wave218/`) 直接 cp 复用 |
| `auto-deploy-all.sh` 在 release-app.sh 跑过后再调一次 publish-ota.sh — 是否会重发 OTA? | 是. OTA 是幂等的 (expo export + rsync, 重复跑 = 浪费 IO 不破产物). 注释明示 "step 2 是 idempotent 重跑" |
| `--evidence-dir` 路径不存在时, lib 会 mkdir -p — 老板写错路径会留垃圾目录 | 失败不致命, 只是 mkdir; exit code 仍以 4 护栏真值为准 |
| fork-surface budget 提了一档 — 后续 wave 还会继续加 flag | 每次 +20-30 算正常增长; maxTotal 500/240/240 都还有空间 |

---

## 8. 老板真机 (可选, post-merge)

不发 APK, 但 merge 后 PM 可选跑一次完整 dry-run 端到端:

```sh
bash scripts/auto-deploy-all.sh --dry-run 9.9.9 "wave233 dry-run 端到端"
# 期望: 6 step 打印, OTA / server / version.json 全部 dry-run, exit 0
```

老板要看 4 护栏真值的话 (不真发, 只验):

```sh
VERSION=0.6.8 bash -c '
. scripts/lib/auto-deploy.sh
ad_guard_4 /tmp/wave233-boss-check
'
# 期望: 4 PASS, /tmp/wave233-boss-check/ 下 4 个证据文件
```
