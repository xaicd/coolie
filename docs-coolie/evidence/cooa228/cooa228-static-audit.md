# COOA-228 · 设备独占冲突下的静态走查记录

- 日期: 2026-10-16
- 执行: 百晓生 (DS / claude_local), run `403106f9-c513-4644-9fa6-6c345b426ec7`
- 工单: [COOA-228](/COOA/issues/COOA-228)（承接口 [COOA-189](/COOA/issues/COOA-189)）
- 结论: **本轮无法取得 emulator-5554 独占权**，13 屏真机复测 / 闭环旅程 / 流式逐帧三项 DoD 均需真机，故本轮仅完成设备无关的静态走查，工单转 `blocked`。

## 一、设备独占冲突（实测）

- `adb devices` 仅 `emulator-5554`（`cloud.coolie.app` 已装, Metro :8081）。
- 该设备当前由 **另一数字员工的活跃 run 独占**：
  - 占位 run: `0fd7d363-bf59-41cc-b177-c7a0256b1877`（agent `58dc794d…` 门神/FDSE）
  - 占位任务: [COOA-134](/COOA/issues/COOA-134) `[COOA-117-S5] Stage 5 Expo App 移动端 i18n 对齐` (status=`in_progress`)
  - 活跃证据: `docs-coolie/evidence/cooa134/shots/en-*.png`（本轮 3 分钟内仍在写入）
  - 设备栈: `agent-device` 常驻 daemon (PID 15209) + Session snapshothelper instrumentation 活动
- 结论: 同一 emulator 上并发注入 `adb input` 会让双方证据互相污染，复测无效。**本工单让行**。

## 二、13 屏静态走查（设备无关部分，已完成）

对 13 屏逐一核对：文件存在、组件导出、`App.tsx` LIFO 栈注册、`ScreenHeader` 接入、`testID` 覆盖率。

| 屏 | 行数 | ScreenHeader | testID 数 | 栈注册 |
| :-- | --: | :--: | --: | :-- |
| AgentDetailScreen | 487 | ✔ | 0 | ✔ (agentDetail) |
| CodeDiffScreen | 938 | ✔ | 0 | ✔ (webContainer/sandbox 内) |
| GitCredentialsScreen | 445 | ✔ | 0 | ✔ (gitCredentialsOpen) |
| InboxScreen | 2996 | – | 0 | ✔ (inboxInitialTab) |
| PipelinesScreen | 216 | ✔ | 0 | ✔ (pipelinesOpen) |
| PlansScreen | 156 | ✔ | 0 | ✔ (plansOpen) |
| PluginSettingsScreen | 536 | ✔ | 0 | ✔ (pluginSettingsId) |
| RegisterScreen | 202 | ✔ | 0 | ✔ (顶层 auth) |
| SpecEditorScreen | 580 | ✔ | **15** | ✔ |
| TaskKanbanScreen | 1301 | – | 0 | ✔ (TasksScreen 内) |
| TasksScreen | 243 | ✔ | 0 | ✔ (Tab 根) |
| WebContainerScreen | 554 | – | 0 | ✔ (webContainerTarget) |
| WebLoginScreen | 463 | – | 0 | ✔ (顶层 auth) |

**发现（非阻断，供后续收口）**

1. **`testID` 覆盖率极低**：13 屏中仅 `SpecEditorScreen` 有 15 个 `testID`，其余 12 屏为 0。真机 `agent-device` 只能退化为「按 label/文本 + rect 中心」驱动，遇中英混排或同文案多按钮时定位脆弱。这正是 COOA-189 期用 `BoardChat__CodeCopy__1` 这类 testID 才稳定命中的原因。建议后续为 13 屏补 `data-agent-target`/`testID`（属新增改造，不在本工单 DoD 内）。
2. **LIFO 栈注册完整**：`App.tsx` 单一 `onBack` 逆序出栈链（`webContainerTarget → agentDetail → pipelinesOpen → plansOpen → gitCredentialsOpen → pluginSettingsId`）覆盖本次 13 屏中的可入栈屏，未见「跳级缺层」的静态隐患（真机仍需回归确认）。

## 三、流式逐帧吸底：源码逻辑核对（已确认在架）

`clients/expo/src/screens/BoardChatScreen.tsx`:

- `L523 atBottomRef = useRef(true)`
- `L961 scrollToBottom(animated=true, force=true)`
- `L962 if (!force && !atBottomRef.current) return;`  ← 解锚后 `force=false` 不再骚扰（核心吸底跟随语义）
- `L2232 onContentSizeChange={() => scrollToBottom(false, false)}` ← 流式内容增长触发的跟随钩子
- `L1708 scrollToBottom(false, false)` ← 流式分块跟随

即任务要证的「`atBottomRef=true` 时 `scrollToBottom(force=false)` 持续吸底、上滑解锚后不再拽回」逻辑**源码已在架**；缺的是真机中途逐帧采样的**运行期证据**。

## 四、剩余 DoD（全部依赖真机，待设备释放）

1. 13 屏逐屏四态（空/载/成/异）+ 防撑爆 + 防遮挡。
2. 审批签署闭环旅程（收件箱审批 Tab → 卡片 → 签署/驳回）。
3. 终验归档闭环旅程（终验核销单 → 归档）。
4. 纯流式逐帧吸底真机实证（真实 LLM 活跃会话中途逐帧采样）。

## 五、解除条件

- [COOA-134](/COOA/issues/COOA-134)（门神）释放 `emulator-5554`；本工单已置 first-class blocker，COOA-134 `done` 后自动 `issue_blockers_resolved` 唤醒续跑。
