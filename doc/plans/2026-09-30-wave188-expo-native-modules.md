# wave188 — 6 个 expo-* 原生模块最小集成

> **日期:** 2026-09-30
> **触发:** App 端还有 6 个常用 expo-* 模块没装 — 后台任务 / 后台拉取 / 定位 / 系统分享 / 打印 PDF / 本地推送; 装库 + 每库做 1 个最小交互 demo, 让老板在 App 内直接验证 (不靠截图/录屏)。
> **范围:** `clients/expo/package.json` (加 6 库) + `clients/expo/app.json` (config plugin + Android 权限) + `clients/expo/src/screens/NativeModulesScreen.tsx` (新) + `clients/expo/App.tsx` (SettingsSheet 加入口) + `clients/expo/CHANGELOG.md` (v0.6.13)
> **不动:** server、db、ui (web)、其他屏

---

## 0. 一句话

App 端装了 17 个 expo-* 模块, 还有 6 个老板可能用得上的没装: `expo-task-manager` (后台任务, 给后续 OTA 检查 / 通知接收做底层) / `expo-background-fetch` (周期性网络回调) / `expo-location` (定位) / `expo-sharing` (分享本地文件) / `expo-print` (HTML→PDF) / `expo-notifications` (本地推送 + 后续 APNs/FCM 入口)。修法: 装 6 库, 在 Settings 加 "原生模块" 屏, 每库挂一个最小按钮 (跑一次 API + 显示状态), 老板在模拟器/真机点一点就能看效果。版本固定到 expo SDK 52 bundledNativeModules 对齐的版本。

---

## 1. 真因

老板在多次迭代里提过:

| 诉求 | 缺什么 | 现状 |
|---|---|---|
| "App 关屏能不能继续检查 OTA/通知" | expo-task-manager + expo-background-fetch | 没装, App 切后台就停 |
| "现在能不能拿到我当前位置" | expo-location | 没装, 完全没定位能力 |
| "我把某个文件 / 链接发给同事" | expo-sharing | 只用 RN 自带 Share, 不能传文件 |
| "报表 / 工单能不能导出 PDF" | expo-print | 没装, 无 PDF 能力 |
| "重要事件能不能本地推送" | expo-notifications | 没装, 推不了 |

不是说要立刻做产品, 是「先把库装上 + 留个最小 demo 入口」, 后续接什么逻辑都有地基。

---

## 2. 设计

### 2.1 6 个库 + 版本 (expo SDK 52 锁定)

| 库 | 版本 | 用途 | 最小 demo |
|---|---|---|---|
| `expo-task-manager` | `~12.0.6` | 注册后台任务回调 (ExpoTask API) | 注册 1 个 `demo-task`, 跑 `TaskManager.unregisterAllTasksAsync()` + `registerTaskAsync` + `getRegisteredTasksAsync()`, 显示已注册列表 |
| `expo-background-fetch` | `~13.0.4` | 系统级周期性后台拉取 | `BackgroundFetch.registerTaskAsync` + `getStatusAsync()`, 显示状态 (denied/restricted/available) |
| `expo-location` | `~18.0.10` | GPS / 定位 | `requestForegroundPermissionsAsync` + `getCurrentPositionAsync`, 显示经纬度 |
| `expo-sharing` | `~13.0.0` | 调起系统分享面板传文件 | `Sharing.shareAsync` 传一个临时 txt, 显示 "已分享" Toast |
| `expo-print` | `~14.0.1` | HTML → PDF | `Print.printToFileAsync` 渲染一段 HTML, 生成 PDF 后 `Sharing.shareAsync` 给用户 |
| `expo-notifications` | `~0.29.14` | 本地推送 + (后续 APNs/FCM) | `requestPermissionsAsync` + `scheduleNotificationAsync` (5s 后), 显示 "已排程" |

每个 demo 一个按钮 + 一个状态/结果区, 跑过的状态 (权限 / 任务名 / 坐标 / PDF URI) 用 Linear 配色卡片呈现。

### 2.2 不做的事

- **不**接 FCM/APNs: 那需要 `google-services.json` (FCM) + Apple 推送证书 + 后端配合, 是另一波工作。`expo-notifications` 装上但只用 `scheduleNotificationAsync` 本地推送部分。
- **不**接后台定位: 老板 demo 只验前台定位 (single shot), 后台定位得 `UIBackgroundModes: location` + Android `ACCESS_BACKGROUND_LOCATION` 复杂权限, 推后。
- **不**替换现有 RN `Share` 调用: 现存的 RN 内建 `Share.share` 还在用, 不动。`expo-sharing` 只在新屏里用。
- **不**改 App.tsx 现有结构: 仅在 SettingsSheet 加一行, 由该行打开新屏 (走现成的 "settingsOpen → onOpenX → setXOpen(true)" 模式, 参考 wave70 git 凭证屏)。

### 2.3 入口: Settings 屏 → "原生模块" 行

参考 wave70 `WorkspaceGitToggle` 的写法 — 在 SettingsSheet 的 "开发者" 分组下加 1 行 "原生模块 (6 个 expo-*)", 点击打开 `NativeModulesScreen`。

打开模式复用 `setGitCredentialsOpen` 那一套 (settingsClose + newOpen), 简单且跟现有 UX 一致。

---

## 3. 改动面

### A. `clients/expo/package.json` (改)

```json
"expo-background-fetch": "~13.0.4",
"expo-location": "~18.0.10",
"expo-notifications": "~0.29.14",
"expo-print": "~14.0.1",
"expo-sharing": "~13.0.0",
"expo-task-manager": "~12.0.6",
```

(均与 expo SDK 52 bundledNativeModules 对齐; 装其他版本会触发 expo version mismatch warning。)

### B. `clients/expo/app.json` (改)

- `plugins` 加 `"expo-task-manager"`, `"expo-background-fetch"`, `"expo-notifications"`, `"expo-location"` (sharing/print 无 config plugin)
- `android.permissions` 加 `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION` (前台定位) / `POST_NOTIFICATIONS` (Android 13+ 推送)
- `ios.infoPlist` 加 `NSLocationWhenInUseUsageDescription` (前台定位文案)

### C. `clients/expo/src/screens/NativeModulesScreen.tsx` (新)

整屏壳, 6 个 Section (task-manager / background-fetch / location / sharing / print / notifications), 每节:

- 标题 (Ionicons + 中文)
- 一行说明 (ink3 11px)
- 一个主按钮 (`start/dismiss`)
- 一段结果区 (Line 卡片样式, 字号 11, ink2)

走 Sheet (modal=true, 半屏), 内容可滚动。

### D. `clients/expo/App.tsx` (改)

SettingsSheet:
- 多 1 行 Pressable "原生模块 (6 个 expo-*)", 在 "开发者" 分组下, `onOpenNativeModules` 回调
- `onOpenNativeModules` 由 HomeScreen 提供, 走现成 settingsClose + newOpen 模式 (`setNativeModulesOpen(true)`)

HomeScreen state:
- `const [nativeModulesOpen, setNativeModulesOpen] = useState(false);`

HomeScreen return:
- 在 SettingsSheet 渲染处下方条件渲染 `<NativeModulesScreen onClose=... />`

### E. `clients/expo/CHANGELOG.md` (改)

顶部加 v0.6.13 条目。

---

## 4. 验证

1. `pnpm install` 成功, 6 库都装上
2. `pnpm --filter @coolie/expo typecheck` 通过
3. `pnpm --filter @coolie/expo bundle` (expo export) 通过 — 验证 config plugin 链路通 (config plugin 错 = bundle 直接挂)
4. release-app.sh 出 0.6.13 APK, 推到模拟器
5. 打开模拟器 App → 设置 → 原生模块 → 每节按钮跑一次, 截图存 docs-coolie/evidence/wave188/

---

## 5. 风险

- **Config plugin 顺序**: expo-background-fetch/expo-location 等某些 config plugin 跟 expo-updates 有顺序要求, bundle 时若挂掉, 需调整 plugins 顺序。
- **Android 13+ 通知权限**: 默认拒绝, demo 第一次按按钮会触发权限弹窗; 若用户拒绝, 文案明确告知怎么开。
- **iOS 推送 demo**: simulator 无 APNs, 只 schedule local notification 能验证; 真机才验完整链。
- **expo-print + expo-sharing**: 模拟器无 PDF 预览, demo 只能用 `Print.printToFileAsync` 生成 URI 后 `Sharing.shareAsync` 让用户选 app; 真机用预览 app 验。

---

## 6. 不在范围 (后续波次)

- 后台定位 + UIBackgroundModes / ACCESS_BACKGROUND_LOCATION
- FCM/APNs + 后端 device registry
- 后台拉取实际接 OTA / 通知检查
- expo-print 接复杂报表
- expo-sharing 替换现有 RN `Share.share` 调用

---

## 7. 落地结果 (2026-09-30)

### 已落地

- 6 库按 SDK 52 bundledNativeModules 锁定版本装上
- `src/screens/NativeModulesScreen.tsx` 新屏 (456 行, 6 节每节 1 按钮 + 结果回执)
- `App.tsx` SettingsSheet 接入口, HomeScreen state + 渲染 + swipeBack 路径全部接好
- `app.json` 加 4 个 config plugin + Android 权限 + iOS InfoPlist 文案
- `metro.config.js` 加 workspace-root watchFolders + `@ide/backoff` resolveRequest (pnpm hoisted 到 workspace root 引发)
- `pnpm-lock.yaml` (clients/expo/) 增 349 行 (新增 6 包 + `@ide/backoff` peer + 全部 transitive)
- typecheck 通过 + expo bundle (android) 4.99 MB 成功导出
- commit `3deb382f1` 已落 main

### QA / 模拟器验收

> **未跑** — 需要 release-app.sh 真发版 (DS 一票否决 + OTA + APK 部署),
> 本波由 Claude Code 在本地开发环境完成代码 + bundle 验证, **没**触发真发版。
> 老板在模拟器上的 6 个交互 demo 需等 `bash scripts/release-app.sh 0.6.13 ...`
> 出 APK + OTA + 推送到 https://xrobinai.cn/ota/manifest 之后才能点。

### 真发版前还需

1. 处理 clients/expo 下其他波次遗留的未提交改动 (`toast.ts` / ErrorBoundary /
   ToastHost / `network.ts` / `stores/toast.ts` —— wave184 / wave186 产物)
2. `bash scripts/release-app.sh 0.6.13 "wave188 ..."` (DS 审批通过后)
3. 出 APK → 模拟器装 → 设置 → 原生模块 → 逐节跑 demo + 截图存 docs-coolie/evidence/wave188/

### 已知小坑 (供 wave188+ 排查)

- `TaskManager` 在 SDK 52 不暴露 `registerTaskAsync`, 注册入口走
  `BackgroundFetch.registerTaskAsync`, 后者内部调 TaskManager.register。
- `Notifications.scheduleNotificationAsync` 的 trigger 必须显式带
  `type: SchedulableTriggerInputTypes.TIME_INTERVAL`, 否则 TS 报缺字段。
- expo-notifications 的 peer `@ide/backoff` 在本仓库 (pnpm hoisted) 不会被
  metro 找到, 必须加 resolveRequest 别名 + 把 workspace root 加进 watchFolders。

