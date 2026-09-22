# Brief: wave 21 — 会话过程全部支持语音 (4 个能力)

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: cmd

## 0. Boss 09-21 22:50 OOB 「会话过程也要全部支持语音」

老板要求 Coolie工坊 App 会话过程 **全部支持语音** — 不只是"语音派单"按钮. 4 个能力要齐:

1. **会话内长按 mic 录音** — 每条消息都能语音发 (不是只 dispatch 一个按钮)
2. **AI 回复 TTS 播放** — SSE 流式文本转语音播报
3. **历史消息 TTS 重播** — 点消息旁 [▶] 按钮播放
4. **语音消息气泡** — 录音发的不只是 text, 是个语音消息, 接收方可点播放

## 1. 已知现状 (PM 09-21 真查)

```
✅ useRecorder.ts 录音组件 (wave14, 90 行, expo-av)
✅ BoardChatScreen mic 按钮 → voiceDispatch() → ASR → issue 创建 (wave14/wave18/wave19)
✅ TasksScreen appBar mic 按钮 (wave20 in-progress)
✅ Tencent ASR 已配 (company_secrets 表里, wave14 验证)
✅ ChatHome SSE 流式回复已接 (streamingText 状态)
❌ TTS 没有任何实现 (grep 'tts\|SpeechSynthesis\|ExpoSpeech' = 空)
❌ 会话内长按 mic 没做 (只单按钮 dispatch)
❌ 语音消息气泡没做 (只显示 transcribed text)
❌ 历史消息 TTS 重播按钮没做
```

## 2. 目标

**Coolie工坊 0.5.11 App** BoardChatScreen 全部会话过程语音化:

```
会话内:
- chat input 旁长按 mic 录音 (替代打字) → 弹起后转 ASR → 文字入 input → 可继续编辑或发送
- 收到 AI 回复时 SSE 流式文本 → 同时 TTS 播放 (audio 流)
- 用户可点 AI 消息气泡旁 [🔊 播放] 按钮 → 单独 TTS 重播
- 录的语音消息是 voice bubble (audio url + duration), 点 [▶] 播放
```

## 3. 任务 (6 步)

### 3.1 chat input 旁长按 mic 录音 (替代打字)

`clients/expo/src/screens/BoardChatScreen.tsx`:

```tsx
// 在 chat input TextInput 右侧加 mic 长按按钮
<Pressable
  onPressIn={() => startRecording()}
  onPressOut={() => stopRecording()}
  style={styles.micPressable}
>
  <Text style={styles.micEmoji}>🎤</Text>
</Pressable>
```

长按开始录音 → 松开停止 → 调 ASR → transcribed text 自动填回 input → 用户可继续打字或点发送

复用 wave14 `voiceDispatch()` 但 mode 改成 'transcribe' (只转写, 不创建 issue).

### 3.2 AI 回复 TTS 播放 (SSE 流式转 audio)

新建 `clients/expo/src/services/tts.ts`:

```ts
// 调 server /api/multimodal/tts (新加)
// body: { text, voice?: 'zh-CN-XiaoxiaoNeural', format: 'mp3' | 'wav' }
// 返回 audio url / audio base64

// OR 客户端 expo-speech (offline, 免费, 但中文一般):
import * as Speech from 'expo-speech';
Speech.speak(text, { language: 'zh-CN', rate: 0.95 });
```

**优先用 server 端 TTS (腾讯云 ASR 已经在用, 加 TTS 同 SDK)**:

server 端 (paperclip 上游 plugin-multimodal worker.ts) 加 TTS 端点:
- 新建 `packages/plugins/plugin-multimodal/src/tts.ts`: 用腾讯云 TTS SDK (Action: TextToVoice)
- `POST /api/multimodal/tts` → { audioBase64, format: 'mp3' }

Client 端 (BoardChatScreen.tsx) SSE 流式回调 onToken 时:
```ts
const handleStreamToken = (token: string) => {
  setStreamingText(prev => prev + token);
  // 累积每句 (按句号 . ! ? 切) → 调 TTS 播放
  bufferRef.current += token;
  if (/[.!?。！？]\s*$/.test(bufferRef.current)) {
    playTts(bufferRef.current);
    bufferRef.current = '';
  }
};
```

### 3.3 AI 消息气泡 [🔊 播放] 按钮

在 assistant 消息气泡右上角加 [🔊 播放] 按钮 (already streamingText 渲染):

```tsx
{message.role === 'assistant' && !message.streaming && (
  <Pressable onPress={() => playTts(message.text)} style={styles.ttsBtn}>
    <Text>🔊</Text>
  </Pressable>
)}
```

### 3.4 语音消息气泡 (voice bubble)

修改消息数据结构 (`BoardChatMessage` type):
```ts
type BoardChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  audioUrl?: string;        // 语音消息 URL
  audioDurationMs?: number; // 录音时长
  audioTranscript?: string; // 同步 ASR 转写文本
  createdAt: string;
};
```

发送语音消息: audio base64 → POST /api/multimodal/transcriptions mode=transcribe-only → 拿 transcribed text + audioUrl → 渲染 voice bubble

Voice bubble UI:
```
┌──────────────────────┐
│  ▶ ━━━━━━━━━━━━━─── 8s │
│  "明天开会" (transcript) │
└──────────────────────┘
```

### 3.5 h5 镜像

`clients/h5/src/screens/BoardChatScreen.tsx`:
- mic 长按录音 → Web Speech API (浏览器原生, 免费) → 文字入 input
- AI 消息 [🔊 播放] → Web Speech Synthesis API (浏览器原生)
- 语音消息气泡 → HTML5 audio element

h5 用浏览器原生 API, 不用 server.

### 3.6 模拟器验证 (dev instance, 模拟器无麦 → h5 web 测)

```
1. bump 0.5.10 → 0.5.11
2. Build APK + adb install + 启动
3. 进 BoardChatScreen:
   - chat input 旁看到 mic 长按按钮
   - 长按 3s (模拟器) → 期望 transcript 显示 '...' (dev 配 ASR, 应能真转写)
   - AI 消息气泡右上角看到 [🔊 播放] 按钮 (dev 没 TTS, 看到 UI 即可)
4. (h5 web dev: chrome dev mode)
   - mic 长按 → 浏览器请求权限 → 录音 → 转写
   - 收到 AI 消息 → Web Speech API 播放
5. 截图 /tmp/emu-evidence/wave21-0.5.11/
```

## 4. Constraints

- ❌ DON'T touch paperclip 上游 (ui/) — 客户端分发 + server 端暴露
- ❌ DON'T 改 wave14 voiceDispatch (复用)
- ✅ DO server 加 TTS 端点 (复用 Tencent Cloud SDK)
- ✅ DO client 加 voice bubble + tts button + 长按 mic
- ✅ DO h5 用浏览器原生 Web Speech API

## 5. Don't do

- ❌ Don't 让 TTS 阻塞主线程 — 异步播放
- ❌ Don't 替换 ChatHome SSE 流式逻辑 — 在现有 stream callback 上加 TTS
- ❌ Don't 改 message schema 破坏现有 history — 用 optional fields

## 6. Done definition

6 步全完 + 0.5.11 APK 装机 + h5 镜像 + 模拟器验证 + commit + push + 发版 + 上 COS:

```
Coolie工坊 0.5.11: https://dls.xrobinai.cn/coolie/app/0.5.11/coolie-release.apk
```

## 7. Tencent TTS 凭据 (待 boss 配)

server 端 TTS 需要腾讯云 TTS secret (类似 ASR 配置). 字段:

```
TENCENT_TTS_SECRET_ID
TENCENT_TTS_SECRET_KEY
TENCENT_TTS_APPID
```

**PM 拍板**: 如果 boss 没给 TTS key, 先用 server 端 placeholder 写完代码, TTS 端点返 501 'TTS_NOT_CONFIGURED' — UI 仍显示 [🔊 播放] 按钮, 点时弹 'TTS 未配置' toast. 不阻塞 APK 发版. 等 boss 配 TTS key 后立即生效 (跟 ASR 同样的套路).

**或者 fallback**: 客户端 expo-speech (offline TTS, 语音质量一般, 但不用 server) — dev/prod 都能跑.