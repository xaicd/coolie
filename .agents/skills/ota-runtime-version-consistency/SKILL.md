---
name: ota-runtime-version-consistency
description: OTA 的 runtimeVersion 必须三处一致（app.json / APK 原生 / 生产 manifest），否则 expo-updates 只下载不加载（「下了不装」）。Use when 老板装新包仍跑旧 bundle / OTA 弹了「更新就绪」但重启后没变化 / 改 release-app.sh 或 publish-ota.sh / 排查 expo-updates runtime mismatch。
---

# OTA 运行时版本一致性

> 老板 2026-09-21 撞的真 bug：OTA 只下载不加载（「下了不装」）。
> 根因不是 OTA 链路，而是**同一个 runtimeVersion 在三处漂移了**。

## 1. 症状

App 能 fetch manifest、能下载 bundle、能弹「更新就绪」，但**重启后还是旧界面**。
logcat 里 `DownloadComplete isUpdatePending=true` 却永远不出现新的 `updateId`。

这类症状先查本条，别去怀疑 Caddy / bundle 物理存在 / 网络（那些都在
`ota-caddy-fallback-trap`、`ota-cache-busting` 里）。

## 2. 为什么：runtimeVersion 必须三处一致

expo-updates 加载一份已下载的 bundle 前，比对**运行时的版本**和 manifest 的
`runtimeVersion`。对不上就**只下载、不加载**。这个值必须同时成立：

| # | 位置 | 含义 |
|---|---|---|
| 1 | `clients/expo/app.json` 的 `expo.runtimeVersion` | 意图（`policy=appVersion` → 运行时 = `expo.version`）|
| 2 | 装机 APK 内嵌的原生值 | AndroidManifest 的 `expo.modules.updates.EXPO_RUNTIME_VERSION` |
| 3 | 生产 `/ota/manifest` 的 `runtimeVersion` | 下发 bundle 声称的运行时 |

**唯一口径在代码里**：`clients/expo/scripts/runtime-version.mjs`。
三处都从它取/对它断言，不要再各自推导一份（漂移就是这么来的）。

## 3. 门禁（3 条线，一条命令）

```bash
# 全量（仓库根目录执行）
node clients/expo/scripts/verify-ota-runtime-consistency.mjs
```

单条也可单跑（便于定位）：

```bash
node clients/expo/scripts/verify-ota-runtime-consistency.mjs --only=app-json   # 第 1 条
node clients/expo/scripts/verify-ota-runtime-consistency.mjs --only=apk        # 第 2 条
node clients/expo/scripts/verify-ota-runtime-consistency.mjs --only=remote     # 第 3 条
```

底层查询命令（门禁就是调它们）：

```bash
cd clients/expo
node scripts/runtime-version.mjs --app-json          # 意图值
node scripts/runtime-version.mjs --apk               # APK 真值（aapt2 dump xmltree）
node scripts/runtime-version.mjs --apk=<path>        # 指定 APK
node scripts/runtime-version.mjs --native-manifest <AndroidManifest.xml>  # 源码 manifest
node scripts/runtime-version.mjs                     # 发布 manifest 应采用的值（APK 真值优先）
curl -fsS https://xrobinai.cn/ota/manifest | python3 -c 'import json,sys;print(json.load(sys.stdin)["runtimeVersion"])'
```

**退出码 / 诚实规则**：0 = 三条全跑通（`PASS — all 3 lines verified`）；
1 = 有不一致；2 = 无 FAIL 但有 NOT VERIFIED / NOT RUN。
跑不成的线报 `NOT VERIFIED` 并说明缺什么，**不当通过**（无 APK / 无 aapt2 / 无网络时如此）。

## 4. 第 2 条 FAIL 怎么办（这是「下了不装」的根因）

APK 原生值 ≠ `app.json` → 这份 APK 永远加载不了声称那个 runtime 的 bundle。

- **根因在** `clients/expo/scripts/fix-android-manifest.sh`：它把 `app.json` 的意图写进
  原生 manifest。老版本**只在「键不存在」时注入**，于是一次写成某个值后就再也不更新
  （本次真事件就是它在 0.5.5 时写死，0.5.7 的包还钉着 0.5.5）。现已改为**每次重写**。
- **修**：重建 APK（`bash scripts/release-app.sh <新版本> "..."`）。`release-app.sh` 第
  [5/9] 步会断言原生值 == `app.json` 意图，不一致直接拒绝发版（fail-loud，不带病出包）。
- **没重建之前**：`publish-ota.sh` 会采用 **APK 真值**写 manifest（迁就已装机运行时），
  所以现装机 App 的 OTA 能照常跑通 —— 这不是掩盖，是让 manifest 说实话；重建后
  两边自动对齐。

## 5. 抓到的真事件（wave16, 2026-09-21）

```
0.5.7 APK: aapt2 dump xmltree → EXPO_RUNTIME_VERSION=0.5.5, versionName=0.5.7
0.5.7 装机 App: 下载 manifest.runtimeVersion=0.5.7 的 bundle → 只下载不加载
wave15 曾把生产 manifest 手改成 0.5.5 迁就 APK → 但 publish-ota.sh 一跑又写回 0.5.7
```

门禁当场把三处摆出来（1 OK / 2 FAIL / 3 VERIFIED），第 2 条即根因。
修复：`fix-android-manifest.sh` 每次重写 + `release-app.sh` 断言 + `publish-ota.sh` 读 APK 真值。

## 6. 这个门禁**抓不到**什么

- **它不验证 bundle 的 JS 是否真新**：runtimeVersion 一致≠跑的就是新代码。要证明「跑的是
  新 bundle」，得看 logcat 里 `[OTA] manifest check … updateId=` 变化 + bundle 内独有指纹
  （如 `OTA_PATCH_MARKER`）。
- **无 APK 时第 3 条只能拿 app.json 意图比对**：本机没有构建产物时第 2 条报 NOT VERIFIED，
  它无法代表老板手机里那份包的运行时。
- **多版本并存**：它只对「本机这一份 APK + 当前生产 manifest」负责；装机用户若散布在多个
  原生 runtime 上，`policy=appVersion` 一次只能服务其中一个。
