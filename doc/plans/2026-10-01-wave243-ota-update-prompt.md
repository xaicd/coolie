# wave243 — OTA 升级提示修法 (native runtimeVersion 边界压制)

## 范围

改 3 文件 + 重发 OTA + 推 version.json, 1 commit:

| 文件 | 改动 |
|---|---|
| `clients/expo/src/AppVersion.ts` | 加 `nativeRuntimeVersion()` + `isNativeAheadOfManifest()` + `checkAppVersion()` 用 OTA manifest 做 native 边界压制 |
| `clients/expo/app.json` | `expo.version 0.6.13 → 0.6.10`, `expo.android.versionCode 613 → 610` |
| `clients/expo/android/app/src/main/AndroidManifest.xml` + `res/values/strings.xml` | `EXPO_RUNTIME_VERSION=0.6.10` (跑 `fix-android-manifest.sh` 同步) |
| 生产 `https://xrobinai.cn/ota/manifest` | 重 publish-ota, manifest.runtimeVersion = 0.6.10 (待 APK rebuild 后) |
| 生产 `https://xrobinai.cn/version.json` | version=0.6.10 / versionCode=610 (已推) |
| 生产 `coolie-release.apk` | 0.6.10 APK rebuild + coscli 上传 (待) |

不动 server 业务代码, 不动 wave230 / 235 / 237 / 238 / 239 / 240 / 241 / 242。

## 真因 (老板截图, 09-30 实机)

老板真机 (Samsung SM-G9860) 装的 APK 在装 / 启动后 App 内仍弹"升级"按钮,
即便他装的 APK 已经在 native 层 bump 过:

- `adb dumpsys package cloud.coolie.app` → `versionCode=608, versionName=0.6.8`
  (实测模拟器; 老板真机大概率同源 — wave239 commit 改 `app.json/build.gradle`
  但本地没有触发 `gradle assembleRelease`, 仓库里 APK 产物仍是 0.6.8 binary。)
- 远端 `https://xrobinai.cn/ota/manifest` 的 `runtimeVersion=0.6.8` (wave218 09-30 14:17)。
- 远端 `https://xrobinai.cn/version.json` 的 `version=0.6.8`。
- `AppVersion.ts:checkAppVersion()` 比较 `info.version` (version.json) 与 `localVersion()`
  (`Constants.expoConfig.version`)。OTA 加载后 `Constants.expoConfig.version`
  被 `manifest.extra.expoClient.version=0.6.8` 覆盖, 本机 `localVersion()` 读
  到的也是 0.6.8 — 与远端齐平, 旧实现应该判 `updateAvailable=false`。

但 `AppUpdateCard` 的 `useEffect → checkAppVersion()` 还要看 native 层。
真正的信号源是 **装机 APK 的原生 runtimeVersion** (`Updates.runtimeVersion`,
读 AndroidManifest `EXPO_RUNTIME_VERSION` meta-data), 不是 `Constants.expoConfig.version`
这个会随 OTA 漂移的字段。**native runtimeVersion 是判断「本机原生层是否已
经追平远端 manifest」的唯一可信字段。**

老板未来装 0.6.10 真机: native=0.6.10, 远端 manifest=0.6.8 → `native > remote` →
不应再提示升级。旧实现没有这个 native-vs-manifest 对比, 任何「老板 bump 过 APK
但 OTA 没追上」 的时机都会误报升级。

## 改动

### A. 升级提示逻辑 (AppVersion.ts)

1. 加 `nativeRuntimeVersion()`: `Updates.isEnabled ? Updates.runtimeVersion ?? null : null`。
2. 加 `isNativeAheadOfManifest(nativeRuntime, manifestRuntime)`: `cmpVersion(native, remote) >= 0`。
3. 改 `checkAppVersion()`:
   - 旧: `cmpVersion(info.version, localVersion()) > 0` → `updateAvailable = newer`
   - 新: 若 `newerByJson` 为真, 额外拉一次 OTA manifest, 拿 `m.runtimeVersion`;
     若 `isNativeAheadOfManifest(native, m.runtimeVersion)` 为真 → `updateAvailable = false`
     (native 边界压制)。manifest 拉不到时回退纯 version.json 判断 (旧行为)。

```ts
// AppVersion.ts
const newerByJson = cmpVersion(info.version, localVersion()) > 0;
let nativeAhead = false;
if (newerByJson) {
  try {
    const manifestUrl = (Constants.expoConfig as { updates?: { url?: string } } | undefined)
      ?.updates?.url;
    if (manifestUrl) {
      const res = await fetch(manifestUrl, { headers: { "expo-channel-name": "production" } });
      if (res.ok) {
        const m = (await res.json()) as { runtimeVersion?: string };
        if (typeof m.runtimeVersion === "string") {
          nativeAhead = isNativeAheadOfManifest(nativeRuntimeVersion(), m.runtimeVersion);
        }
      }
    }
  } catch {
    // manifest 拉不到回退
  }
}
const newer = newerByJson && !nativeAhead;
```

### B. 重 publish-ota

跑 `bash clients/expo/scripts/publish-ota.sh android`。
**前提**: 先跑 `fix-android-manifest.sh` 让 AndroidManifest/strings.xml
写 0.6.10, **然后 gradle assembleRelease 出新 APK** — 因为
`runtime-version.mjs` 默认读 APK 真值, 不重 build 就会继续用旧 APK
里的 0.6.8 资源, 写出的 manifest runtimeVersion=0.6.8, 与新版本 json
不对齐。

### D. 紧急熔断按钮位置 (review)

`DashboardScreen.tsx:302-319` 的「🚨 紧急熔断」chip 是 ScrollView 内
`alignSelf: flex-end`, 父布局的 TabBar (5 项) 是固定底栏 sibling。
ScrollView 的内容区只占据 ScrollView 自身的高度, TabBar 在 SafeAreaView
外层独立绘制, 两者不重叠。**OK, 不动**。

## QA 路径 (老板真机装 0.6.10 APK)

1. 装 0.6.10 APK + 拉 OTA bundle (与 wave243 manifest runtimeVersion=0.6.10 一致)。
2. 启动 App → 不应再显示「升级」红 banner (`AppUpdateCard` 在 `appUpdate=null` 时不渲染)。
3. 进 `设置 → 版本与更新` → 弹「当前已是最新版本」 (`checkAndApplyUpdate` 走
   `Updates.checkForUpdateAsync`, native ≥ remote → `isAvailable=false`)。
4. 仪表盘 → 紧急熔断 chip 在右上, 5 底栏 Tab 不被遮。
5. WhatsNew 屏自检行: 「OTA 运行时 0.6.10」+「更新源 已连通」+「当前运行 bundle OTA 下发 / APK 内嵌」。

## 验收口径

- `https://xrobinai.cn/ota/manifest` `runtimeVersion = "0.6.10"`。
- `https://xrobinai.cn/version.json` `version = "0.6.10"` + `versionCode = 610`。
- 0.6.10 装机启动后 `AppUpdateCard` 不显示; `useOTA.checkUpdate()` 报「已是最新」。
- `git log --oneline` 一条 commit: `fix(expo): wave243 — native runtimeVersion 边界压制 + bump 0.6.10`。

## 风险

- `fix-android-manifest.sh` 改的 `AndroidManifest.xml` / `strings.xml` 是
  本地预构建目录 (gitignored), 不进 commit; 若有人拉新仓后没跑这个脚本,
  `gradle assembleRelease` 出的 APK EXPO_RUNTIME_VERSION 仍是 app.json 旧值。
  本波跑通后下次发版 `release-app.sh step [5/7]` 会自动跑 `fix-android-manifest.sh`,
  不会再漏。
- manifest 拉取失败回退旧逻辑 (纯 version.json 比对), 失败 = 仍可能误报升级。
  这是「宁可多按一次升级, 不漏发」的取舍; 监控失败需 `getLogs` 排查。

## 不动

- 不动 `server/src/routes/ota-manifest.ts` (已经按 wave164 把 version.json 当 canonical)
- 不动 wave230 / 235 / 237 / 238 / 239 / 240 / 241 / 242 任何文件
- 不动 `clients/expo/CHANGELOG.md` (发版流程 release-app.sh 会改; 本波手动发版未走 release-app.sh)
- 不动 iOS 字段 (`iosDownloadUrl` / `iosSha256` / `iosTestFlightUrl` 仍是 0.6.2)