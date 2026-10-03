# C 端 Flutter 跨端发布诊断与脚本编辑

> 单一职责：C 端 (apps/mobile-c-end) Flutter 跨 iOS / Android / H5 三端的发布脚本、
> 客户端埋点、TestFlight 故障定位、根因沉淀。每一条规则都是 **事故沉淀**（含 v0.1.106→107
> iOS Tab 全空白根因），不复述 Flutter / Dart / Xcode 通用知识。

## 机器适用表（强制先看）

本 skill 由 mac dev 端沉淀, 部分 SOP 在 Linux 上直接执行会失败。**动手前必须对当前机器定位**:

| 机器 | 操作系统 | workspace | 跑什么 |
|---|---|---|---|
| **mac dev** | macOS | `/Users/mac/workspace/townwenlv/wenlv-next` | flutter build ios / xcodebuild / xcrun altool / 真机调试 / iOS 打包发 TF |
| **本机 Linux** (Hermes) | Linux 7.0 | `/home/beye/workspace/zhuangyuan/wenlv-next` | git ops / Python 验证脚本 / ssh tc-robin-claw 查 docker logs / 改 AGENTS.md + skill |
| **tc-robin-claw** | Linux (docker host) | `/root/...` | qloapps-* 容器跑业务; `docker logs qloapps-core-server` / `qloapps-mobile-web` 落点 |

**每节末尾打标**:
- `[仅 mac]` = xcodebuild/xcrun altool/flutter build ios 等 Apple 工具链, 本机跑会 `command not found`
- `[跨平台]` = Python 脚本/ssh 查 docker logs/git 提交, 哪台机器都行
- `[仅远端]` = `ssh tc-robin-claw` 才能拿到的事实 (容器日志、容器内文件)

## Before running 前置检查（必跑）

任何命令执行前, 先校验**三件事**都对得上 SOP:

```bash
# 1) 当前 OS 是不是 SOP 要求的 (mac = darwin, linux = linux)
uname -s   # 期望: Darwin / Linux, 不匹配则停手

# 2) 当前 workspace 路径 (不要假设 /Users/mac/... 永远是当前路径)
pwd        # 期望: 与 SOP 顶部 workspace root 对齐, 不匹配则停手

# 3) 如果是 ssh, 先确认目标主机不是误把 dev 机当 build 机
ssh -o BatchMode=yes -o ConnectTimeout=5 tc-robin-claw 'uname -s && hostname' 2>&1
# 期望: Linux + tc-robin-claw, 不是 mac 也不是本机
```

**铁律**: 路径 / OS / 主机名 三件不对, **不执行原 SOP**, 先改命令再跑。**禁止**用 `cd /Users/mac/...` 强行跳转绕过。

## 何时调用

- 用户说"打包到 TF / TestFlight 上传 / iOS 发布 / 安卓发包"
- 用户说"C 端 iOS 空白 / 黑屏 / 没内容"
- 用户说"加日志 / 埋点 / 上报"
- 用户说"客户端日志在服务端怎么看"
- 用户说"诊断构建出来的 release IPA"
- 在 PR review 中明确"看 iOS / 安卓 release 链"
- 跨平台 SDK（mobile_scanner / fluwx / wechat_open / google_mlkit）安装问题

## 三端差异硬规则 (2026-10 沉淀)

| 差异 | Android (apps/mobile-c-end) | iOS (apps/mobile-c-end) |
|---|---|---|
| 部署产物 | APK (flutter build apk / appbuild.sh) | IPA (xcodebuild archive + export) |
| 发布脚本 | `scripts/app-build.sh` | `scripts/release-ios-testflight.sh` |
| 验证脚本 | `scripts/verify-cend-test-apk.py` | `scripts/verify-cend-test-ipa.py` |
| 凭证来源 | `.env.test` 内 API_ENCRYPTION_KEY 等 | `~/secure/ios-build.dayanwa.env` (APPLE_TEAM_ID, etc.) |
| WebViewAssetLoader | ✅ 支持 (AssetsPathHandler + CustomPathHandler) | ❌ **PlatformCustomPathHandler unsupported — build 崩溃** |
| WebView 同源策略 | WebViewAssetLoader 拦截 assets 同源 | 必须走真服务器 `http://192.144.253.205/app` |
| Console 日志 | logcat / adb logcat | Console.app / idevicesyslog / Xcode device logs |
| ATS (HTTP cleartext) | 不需 | Info.plist 必须有 `NSAppTransportSecurity.NSExceptionDomains` |
| TestFlight 发布 | 不适用 (Google Play FBA) | `xcrun altool --upload-package` + App Store Connect API key |

### 关键: WebViewAssetLoader 跨端平台差异

`flutter_inappwebview` 的 `webViewAssetLoader` 字段 + 自定义 `CustomPathHandler`:

```dart
// ❌ iOS 上 build 抛 PlatformCustomPathHandler unsupported
//    FlutterError: InAppWebViewPlatform.createPlatformCustomPathHandler
//    → WebShellPage build 异常 → 5 个 Tab 内容全空白
webViewAssetLoader: WebViewAssetLoader(
  domain: 'appassets.androidplatform.net',
  pathHandlers: [_FlutterAssetsPathHandler(path: '/app/')],
),

// ✅ 必须 Platform.isAndroid 守护
final isAndroid = Platform.isAndroid;
final assetLoader = isAndroid
    ? WebViewAssetLoader(domain: ..., pathHandlers: [...])
    : null;
return InAppWebViewSettings(webViewAssetLoader: assetLoader);
```

**事故**: v0.1.106 release 装到 iOS, 5 个 Tab 全部 build 异常, 仅剩原生底部导航栏可见.
**症状**: Flutter framework 抛 PlatformCustomPathHandler unsupported, 完全 silent (release 模式
**自动 crash on build, 而不是运行时 throw). 诊断路径: ClientLogService 自动 dio 上报
`/api/app/logs` → core-server pino stdout → `docker logs qloapps-core-server` 抓到 stack.
**修复**: 仅在 Android 上挂 assetLoader.

## 客户端日志埋点体系

### 框架 (`lib/app/client_log_service.dart`)

ClientLogService 是统一入口, 所有 log() 调用双写:

1. **dio 上报**: `POST $_apiBaseUrl/api/app/logs` (后端写 pino JSON → docker logs)
2. **os_log 镜像** (v0.1.106+): `print('[qlo:$tag] $msg')` + `developer.log(msg, name: 'qlo.$tag')`
   → iOS 自动转发 os_log → Xcode Console.app / `idevicesyslog -u<UDID> 2>/dev/null | grep qlo.` 可抓

```dart
// 添加新埋点 (Android+iOS 自动生效, 由 Platform.isIOS 区分 platform tag)
ClientLogService.instance.error(
  'TagName',
  '人类可读的一句话',
  route: widget.initialPath,
  details: {'url': url.toString(), 'status': res.status},
);
```

**严重等级**: ERROR/CRASH → 立即 flush; INFO/WARN → 15s 周期 flush.

### WebView 埋点矩阵 (lib/features/shell/web_shell_page.dart)

| 事件 | tag | 内容 | 何时打 |
|---|---|---|---|
| onWebViewCreated | `WebViewCreated` | apiBaseUrl, webBaseUrl, mount, lockBuildEnv, keyLen | 启动一次 |
| onLoadStart | `WebViewLoadStart` | url + host + path | 每次 URL 变化 |
| onProgressChanged | `WebViewProgress` | progress=0..100 | 高频 |
| shouldOverrideUrlLoading | `WebViewNav` | navigate URL + host + scheme | 每次导航 |
| onLoadStop | (注入 JS) | document.title 写 DBG:JSON | 触发 SPA 端 fetch |
| onReceivedError | `WebViewError` | description + url + method + isForMainFrame | WebView 错误 |
| onReceivedHttpError | `WebViewHttpError` | status + reasonPhrase | HTTP 4xx/5xx |
| onConsoleMessage | `H5Console` | console.log/warn/error 全转 | SPA 内 console |
| (SPA fetch 拦截器) | `H5FetchFail` / `H5FetchErr` | H5 端 fetch 失败 | 网络异常 |

### 后端接收 (`apps/web → src/app/api/app/logs/route.ts`)

- POST /api/app/logs 接收 `LogEntry[]`, schema 校验后写 pino logger (`module: AppClientTelemetry`)
- 容器 `qloapps-mobile-web` / `qloapps-core-server` 都有 (mobile-web 跑 /api/app/logs)

> 适用: `[跨平台]` (代码改动跨平台; 验证容器落点仅远端 docker host)

### 远程查日志 (用户不在电脑边时)

```bash
# 1) 找全量 IOS + 0.1.10x 的 FlutterFramework 异常 (即 build 崩溃堆栈)
ssh -o BatchMode=yes tc-robin-claw \
  'sudo docker logs qloapps-core-server 2>&1 \
   | grep -aE "IOS.*0\.1\.10[5-7].*FlutterFramework" | head -3 | cut -c1-1000'

# 2) 看 WebView 加载序列 (按时间)
ssh -o BatchMode=yes tc-robin-claw \
  'sudo docker logs qloapps-core-server 2>&1 \
   | grep -aE "IOS.*0\.1\.10[5-7].*(WebViewCreated|WebViewLoadStart|WebViewNav)" | tail -20'

# 3) H5 SPA 端错误
ssh -o BatchMode=yes tc-robin-claw \
  'sudo docker logs qloapps-core-server 2>&1 \
   | grep -aE "IOS.*0\.1\.10[5-7].*(H5Console|H5Fetch|H5BridgeReady)" | tail -30'

# 4) 单设备 deviceId 全轨迹 (用户给 deviceId 时)
ssh -o BatchMode=yes tc-robin-claw \
  'sudo docker logs qloapps-core-server 2>&1 \
   | grep -a "<deviceId>" | tail -50'
```

**注意**: docker logs qloapps-core-server 的 stdout 是 pino JSON 格式; 用 jq 解析
可用 `| jq -r 'select(.platform=="IOS" and .appVersion=="0.1.107") | .message'`。

> 适用: `[跨平台]` (Python + ssh 哪台机器都行, 但 docker host 必须是 tc-robin-claw)

## TestFlight 发布 SOP

### 一条命令发布 (标准流程)

```bash
cd /Users/mac/workspace/townwenlv/wenlv-next
set -a; source .env.test; set +a   # 装载 C 端环境 (API_BASE_URL / WEB_BASE_URL / API_ENCRYPTION_KEY 等)
bash scripts/release-ios-testflight.sh --skip-icons
```

脚本内部 (顺序):
1. source .env.test → 校验 WEB_BASE_URL 含 `/app` (C 端必须挂 mount)
3. source `~/secure/ios-build.dayanwa.env` → 校验 APPLE_TEAM_ID 等
4. **flutter build ios --release --no-codesign** with --dart-define 数组 (9 项)
5. xcodebuild archive
6. xcodebuild -exportArchive (ExportOptions.plist 写入 provisioningProfiles)
7. **verify-cend-test-ipa.py**: Info.plist bundle/version, arm64, cert, profile, Dart string pool 含 host/api+/app, AppIcon PIL 像素采样 (≥10% 鲜绿)
8. xcrun altool --upload-package (App Store Connect API key)

### 跳过步骤 flag

- `--skip-icons`: 跳过 Chrome 渲染 SVG → 15 PNG, 直接用现有
- `--skip-build`: 跳过 flutter build + archive → 用已存在 Runner.app
- `--skip-upload`: 跑到 verify 停, 不传 App Store Connect

### bundle version 唯一性

CFBundleVersion 必须严格高于已上传 TF 版本 (否则 altool 报 "Version already exists" 拒收).
递进策略: 修 bug → +1; 功能更新 → +5; 重大架构 → +10.
`pubspec.yaml` `version: <ver>+<build>` 必须 + 左变, 同步 bump.

### 已发版本与冲突

发布前先查已用记录 (避免 0.1.104 撞 0.1.104 已被另一个 dev upload):

```bash
# 查已上传 App Store Connect versions
ssh -o BatchMode=yes tc-robin-claw '...'
# 或直接在 App Store Connect → TestFlight → Builds 列表看
```

> 适用: `[仅 mac]` + `[仅远端]` (xcodebuild/xcrun altool 仅 mac; ssh tc-robin-claw 仅 docker host)

## TestFlight Tester 邀请机制

**每个新 build version 都触发一次"新版本邀请"** (Apple 设计). 这是 normal 行为, 不是 bug.

### 三种解法

1. **iPhone 端开自动更新** (5 秒, 推荐最快):
   iPhone 设置 → TestFlight → 自动更新 → 开.
   之后每个 build 自动静默 install, 不需要任何邀请.

2. **Internal Testers 组** (一劳永逸):
   App Store Connect → Users and Access → Internal Testers group (100 人/年, 免 review).
   上传 build 自动入组, 每人一次性 Accept, 后续 build 自动装.

3. **External Public Link** (公链 + 一次性 App Review).

`xcrun altool` **不支持 tester 管理**, 必须走 App Store Connect 网页或 fastlane.

> 适用: `[仅 mac]` (App Store Connect 网页/fastlane 上传是 mac/web 端; xcrun altool 仅 mac)

## 仓库信息

- workspace root: `/Users/mac/workspace/townwenlv/wenlv-next`
- 远端: `github` + `origin` 双推送 (origin = gitee), 必须两个都 push
- pubspec.yaml `version: <x.y.z>+<build>` 在 `apps/mobile-c-end/pubspec.yaml`
- iOS 凭证: `~/secure/ios-build.dayanwa.env` (mode 600, **永不 echo 进 transcript**)
- C 端环境: `.env.test` (API_BASE_URL / WEB_BASE_URL / API_ENCRYPTION_KEY / etc.)

## 关联 memory / 项目知识

- `apps/mobile-c-end/lib/features/shell/web_shell_page.dart` — WebView 主入口
- `apps/mobile-c-end/lib/app/client_log_service.dart` — 日志服务
- `scripts/release-ios-testflight.sh` — iOS 发布链
- `scripts/verify-cend-test-ipa.py` — IPA fail-closed 验证
- `src/app/api/app/logs/route.ts` — 后端日志接收
- `memory/ios-26-5-sim-arm64-blocker.md` — iOS 26+ 模拟器与 Flutter plugin 链架构锁死

## 记录: 重要 Bug Fix 历史

- v0.1.107 (2026-10-02): WebViewAssetLoader PlatformCustomPathHandler unsupported on iOS — Platform.isAndroid 守护
- v0.1.106 (2026-10-01): 加诊断埋点 + oslog 镜像 + H5 fetch 上报
- v0.1.105 (2026-10-01): 第一次成功上传 (Delivery UUID afb7bd55-...)
- v0.1.104 (2026-09-30): bundle version 重复被拒 (ed7c03e9 已被用)