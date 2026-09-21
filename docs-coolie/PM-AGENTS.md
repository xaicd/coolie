# Coolie — Fork PM 启动手册

> **每个 PM / 匠人开工必读**。包含项目核心信息 + skill 索引 + 启动检查 + 派单纪律。
> 注：根目录 `AGENTS.md` 是上游 paperclip 的（245 行，Hermes 系统保护不让覆盖）。这份是 fork 自己的 PM 启动手册。

---

## 0. 项目核心信息（5 秒读完）

| 项 | 值 |
|---|---|
| 项目名 | Coolie（paperclip fork） |
| 仓库 | github.com/xaicd/coolie |
| 主分支 | `main`（领先 `origin/main` 时直接推） |
| 工作分支 | `release/0.4.0`, `release/0.5.0`（已推） |
| 包管理 | pnpm + monorepo |
| 客户端 | clients/expo + clients/api-client + clients/h5（React Native + Expo SDK 52） |
| 服务端 | server/（Express + tsx + ts-rest） |
| 数据库 | postgres（生产）；PGlite（dev） |
| 部署 | Docker + systemd + Caddy |
| 生产域名 | `https://xrobinai.cn`（Tencent Cloud CVM 62.234.59.180） |
| OTA | `xrobinai.cn/ota/manifest` |
| APK COS 桶 | `gzbucket` = sls-cloudfunction-ap-guangzhou-code-1258019043 |
| 下载 | `https://dls.xrobinai.cn/<key>` |
| 当前生产版本 | v0.5.0（500） |
| 老板 | 陈伟（xaicd GitHub 组织，xrobinai.cn 站长） |
| 老板联系 | weixin `o9cq80_tfu-U-ON3wZcJEw@im.wechat`（不要猜） |
| PM | Hermes Agent（掌柜，老板派单 + 验收 + 写文档） |
| 匠人池 | 门神 cmd（180s 冷却）、铁匠 claude（30s 冷却）、墨斗 agy（待 09-23）、副炉 mm |
| 时区 | CST (UTC+8) |
| 信任等级 | 老板严重要求：PM 只派活 + 验收，不写代码（紧急例外记 PM-DISPATCH-RULES.md） |

---

## 1. 项目级 Skill 索引（`.agents/skills/`）

### 1.1 工作流 skill（PM 主导，fork 新增）

| Skill | 用途 |
|---|---|
| **requirements-capture** | Kiro Feature Spec + EARS 标注法收需求（老板话 → spec 1-6 节）|
| **system-design-spec** | spec 1-6 节 → spec 7 节（架构 / 数据流 / API / 风险）|
| **bug-fix-flow** | Kiro Bugfix Spec + 三段（current/expected/unchanged）+ property tests |

### 1.2 项目自带 skill（不动）

26 个来自 paperclip 上游：`paperclip-create-plugin` / `paperclip-page` / `paperclip-evals` / `add-product-e2e-eval` / `comprehensive-testing-workflow` / `release` / `release-changelog` / `prepare-paperclip-pr` / `check-pr` / `pr-gardening` / `pr-report` / `prcheckloop` / `deal-with-security-advisory` / `diagnose-why-work-stopped` / `garden-inbox` / `fork-sync` / `doc-maintenance` / `create-agent-adapter` / `create-issue-interaction-ui` / `company-creator` / `create-paperclip-bundled-skill` / `add-runner-eval` / `terminal-bench-loop` / `palantir-role-engineering` / `paperclip-dev-workspace-run-verify-fix`

---

## 2. PM 启动检查（每次开工必跑）

```bash
cd ~/workspace/xaicd/coolie
git status --short               # 应当为空（除 untracked .commandcode / core / screenshots）
git log --oneline -5
git branch --show-current

curl -fsS https://xrobinai.cn/version.json | head -8
curl -fsS https://xrobinai.cn/ota/manifest | head -5
curl -fsS https://xrobinai.cn/api/health

ls docs-coolie/PM-*.md
ls docs-coolie/specs/

ssh tc-coolie-claw "sudo systemctl is-active coolie"
ps aux | grep -E "[c]md -p|[c]laude -p" | grep -v grep | head -5
```

如果某条卡住，立刻告诉老板。

---

## 3. 派单纪律

- 单匠人连发间隔：**≥3 分钟**（cmd）/ **≥30 秒**（claude）
- Coolie 系统内置 pacing rules（`0df489620`）：cmd 180s / claude 30s
- 派单流程：老板说话 → PM 写 `docs-coolie/specs/YYYY-MM-DD-<slug>.md` → PM 写 `docs-coolie/briefs/<job>.md` → 派单 → 匠人 commit 引 spec 路径 → PM 24 项 gate 签字 → `PM-DISPATCH-LOG` 加一行
- 必读 PM 文档：`PM-ROADMAP` `PM-DISPATCH-RULES` `PM-FAILURE-CASES` `PM-RELEASE-CHECKLIST` `PM-SPEC-WORKFLOW` `PM-DISPATCH-LOG`
- 反派单（拒发合理）：无文件白名单 / 没真 bug 信号 / 涉 secret 不在仓库 / 没 tsc / sandbox 撞又无 fallback

---

## 4. 项目文件地图

```
~/workspace/xaicd/coolie/
├── clients/expo/             React Native app
├── clients/api-client/      共享 TS 客户端
├── server/                   Express API + scripts/release-app.sh
├── packages/                 db / shared / adapters / plugins / ontology-core
├── ui/                       Web 看板
├── cli/                      paperclipai CLI
├── docs-coolie/              fork 自己的 PM 文档 + 审计 + DS 学习
├── .agents/skills/           项目级 skill（gitignored，加新 skill 必须 git add -f）
├── AGENTS.md                 上游 paperclip AGENTS（245 行，**不要覆盖**）
└── screenshots/              DS 截图 — 审计 DS 用
```

---

## 5. 仓库纪律

- `/clients/expo/android/` gitignored——prebuild 输出。手改 versionCode 后必须 `./gradlew assembleRelease`
- `/.agents/` gitignored——加新 skill 必须 `git add -f`
- `/core` `/coscli.log` `/screenshots/` `/scripts/deploy-tc-coolie-claw.sh` 是历史 untracked
- `tsc -p .` 必须 0 错误（`clients/expo/` + `server/` 两个 tsconfig）
- commit message 引 spec 路径

---

## 6. 故障树

| 症状 | 第一步查 | 第二步查 |
|---|---|---|
| 工坊对话无响应 | `ssh tc-coolie-claw sudo journalctl -u coolie --since '-10m' \| grep -iE 'board-chat\|transcription'` | 服务端 `hermes chat` |
| 语音派发失败 | plugin-multimodal `ready` 状态 | host secret + plugin config 引用 |
| App 装新版本失败 | `curl -I https://dls.xrobinai.cn/coolie/app/X.Y.Z/coolie-release.apk` | OTA manifest runtimeVersion |
| cmd 卡死 | `pkill -9 -f "cmd -p"` | 切 claude |
| claude sandbox 拦 | fallback 写进 brief | 改用仓库内路径 docs-coolie/briefs/ |

---

## 7. 版本管理

- **OTA**：JS-only，runtimeVersion 不变
- **APK 重发**：原生模块动 / keystore / gradle
- **大版本**：跨多个 PR
- `android.versionCode` 必须 pin 到 `app.json`
- `release-app.sh` 自己 bump `expo.version` + 写 CHANGELOG

---

## 8. 老板说话必落的 PM 文档

| 老板说 | PM 必落 |
|---|---|
| 「做个 X」 | `docs-coolie/specs/YYYY-MM-DD-x.md`（requirements-capture + system-design-spec）|
| 「X 有 bug」 | `docs-coolie/specs/YYYY-MM-DD-x.md`（bug-fix-flow 三段 + PBT）|
| 「发版」 | `PM-RELEASE-CHECKLIST.md` 24 项 gate |
| 「加快/抓紧」 | `docs-coolie/briefs/` 写 brief + 派单 |

---

## 9. PM 自我纪律

- 派单间隔 ≥3min（撞 coolie pacing + 自约束）
- 不连环追匠人完工
- 验收有真信号（tsc / curl / 用户实测）不止 commit message
- 没 bug 不硬压发版
- 老板严重要求 PM 不写代码（例外清单在 `PM-DISPATCH-RULES.md`）