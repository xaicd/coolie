# Brief: Coolie 功能验收（按 FEATURE-ACCEPTANCE-LIST.md 跑 §1-2）

Test staff: **claude**（铁匠，claude-glm + claude-mm 都行）
Spec: `docs-coolie/FEATURE-ACCEPTANCE-LIST.md`（**先读 §0-2**）
Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Wave: 1 of N — 验收第一波，跑 PRD §1 + ChatHome §2 全部 20 条。

## 0. 不要做的事

- ❌ 不修改任何产品代码（只跑 + 报）
- ❌ 不修改 `clients/expo/`（已交付 0.5.1）
- ❌ 不修改 `clients/h5/`（已交付 7a077f42b）
- ❌ 不修改 specs / brief / PM 文档（验收只读）
- ❌ 不发版（不调 release-app.sh）
- ❌ 不接外部网络服务（本地能跑就本地跑）
- ❌ 不改断言让结果变绿（真红就真红）

## 1. 跑前准备（必跑）

```bash
export DEVELOPER_DIR=/Library/Developer/CommandLineTools
cd ~/workspace/xaicd/coolie

# 1. 仓库干净
git status --short   # 期望为空（除 untracked）

# 2. 预检 agent-device
agent-device web doctor   # healthy

# 3. 预检本地后端
curl -s http://localhost:3100/api/health
# 200 → 用本地后端
# 000 → 跑 pnpm dev 后台

# 4. 启动 h5 dev 后台
cd clients/h5 && pnpm dev > /tmp/h5-dev.log 2>&1 &
sleep 5
curl -I http://localhost:5173
# 200 → 用 h5
```

## 2. 必跑项

### §1 PRD 12 项（4 条已 e2e 覆盖，跳过）

```
#1-12 项。e2e-local.sh 已跑过：
#   #11 本体域 ≥7        PASS  (R1)
#   #12 工坊对话回复     真红   (R3,本地不连生产后端,保持)
#   #2/#3/#6 等基础 PASS
#   #1/#4/#5/#7/#8/#9/#10 基础 PASS（其余几条已在前面跑覆盖）
# 你不需要重复跑 e2e,只需 spot-check 任意 3 条未覆盖的:
```

| spot-check 3 条 | 命令 |
|---|---|
| 看额度（#2）| `agent-device open http://localhost:5173 --platform web` → 找「额度」卡片 |
| 看原型（#5）| `agent-device open http://localhost:5173/workspace` → 切 PreviewTab |
| 本体驱动（#11）| `agent-device open http://localhost:5173` → 找本体域卡片 |

每条 spot-check：
- snapshot -i
- 截屏存 `clients/h5/replays/evidence/feat-N-name.png`（新目录）
- 写一句到 stdout：[feature-N] PASS / FAIL — 描述

### §2 ChatHome 抄作业 8 项（全部要跑）

| # | 路径 | 验证命令（h5 web 模式）|
|---|---|---|
| 13 | InlinePreviewPanel URL 预览 | `agent-device open http://localhost:5173` → 在 BoardChat 文本框贴 `<preview-url>https://example.com</preview-url>` → 发 → 期望 inline iframe 出现 |
| 14 | MvpPreviewCard 缩略图 + Modal | 贴 `<preview-mvp title="测试" thumb="https://via.placeholder.com/150" meta='{"key":"val"}'>` → 期望 img + meta 行 |
| 15 | CodeDiffCard 行号 + 红绿 | 贴 `<code-diff file="x.ts" lang="ts">+added\n-removed</code-diff>` → 期望 syntax 高亮 + 红绿 |
| 16 | InlineCodeEditor CM6 | 点 #15 [编辑] → 期望编辑器弹起 |
| 17 | WorkspaceScreen 4 Tab | 点右上 [Workspace] → 期望 4 Tab 切换 |
| 18 | FilesTab 文件树 | 切 Files Tab → 期望 5 层嵌套 mock 渲染 |
| 19 | TerminalTab | 切 Terminal Tab → 输入 `help` → 期望输出 |
| 20 | PreviewTab | 切 Preview Tab → 期望默认 URL |

每条都要：
1. agent-device 实跑（不是截图模拟）
2. 截屏 `clients/h5/replays/evidence/feat-N-name.png`
3. 一句 stdout: `[feature-N] PASS / FAIL — 证据路径`

## 3. 输出报告（必须含）

```markdown
## Coolie 验收第一波 — claude 跑通

### 跑前准备
- git status: <输出>
- agent-device web doctor: <输出>
- 3100 health: <输出>
- h5 dev 200: <输出>

### §1 PRD 12 项 spot-check
- [feature-2]  看额度       PASS / FAIL  — 证据路径
- [feature-5]  看原型       PASS / FAIL  — 证据路径
- [feature-11] 本体驱动     PASS / FAIL  — 证据路径

### §2 ChatHome 8 项
- [feature-13] PreviewPanel       PASS / FAIL — 证据路径
- [feature-14] MvpPreviewCard     PASS / FAIL — 证据路径
- [feature-15] CodeDiffCard       PASS / FAIL — 证据路径
- [feature-16] CodeMirror 编辑器  PASS / FAIL — 证据路径
- [feature-17] WorkspaceScreen 4 Tab  PASS / FAIL — 证据路径
- [feature-18] FilesTab 文件树    PASS / FAIL — 证据路径
- [feature-19] TerminalTab         PASS / FAIL — 证据路径
- [feature-20] PreviewTab         PASS / FAIL — 证据路径

### 失败真实记录
- <真红写这里,不要改松>

### 截图清单（ls 真实输出,本地不入 git）
$(ls -la clients/h5/replays/evidence/)
```

## 4. 重要约束

- **截图不入 git**（fork 政策：截图只留本地）。`screenshots/` `clients/h5/replays/evidence/` 都加进 `.gitignore`
- 报告里写「本地证据路径」即可（绝对路径），commit 不带图
- 失败写 `docs-coolie/TEST-FAILURES-2026-09-21.md`（新建）含 root cause + 真实 stdout
- 不许改断言 / 不许 stub 跑过
- 真红（API 500 / agent-device 报 fetch error）就报 FAIL，**不许撤回**

## 5. 验收

- [ ] 跑前准备 4 步全过
- [ ] §1 3 spot-check 全报
- [ ] §2 8 项全报
- [ ] 11 张截图在本地（不入 git）
- [ ] 失败写 docs-coolie/TEST-FAILURES-2026-09-21.md（如有）
- [ ] commit + push
- [ ] PM-LOG 加一行

## 6. 完成定义

所有 11 项有 PASS/FAIL + 证据路径入库 + 失败真实记录 + commit + push + PM-LOG 加行。

后续 wave 由 PM 决定（再派你跑 §3 工作空间 / §4 DSH）。