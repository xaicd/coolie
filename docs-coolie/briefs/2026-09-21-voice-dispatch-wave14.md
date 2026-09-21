# Brief: wave 14 — 实现语音派发新任务 (腾讯 ASR 优先)

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: cmd

## 0. Boss 09-21 拍板

Boss: "新任务支持语音方式, 先用腾讯ASR"

PRD #1 语音派发 — 0.5.5 装机没有真链路, 必须现在打通.

## 1. 已知现状 (PM 09-21 实查)

```
✅ useRecorder.ts (90 行, expo-av) 录音组件存在, 但注释说"skeleton"
✅ plugin-multimodal dist 存在 (manifest.js + worker.js + ui/index.js)
✅ plugin-multimodal 在 server 已 symlink + 加载
❓ Tencent ASR key 是否配: 不确认
❓ useRecorder 是否接 dispatch: 注释说"skeleton", 没接通
❓ transcribed text 是否真创建 issue + 触发 ChatHome 派活: 未验证
❓ mobile App 录音后能否一键派活: 未验证
```

## 2. 目标

**Coolie工坊 0.5.5 App** 录音按钮 → 录音 → POST 到 Tencent ASR → transcribed text
→ 自动创建 issue 标题 = transcribed text → ChatHome 派活

**优先用腾讯云 ASR** (one-sentence recognition, ≤60s, ≤3MB audio)
如果腾讯 ASR 不可用 → fall back to OpenAI whisper → 不允许降级到本地

## 3. 任务 (5 步)

### 3.1 配腾讯云 ASR 凭据

Boss 09-21 给了账号 (robinschen1989@gmail.com / Cx-TWzbcbpOSLCxb4), 但 ASR 是腾讯云独立服务, 需要单独 secret.

```
ssh tc-coolie-claw 'sudo vim /opt/coolie/server/.env'
# 加:
TENCENT_ASR_SECRET_ID=<ask-boss-or-rotate-from-existing>
TENCENT_ASR_SECRET_KEY=<same>
TENCENT_ASR_REGION=ap-guangzhou
TENCENT_ASR_APPID=<from-boss>
```

**PM 决策**: 如果 boss 没单独给 ASR key, 写 `plugins/plugin-multimodal/.env.example` 让 boss 自己填, 然后 script 拷到 server. 不要瞎编 key.

### 3.2 改 useRecorder.ts 接 dispatch

`clients/expo/src/useRecorder.ts` 加 `dispatchVoice(audioBase64)` function:

```ts
async function dispatchVoice(base64: string, format: "m4a") {
  const res = await fetch("/api/multimodal/transcriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audio: base64, format, mode: "dispatch" })
  });
  if (!res.ok) throw new Error(`ASR failed: ${res.status}`);
  const { text, issueId } = await res.json();
  // 创建 issue 已由 server 端做 (issueId 返回), 这里只 toast 显示 transcribed text
  return { text, issueId };
}
```

### 3.3 改 server plugin-multimodal worker.ts

`packages/plugins/plugin-multimodal/src/worker.ts`:

```ts
import { fetchTencentASR } from "./tencent-asr";

async function handleTranscription(req: Request): Promise<Response> {
  const { audio, format, mode } = await req.json();
  // 调腾讯云 ASR (one-sentence recognition)
  const text = await fetchTencentASR(audio, format);
  if (mode === "dispatch") {
    // 自动创建 issue 标题 = transcribed text
    const issue = await createIssueFromText(text, req);
    return Response.json({ text, issueId: issue.id });
  }
  return Response.json({ text });
}
```

新建 `packages/plugins/plugin-multimodal/src/tencent-asr.ts`:
- 用 Tencent Cloud ASR SDK 或直接 HTTP API
- one-sentence recognition (一句话识别)
- API: `https://asr.tencentcloudapi.com` + Action `SentenceRecognition`

### 3.4 加 Tencent ASR API helper

新建 `packages/plugins/plugin-multimodal/src/tencent-asr.ts`:

```ts
import { createHmac } from "crypto";

interface TencentASRConfig {
  secretId: string;
  secretKey: string;
  appid: string;
  region: string;
}

export async function fetchTencentASR(
  audioBase64: string,
  format: "m4a" | "wav" | "mp3" = "m4a",
  config: TencentASRConfig
): Promise<string> {
  // TC3-HMAC-SHA256 签名 + 调 Tencent ASR 一句话识别
  // (mock 上去, 具体签名算法看 Tencent Cloud SDK 文档)
  const ts = Math.floor(Date.now() / 1000);
  const payload = {
    EngSerViceType: "16k",
    SourceType: 1,  // 1=音频流
    VoiceFormat: format,
    UsrAudioKey: `coolie-${ts}`,
    Data: audioBase64,
    DataLen: audioBase64.length,
    // ...
  };
  // ... 签名 + POST + 解析响应
  return transcribedText;
}
```

### 3.5 UI 集成 (BoardChatScreen toolbar 加录音按钮)

`clients/expo/src/screens/BoardChatScreen.tsx`:
- toolbar 加 mic icon (use Ioni cons `mic-outline`)
- onPress → 启动录音
- onPress again → stop + dispatchVoice
- toast: "派发中... transcribed text"
- on success → 显示 issueId + 转 ChatHome / 任务详情

## 4. 验证

```bash
# 1. 模拟器装新版 (门神 build + adb install)
# 2. 启动 0.5.6 (bump), 进 BoardChatScreen
# 3. 点 mic → 录音 3s → 再点 mic → stop
# 4. 看 logcat: POST /api/multimodal/transcriptions -> 200 + issueId
# 5. logcat: Tencent ASR -> text "..."
# 6. logcat: issue create -> chat-home dispatch -> 任务执行
# 7. 截图证据入 /tmp/emu-evidence/voice-dispatch/
```

## 5. Constraints

- ❌ Don't bump version 0.5.5 → 0.5.6 (PM 决策: bump 即可, voice 是新功能)
- ❌ Don't touch Coolie Web (0.6.2) — voice 在 App 端实现
- ❌ Don't touch paperclip 上游 (ui/)
- ✅ ASR 必须用腾讯云 (boss 明确"先用腾讯ASR")
- ✅ ASR key 必须从 boss / 现有 secret 拿, 不瞎编

## 6. Don't do

- ❌ Don't 降级到 OpenAI whisper (boss: 先用腾讯ASR)
- ❌ Don't 降级到本地 (纯本地 ASR 不在 scope)
- ❌ Don't modify server main routes (走 plugin-multimodal 现有路由)

## 7. Done definition

5 步全完 + 模拟器录 3 秒真验证 + transcribed text 真显示 + issue 真创建 + ChatHome 真派活 + 装机直链给老板 + commit + push。