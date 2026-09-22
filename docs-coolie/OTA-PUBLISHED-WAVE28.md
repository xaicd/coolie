# OTA / 发版报告 — wave28 (2026-09-22)

- Brief: `docs-coolie/briefs/2026-09-22-edge-swipe-back-wave28.md`
- 前置报告: `docs-coolie/OTA-PUBLISHED-WAVE27.md`
- Worker: cmd / PM: Hermes

## TL;DR

| # | 事项 | 结果 |
|---|---|---|
| 1 | **0.5.15 APK 真补发** (wave27 查实「幽灵发版」) | ✅ 真构建+签名+COS 上传 (77,697,570 B) |
| 2 | manifest `runtimeVersion=0.5.15` + 新 hash | ✅ 已是 0.5.15, hash `hxCSzDvB…` 逐字节复核一致 |
| 3 | 模拟器真拉 0.5.15 | ✅ DownloadComplete → NEW_UPDATE_LOADED → 重启后 `updateId=0a497ba1…` |
| 4 | wave28 左缘右滑功能 (EdgeSwipeBack + BackHandler) | ✅ 已实现并真机(模拟器)四场景验证 |
| 5 | 0.5.16 / 0.5.17 发版 + OTA | ✅ 两份 APK 上 COS + version.json + manifest 同步 |
| 6 | wave27 报告入库 | ✅ commit `0c15a4132` |

**结论**: 0.5.15 之前「只改了 app.json、没出包」的问题已补实; wave28 手势功能已发版,
并在模拟器上**四场景全部真验通过** (含老板那台的手势导航机型场景)。

---

## 1. 0.5.15 补发 (wave27 §6 建议 1)

wave27 查实: `release: v0.5.15` 那次提交只 bump 了 app.json/package.json/CHANGELOG,
gradle 构建 / COS 上传 / version.json / OTA 都没跑 —— 世上不存在原生 runtime 为 0.5.15 的装机包。

补实动作:

1. `git revert dfd328db3` —— 把 app.json/package.json/CHANGELOG 退回 0.5.14 (与「实际发货」
   的真值对齐), commit `5b35a5899`。
2. `bash scripts/release-app.sh 0.5.15 "<原标题>"` —— 走完 4–9 步, commit `1c3d08e99`:
   - `[5/9]` 原生 `EXPO_RUNTIME_VERSION` = 0.5.15 (与 app.json 一致, 漂移即拒绝发版)
   - `[6/9]` `gradle assembleRelease` **BUILD SUCCESSFUL in 46s**
   - `[7/9]` COS: `cos://gzbucket/coolie/app/0.5.15/coolie-release.apk` (77,697,570 B)
   - `[8/9]` version.json → 0.5.15
   - `[9/9]` publish-ota.sh android

产物直链: <https://dls.xrobinai.cn/coolie/app/0.5.15/coolie-release.apk>

## 2. manifest = 0.5.15 (字段 + 字节级复核)

| 项 | 值 |
|---|---|
| manifest id | `0a497ba1-5cb4-4ad4-88c3-d51483870189` |
| runtimeVersion | **0.5.15** |
| launchAsset.key | `android-bundle-hxCSzDvB2pKqIiJSEo_X2pyrZv9ho9icIxXC9eB9edA` |
| launchAsset.hash | `hxCSzDvB2pKqIiJSEo_X2pyrZv9ho9icIxXC9eB9edA` (43 字符 base64url) |
| launchAsset.fileSize | 3509943 (数字) |
| assets | 19/19 都有 hash |

不只看字段非空 —— 把 `launchAsset.url` 的**实际字节**拉下来重算
`sha256 → base64url`, 与 manifest 写的 hash **逐字符一致**, 文件大小也一致。

门禁 `node clients/expo/scripts/verify-ota-runtime-consistency.mjs`:

```
[VERIFIED] app-json: intent=0.5.15 (policy=appVersion → 跟随 version 0.5.15)
[VERIFIED] apk:      原生 0.5.15 == app.json 0.5.15
[VERIFIED] remote:   远端 0.5.15 == APK 原生 0.5.15
PASS — all 3 lines verified.
```

**wave16/23/27 的「下了不装」在这里正式闭合**: 三处口径第一次全部真值相等。

## 3. 模拟器真拉 0.5.15 (coolie-test, sdk_gphone64_arm64)

装 0.5.15 APK → `pm clear` → 启动:

```
16:32:29  Updates state change: Check
16:32:29  Updates state change: CheckCompleteAvailable   latestManifest.id=0a497ba1…
16:32:29  Updates state change: Download
16:32:38  Updates state change: DownloadComplete         isUpdatePending=true
16:32:38  ErrorRecovery: remote load status changed: NEW_UPDATE_LOADED
# 重启 App
16:33:xx  [OTA] manifest check … runtimeVersion=0.5.15 updateId=0a497ba1-5cb4-4ad4-88c3-d51483870189
16:33:xx  Updates state change: CheckCompleteUnavailable  ← 已是最新, 不再重复下载
```

`updateId` 由内嵌 `a67b95ca…` 变为本次发布的 `0a497ba1…`, 自检屏显示「当前运行 bundle: OTA 下发」。
全程无 `Failed to construct manifest` / `AssetDownloadException`。

## 4. wave28 功能实现

老板 09-22 23:08 OOB: 「app, 我左手, 手机左边长按右滑要支持返回上一页, 不能直接退出 app」。

brief §3.1/§3.3 假设本客户端走 React Navigation + react-native-gesture-handler ——
**实测不成立**: `clients/expo` 是手写状态机导航 (`App.tsx` 里 `useState` 表示 tab/浮层/详情,
没有 `NavigationContainer`, 也没装 gesture-handler)。所以按实际架构落地:

1. **`src/components/EdgeSwipeBack.tsx`** (新) —— 用 RN 内置 `PanResponder` 实现 iOS 式
   edge swipe back, 不引新原生依赖。判定: 屏幕左缘 32dp 内起手 + 水平位移 > 垂直 1.5x;
   释放位移 ≥70dp 或 (≥40dp 且速度 ≥0.4dp/ms) 才算触发。不命中就什么都不做。
2. **`App.tsx` HomeScreen** —— 顶层包一层, `swipeBack` 按堆叠顺序逐层退:
   sandbox/diff/审批/搜索/通知/员工/流水线/计划/任务详情/新建浮层/设置 → 最后回上一个 tab;
   新增 tab 历史 (`tabHistoryRef` + `navigateTab`/`goBackTab`), 所有切 tab 都走 `navigateTab`。
3. **新建浮层 (composeOverlay)** 自带一层 `EdgeSwipeBack`, 左缘右滑关浮层而非退页。
4. **`BackHandler`** (0.5.17 追加, 见 §6.1) —— 系统返回键 / **手势导航下左缘内滑**映射到
   同一套 `swipeBack`。

## 5. 0.5.16 / 0.5.17 发版

| 版本 | 内容 | APK | manifest runtimeVersion |
|---|---|---|---|
| 0.5.16 | EdgeSwipeBack + 浮层关闭 + tab 历史 | `…/0.5.16/coolie-release.apk` (77,698,958 B) | 0.5.16 |
| 0.5.17 | + BackHandler (系统返回/手势导航) | `…/0.5.17/coolie-release.apk` | 0.5.17 |

两次都走完 `release-app.sh` 4–9 步 (gradle 构建 / COS / version.json / publish-ota),
0.5.17 门禁三线 PASS, manifest hash 43 字符 base64url 且与服务器字节一致。

## 6. 模拟器真验: 四场景 (0.5.16 三键导航 + 0.5.17 手势导航, 各跑一遍)

| 场景 | 操作 | 结果 |
|---|---|---|
| a. 关闭浮层 | 汇览 → 点中央 [+] → 左缘右滑 | ✅ 浮层关闭, 回到汇览, **不退 App** |
| b. 返回上一页 | 任务 → 点任务行 (详情) → 左缘右滑 | ✅ 回任务列表 (**像素级完全一致**), 不退 App |
| c. 回上一页 (tab) | 任务 tab → 左缘右滑 | ✅ 回到**上一个看过的 tab** (汇览) |
| d. root 不退 App | 汇览 (root) → 左缘右滑 | ✅ 页面不动、**App 不退**, 弹「再按一次返回键退出 Coolie工坊」 |

- 三键导航下走的是**自研 PanResponder 手势** (App 真的收到了左缘触摸)。
- 手势导航下左缘内滑是**系统手势**, App 收不到 → 走 `BackHandler`; 四场景同样全部正确。

证据截图/日志: `/tmp/emu-evidence/wave27-0.5.15/`、`/tmp/emu-evidence/wave28-0.5.16/`、
`/tmp/emu-evidence/wave28-0.5.17/` (含每个场景 before/after 与像素 diff)。

### 6.1 验证中发现: 手势导航下 JS 手势根本收不到 (已修)

第一次在手势导航的模拟器上做场景 d: 左缘右滑 → **App 直接退回桌面**
(`mCurrentFocus` 变成 launcher)。原因: 手势导航时左缘内滑由系统
`EdgeBackGestureHandler` 消费, JS 层 `PanResponder` 拿不到; 而 App 在 root 时
系统返回 = 退出。**这正是老板抱怨的现象**, 且 JS-only 手势解不了。

修法 (0.5.17): 注册 `BackHandler`, 系统返回先走 `swipeBack()`; 只有已经在最外层
(汇览 root) 时才交回系统 —— 且第一次只弹 toast, 2s 内再按一次才真退出
(Android 常规「再按一次退出」), 既满足「滑一下不会掉出 App」, 也不把用户关死。

⚠️ 这条是 brief 没写、但老板原始诉求必需的一步, **请 PM 确认「再按一次退出」这个取舍**。

## 7. 顺带查实的问题 (未修, 交 PM 决策)

### 7.1 OTA「下了不装」死循环 —— 会弹无限「更新就绪」弹窗

模拟器上反复观察到: expo-updates 每次启动都 `Check → CheckCompleteAvailable →
Download → DownloadComplete`, `updateId` **始终停在 APK 内嵌值**, 从不加载已下载的 bundle;
于是 `isUpdatePending` 恒为 true, 而 `src/OTA.ts` 的 state-change 监听器**每个事件弹一次**
Alert —— 一次下载 20 个文件 → 20+ 个「更新就绪」弹窗排队, 把整个 App 盖住点不动。

0.5.15 时该更新能正常加载 (`NEW_UPDATE_LOADED` + 重启后 updateId 变新), 0.5.16 之后
不再加载。影响面: 已装 App 会被弹窗风暴卡住。**建议单独派单排查** (怀疑与
`launchAsset.key` 内容寻址 / 下载后校验 / runtimeVersion 三处之一有关)。

### 7.2 登录页输入后按钮点不动 (emulator 环境)

登录页 `Surface` 的 `ScrollView` 没设 `keyboardShouldPersistTaps`, 默认 `'never'`;
`ScrollView.js:1505-1536` 的 capture 逻辑在 RN 认为键盘仍开着时会吞掉所有非输入框点击。
本次模拟器的 IME 不回传 hide 事件, 导致打字后 Pressable 全部失灵 (与本次改动手势无关,
0.5.15 同样复现)。真机 IME 正常时应无此问题, 但**建议给登录/注册页的 ScrollView 补
`keyboardShouldPersistTaps="handled"`**, 顺手消除一类「点了没反应」。

### 7.3 环境备注 (测试脚手架, 未入库)

模拟器登录 UI 无法自动化 (7.2), 本次验证通过 WebView cookie store
(`app_webview/Default/Cookies`, adb root) 注入会话以进入已登录态; 属测试手段,
**不涉及任何提交的代码或产物**, 且已把 AVD 配置/IME/autofill 恢复原状。

## 8. 给老板

- 最新装机直链: <https://dls.xrobinai.cn/coolie/app/0.5.17/coolie-release.apk>
- 版本线: 0.5.15 (补实) → 0.5.16 (左缘右滑) → **0.5.17 (手势导航也生效)**。
- 左缘右滑现在: 详情/浮层/设置**逐层退回**; 非 root 页回上一层; 到汇览 root 再滑会提示
  「再按一次返回键退出」, 不会一下就掉出 App。
- 已装 0.5.16 的设备可直接 OTA 到 0.5.17; 更老的装机包 (0.5.13/0.5.14) 因
  `policy=appVersion` 的运行时匹配语义, 仍需先经 version.json 升级到最新 APK。
