# COOA-228 · 移动端剩余屏/旅程真机复测 + 纯流式逐帧吸底实证

- 日期: 2026-10-16
- 执行: 百晓生 (DS / claude_local) · run `3ce21006-4c92-4bf4-89e8-91efe0057271`
- 工单: [COOA-228](/COOA/issues/COOA-228)（承接口 [COOA-189](/COOA/issues/COOA-189)）
- 设备: Android `emulator-5554` (coolie-test) · app `cloud.coolie.app` (Expo dev client, Metro :8081) · 1080×2400
- 设备锁: `scripts/device-claim.sh acquire --owner $PAPERCLIP_AGENT_ID --ttl 1500`（COOA-232 串行化契约）
- 结论: **DoD-3「纯流式逐帧吸底」真机实证 PASS**；DoD-1 完成 8/13 屏真机取证并发现 3 个结构性「不可达死屏」；DoD-2 审批闭环因实例 0 待审批仅取到空态，归档闭环已驱动并留证。

> 前置确认：前序 blocked 根因是 `emulator-5554` 被 [COOA-134](/COOA/issues/COOA-134) 的活跃 run 独占。本轮开始前 COOA-134 已 `done`、无 `device-claims`、`device-claim status` = free → 阻塞自然解除，本工单取得独占锁后串行驱动。

---

## 一、13 屏真机复测矩阵

`agent-device snapshot --json` 取 a11y 几何（`rect`），`adb exec-out screencap` 取像素；每屏落地 `nodes/*.json` + `shots/*.png`。

| # | 屏 | 真机状态 | 证据 |
| :-- | :-- | :-- | :-- |
| 1 | AgentDetailScreen | ✅ 可达（搜索 Hermes → 员工详情），渲染角色/适配器/执行态势 | `01-AgentDetail.{png,json}` |
| 2 | CodeDiffScreen | ⚠️ 未取到运行实证 | 需带 `diff` 交付物；产物中心 50 项均为 docs 目录树，无 diff 工件可路由（源码入口见 `ArtifactsScreen.tsx:509,1086`） |
| 3 | GitCredentialsScreen | ✅ 可达（设置→Git 仓库凭证），空态「还没有凭证」 | `03-GitCredentials.{png,json}` |
| 4 | InboxScreen | ✅ 可达（顶栏 🔔），与我(102)/未读/最近/受阻/全部 五 Tab + 命中列表 | `04-Inbox.{png,json}` |
| 5 | PipelinesScreen | ❌ **结构性不可达（死屏）** | 见 §二 |
| 6 | PlansScreen | ❌ **结构性不可达（死屏）** | 见 §二 |
| 7 | PluginSettingsScreen | ✅ 可达（设置→扩展插件中心→插件「配置」） | `07-PluginSettings.{png,json}` |
| 8 | RegisterScreen | ⏭ 未驱动 | 登录前态；需注销当前会话，会把共享模拟器留在未登录态 → 主动让行，未注销 |
| 9 | SpecEditorScreen | ✅ 可达（任务详情→「规范」），三段式 需求/设计/任务 | `09-SpecEditor.{png,json}` |
| 10 | TaskKanbanScreen | ✅ 可达（任务 Tab），列表/项目分组/看板 三视图(24 任务) | `13-TaskKanban-{list,board,grouped}.{png,json}` |
| 11 | TasksScreen | ❌ **死导入**：`App.tsx:78` import 但全仓无渲染点（任务 Tab 实渲染 `TaskKanbanScreen`） | 静态确证 |
| 12 | WebContainerScreen | ✅ 可达（资产→全景成本分析），WebView 壳 + 返回/前进/刷新/浏览器打开 | `12-WebContainer.{png,json}` |
| 13 | WebLoginScreen | ⏭ 未驱动 | 同 #8 登录前态 |

**四态/防撑爆/防遮挡**：本轮为空/默认/成功态取到几何；加载态与异常态需网络注入或后端故障，非纯前端可从 UI 驱动 → 未强制制造。每屏均已做**底栏 5 槽位 (y≈2190–2319) 与内容区几何不相交**检查（`rect` 层面无遮挡）。

---

## 二、结构性缺陷：3 个「不可达死屏」

`App.tsx` 为 `pipelinesOpen` / `plansOpen` / `projectsOpen` 建了 `useState(false)` 与整段渲染分支，但**全仓从无任何 `setPipelinesOpen(true)` / `setPlansOpen(true)` / `setProjectsOpen(true)` 调用点**：

```
$ grep -rn 'setPipelinesOpen(true)|setPlansOpen(true)|setProjectsOpen(true)' clients/expo/App.tsx
（无输出）
$ grep -rn 'onOpenPipelines|onOpenPlans' clients/expo/src/screens/*.tsx
（无输出）
```

- `PipelinesScreen` / `PlansScreen`：**无导航入口**，真机不可达（`TaskKanbanScreen` 已无「编排按钮组」入口）。
- `TasksScreen`：`App.tsx:78` 死导入，无渲染点。

**处置**：不擅自回收「疑似已被有意废弃」的 UI（无法确定是 `wave20 编排按钮组` 被有意下线还是回归遗漏）→ 已另立子工单交 PM/负责人裁决「补入口 or 下线残码」。

**次生发现**：13 屏中仅 `SpecEditorScreen` 有 `testID`（15 个），其余 12 屏为 0 → 真机只能按 label/rect 驱动，脆弱（承 [COOA-189](/COOA/issues/COOA-189) 既有发现）。

---

## 三、闭环旅程

### 3.1 审批签署（approval sign-off）
- 路径: 汇览 →「待审批」卡片 → 收件箱「审批」Tab。
- 实测: 仪表盘 `待审批 = 0`；审批 Tab 命中原生空态「✅ 没有待审批 · 所有申请均已裁决完毕」。
- 判定: **入口与空态 PASS**；因实例无 pending approval，签署/驳回**无对象可驱动**（非前端缺陷）。
- 证据: `04-Inbox-Approvals.{png,json}`。

### 3.2 终验归档（UAT archiving）
- 路径: 收件箱「与我」→ 已完成卡片 → 左滑 `SwipeToArchive` → 「归档」。
- 实测: 左滑触发归档，底部弹出 **5 秒撤销 Snackbar**「已归档: Conversation residential-plan-service 工坊」＋「撤销归档」按钮（`04-Inbox-swipe` / `04-Inbox-archived.{png,json}`）。
- **披露（未闭环点）**: 5 秒撤销窗口在自动化取证期间到期，撤销点击时落到下层卡片（页面已跳转），**本次归档未在原位撤销**。
  - 影响面: `POST /api/issues/:id/inbox-archive` 是**按 userId 的收件箱偏好**（`server/src/routes/issues.ts:11586`，与公告 dismiss 同类的软隐藏），非破坏性、非公司级数据变更；受影响的仅是当前操作账号的收件箱视图。
  - 恢复路径: 该账号对目标 issue 执行 `DELETE /api/issues/:id/inbox-archive` 即恢复；因归档态已从列表页隐去、且 agent key 的 actor userId 与 App 登录账号不同，agent 端无法代撤 → 记入残余事项。
- 证据: `04-Inbox-mine.{png,json}` / `04-Inbox-swipe.png` / `04-Inbox-archived.{png,json}`。

---

## 四、纯流式逐帧吸底真机实证（DoD-3 · PASS）

**方法**：工坊内触发一次真实 LLM 活跃会话，**发送不加 `--settle`**（`--settle` 会阻塞到流结束 → 取不到中间帧），随即 `adb screencap` + `agent-device snapshot --json` 逐帧采样；中途 `swipe` 上滑解锚。源码锚点：`BoardChatScreen.tsx` `L523 atBottomRef=true`、`L961 scrollToBottom(force)`、`L962 if(!force && !atBottomRef.current) return`、`L2232 onContentSizeChange → scrollToBottom(false,false)`。

**帧序（`stream2/`，输入框 y≈2043）**

| 帧 | 阶段 | 末条消息文本长 | 消息盒底 y | 判定 |
| :-- | :-- | --: | --: | :-- |
| a1–a2 | 发送后 | 818(历史条) | 1946/1935 | 流未起 |
| **a3** | 流式中 | 178 | **2012** | **「老板▌」+ 蓝色光标 + 红色停止键 → 边写边吸底** |
| a4 | 流式中 | 350 | 2012 | 长度增长、盒底仍贴底 |
| a5–a6 | 流完毕 | 349 | 1980 | 贴底静止 |
| b1–b8 | **上滑解锚后** | 349 | **1917（恒定）** | **位置停在解锚处，未被拽回底部** |

- **吸底证明**: 流式期间文本长度 178→350 增长，消息盒底恒定贴住输入框上沿（2012→1980 ≈ 紧邻 input y=2043）→ `atBottomRef=true` 时 `scrollToBottom(force=false)` 持续吸底。
- **解锚证明**: 上滑后盒底由 1980 降到 1917 并 8 帧恒定不回弹 → `L962` 的「解锚后不骚扰」语义成立。
- 佐证视频: `stream2/stream2.mp4`（本实验全过程）；`stream/stream.mp4`（首轮采样）。
- 视觉复核: a3 帧经视觉模型确认含「老板▌」打字光标 + 停止键，且消息紧贴输入行。

**残留（诚实标注）**: 本轮上滑解锚发生在流式结束约 2s 后（应答仅 ~350 字，流时长 < 5s），**未取到「流式中途解锚而不被拽回」的同帧证据**；「解锚后不拽回」为流后帧却已恒定，语义成立但非流内。`回底` 浮标因子屏仅上滑 63px（内容刚溢出、`atBottomRef` 未越过阈值）未出现。

---

## 五、残余 DoD 与依赖

1. CodeDiffScreen：需一个 `contentType` 含 `diff` 的交付物才能路由实证（源码入口在架）。
2. RegisterScreen / WebLoginScreen：需在**专用设备会话**注销后驱动，避免污染共享模拟器登录态。
3. 审批签署闭环：需实例存在 1 条 pending approval。
4. 「流式中途解锚」同帧证据：需一次更长的流（提示词要求长回答）并在流内 swipe。
5. 归档撤销复原：见 §3.2。

## 六、证据清单

- `nodes/*.json`（a11y 几何, 全屏）+ `shots/*.png`（像素）
- `stream2/{a*,b*}.{png,json}` + `stream2/stream2.mp4`（流式逐帧）
- `stream/{f*}.{png,json}` + `stream/stream.mp4`（首轮，`--settle` 阻塞事故留存）
- 本文件 `cooa228-device-retest.md`、机读报告 `cooa228-run-report.json`
