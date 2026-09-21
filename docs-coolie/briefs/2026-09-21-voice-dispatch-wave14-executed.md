# 执行报告: wave 14 — 语音派发 (腾讯 ASR) 真接通 + 装机直链

- 日期: 2026-09-21
- Boss: 「新任务支持语音方式, 先用腾讯ASR」(09-21) / 「派」
- PM: Hermes
- Worker: cmd
- 状态: **App 端已接通并发布 0.5.7; 服务端 ASR 真链路已用真语音验证。**

---

## 0. 一句话结论

**服务端链路 (腾讯一句话识别 → 建任务) 已用真语音跑通；App 端录音入口已接通并真机装机。**
期间发现并修复了两个阻断性 bug（App 连不上实例、`/version.json` 直出 403），因此
发版号从 0.5.6 顺延到 **0.5.7**（0.5.6 的 APK 连不上实例，应视为作废）。

## 1. 本次改动

```
改  clients/expo/src/screens/BoardChatScreen.tsx  底部输入区加麦克风 (mic-outline)
改  clients/expo/src/coolie.ts                    base URL 内联修复 + 默认线上实例
改  clients/expo/src/OTA.ts                       extraParam 键 deviceId -> device_id
改  scripts/release-app.sh                        version.json 落盘后 chmod 644
改  clients/expo/README.md                        device_id 说明同步
发版 clients/expo/{app.json,package.json,CHANGELOG.md}  v0.5.7 (versionCode 507)
```

### 1.1 驾驶舱工坊 mic (核心需求)

`BoardChatScreen` 底部输入区左侧新增麦克风按钮：点击开始录音，再次点击停止并把
m4a 交给 `coolie.voiceDispatch` → 服务端 `plugin-multimodal` 走 **腾讯云一句话识别**
转文字，并（`createIssue` 默认 true）直接把文字建成任务；转写结果与新建任务以系统
气泡追加进聊天流，派活与回执同屏可见。未配 ASR 凭据时明确提示
（`isAsrNotConfigured`），**不降级到 whisper / 本地**。

音频格式沿用 `useRecorder` 的 `HIGH_QUALITY` m4a（实测腾讯 `16k_zh` 直接接受
44.1kHz m4a，无需转码）。

### 1.2 阻断修复 A — 装机 App 连不上实例（严重）

`EXPO_PUBLIC_COOLIE_BASE_URL` 从未生效：babel-preset-expo 只在「直接成员访问」
时把 `process.env.EXPO_PUBLIC_*` 内联成字面量，而代码写的是可选链
`process?.env?.EXPO_PUBLIC_COOLIE_BASE_URL`（OptionalMemberExpression），内联器
不匹配 → 运行时查表得到 `undefined` → 恒用默认值。自 `f87299113`(9/18) 起，所有
release 构建都没连上过生产（默认值一路从 tailscale IP 变成 `127.0.0.1:3100`）。

实测证据（导出的 Hermes bundle 里）：

```
EXPO_PUBLIC_COOLIE_BASE_URL  count=1   ← 还是运行时查表，未内联
http://127.0.0.1:3100        count=1   ← 实际生效的默认值
```

装机后登录直接报 `Network request failed`。

修复：改成普通成员访问（加 `typeof process !== "undefined"` 保护，无 process 的
宿主不抛），默认值改回文档承诺的线上实例 `https://xrobinai.cn`。修复后同一导出：

```
EXPO_PUBLIC_COOLIE_BASE_URL  count=0
example.test (env 注入)      count=1   ← 真内联
```

### 1.3 阻断修复 B — `/version.json` 直出 403（App 永远看不到升级）

`https://xrobinai.cn/version.json` 原先落进 Caddy 的 SPA 兜底 → 返回 HTML，
App `checkAppVersion` 的 `JSON.parse` 失败并静默判「无更新」。两层原因：

1. **Caddyfile 没有 `/version.json` 特例**（只有 `/ota/*`）。已在生产
   `/etc/caddy/Caddyfile` 补 `handle /version.json { root */opt/coolie/ui/dist;
   file_server }`（与 OTA 同款：显式 JSON、no-cache），已备份原文件并 reload。
2. **scp 落盘的 version.json 是 600**，caddy 用户读不了 → 403。已在
   `release-app.sh` 的 scp 后补 `chmod 644`（发版脚本里，防回归）。

## 2. 验证

### 2.1 服务端真链路 ✅（真中文语音）

用 macOS `say -v Tingting` 合成「明天下午3点开产品评审会」，转 44.1kHz m4a，
以 agent key + 同源 Origin POST 生产端点：

```
POST https://xrobinai.cn/api/plugins/paperclipai.plugin-multimodal/api/transcriptions
  {"companyId":"4cafeb9a…","audioBase64":"<m4a>","format":"m4a","createIssue":true}

HTTP 201
transcription.status = "done"
transcription.text   = "明天下午3点开产品评审会。"
issue.id             = d026a5d3-8539-4377-9fe2-eda777a1d875
issue.title          = "明天下午3点开产品评审会。"
```

→ 腾讯 ASR 真识别 + 真建任务，端到端成立。

### 2.2 App 端 ✅（登录 + UI）

0.5.7 APK 装模拟器（versionName=0.5.7 / versionCode=506→507）：

- 用 agent key 登录**成功**，落到 `xrobinai` 公司驾驶舱（证明 base URL 已修）。
- 工坊对话屏底部输入区**麦克风按钮真渲染**（截图 `09-chat.png`）。
- OTA manifest 自检 `ok=true status=200 contentType=application/json
  protocolVersion=0 runtimeVersion=0.5.7`。

### 2.3 未能验证 ⚠️ — App 内录音（环境限制，非代码问题）

本机的 Android 模拟器**没有可用麦克风**（无 `-allow-host-audio` 时输入被静音，
开启后音频后端不稳），任何一次「开始录音」都会让 QEMU 线程全部挂死（
`detected a hanging thread 'QEMU2 main loop'`），模拟器随即 offline。因此
**App 内 3 秒真录音这一段无法在本机跑通**。

补偿：服务端真链路已用真语音验证（§2.1），且 App 与生产端点连通性已由登录验证
（§2.2）—— 剩下的唯一未测缝就是「设备麦克风 → m4a」这一原生片段，在有麦克风的
真机上才可测。请在真机上复测一条语音任务。

### 2.4 网络/升级链路 ✅

```
GET https://xrobinai.cn/ota/manifest   → 200 application/json, runtimeVersion 0.5.7
GET https://xrobinai.cn/version.json   → 200 application/json, version 0.5.7
GET https://dls.xrobinai.cn/coolie/app/0.5.7/coolie-release.apk → 200
```

## 3. 交付物

| 项 | 值 |
| --- | --- |
| App 版本 | **0.5.7** (versionCode 507) |
| APK 直链 | https://dls.xrobinai.cn/coolie/app/0.5.7/coolie-release.apk |
| COS 对象 | `cos://gzbucket/coolie/app/0.5.7/coolie-release.apk` |
| version.json | https://xrobinai.cn/version.json |
| OTA | https://xrobinai.cn/ota/manifest (runtimeVersion 0.5.7) |

## 4. 生产侧改动（服务器，非仓库）

- `/etc/caddy/Caddyfile`：新增 `/version.json` 直出块（已备份 `Caddyfile.bak.*`，已 reload）。
- `/opt/coolie/ui/dist/version.json`：chmod 644。
- 为验证临时创建、随后**已吊销**的 agent key：`wave14-voice-test`。

## 5. 未做 / 待 PM

- **测试残留**：`xrobinai` 公司里留了一条验证用任务
  `d026a5d3-…`（标题「明天下午3点开产品评审会。」）。属本次验证产物，是否删除请 PM 定。
- **0.5.6 作废**：0.5.6 的 APK 因 §1.2 bug 连不上实例，已被 0.5.7 覆盖（COS 上两个
  对象都在，version.json/OTA 已指向 0.5.7）。如需彻底下架 0.5.6 的 COS 对象请示下。
- **原生 runtimeVersion 仍显示 0.5.5**：What's New 的自检行「OTA 运行时」读
  `Updates.runtimeVersion` 恒为 0.5.5（android/ 是 gitignore 的本地预构建目录，
  release-app.sh 只改 build.gradle 的 versionCode/versionName，不重生成原生
  runtimeVersion 资源）。不影响本次功能，但 OTA 运行时的展示与实际不一致，建议另开
  issue（属 wave13 OTA 范畴）。

## 6. 验证命令速查

```bash
# 服务端真链路
bash -c 'say -v Tingting "明天下午3点开产品评审会" -o /tmp/v.aiff'
ffmpeg -y -i /tmp/v.aiff -ar 44100 -ac 1 -c:a aac /tmp/v.m4a   # base64 后 POST §2.1

# 交付物
curl -s https://xrobinai.cn/version.json
curl -sI https://dls.xrobinai.cn/coolie/app/0.5.7/coolie-release.apk
curl -s https://xrobinai.cn/ota/manifest | python3 -m json.tool | head

# 回归门 (客户端)
cd clients/expo && npx tsc --noEmit
```
