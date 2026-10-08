# OTA 触发验证报告 — wave15

- 日期: 2026-09-21
- Boss 指令: 「触发增量更新」
- Worker: cmd / PM: Hermes
- Repo: `~/workspace/xaicd/coolie` (main)
- 不动版本 (0.5.7)、不重 build APK、不动 server 代码。

## TL;DR

真 OTA 链路**已跑通**: 装 0.5.7 的 App, 在新 bundle 发布后自动
`check → 下载 → 弹「更新就绪」→ 立即重启 → 跑新 bundle`。

但第一次发 patch 时撞到一个**真 bug**, 挡住了「加载」这一步:

> **0.5.7 APK 的原生 `runtimeVersion` 是 `0.5.5`**(构建期写死), 而 manifest 按
> `app.json` 声称 `0.5.7`。expo-updates 把 bundle **下载了却不启动**它 —— 因为运行时
> 版本对不上。

修复(不重建 APK): 把 manifest 的 `runtimeVersion` 改成 **`0.5.5`**, 与已装机 App 的
实际运行时一致。改完后 OTA 真生效, 端到端 logcat 全程可查。

---

## 1. bundle hash 变更 (触发一次真增量)

| 项 | 旧 | 新 |
| --- | --- | --- |
| bundle 文件 | `index-80deb5f12915f2d879faf17fdefb4611.hbc` | `index-10ccd232fc1656c73c1b2ff45e53c6c5.hbc` |
| bundle 大小 | 3,383,812 B | 3,383,871 B |
| manifest id (生产) | `ba89adf1-c138-46c4-a8d1-549e3fc04c0c` | `12c14309-…` → `3eae1866-…` |
| manifest runtimeVersion | `0.5.7` | `0.5.5`(见 §3) |
| app version / versionCode | 0.5.7 / 507 | 0.5.7 / 507(**不动**) |

客户端微改(让 bundle 字节变化 → hash 变, 并留一个 logcat 指纹):

- `clients/expo/src/screens/WhatsNewScreen.tsx`: 新增
  `export const OTA_PATCH_MARKER = "ota-patch-wave15-2026-09-21";`, 并把
  `OTA_PATCH_MARKER=${OTA_PATCH_MARKER}` 打进已有的 `[OTA] manifest check …` 日志。

构建 + 发布命令(使用仓库现成的 `scripts/publish-ota.sh`, 它按 Expo Updates
Protocol v0 生成 manifest 并 rsync 到生产):

```bash
cd clients/expo && bash scripts/publish-ota.sh android
# -> dist/_expo/static/js/android/index-10ccd232fc1656c73c1b2ff45e53c6c5.hbc
# -> rsync --delete 到 tc-coolie-claw:/opt/coolie/ui/ota/
```

线上校验:

```
GET https://xrobinai.cn/ota/manifest
  200, content-type: application/json, expo-protocol-version: 0
  launchAsset.url = .../index-10ccd232fc1656c73c1b2ff45e53c6c5.hbc (200, 3,383,871 B)
  旧 bundle index-80deb5f1….hbc -> 404 (已被 --delete 清掉)
```

## 2. 真 bug: APK 原生 runtimeVersion 与 version 脱钩

第一次按「正确」的 `runtimeVersion: 0.5.7` 发布后, 模拟器(装 0.5.7 APK)行为:

```
Updates state change: Check
Updates state change: CheckCompleteAvailable  (latestManifest.id=2497f374-…)
Updates state change: Download
Updates state change: DownloadComplete        (isUpdatePending=true)
```

即 **下载成功、pending=true**, 但**重启后仍跑旧 bundle**。落库读数(sqlite 读
`/data/data/cloud.coolie.app/databases/updates.db`):

```
id (hex)                            runtime_version  ok_launch  fail_launch
E12FEDECA82A44F7AEBB2B442E6414CE    0.5.5            2          0   <- 一直在跑(嵌入式)
2497F3741B25450FBEBA2A801C57359B    0.5.7            0          0   <- 下了, 从未被启动
```

根因(拆 APK 的 AndroidManifest 确认):

```
$ aapt2 dump xmltree app-release.apk --file AndroidManifest.xml | grep -A2 EXPO_RUNTIME_VERSION
name="expo.modules.updates.EXPO_RUNTIME_VERSION"  value="0.5.5"
$ aapt2 dump badging app-release.apk | grep ^package
package: name='cloud.coolie.app' versionCode='507' versionName='0.5.7'
```

App 运行时自检屏也当场点破(截图 `screenshots/ota-wave15/01-whatsnew-runtime-055.png`):

> OTA 运行时 **0.5.5**  /  APK 版本 v0.5.7
> 运行时版本（0.5.5）与 APK 版本（0.5.7）不同…

即: **APK 被打上 `versionName=0.5.7`, 但 expo-updates 的原生运行时版本还是建包时的
`0.5.5`**。`runtimeVersion.policy = appVersion` 的意图是运行时=0.5.7, 但原生工程里的
meta-data 没跟着 `app.json` 的 version 一起更新。于是任何声称 `0.5.7` 的 manifest 都
会被这个 App 判为「运行时不符」而不加载。

> 装机直链上的 APK 与本地/模拟器 APK **字节数完全一致**(77,644,062 B),
> 所以老板装的就是这份 `runtimeVersion=0.5.5` 的包 —— 修复必须迁就已装机运行时。

## 3. 修复(不重建 APK)

把生产 manifest 的 `runtimeVersion` 从 `0.5.7` 改为 `0.5.5`(并换新 id 触发一次
真实更新), 其余字段(launchAsset/assets/extra.expoClient)原样保留。改后:

```
GET https://xrobinai.cn/ota/manifest -> runtimeVersion: "0.5.5"
```

## 4. 模拟器真验证 (逐帧 logcat)

清空 App 数据 → 启 0.5.7 APK → 看 expo-updates 全状态机:

**① 首次启动: check → 发现新 bundle → 下载完成(pending)**

```
I/dev.expo.updates: Updates state change: Check, context = {isChecking=true, ...}
I/dev.expo.updates: Updates state change: CheckCompleteAvailable, context = {isUpdateAvailable=true,
    latestManifest={"id":"12c14309-…","runtimeVersion":"0.5.5",
    "launchAsset":{…"index-10ccd232fc1656c73c1b2ff45e53c6c5.hbc"}, …}}
I/dev.expo.updates: Updates state change: Download, context = {isDownloading=true, ...}
I/dev.expo.updates: Updates state change: DownloadComplete, context = {isUpdatePending=true, ...}
```

**② 重启: 真正加载 OTA 新 bundle, 指纹命中**

```
I/ReactNativeJS: [OTA] manifest check url=https://xrobinai.cn/ota/manifest ok=true status=200
  contentType=application/json protocolVersion=0 runtimeVersion=0.5.5
  updateId=12c14309-b528-4a70-bdba-cdb10cd6f463
  OTA_PATCH_MARKER=ota-patch-wave15-2026-09-21 error=none
```

`updateId` 由嵌入式 `e12fedec-…` 变为 **`12c14309-…`**(=OTA 下发的新 bundle),
且 `OTA_PATCH_MARKER` 这个**只存在于新 bundle 里的字符串**打了出来 —— 证明跑的就是新
bundle, 不是 APK 内嵌的那份。

**③ 用户侧提示 + 点「立即重启」生效**

- 弹出 Alert(截图 `screenshots/ota-wave15/02-update-ready-alert.png`):
  标题 **「更新就绪」**, 正文「应用新版本已在后台静默下载完毕，是否立即重启生效？」,
  按钮 `稍后` / `立即重启`。
- 点「立即重启」:

```
I/dev.expo.updates: Updates state change: Restart, context = {isRestarting=true, ...}
I/dev.expo.updates: Updates state change: reset, context = {isUpdatePending=false, ...}
I/ReactNativeJS: [OTA] manifest check … updateId=3eae1866-accc-46cd-ab44-5356867075be
  OTA_PATCH_MARKER=ota-patch-wave15-2026-09-21 error=none
```

**④ 重启后再 check: 已是最新, 不再重复下载**

```
I/dev.expo.updates: Updates state change: CheckCompleteUnavailable
```

## 5. 结论

- ✅ **「触发增量更新」通过**: server 发 patch → App 自动 check → 下载 → 提示 → 重启后
  跑新 bundle, 全链路 logcat 可证(bundle hash + updateId + bundle 内指纹三重对齐)。
- ✅ 未 bump 版本(仍 0.5.7 / 507), 未重 build APK, 未动 server 代码。
- ⚠️ 过程暴露的真 bug: 0.5.7 APK 的原生 `runtimeVersion=0.5.5`, 与 `app.json` 的
  0.5.7 脱钩。这是「OTA 看起来发了却拉不动」的根因。

## 6. 给老板

装机直链**不变**:

```
https://dls.xrobinai.cn/coolie/app/0.5.7/coolie-release.apk
```

装好后 App 会自动拉到本次 patch bundle(首次启动→下载, 重启→生效; 屏上会弹「更新就绪」)。

## 7. 遗留 / 必须跟进的修复

1. **真修复(需重建 APK, 本次明确不做)**: 让 APK 原生 `runtimeVersion` 与
   `app.json.version` 一致。可选:
   - 每次 build 前确认原生工程 meta-data 跟随 `app.json.version` 重新生成; 或
   - 把 `app.json` 的 `runtimeVersion` 从 `{policy:"appVersion"}` 改为**固定字面量**
     (如 `"1"`), 让运行时不再随版本漂移, 再重建一次 APK。
2. **现状是脆的**: 只要生产 manifest 的 `runtimeVersion` 保持 `0.5.5`, 现装机 App 都能
   收到 OTA。但**直接跑 `scripts/publish-ota.sh` 会按 `app.json` 重新生成 `0.5.7`**,
   会把 OTA 打回「下了不加载」。在 APK 修好之前, 每次发布后都要把 manifest 的
   `runtimeVersion` 改回 `0.5.5`(或先修复第 1 条)。

## 8. 证据文件

- 报告: 本文件 `docs-coolie/OTA-TRIGGERED.md`
- 截图(本地, 按 fork policy 不入库): `screenshots/ota-wave15/`
  - `01-whatsnew-runtime-055.png` — 装机自检屏, 「OTA 运行时 0.5.5」
  - `02-update-ready-alert.png` — 「更新就绪 / 立即重启」弹窗
- logcat 原文见 §4 各段(由 `adb logcat -v time` 采集)
