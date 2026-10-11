# Bug: 原生APP 工坊对话响应锁定与流式体验治理 (Bugfix Spec)

## 1. 背景与老板原话
- **老板原话**:
  > “原生APP 的 工坊 输入对话 你试过吗 ，一直在 锁定 响应，不太合理”
- **复现路径与排查**:
  - 用户在移动原生 APP 的【工坊】会话中输入问题并点击发送。
  - 输入框、附件按钮、语音切换按钮、语音长按条均被 `canEdit = !sending && !disabled` 全面置灰锁定；
  - 由于底层 `streamBoardChat` 在 React Native 环境中默认使用 `fetch()`，而 React Native 核心网络层对于 SSE 并未实现渐进式 ReadableStream reader，导致其回退为 `await res.text()` 阻塞等待整条连接完全断开，在此期间没有任何字符吐出，用户手机界面完全呈现为卡在“正在连接会话助手…”的长时间锁定态；
  - 一旦请求发生网络偶发超时或异常，`handleStop` 中由于存在 `if (!controller) return` 的防御漏洞，导致无法成功清理模块级全局变量 `liveBoardChat`，离开页面后重新进入依然恢复为 `setSending(true)`，形成永久死锁锁定态。

## 2. Current Behavior（当前行为）
1. 用户在原生 APP 工坊中点击发送后，整个输入栏被整体强制锁定，用户无法草拟下一句指令、无法查看或选择附件，无法切换到语音输入模式；
2. 助手在后端执行多轮工具或生成长文本期间，客户端无任何增量 token 渲染，用户界面表现为“一直在锁定响应”；
3. 如果中途网络中断或助手耗时较长，用户点击中止按钮可能因 controller 引用错位而失效，用户无法跳出等待。

## 3. Expected Behavior（期望行为）
1. **输入框与交互栏全生命周期自由编辑 (Never Lock Input Box)**:
   - 响应中严禁锁定文本输入框 (`TextInput`)，用户在助手回答期间可以自由输入下一句提问、编辑草稿；
   - 附件按钮与语音切换按钮在响应期间保持可用；
2. **多态智能发送与打断 (Preemption & Stop-on-Demand)**:
   - 助手响应中且输入框为空时：右下角按钮展示【停止方块】(`StopBtn`)，用户随时一键优雅中止当前生成；
   - 助手响应中且用户已输入文字时：右下角按钮展示【发送箭头】(`SendBtn`)，用户点击即可无缝打断上一轮回答并立即发出新一轮提问（对标 ChatGPT/Claude 现代交互范式）；
3. **思考态就地【中止】按钮 (Inline Abort Action)**:
   - 在助手“三点动画 (TypingDots)”思考等待气泡内，常驻提供胶囊型【中止】按钮，为用户提供视线直达的即时取消路径；
4. **React Native 原生真实实时流推推流 (True RN XMLHttpRequest SSE Streaming)**:
   - `@coolie/api-client` 的 `streamBoardChat` 针对 React Native 环境 (`navigator.product === 'ReactNative'`) 采用原生 `XMLHttpRequest` 监听 `readyState === 3` 与 `4`，逐 chunk 实时解析 SSE `data:` 行，实现真机逐字渐显打字机效果；
5. **健壮解锁兜底 (Fail-Safe Unlocking)**:
   - `handleStop` 无条件清空 `setSending(false)`、清除局部状态与模块全局缓存 `liveBoardChat = null`，彻底根除偶发残留导致的永久死锁；
   - `LiveBoardChatState` 引入 90 秒时效性保护，超时残留自动丢弃。

## 4. Unchanged Behavior（不变行为）
1. 语音按住说话三态手势 HUD（居中发送、左滑取消、右滑转文字）在用户录音时保持原有交互机制不变；
2. 历史会话恢复与持久化（`boardConversations` / `issue_comments`）逻辑与数据库契约保持不变；
3. Web 控制台的 `BoardChat` 页面及 SSE 事件契约保持不变；
4. 构建进度卡 (`BuildProgressCard`)、审批卡 (`QuickApprovalCard`) 以及商业交付提案卡 (`FoundryProposalCard`) 的渲染与流转保持不变。

## 5. 根因与修复点
- **文件 1**: `clients/api-client/src/client.ts`
  - 根因: React Native 环境 `fetch` 回退为阻塞式 `await res.text()`，导致 SSE 流无法增量吐字。
  - 修复: 引入 React Native `XMLHttpRequest` 专线流式解析，监听 `readyState === 3` 实时 `dispatchLine`。
- **文件 2**: `clients/expo/src/components/ChatInput.tsx`
  - 根因: `canEdit = !sending && !disabled` 将响应期强行定义为不可编辑状态；
  - 修复: `canEdit = !disabled`；根据 `sending && !showSend` 动态呈现【停止】方块与【发送】箭头。
- **文件 3**: `clients/expo/src/screens/BoardChatScreen.tsx`
  - 根因: `handleStop` 存在 `if (!controller) return;` 漏洞，且 `handleSend` 在 `sending === true` 时直接拦截用户；
  - 修复: 提前声明健壮的 `handleStop`，在 `handleSend` 中支持前序中止并抢发；在 `TypingBubbleText` 旁新增【中止】按钮；模块镜像引入 90s 超时防僵尸残留机制。

## 6. 验证与门禁
- [x] `@paperclipai/server`: `tsc --noEmit` 0 报错
- [x] `@paperclipai/ui`: `tsc -b` 0 报错
- [x] `clients/expo`: `tsc --noEmit` 0 报错
- [x] `clients/api-client`: `tsc --noEmit` 0 报错
- [x] `scripts/check-governance-audit.sh`: 14/14 门禁全绿 PASS
- [x] 宿主机真机/模拟器实际输入走查通过
