# Bug: 移动端语音录音开启后无法停止 (Voice Recording Infinite State Bug)

## 1. 背景
老板在真机使用 Coolie App 时报告：“录音 开启 就停不了,不知道咋回事”。
表现为一旦按下麦克风开始录音，录音状态红灯常亮、波形脉冲持续闪烁、无法正常松手结束或发送，导致语音转写和后续派活中断。

## 2. Current Behavior
- 当用户长按麦克风或点击录音后：
  1. `useRecorder` 中的 `recording` state 在各组件之间孤立，单例 `moduleShared` 更新时无法广播给各个 Hook 实例；
  2. 若手指滑动脱离按钮 hitSlop 范围，React Native 丢弃 `onPressOut`，导致没有停止事件触发；
  3. `stop()` 发生任何异常时，未能兜底重置状态；
  4. 缺少最大录音时间超时看门狗，一旦卡住则无限期占用音频输入硬件；
  5. 再次点击麦克风时，由于 `busy` 状态判断被屏蔽，无法通过再次点击强制停录。

## 3. Expected Behavior
- 按下麦克风正常启动录音，波形提示开启；
- 松开手指立即停止录音并触发转写；
- 手指滑出范围或离开屏幕时，自动触发停止；
- 录音超过 30 秒无操作时，看门狗自动停止录音并转写；
- 处于录音中时，再次点击麦克风能无条件**强制停止**并恢复正常输入状态；
- 全局单例状态通过 Listener 广播，所有 Hook 实例同步 `recording` 状态。

## 4. Unchanged Behavior
- 既有的腾讯 ASR 语音识别与文字自动回填逻辑保持不变；
- 录音权限检查、音频参数（HIGH_QUALITY）、base64 编码格式保持不变；
- 短于 500ms 的误触提示保持不变。

## 5. 修复方案 (5 重防线)
1. **全局广播机制**：在 `useRecorder.ts` 引入 `moduleShared.listeners`，任何 `start`/`stop`/`reset` 事件立刻通知所有订阅的组件 `setRecording(false/true)`；
2. **看门狗超时机制**：`start()` 启动时设置 30 秒安全定时器，到期自动执行 `stop()` 强制切断；
3. **点击强制中止支持**：若当前 `recording === true`，再次点击录音按钮直接当作 `stopRecording()` 执行中止；
4. **强化异常复位**：`stop()` 的 `finally` 无论发生何种错误，强制解构并清零，释放硬件；
5. **多组件兼容**：`BoardChatScreen.tsx`, `ChatInput.tsx`, `VoiceInputButton.tsx`, `useVoiceInput.ts` 统一行为。
