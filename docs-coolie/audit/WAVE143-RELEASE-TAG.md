# WAVE143 — 提交推送 + 发版 0.5.97 + 里程碑 tag

- 日期: 2026-09-29
- wave: wave143（boss 2026-09-28 OOB:「提交推送,同时打包升级,留版本tag」）
- 分支: `main`
- 本报告: A) 提交推送 · B) 发版 0.5.97 · C) 里程碑 tag · D) 部署护栏 —— 逐项证据
- 纪律: 未碰 `PAPERCLIP_API_KEY` / `DEPLOYMENT_MODE`；**未改 server 代码**；未用 agy；提交按**显式路径**，未卷入他人 untracked 文件

---

## 0. 结论速览

| 项 | 结果 | 证据 |
|---|---|---|
| A. 交付物提交 | ✅ 4 个 commit 落 `main` 并已推送 | §1（commit hash + push 回执） |
| B. 发版 0.5.97（App APK + version.json + OTA） | ✅ APK 出包上传、version.json/OTA 均 0.5.97 | §2 |
| B. Web 部署（加固脚本） | ✅ `DEPLOYED main@bc48b1e80`，ui 真重建 | §4 |
| C. 里程碑 tag `v0.5.97` | ✅ 本地建 + 远端推送 | §3（tag 回执） |
| D. 部署护栏 | ✅ version.json / ota/manifest / health / filing / www 全绿（前后各一次） | §4 |

---

## 1. A) 提交推送

### 1.1 本次新增的 4 个 commit（`main`）

| # | commit | 类型 | 说明 |
|---|---|---|---|
| 1 | `7946c9a4e` | `feat(ui)` | wave142 沙箱附件组件 + 看板/工坊对话内联渲染 HTML 交付物（5 文件） |
| 2 | `ae838c536` | `docs(skills)` | 看板助手交付产物说明补充内嵌预览标签与网页端内联渲染 |
| 3 | `1b9074935` | `release` | v0.5.97 — wave142 WBS 任务自动路由 + 交付物激活补产物(S3 沙箱示范) + 看板/工坊对话内联渲染 HTML 交付物 |
| 4 | `bc48b1e80` | `chore(release)` | version.json 0.5.95 → 0.5.97 |

`feat(ui)` 显式路径（未 `git add .`）:
`ui/src/components/SandboxedHtmlAttachment.tsx`(新) · `ui/src/lib/issue-attachments.ts` ·
`ui/src/lib/issue-attachments.test.ts`(新) · `ui/src/components/IssueAttachmentsSection.tsx` ·
`ui/src/pages/BoardChat.tsx`。

### 1.2 push 回执

```
b2442f7f7..ae838c536  main -> main      # feat + docs
ae838c536..bc48b1e80  main -> main      # release + chore(version.json)
```

push 命令（绕本地代理直连 github，本仓约定）:
`GIT_SSH_COMMAND='ssh -o ProxyCommand=none' git push origin main` → 均为 fast-forward，成功。

### 1.3 提交前验证（绿→绿）

| 检查 | 命令 | 结果 |
|---|---|---|
| 设计令牌门 | `node scripts/check-token-gates.mjs` | Gate1-4 全 CLEAN，exit 0 |
| UI 类型 | `pnpm --filter @paperclipai/ui typecheck` | `tsc -b` exit 0 |
| 新增单测 | `vitest run ui/src/lib/issue-attachments.test.ts` | 5/5 通过 |

> 说明: 简报 A 列的 `scripts/wave142/route-wbs-assignees.mjs` + `docs-coolie/evidence/wave142/**`
> **上一会话已提交并推送**（`b2442f7f7`，已在 `origin/main`）；本次只补交该波的 沙箱组件 + 接线。
> 因已推送，未 amend，按新 commit 追加（符合本仓「已推送不改写历史」纪律）。

---

## 2. B) 发版 0.5.97

执行: `bash scripts/release-app.sh 0.5.97 '<notes>' --skip-server-deploy`
（`--skip-server-deploy`：server 无改动；Web/服务端走 §4 的加固脚本，而非脚本内嵌的
`deploy-tc-coolie-claw.sh`。）

### 2.1 产物

| 产物 | 值 |
|---|---|
| APK 构建 | `BUILD SUCCESSFUL in 28s`（947 tasks） |
| APK 上传 | `cos://gzbucket/coolie/app/0.5.97/coolie-release.apk`（78,111,010 B / 74.49 MB） |
| APK 直链 | `https://dls.xrobinai.cn/coolie/app/0.5.97/coolie-release.apk` |
| APK sha256 | `2e16b803966cfa7a68bc532267345812170732a4ceb22c3307adfb3f9cc56d9e` |
| version.json（远端） | `0.5.97` / code `597` / commitSha `1b9074935dbef7551cdc0d17f0f400bdd97ac09f` |
| OTA manifest | `runtimeVersion 0.5.97`，`createdAt 2026-09-29T09:26:52Z` |

脚本内发布 OTA 到 `tc-coolie-claw:/opt/coolie/ui/ota/`（31 文件），远端自检
`/ota/manifest` runtimeVersion = `0.5.97`。

> OTA bundle 与 0.5.96 同哈希（`index-c01e5dcbc6c3ee2e973467a6fc354b9c.hbc`）——
> 因为本波**未改 `clients/expo`**，App JS 不变；本次是版本/装机包 hygiene 重发。

### 2.2 版本号变化（各发布面，前后实测）

| 发布面 | 前 | 后 | 读取方式 |
|---|---|---|---|
| 生产 `/version.json` | 0.5.96 | **0.5.97** | `curl https://xrobinai.cn/version.json` |
| OTA `/ota/manifest` runtimeVersion | 0.5.96 | **0.5.97** | `curl …/ota/manifest` |
| `clients/expo/app.json` expo.version | 0.5.96 | **0.5.97** | node 读取 |
| 原生 `EXPO_RUNTIME_VERSION` | 0.5.96 | **0.5.97** | `AndroidManifest.xml`（fix-android-manifest 重写） |
| 仓库 `version.json`（被跟踪） | 0.5.95 | **0.5.97** | commit `bc48b1e80` |
| APK `0.5.97` 直链 | — | **HTTP 200**（78,111,010 B） | `curl -o /dev/null -w %{http_code}` |

**四面对齐**: app.json 意图 = 原生 manifest = version.json = OTA runtimeVersion = `0.5.97`
（本仓历史反复踩的「下了不装」正是这里不一致，本次一致）。

---

## 3. C) 里程碑 tag

```
git tag -a v0.5.97 -m 'wave142: WBS 任务自动路由 + 沙箱附件真渲染 + 启动链路端到端可观察'
GIT_SSH_COMMAND='ssh -o ProxyCommand=none' git push origin v0.5.97
```

远端回执:

```
 * [new tag]  v0.5.97 -> v0.5.97
```

`git ls-remote --tags origin`:
`577242aa7a43157ee6ae46d4413e11a2ed2cddf9  refs/tags/v0.5.97`（annotated tag 对象）
`bc48b1e807a53f90010f3a630ad7109a4cd5910f  refs/tags/v0.5.97^{}`（指向提交）

tag 亦登记于新建的 `docs-coolie/RELEASE-HISTORY.md` 一行（此前无 git tag，v0.5.97 为首个）。

---

## 4. D) Web 部署 + 部署护栏

执行: `bash scripts/deploy-coolie.sh` → `DEPLOYED main@bc48b1e80 to https://xrobinai.cn`

### 4.1 护栏前后（全绿）

| 阶段 | 检查 | 结果 |
|---|---|---|
| sync 之后 | `/version.json`（升级清单） | **200 ok** |
| sync 之后 | `/ota/manifest`（OTA 清单） | **200 ok** |
| 重建（stale: shared, db, skills-catalog, mcp-server, **ui**） | —— | `built ui + refreshed server/ui-dist` |
| build 之后 | `/version.json` | **200 ok** |
| build 之后 | `/ota/manifest` | **200 ok** |
| 重启 | `/api/health`（host 内 3100） | `health ok` |
| 外部 | `https://xrobinai.cn/api/health` | **ok** |
| 外部 | ICP 备案号（落地页 / app shell） | **ok / ok** |
| 外部 | 退役路径 | `skip`（本部署未声明，符合脚本设计） |
| 外部 | `https://www.xrobinai.cn/` | **ok** |

### 4.2 部署确实带上了新 UI（非空判）

- 主机 `ui/dist/assets/index-CoQ46jP6.js`（6,489,783 B，mtime `09-29 17:31`）由本次构建产出；
- `server/ui-dist/assets/index-CoQ46jP6.js` 同步刷新（Express 实际直出的静态根）；
- 对外 `/auth`、`/XROA` 的 SPA shell 均引用 `assets/index-CoQ46jP6.js` / `index-CZMUiwQz.css`；
- `/opt/coolie/ui/dist/version.json` = 0.5.97（构建期间 stash/restore 保住，未被 vite 清掉）；
- `systemctl is-active coolie` → `active`。

---

## 5. 未做 / 遗留 / 假设（供复核）

- **Web 看板对话内联渲染未做浏览器点验**。它渲染的是「绑定到评论的 HTML 附件」
  （`issueCommentId` 非空）；当前生产没有这样一条可渲染的现成数据，而临时造一条=
  往生产写评论，超出本次「提交/发版」范围，故未做。可见证据是：单元测试 5/5 + UI 类型 0 错 +
  部署后 ui 真重建。**点击路径（留给你最后一眼）**:
  登录 → 公司 `XROA` → 打开一个「agent 回复里带 HTML 交付物」的工单 → 看板对话 →
  该回复气泡下方应出现**内联 iframe 预览**（紫色页头/正文），而不再是下载链接。
- App 侧沙箱真机证据见 `docs-coolie/evidence/wave142/`（v0.5.96 装机包，本波未重跑真机）。
- `scripts/e2e/**` 与 `docs-coolie/evidence/e2e/**` 属**他人 wave140/141 WIP（untracked）**，
  未纳入本次提交（未 `git add`）。
- **假设（请 operator 复核）**: 简报 B 的条件句「若 ui 真改了 `clients/expo` → 才出 0.5.97 APK」
  中，`clients/expo` 实际**未改**。但 `0.5.97` 这个版本号在本仓**只存在于 `clients/expo`**
  （app.json / package.json / CHANGELOG）——Web 端没有任何版本号位；且 boss 明令「打包升级」
  +「留版本tag」。故按**完整 App 发版**处理（`release-app.sh 0.5.97`）。若本意是「web-only、
  不出 APK」，可在 `version.json` 回退——但那会让 tag 与产物脱节，**不建议**。

---

## 6. 复现命令

```sh
# 提交
git add <显式路径> && git commit -F - <msg>
GIT_SSH_COMMAND='ssh -o ProxyCommand=none' git push origin main

# 发版（App）
bash scripts/release-app.sh 0.5.97 '<notes>' --skip-server-deploy
# 仓库侧 version.json 单独提交
git add version.json && git commit -m 'chore(release): version.json 0.5.95 → 0.5.97'

# Web 部署（加固）
bash scripts/deploy-coolie.sh

# tag
git tag -a v0.5.97 -m '<topic>' && GIT_SSH_COMMAND='ssh -o ProxyCommand=none' git push origin v0.5.97
```
