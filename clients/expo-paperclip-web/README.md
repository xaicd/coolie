# Coolie Web (paperclip PC web 套壳)

[paperclip](https://www.xrobinai.cn/XROA) 完整 PC web 的 native 壳：一个单屏 Expo
App，用 `react-native-webview` 装 `https://www.xrobinai.cn/XROA`，商店名
**Coolie Web**，包名 `cloud.coolie.app.web`。

它与驾驶舱 App（`clients/expo/`，`cloud.coolie.app`）**并存**，互不覆盖：

| | 驾驶舱 (`clients/expo/`) | Coolie Web (本目录) |
| --- | --- | --- |
| 包名 | `cloud.coolie.app` | `cloud.coolie.app.web` |
| versionName | `0.5.2` | `0.6.4-paperclip-web` |
| OTA runtimeVersion | `0.5.2` | `0.6.4` |
| OTA 更新源 | `https://xrobinai.cn/ota/manifest` | `https://xrobinai.cn/ota/paperclip-web/manifest` |

两个 App 的 `runtimeVersion` 不同，所以一方的 OTA bundle 不会被另一方装上。

## 为什么不复用 `clients/expo/`

wave 9 的 spec（`docs-coolie/specs/2026-09-21-paperclip-pc-web-app-wave9.md`）
给了两条路：复用驾驶舱项目加一个 WebView 屏，或新开独立目录。这里选后者，理由：

- 老板要求**并存两个 App**（不同包名）。包名/图标/OTA 流都是构建期常量，塞进同一个
  Expo 项目就得靠 flavor 切换，比独立目录更容易出错。
- 驾驶舱 App 是 2400 行的原生 UI，套壳 App 只有一屏。合在一起会让驾驶舱的
  `App.tsx` 继续膨胀，也会让套壳的每一点改动都经过驾驶舱的构建。
- 两边共享的上游代码为零 —— 本 App 不 import `@coolie/api-client`，不做登录
  （登录、cookie、sessionStorage 全是 web 站自己的事）。

## 结构

```
clients/expo-paperclip-web/
├── App.tsx                  # 单屏 PaperclipWebScreen (WebView + toolbar)
├── app.json                 # 应用名 "Coolie Web" / 包名 cloud.coolie.app.web
├── index.ts                 # registerRootComponent
├── babel.config.js
├── tsconfig.json
├── scripts/publish-ota.sh   # 发布到 /ota/paperclip-web/
└── android/                 # gitignored 的本地预构建目录 (gradle 直构建)
```

`android/` 与 `ios/` 是 `expo prebuild` 的产物、**不进 git**（见 `.gitignore`）。
本仓库走 **gradle 直构建**（不跑 prebuild）：改 `app.json` 之后，需要同步改
`android/app/build.gradle` 里的 `versionCode` / `versionName`，以及
`android/app/src/main/AndroidManifest.xml` 里的 OTA 配置。

## 打包 (Android)

```sh
# 依赖：本目录需要一份 node_modules。它不是 pnpm workspace 成员，
# 可以从驾驶舱目录克隆避免重复下载（APFS 上是写时复制，秒级）：
cp -Rc ../expo/node_modules ./node_modules

# 预构建目录从驾驶舱目录拷一次即可（已含 kotlin 1.9.25 的版本目录修正）：
rsync -a --exclude build/ --exclude .gradle/ ../expo/android/ ./android/

export JAVA_HOME="$HOME/jdk/jdk-17.0.20.1+1/Contents/Home"
cd android && ./gradlew assembleRelease -x lint
# 产物: android/app/build/outputs/apk/release/app-release.apk
```

`release.keystore` 与它的口令只存在于 `android/`（gitignored）里，从不进 git。

## 发布

```sh
# APK 上传 COS（老板装机直链）
no_proxy=.myqcloud.com coscli cp android/app/build/outputs/apk/release/app-release.apk \
  cos://gzbucket/coolie/app/0.6.2-paperclip-web/coolie-release.apk

# OTA 增量更新（独立于驾驶舱的流）
bash scripts/publish-ota.sh android
```
