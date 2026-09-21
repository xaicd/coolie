# Brief: wave 19 — 工坊对话智能识别 (老板指令智能分发到编排能力)

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: cmd

## 0. Boss 09-21 22:39 OOB 「a,b」

Boss 选 A + B 两个方案:
- A (wave18 已融): TasksScreen 顶部按钮组 [🔨 Build] [🛤️ Pipeline] [📋 Plan]
- **B (本 brief): 工坊对话智能识别 — 解析「建 pipeline / plan / 开 pr」+智能分发**

## 1. 目标

**Coolie工坊 0.5.9 App** BoardChatScreen 智能分发用户消息:

| 用户输入模式 | 解析后行为 |
|---|---|
| 「build xxx」/「做 xxx」/「开发 xxx」| 已有: POST /api/board/build/start → BuildProgressCard |
| 「建 pipeline xxx」/「创建 pipeline xxx」| 新增: POST /api/pipelines → 跳 PipelineEditor |
| 「plan xxx」/「规划 xxx」/「设计 xxx」| 新增: POST /api/plans → 跳 PlanDetail (Ask mode) |
| 「开 pr xxx」/「提交 pr xxx」| 新增: 触发 GitHub PR workflow (heartbeat 已有) |
| 普通对话 | 已有: ChatHome 派活回答 |

## 2. 任务 (4 步)

### 2.1 增强 BoardChatScreen 输入解析

`clients/expo/src/screens/BoardChatScreen.tsx`:

- 当前已有 `BUILD_TRIGGER_PATTERN` 检测「build xxx」
- 加新模式:
  - `PIPELINE_TRIGGER_PATTERN = /^(建|创建|新建)\s*pipeline\s+(.+)/i`
  - `PLAN_TRIGGER_PATTERN = /^(plan|规划|设计)\s+(.+)/i`
  - `PR_TRIGGER_PATTERN = /^(开|提交|建)\s*pr\s+(.+)/i`

- onSubmit 逻辑:
  ```
  if msg matches BUILD_TRIGGER: → server build orchestrator (existing)
  if msg matches PIPELINE_TRIGGER: → POST /api/pipelines { name: extracted } → toast + 跳 /pipelines/:id
  if msg matches PLAN_TRIGGER: → POST /api/plans { title: extracted } → toast + 跳 /plans/:id
  if msg matches PR_TRIGGER: → POST /api/issues { title: 'PR: <text>', tags: ['pr-workflow'] } → 触发 heartbeat 自动开 PR
  else: 普通 ChatHome 派活
  ```

### 2.2 新建 server 路由 (paperclip 上游已有, 只暴露)

- `GET /api/pipelines?companyId=X` — 已有,只读
- `POST /api/pipelines` — paperclip 上游 pipelines.ts 已有 create, 暴露出来
- `GET /api/plans?companyId=X` — paperclip 上游 plans 端点(如有), 暴露
- `POST /api/plans` — paperclip 上游 plans create 暴露

如果 server 没有 plans 端点, 用 issue_relations 模拟 (plan doc → plan task issue + subtask issues 关联)

### 2.3 h5 镜像 + i18n 字典

新建 `clients/h5/src/screens/BoardChatScreen.tsx` 镜像 (h5 端同样智能分发逻辑).

i18n 字典加 5 条 (波 18 已加 11 条, 本波加 5 条新模式):

```
'Build mode started' → 'Build 模式已启动'
'Pipeline created' → 'Pipeline 已创建'
'Plan created' → 'Plan 已创建'
'PR workflow triggered' → 'PR workflow 已触发'
'Unknown command' → '未知指令, 请用 build/pipeline/plan 开头'
```

### 2.4 模拟器验证

```
1. 启动 0.5.9 → 进 BoardChatScreen
2. 测 4 个模式:
   - 发 "build xxx" → BuildProgressCard 渲染 (已有)
   - 发 "建 pipeline 部署新功能" → toast 'Pipeline 已创建' + 跳 /pipelines/:id
   - 发 "plan 改登录页" → toast 'Plan 已创建' + 跳 /plans/:id
   - 发 "开 pr 修bug" → toast 'PR workflow 已触发' + 看到 issue 创建
4. 发 "随便聊天" → 普通 ChatHome 派活 (无副作用)

6. 期望: 4 个模式都触发对应 UI, 普通消息不受影响
```

## 3. Constraints

- ❌ DON'T 改 paperclip 上游 (ui/ + server/ 不动) — 只暴露 + 客户端分发
- ❌ DON'T 改 build-orchestrator.ts — 已工作
- ✅ DO bump 0.5.8 → 0.5.9
- ✅ DO 复用 server 现有 /api/pipelines 端点 (paperclip 上游已有)

## 4. Don't do

- ❌ Don't 让普通对话走错路径 (解析器要严, 避免 false positive)
- ❌ Don't 删现有 build-orchestrator 行为 (build xxx 仍走老路径)
- ❌ Don't 让 plan / pipeline / pr 路径阻塞 build 路径

## 5. Done definition

4 步全完 + 0.5.9 APK + 模拟器验证 4 模式 + 普通对话不受影响 + commit + push + 发版 + 上 COS:

```
Coolie工坊 0.5.9: https://dls.xrobinai.cn/coolie/app/0.5.9/coolie-release.apk
```