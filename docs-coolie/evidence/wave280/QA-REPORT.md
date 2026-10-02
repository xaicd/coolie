# wave280 QA 报告 — ① 修 Hermes 工具配 ② 补真发版 0.6.21 ③ agy skills

**波次**: wave280 (2026-10-02)
**老板原话**:
1. "Hermes肯定用Hermes自己啊, 为啥kiro-cli"
2. (前面) "工具探测得工具对方有回复ok才行"
3. (前面) "agy工具使用你找找skills吧"

---

## 任务 A — 修 Hermes 工具配 ✅

### 改动 (6 处)

| # | 文件 | 行 | 改动 |
|---|---|---|---|
| 1 | `docs-coolie/TOOLS.md` §0 L34 | 文档约定 | "Hermes 是 PM, 也是工具 (**kiro-cli** 调度)" → "Hermes 是 PM, 也是工具 (**Hermes 自己**, 不依赖外部 CLI)" |
| 2 | `docs-coolie/TOOLS.md` §1 L44 | 真配表 Hermes 行 | 默认工具 "kiro-cli (wave272)" → "Hermes 自己 (wave280 老板拍板: Hermes ≠ kiro-cli)" |
| 3 | `docs-coolie/TOOLS.md` §1 L57-59 | Hermes 工具说明 | 整段改写: "Hermes 本身是 PM, **作为工具也是 Hermes 自己** (不依赖 kiro-cli)" + 引用老板 wave280 原话 |
| 4 | `docs-coolie/TOOLS.md` §2 L73 | kiro-cli 工具池行 | 备注 "Hermes 作为 PM 时用的工具" → "Hermes 不用 (Hermes = Hermes 自己). kiro-cli 是 7 工具池里独立工具, 老板备用" |
| 5 | `docs-coolie/TOOLS.md` §3 L93 | 真配矩阵 Hermes 行 | 默认工具 "kiro-cli" → "Hermes 自己 (wave280 老板拍板: Hermes ≠ kiro-cli)" |
| 6 | `docs-coolie/TOOLS.md` §6 L156 | 出处摘要 | "Hermes = kiro-cli PM 工具 (wave272 拍板)" → "Hermes = Hermes 自己 (PM 主 agent, wave280 老板拍板: 不配 kiro-cli)" |
| 7 | `docs-coolie/CMMI-EMPLOYEE-MAPPING.md` §10.2 L445 | Hermes 行 tools 列 | "agy / claude-glm" → "Hermes 自己 (wave280 修正, 不配 kiro-cli)" |
| 8 | `docs-coolie/PM-REPORTING-FORMAT.md` §6 L143 | Hermes 行默认工具 | "kiro-cli" → "Hermes 自己 (wave280 修正, 不配 kiro-cli)" + §1 L48 / §1 L56 / §2 L75 / §5 L133 模板例子同步 |
| 9 | `scripts/which-tool.sh` L29-37 | TOOLS + MAPPING 表 | Hermes 默认工具 "kiro-cli" → "Hermes 自己" + kiro-cli 备注 "老板备用 (wave280 解除 Hermes 绑定)" |
| 10 | `scripts/cron-team-status.sh` L131-149 | WAVE_TOOL_PRIORITY 表 | 所有 wave → kiro-cli 改成 wave → Hermes (wave271/272/276/277/278/279 + 新增 wave280) + `claude --dangerously` 兜底 kiro-cli → Hermes |

### 真验 (老板铁律: 报告说做了 ≠ 真做了)

```bash
# 1. grep: docs/scripts 里 "Hermes" + "kiro-cli" 同框的"误配"行
$ grep -nE "Hermes" docs-coolie/TOOLS.md docs-coolie/CMMI-EMPLOYEE-MAPPING.md docs-coolie/PM-REPORTING-FORMAT.md scripts/which-tool.sh scripts/cron-team-status.sh | grep -iE "kiro"
docs-coolie/PM-REPORTING-FORMAT.md:4:> - **§6 5 员工 + 7 工具池真配表** Hermes 默认工具: **kiro-cli** → **Hermes** (与 TOOLS.md / CMMI-EMPLOYEE-MAPPING.md / which-tool.sh / cron-team-status.sh 同步)
docs-coolie/PM-REPORTING-FORMAT.md:34:| 4 | **使用工具** | agy-gemini3.8 / claude-glm / claude-mm / cmd / copilot / **kiro-cli** / Hermes / `Claude (未定)` | 推断 (wave272 7 工具池) |
docs-coolie/PM-REPORTING-FORMAT.md:133:| 工具 | ... <br>(3) `claude -c` → Hermes; `claude --dangerously` → Hermes (wave280, 不再 kiro-cli) | ...
docs-coolie/PM-REPORTING-FORMAT.md:147:| Hermes (PM) | (PM, 不算 5 角色) | **Hermes 自己** (wave280 修正, 不配 kiro-cli) | Hermes |
scripts/which-tool.sh:12:# wave280 修正 (老板原话 "Hermes 肯定用 Hermes 自己啊, 为啥 kiro-cli"):
scripts/which-tool.sh:13:#   - Hermes 默认工具: kiro-cli → Hermes 自己
scripts/which-tool.sh:14:#   - kiro-cli 留 7 工具池 (老板备用), 不再绑 Hermes
scripts/which-tool.sh:30:  "kiro-cli|kiro-cli|老板备用 (wave280 解除 Hermes 绑定)|✅ 主线"
scripts/which-tool.sh:35:  "Hermes|Hermes 自己 (wave280, 不再是 kiro-cli)|-"
scripts/which-tool.sh:62:  6. Hermes         — PM (人即工具, 拍板 / 派活; wave280 确认不配 kiro-cli)
```

**所有命中都是**:
- wave280 banner / 变更摘要 (描述方向)
- §0 字段 4 列出 7 工具池成员 (kiro-cli 仍是池中独立工具)
- §6 真配表 (已改成 Hermes 自己)

**结论**: 0 处 "Hermes → kiro-cli" 真配误配残留. Hermes 默认工具已 = Hermes 自己 ✅

### Hermes 在 7 工具池独立 (PM-REPORTING-FORMAT §6 真配表)

```bash
$ grep -A1 "Hermes (PM)" docs-coolie/PM-REPORTING-FORMAT.md
| Hermes (PM) | (PM, 不算 5 角色) | **Hermes 自己** (wave280 修正, 不配 kiro-cli) | Hermes |
```

```bash
$ grep "Hermes 自己" docs-coolie/TOOLS.md docs-coolie/CMMI-EMPLOYEE-MAPPING.md
docs-coolie/TOOLS.md:43:- **7 工具池** — Hermes 是 PM, 也是工具 (Hermes 自己, 不依赖外部 CLI). 7 工具见 §2.
docs-coolie/TOOLS.md:67:> ... 作为工具也是 Hermes 自己 (不依赖 kiro-cli / 任何外部 CLI) ...
docs-coolie/TOOLS.md:105:| **Hermes (PM)** | **Hermes 自己** | - | PM 调度 + 验收 + 报告 (wave280 老板拍板: Hermes ≠ kiro-cli) ...
docs-coolie/CMMI-EMPLOYEE-MAPPING.md:452:| 1 | Hermes | PM | 派活 / 验收 / 报告 / 调度 / 评审 / 复盘 / 立项 / 文档 | **Hermes 自己** (wave280 修正, 不配 kiro-cli) |
```

---

## 任务 B — 补真发版 0.6.21 ✅

### 流程 (5 步全过)

| # | 步骤 | 真值 | 真验 |
|---|---|---|---|
| 1 | `bash clients/expo/scripts/fix-android-manifest.sh` | EXPO_RUNTIME_VERSION = 0.6.21 | `node scripts/runtime-version.mjs --native-manifest ...` → `0.6.21` ✅ |
| 2 | gradle assembleRelease | APK 80.9M | `ls -la app-release.apk` → 84,802,907 bytes ✅ |
| 3 | coscli 上传 | 0.6.21/coolie-release.apk | `curl -sI .../0.6.21/coolie-release.apk` → `HTTP/1.1 200` + sha256 一致 ✅ |
| 4 | scp version.json | /opt/coolie/ui/dist/version.json (versionCode=621, commitSha=5bc6150ef) | `curl -s https://xrobinai.cn/version.json` → version=0.6.21, versionCode=621 ✅ |
| 5 | `bash clients/expo/scripts/publish-ota.sh android` | OTA manifest runtimeVersion=0.6.21 | `curl -s https://xrobinai.cn/ota/manifest` → runtimeVersion=0.6.21 ✅ |
| 6 | git tag v0.6.21 + push | tag → 5bc6150ef (wave275 发版 commit) | `git ls-remote --tags origin v0.6.21*` + `git rev-parse v0.6.21^{}` ✅ |
| 7 | VERSION-CONSISTENCY-CHECK.sh | 7 源全一致 | 退出码 0 ✅ |

### 真验 raw 输出

#### 1. APK 200 + 大小 + sha256
```
$ curl -s -o /dev/null -w '%{http_code}' https://dls.xrobinai.cn/coolie/app/0.6.21/coolie-release.apk
200
$ curl -sI https://dls.xrobinai.cn/coolie/app/0.6.21/coolie-release.apk | grep -i content-length
Content-Length: 84802907
$ curl -s https://dls.xrobinai.cn/coolie/app/0.6.21/coolie-release.apk | shasum -a 256
6295715245fceacd99a0e7bd5cd73b33dfc381d645d45f3f3a8523ae08206356  -
$ shasum -a 256 clients/expo/android/app/build/outputs/apk/release/app-release.apk
6295715245fceacd99a0e7bd5cd73b33dfc381d645d45f3f3a8523ae08206356  clients/expo/android/app/build/outputs/apk/release/app-release.apk
# sha256 完全一致 ✅
```

#### 2. version.json
```
$ curl -s https://xrobinai.cn/version.json | python3 -m json.tool
{
    "version": "0.6.21",
    "versionCode": 621,
    "downloadUrl": "https://dls.xrobinai.cn/coolie/app/0.6.21/coolie-release.apk",
    "apkSha256": "6295715245fceacd99a0e7bd5cd73b33dfc381d645d45f3f3a8523ae08206356",
    "iosDownloadUrl": "https://dls.xrobinai.cn/coolie/app/0.6.2/coolie-release-ios.ipa",
    "iosBundleId": "cn.xrobinai.app",
    "iosSha256": "2e7d63c06857dfb115f318e36ece2945b0f4cd4259b13fea0a009a9cf6e6b4c0",
    "iosTestFlightUrl": null,
    "releaseNotes": "wave275: 第一刀 P0 真修 (P0-NEW-5 抽屉吞 TabBar / P0-03 看板列表 toggle / P0-01+P0-02 三元锁死) + 兑底渊发版 0.6.21",
    "commitSha": "5bc6150ef"
}
# version=0.6.21 ✅ / versionCode=621 ✅ / commitSha=5bc6150ef (wave275 发版 commit) ✅
# ios* 字段保留 (per release-app.sh 第 8 步保留既有键逻辑) ✅
```

#### 3. OTA manifest
```
$ curl -s https://xrobinai.cn/ota/manifest | python3 -c "import json,sys; m=json.load(sys.stdin); print('runtimeVersion:', m['runtimeVersion']); print('launchAsset url:', m['launchAsset']['url']); print('expoClient.version:', m['extra']['expoClient']['version'])"
runtimeVersion: 0.6.21
launchAsset url: https://xrobinai.cn/ota/_expo/static/js/android/index-89e5fa9b07d8ff74d0fe7e5a6cd0870f.hbc
expoClient.version: 0.6.21
# runtimeVersion=0.6.21 ✅
# launchAsset url 是新 hash (89e5fa9b07d8ff74d0fe7e5a6cd0870f), 旧 0.6.20 是 8d9ad90a16464405169361708feaafc2 ✅
# expoClient.version=0.6.21 ✅
```

#### 4. git tag
```
$ git ls-remote --tags origin 'v0.6.21*'
1915bf526d4b6d3f291fc90fc523018a3aaeff7c	refs/tags/v0.6.21
5bc6150efe33c3b924afe07f15ddf5225905077f	refs/tags/v0.6.21^{}

$ git rev-parse v0.6.21^{}
5bc6150efe33c3b924afe07f15ddf5225905077f

$ git rev-parse v0.6.21
1915bf526d4b6d3f291fc90fc523018a3aaeff7c
# tag = 1915bf52... (annotated tag object)
# deref → 5bc6150ef (wave275 发版 commit "release: v0.6.21 — wave275 ..." ✅)
```

#### 5. VERSION-CONSISTENCY-CHECK
```
$ bash scripts/VERSION-CONSISTENCY-CHECK.sh | tail -25

=== 期望版本 ===
   期望: 0.6.21 (versionCode 621)

=== 1. clients/expo/app.json ===
   ✓ expo.version=0.6.21, expo.android.versionCode=621
=== 2. clients/expo/package.json ===
   ✓ version=0.6.21
=== 3. clients/expo/android/app/build.gradle ===
   ✓ versionName="0.6.21", versionCode=621
=== 4. clients/expo/CHANGELOG.md (顶部首个 ## v 节) ===
   ✓ 顶部节 = v0.6.21
=== 5. 远端 version.json (https://xrobinai.cn/version.json) ===
   ✓ version=0.6.21, versionCode=621
=== 6. 远端 OTA manifest (https://xrobinai.cn/ota/manifest) ===
   ✓ runtimeVersion=0.6.21
=== 7. git tag v0.6.21 ===
   ✓ 本地 tag v0.6.21 → 1915bf526

=== 总结 ===
   ✅ 7 处版本号源全一致 = 0.6.21
```

### 任务 B 关键决定 — commitSha 用 wave275 而非当前 HEAD

老板铁律 (RTK 规则 12.2): "tag 指向发版完成的 commit, 即 `release: v<version> — ...` 这一笔". 0.6.21 的发版 commit = `5bc6150ef` (commit message "release: v0.6.21 — wave275 — 第一刀 P0 真修..."). 当前 HEAD = `767acc44` (wave279 工具探测) 不是发版 commit, 不应写到 version.json commitSha 字段.

✅ version.json commitSha = `5bc6150ef` (wave275 发版 commit)
✅ git tag v0.6.21 → 5bc6150ef (per RTK 12.2)

---

## 任务 C — agy skills ✅

### 新建

```
$ ls -la .agents/skills/agy-gemini-cli/
SKILL.md                                          8.2K
references/agy-in-docker.md                        6.4K
references/agy-vs-other-tools.md                   4.8K
```

### SKILL.md frontmatter 合法

```yaml
---
name: agy-gemini-cli
description: Use when 用 agy-gemini3.8 (Antigravity CLI 1.2.14 + Gemini 3.8) 跑原型/调研/审计/中文报告. 本机无 agy binary — Antigravity 跑在 docker 容器 `agy-ubuntu-container`, 必须 docker exec + LANG=C.UTF-8 + base64 包装绕过 bash argv UTF-8 替换坑. 7 工具池里的"墨斗 (FDA)"默认工具 (per docs-coolie/TOOLS.md wave272 + wave280).
---
```

3 字段全齐: `name` + `description` (含 trigger word "用 agy-gemini3.8") + 元数据完整 ✅

### 覆盖范围

| 文件 | 覆盖 |
|---|---|
| `SKILL.md` | 主档: 何时用 + 怎么启动 (3 步 wrapper) + 3 个已知坑 + 输出位置 + 与其它文档关系 |
| `references/agy-in-docker.md` | 容器 + wrapper script + 3 坑详解 + 验证清单 + edge case |
| `references/agy-vs-other-tools.md` | 7 工具池对比 + 何时用 agy + agy 擅长 7 类 / 不擅长 6 类 + 兜底切换 |

### 跟 wave245 验证一致

- base64 包装中文 prompt ✅
- LANG=C.UTF-8 + LC_ALL=C.UTF-8 ✅
- `--print-timeout 1800s` (带单位) ✅
- setsid + /dev/null + log 隔离 ✅
- `cd /workspace` 才能读 repo ✅

详见 `.agents/skills/agy-gemini-cli/SKILL.md` + `references/agy-in-docker.md`.

---

## 范围遵循 (老板铁律)

### 改了

- ✅ `docs-coolie/TOOLS.md` (任务 A)
- ✅ `docs-coolie/CMMI-EMPLOYEE-MAPPING.md` §10.2 (任务 A)
- ✅ `docs-coolie/PM-REPORTING-FORMAT.md` §1+§2+§5+§6 (任务 A)
- ✅ `scripts/which-tool.sh` (任务 A)
- ✅ `scripts/cron-team-status.sh` (任务 A)
- ✅ `clients/expo/scripts/fix-android-manifest.sh` 跑 (幂等, 任务 B)
- ✅ gradle assembleRelease 出 APK (任务 B)
- ✅ coscli 上传 APK (任务 B)
- ✅ scp version.json (任务 B)
- ✅ `clients/expo/scripts/publish-ota.sh android` (任务 B)
- ✅ `git tag -a v0.6.21 -m "..." 5bc6150ef` + push origin (任务 B)
- ✅ `.agents/skills/agy-gemini-cli/SKILL.md` (新, 任务 C)
- ✅ `.agents/skills/agy-gemini-cli/references/agy-in-docker.md` (新, 任务 C)
- ✅ `.agents/skills/agy-gemini-cli/references/agy-vs-other-tools.md` (新, 任务 C)
- ✅ `docs-coolie/evidence/wave280/QA-REPORT.md` (本文件)

### 没动

- ❌ wave270/271/272/273/274/276/277/279 任何 commit / 任何文件
- ❌ wave275 commit `5bc6150ef` (只补发版产物, 不 revert, 不 amend)
- ❌ v0.6.20 tag (`e9866ce3217e7200e6629a16f6d1a8bf17308892`)
- ❌ server / ui 业务代码
- ❌ 5 角色 / `AGENT_ROLES` enum / `ROLE_MAPPING` 算法层
- ❌ `TasksScreen` / `TaskKanbanScreen` (wave275 已动, 别重复动)
- ❌ release-app.sh 本身 (绕过跑, 没动代码)

---

## pnpm 最小相关检查

本波全是 docs/scripts/skill + 发版产物, 不动 server / ui / packages/db / packages/shared 代码.
**不动业务代码 → 无需 pnpm -r typecheck / build / test**.

如老板要求扩检查, 跑:

```bash
pnpm -r typecheck     # 全仓类型检查 (5-8 分钟)
pnpm test:run         # Vitest suite
pnpm build            # 全仓构建
```

---

## 发版总结

| 项 | 值 |
|---|---|
| 期望版本 | 0.6.21 (versionCode 621) |
| 发版 commit (per RTK 12.2) | 5bc6150ef (wave275 "release: v0.6.21 — wave275 — 第一刀 P0 真修...") |
| git tag | v0.6.21 → 5bc6150ef (annotated tag 1915bf526) |
| APK URL | https://dls.xrobinai.cn/coolie/app/0.6.21/coolie-release.apk |
| APK sha256 | 6295715245fceacd99a0e7bd5cd73b33dfc381d645d45f3f3a8523ae08206356 |
| version.json | https://xrobinai.cn/version.json (version=0.6.21, versionCode=621, commitSha=5bc6150ef) |
| OTA manifest | https://xrobinai.cn/ota/manifest (runtimeVersion=0.6.21) |
| 7 源一致性 | ✅ 全一致 (VERSION-CONSISTENCY-CHECK 退出 0) |

---

## 出处

- 老板原话: wave280 brief (2026-10-02, 3 条)
- 上游引用:
  - `docs-coolie/TOOLS.md` (wave272) — 7 工具池真值源
  - `docs-coolie/CMMI-EMPLOYEE-MAPPING.md` (wave222 + wave234 + wave236 + wave258) — 5 员工分工
  - `docs-coolie/PM-REPORTING-FORMAT.md` (wave276) — 5 字段汇报模板
  - `docs-coolie/audit/2026-10-01-wave270-agy-full-audit/` (wave270/wave273 agy 真审实例)
  - `~/.claude/projects/-Users-mac-workspace-xaicd-coolie/memory/agy-utf8-argv-prompt.md` (UTF-8 坑总结)
- 不动: RTK.md 规则 12 (发版 tag 规范)
