# OTA 触发链 debug 报告 — wave86 (0.5.55 为啥不更新)

- 日期: 2026-09-25
- Boss 指令: 09-23 27:18 OOB「0.5.55 为啥不更新」+ 27:19 OOB「派」
- Worker: claude / PM: Jason
- 产物: v0.5.60 (`https://dls.xrobinai.cn/coolie/app/0.5.60/coolie-release.apk`)

## TL;DR

**OTA 触发链本身没坏。坏的是 boss 装的那份 0.5.55 APK —— 它是一个陈旧构建：
包名是 `com.coolie` (而不是 `cloud.coolie.app`)，且原生层完全没有 expo-updates
配置 (无 update URL、无 runtimeVersion)。它从不检查更新，所以永远「不更新」。**

同时排除了 PM 的 5 个理论假设里的 4 个，并修正了一个认知：

- ❌ WhatsNew dismiss 吞弹窗 —— 与 OTA 检查无关 (0.5.55 根本没有 OTA)。
- ❌ 检查间隔太短没等到 —— `CHECK_ON_LAUNCH=ALWAYS` 冷启即查 (0.5.56+)。
- ⚠️ APK 内 runtimeVersion 真值 —— 确实查了，但 0.5.55 是「整个 updates 配置缺失」，
  比 PM 猜的「版本号钉错」严重得多。
- ❌ Caddyfile `/ota/*` 路径 —— 配置正确，静态直出，manifest 实测可拉。
- ❌ `updates.url` —— app.json 与 APK (0.5.56+) 内嵌一致。
- 🔧 **认知修正**: manifest `runtimeVersion`(0.5.59) ≠ 装机 runtime(0.5.58) 时，
  expo-updates **照样下载并加载** bundle (模拟器实测 `DownloadComplete +
  NEW_UPDATE_LOADED`)。runtimeVersion 不匹配不是「静默忽略」，是能更新的。

## 1. 证据 (aapt2 实证)

dls 上各版本 APK 的原生真值 (`aapt2 dump badging` / `xmltree` / `resources`)：

| 版本 | 包名 | versionCode | OTA 配置 | 内嵌 runtime |
|---|---|---|---|---|
| 0.5.55 ← **boss 装的** | `com.coolie` | 555 | **零配置** (无 URL/无 ENABLED/无 runtime) | 无 |
| 0.5.56 | `cloud.coolie.app` | 556 | ✓ | 0.5.56 |
| 0.5.57 | `cloud.coolie.app` | 557 | ✓ | 0.5.57 |
| 0.5.58 | `cloud.coolie.app` | 558 | ✓ | 0.5.58 |
| 0.5.59 | `cloud.coolie.app` | 559 | ✓ | 0.5.59 |

矛盾点： git 里 0.5.55 release commit (`797c8855f`) 的 app.json **已经有**
`updates.url` + `package: cloud.coolie.app` —— 而 dls 的 0.5.55 APK 两者皆无。
即该 APK 不是从该 commit 的源码构建的，是陈旧 `android/` 目录 (gitignored、
被旧工作树污染) 的产物。历史上存在过并行的两条构建线 (模拟器上还留着一个
`com.coolie` 0.5.56)。

## 2. 真验 (emulator-5554)

装 dls 的 0.5.58 → 冷启 → logcat：

```
UpdatesController onBackgroundUpdateFinished: Update available
Updates state change: DownloadComplete, context={isUpdateAvailable=true,
  isUpdatePending=true, latestManifest={...runtimeVersion:"0.5.59"...}}
ErrorRecovery: remote load status changed: NEW_UPDATE_LOADED
```

→ 0.5.58 装机自动拉到了 0.5.59 bundle。**OTA 链路对一切 0.5.56+ 装机是通的。**

## 3. 修复 (v0.5.60)

1. **发布正确的 0.5.60 APK** (`cloud.coolie.app` + 完整 OTA 配置，
   `expo prebuild --clean` 全量重建，不走 patch-in-place —— 那正是陈旧
   android/ 的温床)。version.json 指向它。
2. **客户端观测点** (`clients/expo/src/OTA.ts`):
   - `setupOTAListener` 启动即打 `[OTA] listener setup: runtimeVersion=... channel=...`
   - `[OTA] check manifest runtimeVersion=X vs installedApp=Y → match|MISMATCH` 探针
   - 每 60s 主动复查 (ON_LOAD 只覆盖冷启动；常驻前台的装机会错过更新)
   - 弹窗去重: 待重启状态只提示一次，不再每次状态变化都轰炸
3. **服务端观测点**: 生产 Caddy 增加站点访问日志 (JSON, 过滤 Cookie/Authorization)，
   请求头里的 `expo-runtime-version` / `expo-platform` 全部落盘 ——
   「谁在什么时候拉了哪次 manifest」从此可查。

## 4. Boss 手机怎么更新 (重要)

`com.coolie` 0.5.55 与 `cloud.coolie.app` 是**两个不同的 App 包名**，Android
不会原地升级，OTA 也够不着旧包 (它没有 update URL)。装一次
0.5.60 APK (云端直链 / 应用内升级卡片)，装完把旧的 Coolie 图标卸载即可。
此后 0.5.60 → 未来版本全部走 OTA 自动更新。

## 5. 遗留

- `release-app.sh` 的 patch-in-place 路线 (不跑 prebuild) 在 `android/` 陈旧时
  会再次产出无 OTA 配置的坏 APK —— 发版一律 `expo prebuild --clean`
  (wave85 起 brief 已固化该步骤)。
- 模拟器遗留的 `com.coolie` 0.5.56 是同一条坏线的样本，可 `adb uninstall com.coolie`。
