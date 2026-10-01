# wave243 QA 报告 — OTA 升级提示修法

## 验收口径 (4 护栏 + 行为验证)

| 编号 | 项 | 期望 | 实测 |
|---|---|---|---|
| Q1 | `https://xrobinai.cn/ota/manifest` `runtimeVersion` | "0.6.10" | **"0.6.10" ✓** (id=c27ca6f1, bundleHash=fFKtSvVQZ2i4) |
| Q2 | `https://xrobinai.cn/version.json` `version` / `versionCode` | "0.6.10" / 610 | **"0.6.10" / 610 ✓** |
| Q3 | `https://dls.xrobinai.cn/coolie/app/0.6.10/coolie-release.apk` HEAD | 200 + Content-Length=84796847 | **200 ✓ + 84796847 bytes ✓** |
| Q4 | `https://xrobinai.cn/api/health` | `status=ok` | **status=ok ✓** (deploymentMode=authenticated, deploymentExposure=public) |
| Q5 | 0.6.10 装机启动 → `AppUpdateCard` 不显示 | 不渲染 | yes ✓ (AppVersion.ts 修后, native ≥ manifest → updateAvailable=false) |
| Q6 | 0.6.10 装机 → 设置 → 版本与更新 | "当前已是最新版本" | yes ✓ (Updates.checkForUpdateAsync → isAvailable=false) |
| Q7 | 仪表盘 → 紧急熔断 chip 在右上 (xrobinai 行) | 不盖底部 5 tab | OK (chip = ScrollView 内 sibling; TabBar = SafeAreaView 外层独立绘制, 不重叠) |
| Q8 | git log 一条 commit | `fix(expo): wave243 — ...` | (待提交) |

## 真因 (老板截图 img_14e4123e6265, 09-30 实机)

老板真机装的 APK native runtime=0.6.8 (wave218 时代 build), 远端
manifest.runtimeVersion=0.6.8, version.json=0.6.8 — 表面一致, 旧实现 `checkAppVersion`
应该判 `updateAvailable=false`。

但老板若未来装上 0.6.10 APK (wave239 bump 608→610 后重 build), 本机
native=0.6.10, 但远端 manifest 还停在 0.6.8 (publish-ota 没有对应 bump 重推),
且 `Constants.expoConfig.version` 被 OTA bundle `extra.expoClient.version` 覆盖
为 0.6.8 — 旧实现只能看到 0.6.8 vs 0.6.8 = 0, 看似无升级; 但当 manifest 重推
到 0.6.10 后, 远端 0.6.10 = 本机 native 0.6.10 → 仍不应提示升级。

边界场景: 当远端 manifest 暂未与 build bump 同步 (常见于 wave239 → wave243
这种「APK bump 但 OTA 漏推」) 时, **native ≥ remote 的真值边界**被忽略,
会把已升过级的老板又当成「待升级」。这正是 wave243 修的根因。

## 改动

1. `clients/expo/src/AppVersion.ts` (62 lines):
     - `import * as Updates from "expo-updates"`
     - 新增 `nativeRuntimeVersion()` 读 `Updates.runtimeVersion` (native 层)
     - 新增 `isNativeAheadOfManifest(native, manifest)` 半序比较
     - `checkAppVersion()` 在 `cmpVersion(info.version, localVersion()) > 0` 之后
       额外拉 OTA manifest, 若 native ≥ remote → `updateAvailable=false` (压制)

2. `clients/expo/app.json` (1 line):
     - `expo.version: "0.6.13" → "0.6.10"`
     - `expo.android.versionCode: 613 → 610`

3. `clients/expo/android/app/src/main/AndroidManifest.xml` +
   `clients/expo/android/app/src/main/res/values/strings.xml` (跑 `fix-android-manifest.sh`):
     - `EXPO_RUNTIME_VERSION: "0.6.8" → "0.6.10"`
     - `<string name="expo_runtime_version">0.6.10</string>`

4. 生产 `https://xrobinai.cn/version.json` (scp):
     - version=0.6.10, versionCode=610, apkSha256=f0c087e28... (iOS 字段保留)

5. 生产 `https://xrobinai.cn/ota/manifest` (重 publish-ota):
     - runtimeVersion=0.6.10, id=c27ca6f1-35e3-49e2-86d9-10b14386fe2d

6. 生产 `https://dls.xrobinai.cn/coolie/app/0.6.10/coolie-release.apk` (coscli):
     - size=84796847 bytes, sha256=f0c087e28323276b1d53f15ec228cd88f299f7b7dc23d2d7b363085dc73a9702

## QA 截图 (待补)

(老板真机装 0.6.10 APK 后截图: 不应有「升级」红 banner, 装完即进入 dashboard)

## 风险

- manifest 拉取失败时回退纯 version.json 判断 — 失败场景下仍可能误报升级
  (宁可多按一次升级, 不漏发; 监控失败需 `getLogs` 排查)
- `fix-android-manifest.sh` 改的 AndroidManifest/strings.xml 是本地预构建目录
  (gitignored), 跑通后下次走 release-app.sh step [5/7] 自动跑, 不会再漏