# Brief: wave 21 (narrow) — 会话内 mic 长按 → 自动转文字 → 用户确认发送

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: cmd

## 0. Boss 09-21 22:57 OOB 「用户语音，自动转文字输入，然后用户确认发送」

老板明确会话内语音流程:
1. 用户长按 mic → 录音
2. 松开 → 自动 ASR → transcribed text 填到 input
3. **用户确认发送** (不自动派发)

## 1. 已知现状 (wave20 跑完, wave21 已入库)

```
✅ useRecorder.ts 录音组件 (wave14, 90 行, expo-av)
✅ Tencent ASR 已配 (company_secrets 表, wave14 验证)
✅ BoardChatScreen 当前 mic 按钮 → voiceDispatch() → ASR → 自动建任务 (wave14/wave19)
   ↑ 这是单按钮 dispatch, 不是会话内 mic
❌ 会话内 chat input 旁长按 mic 没做
❌ 长按 → ASR → text 入 input 没做
✅ 输入框已有 input state, 用户确认发送逻辑已有
```

## 2. 目标

**Coolie工坊 0.5.11 App** BoardChatScreen chat input 旁加 mic 长按按钮:

```
┌─────────────────────────────────────────┐
│ [input text..............] [🎤 mic] [发送] │
└─────────────────────────────────────────┘
```

长按 mic:
1. 启动录音 (recording=true, mic 高亮脉冲动画)
2. 松开 mic → 停止录音
3. POST /api/multimodal/transcriptions mode=transcribe-only (wave14 已实现, 加 mode 区分)
4. 收到 transcribed text → 自动 set 到 input state
5. 用户可继续打字编辑, 或按发送 (现有 send 流程不变)

## 3. 任务 (4 步)

### 3.1 改 BoardChatScreen chat input 行

读 `clients/expo/src/screens/BoardChatScreen.tsx`, 找到 chat input `<TextInput>` + 发送按钮 row.

**新增 mic 长按按钮在 TextInput 右侧, 发送按钮左侧**:

```tsx
<View style={styles.inputRow}>
  <TextInput
    value={input}
    onChangeText={setInput}
    placeholder="说点什么..."
    style={styles.input}
  />
  <Pressable
    onPressIn={startRecording}
    onPressOut={stopRecordingAndTranscribe}
    style={[styles.micBtn, recording && styles.micBtnRecording]}
  >
    <Text style={styles.micEmoji}>{recording ? '🔴' : '🎤'}</Text>
  </Pressable>
  <Pressable onPress={sendMessage} style={styles.sendBtn}>
    <Text>发送</Text>
  </Pressable>
</View>
```

### 3.2 stopRecordingAndTranscribe 处理

```tsx
const stopRecordingAndTranscribe = async () => {
  try {
    setVoiceBusy(true);
    const { base64, format } = await stopRecording();
    const res = await fetch('/api/multimodal/transcriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': 'https://xrobinai.cn' },
      body: JSON.stringify({ audio: base64, format, mode: 'transcribe-only' })
    });
    const { text } = await res.json();
    if (text.trim()) {
      setInput(prev => prev ? `${prev} ${text.trim()}` : text.trim());
      pushSystemEcho(`🎤 已转写: ${text.trim()}`);
    } else {
      pushSystemEcho('🎤 没听清, 请再说一次');
    }
  } catch (e) {
    pushSystemEcho(`🎤 转写失败: ${String(e?.message ?? e)}`);
  } finally {
    setVoiceBusy(false);
    setRecording(false);
  }
};
```

**关键**: transcribed text 只填 input, **不创建 issue**, **不调 ChatHome**, 让用户确认后才发送.

### 3.3 server 端确认 mode 字段支持

读 `packages/plugins/plugin-multimodal/src/worker.ts`:
- 当前 handler 在 `b.createIssue === true` 时创建 issue
- 加新分支: `b.mode === 'transcribe-only'` → 只返回 `{ text, transcriptionId }`, 不创建 issue
- 现有 `b.createIssue === true` 仍工作 (旧 dispatch 调用不变)

### 3.4 h5 镜像

`clients/h5/src/screens/BoardChatScreen.tsx`:
- mic 长按 → Web Speech API (浏览器原生, `webkitSpeechRecognition` / `SpeechRecognition`)
- onresult → text 入 input

h5 用浏览器原生, 不调 server.

## 4. 模拟器验证

```bash
1. bump 0.5.10 → 0.5.11
2. Build APK + adb install + 启动
3. 进 BoardChatScreen:
   - chat input 旁看到 mic 按钮
   - 长按 3s (模拟器) → 期望 transcript 显示 '...' (dev 配 ASR 应能转写)
   - input 自动填入 transcript
   - 用户可继续打字, 然后点 [发送] → 走 ChatHome 派活
4. 截图 /tmp/emu-evidence/wave21-0.5.11/
```

## 5. Constraints

- ❌ DON'T touch paperclip 上游 (ui/)
- ❌ DON'T 自动派发 (用户确认才发送)
- ✅ DO 复用 wave14 voiceDispatch() + useRecorder
- ✅ DO 长按 mic → text 入 input, 用户确认发送
- ❌ DON'T 加 TTS / [🔊] 按钮 / voice bubble (scope 限定)

## 6. Done definition

4 步全完 + 0.5.11 APK 装机 + 模拟器验证 (长按 mic → text 入 input, 不自动派发) + commit + push + 发版 + 上 COS:

```
Coolie工坊 0.5.11: https://dls.xrobinai.cn/coolie/app/0.5.11/coolie-release.apk
```