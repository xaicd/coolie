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

### 2.1 本地验收（App E2E，一条命令）

上线前想知道「App 主链路还活着吗」，在开发机跑：

```bash
scripts/e2e-local.sh            # 全量：健康检查 + 登录 + 本体/任务/工坊 3 条链路
echo $?                         # 非 0 = 有断言没过
```

它用 `agent-device --platform web` 驱动 `localhost:3100` 的看板 UI，跑完打印
「断言清单 + 通过/失败计数 + 每个证据截图的绝对路径」。**没有设备也能出真信号**。

- 断言是真的：本体域数量 ≥7、任务列表非空、工坊发消息后**收到回复**
  （要求助手算出 `388`，所以用户自己那条消息不会让它误过）。
- 详细说明、覆盖边界、已知限制、一次性 bootstrap：`docs-coolie/LOCAL-E2E.md`。
- 2026-09-21 首次实跑结果：**7 通过 / 1 失败**——工坊回复流到了服务端但没进聊天室。
  结论与证据见 `LOCAL-E2E.md`。这条红是它该有的样子，不要为了变绿去改断言。

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

---

## 10. 本地 App 验收（老板指定路径）

老板原话：「测试就在开发机器本地跑就行」。

入口：

```sh
bash scripts/e2e-local.sh         # 跑断言 + 截图证据 + 非零退出
echo $?                           # 0=全过, 1=有失败
```

详情：`docs-coolie/LOCAL-E2E.md`（覆盖/前置/限制/故障排查/故意改错自证/演进路径）。

当前已知：8 断言 7 PASS / 1 FAIL（**R3 工坊对话真红**，本地服务不连生产后端——不掩盖）。

跑前确认：

```sh
agent-device web doctor           # healthy
curl -s http://localhost:3100/api/health   # 200
ls scripts/e2e-local.sh           # 文件存在
```

跑后：

```sh
ls -la clients/expo/replays/evidence/   # 5 张真图
```

### wave1 验收结果（2026-09-21，cmd 跑）

- 报告：`docs-coolie/feature-acceptance-2026-09-21-wave1.md`
- 红表：`docs-coolie/TEST-FAILURES-2026-09-21.md`
- 结论：h5 面 §2 六项 PASS（13/14/17/18/19/20），三项真红未实现（15 CodeDiff / 16 CM6 / 14 的 meta 行）；
  §1 spot-check：#5 PASS，#2/#11 在 h5 面未实现（board UI `:3100` 面 #11 本体 7 域 PASS）。
- 证据：`clients/h5/replays/evidence/`（本地，不入 git）。