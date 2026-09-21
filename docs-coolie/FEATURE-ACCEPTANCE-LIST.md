# Coolie 功能验收清单（agent-device 验收版）

> 老板原话：「梳理下功能清单让测试员工按照测试 skill agent-device 验证」
> Skill：`comprehensive-testing-workflow` + `palantir-role-engineering`（FDSE 角色）
> 工具：`agent-device`（本地 web 模式 + 真机模式）

## 0. 验收原则

- 每个功能必须**有真信号**（截图 + 断言）不是只 commit message
- 跑前 `bash scripts/e2e-local.sh`（基础3 断言必过）
- 跑后 `git push` + `docs-coolie/PM-AGENTS.md` 第 10 节更新
- 失败真实记录，**不掩盖**（PM 不许把断言改松）
- 老板装 0.5.0（v0.5.0 已发）后实测 ChatHome 预览 + 工作空间

## 1. PRD 12 项验收清单

| # | 功能 | 验证手段 | 真机/平台 | 优先级 |
|---:|---|---|---|---|
| 1 | 语音派发 | agent-device 触发 voice dispatch + 监听 issue 创建 | App 装 0.5.0 | P1 |
| 2 | 看额度 | UI → 汇览页 → 员工额度卡片 | App + h5 双端 | P1 |
| 3 | 看产物 | 工坊对话 → 产物入口 | App + h5 双端 | P1 |
| 4 | 看代码 | Issue → 代码查看器（CodeMirror） | App + h5 双端 | P1 |
| 5 | 看原型 | 原型沙箱（含内嵌 + 全屏 Modal）| App + h5 双端 | P1 |
| 6 | 看进度 | 工坊对话 BuildProgressCard 5 步 | App + h5 双端 | P1 |
| 7 | 看空闲度 | 员工列表（汇览）→ 状态徽章 | App + h5 双端 | P1 |
| 8 | 交付周期 | 任务列表 → 完成时间统计 | App + h5 双端 | P2 |
| 9 | 车间效率 | Dashboard → 派单成功率 | App + h5 双端 | P2 |
| 10 | 失败率 | Dashboard → issue 状态饼图 | App + h5 双端 | P2 |
| 11 | 本体驱动 | 本体页 → 7 示例域渲染 + 图谱 | App + h5 双端 | **P0**（已有 e2e 断言 R1）|
| 12 | 驾驶舱问答 | 工坊对话 SSE 流式回复 | App + h5 双端 | **P0**（已有 e2e 断言 R3 真红本地）|

## 2. ChatHome 抄作业验收清单（老板 2026-09-21 拍板）

| # | 功能 | 验证手段 | 真机/平台 | 优先级 |
|---:|---|---|---|---|
| 13 | InlinePreviewPanel URL 预览 | 工坊对话发 `<preview-url>https://example.com</preview-url>` → inline WebView 加载 | App + h5 双端 | **P0** |
| 14 | MvpPreviewCard 缩略图 + 全屏 Modal | 工坊对话发 `<preview-mvp title thumb meta>` → fast-image 渲染 + 点全屏 Modal | App + h5 双端 | P1 |
| 15 | CodeDiffCard 行号 + 红绿 | 工坊对话发 `<code-diff file="x.ts">+... -...</code-diff>` → react-native-syntax-highlighter | App + h5 双端 | P1 |
| 16 | InlineCodeEditor (CodeMirror 6) | 点 CodeDiffCard [编辑] → Modal 内 CM6 编辑器 → 保存 | App + h5 双端 | P1 |
| 17 | WorkspaceScreen 4 Tab | 右上角 [Workspace] → Modal 弹 4 Tab 切换 | App + h5 双端 | **P0** |
| 18 | Workspace FilesTab 文件树 | WorkspaceScreen → 文件 Tab → 5 层嵌套 mock 文件树渲染 | App + h5 双端 | P2 |
| 19 | Workspace TerminalTab | WorkspaceScreen → 终端 Tab → 输入 `help`/`pwd`/`ls`/`cat <file>` | App + h5 双端 | P2 |
| 20 | Workspace PreviewTab | WorkspaceScreen → 预览 Tab → URL 输入 + iframe 加载 | h5（App 端同 InlinePreviewPanel）| P1 |

## 3. 工作空间（workspace-as-company）验收清单

| # | 功能 | 验证手段 | 平台 | 优先级 |
|---:|---|---|---|---|
| 21 | `scripts/new-company.sh` | 跑一次 → workspace 创建 + 5 agent + ruoyi 子模块 | 主仓脚本 | **P0** |
| 22 | 5 角色 skill 范本就位 | `ls .agents/skills/{fda,core-swe,pre-sre,fdse,ds}/SKILL.md` | 主仓 | **P0**（已交付）|
| 23 | workspace 骨架 | `ls templates/workspace-skel/{cli,docs,specs,scripts}` | 主仓 | **P0**（已交付）|
| 24 | 平台层 wire（template + role + routes）| 服务端 `GET /api/companies/templates` 返回 3+ 模板 | 服务端 | ⏸️ 铁匠第二波 |
| 25 | DS 一票否决 | `release-app.sh` 没 ds 签 → 退出非零 | 服务端 | ⏸️ 铁匠第二波 |

## 4. DSH（DeepSeek Harness）验收清单（老板 2026-09-21 拍板，等 spec）

| # | 功能 | 验证手段 | 优先级 |
|---:|---|---|---|
| 26 | `packages/adapters/dsh/` adapter | 文件存在 + tsc 0 | ⏸️ 待 spec |
| 27 | DSH 接 MCP | `dsh` agent 能调本体 MCP server | ⏸️ |
| 28 | DSH 定制业务智能体 | 在 Coolie 上注册 1 个 DSH 智能体，跑通最小任务 | ⏸️ |

## 5. 验收脚本模板（agent-device）

每条功能按下面的结构跑：

```bash
# 1. 预检
agent-device web doctor   # healthy
curl -s http://localhost:3100/api/health   # 200
cd clients/h5 && pnpm dev > /tmp/h5.log 2>&1 &   # 后台启动
curl -I http://localhost:5173                       # 200

# 2. 跑断言
agent-device open http://localhost:5173 --platform web --session test-<num> --save-script
snapshot -i
# 操作步骤...
screenshot ./clients/expo/replays/evidence/func-<num>-<name>.png
# 断言（agent-device 表达式）
is text "期望文本"
assert element-exists ".some-class"

# 3. 退出
agent-device close
```

## 6. 老板回归清单（spot-check 路径）

老板想自己验：

```bash
# 1. 基础跑通
bash scripts/e2e-local.sh
#   期望：8 断言 7 PASS / 1 FAIL（R3 expo board-chat 真红，本地不连生产）

# 2. 装 v0.5.0（生产已发）验 ChatHome 预览 + 工作空间
# 打开 App → 工坊对话 → 发 "build xxx"
# 期望：BuildProgressCard 5 步 + SpecDiffCard preview
# 点 [Workspace] → 4 Tab 切换

# 3. PC web 版
cd clients/h5 && pnpm dev
# 打开 http://localhost:5173 → BoardChat 页 + [Workspace] 弹 4 Tab
```

## 7. 失败处理

| 失败类型 | 处理 |
|---|---|
| e2e 断言红 | 写真失败原因入 `docs-coolie/PM-FAILURE-CASES.md`，**不掩盖** |
| 真机装 0.5.0 有 bug | 写 bug spec 用 `bug-fix-flow` 三段式 |
| h5 dev 跑不起来 | 检查 `pnpm --filter @coolie/h5 dev` 报错 + `pnpm-lock.yaml` 是否要重装 |
| agent-device web 跑不动 | `agent-device web setup` + 重试 |

## 8. PM 验收签字

跑完全部 P0 项后：

- [ ] `git status` 干净
- [ ] `bash scripts/e2e-local.sh` 8/11 断言过（3 红的是真红：R3 expo chat / R1 dev 端口 / R2 鉴权 stub）
- [ ] `docs-coolie/PM-AGENTS.md` 第 10 节更新到最新跑结果
- [ ] `docs-coolie/PM-DISPATCH-LOG-YYYY-MM-DD.md` 加派单记录
- [ ] 老板 weixin 回签

## 9. 后续待补（老板拍板后）

- dsh wave1 验收项（§4）
- 5 角色 agent 真接入 company 创建后的验收项（§3 中 24/25）
- 编辑闭环（修改 → restartStep → 重新 build）的端到端验收

## 10. 文件引用

- `scripts/e2e-local.sh` —— 基础 3 断言
- `clients/expo/replays/*.ad` —— 4 replay 脚本
- `clients/h5/src/screens/workspace/WorkspaceScreen.tsx` —— 4 Tab
- `.agents/skills/comprehensive-testing-workflow/SKILL.md` —— 测试 skill
- `.agents/skills/palantir-role-engineering/SKILL.md` —— 角色视角
- `.agents/skills/bug-fix-flow/SKILL.md` —— 失败记录