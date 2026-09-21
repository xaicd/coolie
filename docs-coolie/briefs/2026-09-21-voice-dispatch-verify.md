# Brief: Voice dispatch 真值验证 (PM 模拟器实查)

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: cmd

## 0. Boss 09-21 问「语音派发能用吗」

PRD #1 语音派发 — 老板想知道 Coolie工坊 App 0.5.5 上能否用 voice 派发 issue.

## 1. 真值采集 (模拟器)

```bash
# 1. 装机 0.5.5 (已装), 启动
adb shell am start -n cloud.coolie.app/.MainActivity

# 2. 进 BoardChatScreen, 找录音按钮 (在 toolbar 或 chat input 旁)
# 3. logcat 看录音事件:
adb logcat -d -t 500 | grep -iE "useRecorder|Audio.Recording|expo-av|voiceDispatch|Microphone" | head -20

# 4. 如果有录音按钮: 触发, 等 5s, stop
# 5. logcat 看 POST 到 /api/multimodal:
adb logcat -d -t 500 | grep -iE "POST.*multimodal|transcriptions" | head -10
```

## 2. server 端验证

```bash
# 1. plugin-multimodal 真注册?
ssh tc-coolie-claw 'journalctl -u coolie --since "-1m" --no-pager | grep -iE "plugin-multimodal|Voice|asr" | head -10'

# 2. 腾讯云 ASR key 配了?
ssh tc-coolie-claw 'sudo cat /opt/coolie/server/.env 2>/dev/null | grep -iE "tencent|asr|secret_key_id|secret_key" | head' 
# 期望: TENCENT_ASR_SECRET_ID=xxx TENCENT_ASR_SECRET_KEY=xxx
# 如果空 = 录音能录但 ASR 调不通

# 3. POST /api/multimodal/transcriptions 真的跑?
ssh tc-coolie-claw 'curl -s -X POST -H "Content-Type: application/json" \
  -d "{\"base64\":\"<短音频 base64>\",\"format\":\"m4a\"}" \
  https://xrobinai.cn/api/multimodal/transcriptions | head -c 300'
# 期望: {"text":"..."}
# 如果 500/empty = ASR 没配或 worker.js 没加载
```

## 3. 真值结果写 docs-coolie/VOICE-DISPATCH-STATUS.md

```
✓ 录音组件: useRecorder.ts (90 行)
✗ recorder 触发 dispatch: ?
✗ POST /api/multimodal/transcriptions: ?
✗ Tencent ASR 配置: ?
✗ 创建 issue: ?
✗ ChatHome 真派活: ?

PM 老实报"语音派发是否可用"
```

## 4. 如果链路有断裂

- ❌ ASR key 没配 → 派 brief 给 server operator 配 key
- ❌ useRecorder 没接 dispatch → 派 brief 给 App 端修 (1-2 天)
- ❌ plugin-multimodal 没加载 → 派 brief 给 server 修 (重启)

## 5. Don't do

- ❌ Don't bump version
- ❌ Don't touch Coolie Web (0.6.2) — 它是 paperclip 上游, voice 走上游路径
- ❌ Don't modify paperclip 上游 (ui/)

## 6. Done definition

真值报告 docs-coolie/VOICE-DISPATCH-STATUS.md (PASS/FAIL/真因) + commit + push + 装机直链不变。