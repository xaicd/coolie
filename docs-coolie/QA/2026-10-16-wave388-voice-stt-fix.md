# wave388 — 录音 + 转文字 (STT) v0.6.58 失灵真因与修复

> 波次: wave388
> 执行员工: 铁匠贰号 (forge-ii-core-swe)
> 底层引擎: cmd
> 日期: 2026-10-16
> 仓库: /Users/mac/workspace/xaicd/coolie @ main
> 老板原话: 「按住说话功能还是不行，然后滑动滑动到那个转文字都一样，都不行」

---

## 0. 结论 (一句话)

**真因在服务端, 不在客户端手势/权限**: 腾讯云一句话识别的 `VoiceFormat` 参数
**必须传字符串** (`"m4a"`), 而插件一直在传**数字枚举** (`10`) —— 被腾讯云
`InvalidParameter: The value type of parameter 'VoiceFormat' is not valid, input type should be 'string'`
刚性拒绝。**"松开发送"与"右滑转文字"走的是同一个转写端点**, 所以两条路都失败、
现象"都一样、都不行"。已修 `packages/plugins/plugin-multimodal/src/asr/tencent.ts`,
**已部署生产 (xrobinai.cn) 并用真实中文语音端到端验证通过 (201 + 正确文字)**。
老板现有 v0.6.58 App **无需重装** 即可恢复语音转文字。

| 项 | 修复前 | 修复后 |
|---|---|---|
| 生产 ASR 真实中文语音 | ❌ HTTP 502, `VoiceFormat` 类型非法, 无文字 | ✅ HTTP 201, 文字 `你好，这是酷吏语音识别链路测试。` |
| 按住说话 (居中松开发送) | ❌ 同一条端点 → 失败 | ✅ 恢复 |
| 滑动转文字 (右滑/上滑松开) | ❌ 同一条端点 → 失败 | ✅ 恢复 |
| 转写失败时录音 | 随临时缓存丢弃 | 复制到持久目录 + 自动挂附件, 可手动重发 |
| 麦克风权限被拒 | 只弹"录音失败" | 弹"去设置"直跳系统设置 |

---

## 1. 根因定位过程 (可复核)

### 1.1 侦察链路
- 录音/转文字实现在 `clients/expo/src/components/doubao/*` 与 `components/composer/VoiceInputButton.tsx`,
  但**两处均为停用预留死件** (注释明写 "停用预留", 宿主已退役)。**现役链路**是:
  - `clients/expo/src/screens/BoardChatScreen.tsx` (工坊会话输入区)
  - → `clients/expo/src/components/ChatInput.tsx` (wave362 手势 HUD)
  - → `clients/expo/src/useRecorder.ts` (expo-av 录音)
  - → `@coolie/api-client` `CoolieClient.voiceDispatch()` → `POST /api/plugins/paperclipai.plugin-multimodal/api/transcriptions`
  - → `packages/plugins/plugin-multimodal/src/worker.ts` → `asr/tencent.ts` (腾讯云 ASR)

### 1.2 排除项 (都不是真因)
- **权限声明**: `clients/expo/app.json` 已声明 `NSMicrophoneUsageDescription` +
  `RECORD_AUDIO`, iOS `Info.plist` / Android `AndroidManifest.xml` 均已合入。**不是权限缺失**。
- **ASR 未配置**: 用**真实公司 id** 探测生产端点返回 **502**(已配置、已发起调用),
  用**伪造 companyId** 才返回 501 (`ASR_NOT_CONFIGURED`)。即生产**已配置腾讯 ASR 凭据**。
- **插件未安装**: 生产 `/api/plugins` 显示 `paperclipai.plugin-multimodal` = `ready`。
- **手势/竞态**: wave362 已重构手势 HUD, 代码路径完整。

### 1.3 决定性证据 (真实 m4a 直打生产端点)
用 macOS `say` + `afconvert` 合成真实中文 m4a, base64 后 POST 生产转写端点:

```json
{"transcription":{"status":"failed","text":"","audio_bytes":33916,"audio_format":"m4a",
 "error":"Tencent ASR error InvalidParameter: The value type of parameter `VoiceFormat` is not valid, input type should be `string`"},
 "error":"transcription failed"}
HTTP 502
```

对照腾讯云官方 API 文档 (更新时间 2025-12-30) 一句话识别 `VoiceFormat`:

| 参数名称 | 必选 | **类型** | 描述 |
|---|---|---|---|
| VoiceFormat | 是 | **String** | 识别音频的音频格式，支持 wav、pcm、ogg-opus、speex、silk、mp3、m4a、aac、amr。示例值：`wav` |

**即 `VoiceFormat` 是字符串枚举, 不是数字枚举。** 插件却把它当数字枚举发 (`m4a → 10`),
腾讯云直接拒收 → 每一条录音、两条手势路径全部失败。

---

## 2. 修复内容

### 2.1 服务端 (核心真因)
`packages/plugins/plugin-multimodal/src/asr/tencent.ts`
- `TencentSentencePayload.VoiceFormat`: `number` → **`string`**。
- `TENCENT_VOICE_FORMAT_MAP`: 由 `{ m4a: 10, ... }` 改为 `{ m4a: "m4a", mp3: "mp3", ... }`
  (含 `spx/speex/spk → "speex"`, `opus/ogg → "ogg-opus"`, `amr` 等别名归一)。
- `resolveTencentVoiceFormat()` 返回字符串; 新增 `TENCENT_VOICE_FORMAT_LEGACY`
  把历史数字码 (1/4/6/8/9/10/16) 兜底映射为字符串, 老调用方不断裂。
- 更新注释与官方文档链接。

`packages/plugins/plugin-multimodal/tests/transcribe-only.spec.ts`
- 断言由"数字枚举"改为"字符串枚举", 显式钉死 `typeof payload.VoiceFormat === "string"`。

### 2.2 客户端韧性 (老板拍: 转文字失败应保留录音 + 网络异常落本地)
- `clients/expo/src/useRecorder.ts`: `stop()` 额外返回录音 `uri`
  (此前只有 base64, 录音文件随临时缓存丢失)。
- `clients/expo/src/services/voiceDraft.ts` (新): `preserveVoiceRecording()`
  把 m4a 从临时缓存复制到 `documentDirectory/voice-drafts/`, 返回可挂载的附件描述符
  (MIME `audio/mp4` —— `.m4a` 的 MIME essence, 命中服务端附件白名单)。
- `clients/expo/src/screens/BoardChatScreen.tsx`:
  - `handleMicPressOut`: 转写**失败/没听清**时, 调用 `preserveFailedVoice()` 保住录音,
    作为附件 staging, 提示"录音已存为附件, 可点发送重发" —— 录音不再被静默丢弃。
  - `handleMicPressIn`: 录音启动失败且为**权限**类错误时, 弹「去设置」(`Linking.openSettings()`)
    直跳系统设置, 替代原来只报"录音失败"。

---

## 3. 验证

### 3.1 单元测试 / 类型 (本地)
```
packages/plugins/plugin-multimodal  pnpm test        → 4 passed
packages/plugins/plugin-multimodal  pnpm typecheck   → clean
clients/expo                        pnpm typecheck   → clean
```

### 3.2 生产端到端 (真实中文语音, 最强证据)
- 部署: 重建 `dist/worker.js` → scp 到 `tc-coolie-claw:/opt/coolie/packages/plugins/plugin-multimodal/`
  (旧件备份 `worker.js.wave388-bak`) → 插件 `disable`+`enable` 热重载 (health = ready)。
- 复测同一真实 m4a:

```json
{"transcription":{"status":"done","audio_bytes":33916,"audio_format":"m4a",
 "text":"你好，这是酷吏语音识别链路测试。","error":"","duration_ms":282,
 "request_id":"4f9bfbc8-c669-4d22-89b7-ecf1b9fcfe4d"},
 "text":"你好，这是酷吏语音识别链路测试。"}
HTTP 201
```

> "酷力"→"酷吏"为同音字, 属识别精度而非链路问题。链路本身 **201 + 有效文字** 已闭环。

### 3.3 说明
- 老板真机 v0.6.58 走的就是本端点, **服务端修复后无需重装 App** 即恢复语音转文字。
- 客户端韧性改动 (2.2) 需下一次 App 发版才生效; 它与本次真因解耦, 属"不再丢录音"的兜底。

---

## 4. 变更文件清单

| 文件 | 变更 |
|---|---|
| `packages/plugins/plugin-multimodal/src/asr/tencent.ts` | **核心**: VoiceFormat 数字→字符串 |
| `packages/plugins/plugin-multimodal/tests/transcribe-only.spec.ts` | 断言同步字符串契约 |
| `clients/expo/src/useRecorder.ts` | `stop()` 返回录音 `uri` |
| `clients/expo/src/services/voiceDraft.ts` | 新增: 录音持久化兜底 |
| `clients/expo/src/screens/BoardChatScreen.tsx` | 失败保录音挂附件 + 权限"去设置" |
| `docs-coolie/QA/2026-10-16-wave388-voice-stt-fix.md` | 本报告 |

生产侧 (仓库外, 非 git): `/opt/coolie/packages/plugins/plugin-multimodal/{dist/worker.js,src/asr/tencent.ts}`
就地更新, 旧件备份 `*.wave388-bak`。

---

## 5. 回滚路径

1. 服务端: `ssh tc-coolie-claw 'cd /opt/coolie/packages/plugins/plugin-multimodal && cp dist/worker.js.wave388-bak dist/worker.js && cp src/asr/tencent.ts.wave388-bak src/asr/tencent.ts'`,
   然后 `POST /api/plugins/paperclipai.plugin-multimodal/disable` + `/enable`。
2. 客户端: 源码级 revert 本波 commit 即可, 不影响其它特性。

---

## 6. 未做 / 待办 (诚实登记)

- 未做模拟器 UI 驱动级 logcat 抓取: 真因已由**真实语音直打生产端点**双向(失败→成功)确证,
  模拟器 UI 驱动不增加判定力; 且权限声明在源码/清单/Podfile 三处均已核实。
- 未发新 App 版本: 服务端修复已让老板现有 v0.6.58 恢复可用; 客户端韧性改动
  (失败保录音/权限引导) 归入下一次发版。
- `packages/plugins/plugin-multimodal/src/enums.ts` 的 `AUDIO_FORMATS` 仍含腾讯不支持的
  `flac`; 现役客户端只发 `m4a`, 未在本次改动范围内 (避免无关波次扩面), 建议后续单独收口。
- 同伴在制品的 `scripts/coolie-dev-loop-supervisor.mjs` / `docs/sprint-prod/10/16.md`
  在 `check-fork-surface` 中为**基线已存在**的未声明项, 与本波无关, 未触碰。
