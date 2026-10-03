# wave178 QA — 全屏 ErrorBoundary 兜底 (App.tsx)

> **波次**: wave178
> **日期**: 2026-09-30
> **触发**: 老板原话 "App.tsx 没 ErrorBoundary, 任何屏崩就白屏".
> **范围**: `clients/expo/src/components/ErrorBoundary.tsx` (新, 兜底 class component) + `clients/expo/App.tsx` (顶层包一层 ErrorBoundary, 原本直接 export 的 `App` 重命名为 `AppRoot`) + 版本号 0.6.8 → 0.6.9 (`app.json` / `package.json` / `strings.xml` / `CHANGELOG.md`).
> **不动**: server / ui / Coolie Web / 既有屏代码 / OTA 协议 / OTA runtimeVersion 校验逻辑.

---

## 1. 真因 (老板原话)

> "App.tsx 没 ErrorBoundary, 任何屏崩就白屏."

之前任何 React 子树 render 抛错, RN 默认走「红屏」(dev) 或「白屏 / 卡死」(release) — 老板真机截一张图也分析不出谁崩的、栈在哪。React 16+ 起 `ErrorBoundary` 是唯一兜得住的官方机制 (必须 class component, getDerivedStateFromError / componentDidCatch)。

## 2. 范围 & 交付物

| 文件 | 改动 | 行数变化 |
|---|---|---|
| `clients/expo/src/components/ErrorBoundary.tsx` | **新增**: class component, root/screen 双 scope, root 走 `Updates.reloadAsync()` | 0 → 302 |
| `clients/expo/App.tsx` | 新增 `AppWithErrorBoundary` (default export), 原 `App` 重命名为 `AppRoot` + 加 ErrorBoundary import | +13 / -1 |
| `clients/expo/app.json` | version `0.6.8` → `0.6.9`, versionCode `608` → `609` | 2 行 |
| `clients/expo/package.json` | version `0.6.8` → `0.6.9` | 1 行 |
| `clients/expo/android/app/src/main/res/values/strings.xml` | `expo_runtime_version` `0.6.8` → `0.6.9` | 1 行 |
| `clients/expo/CHANGELOG.md` | 顶部插入 `## v0.6.9` 段 | +6 行 |

**scope 默认值**: `'screen'` (屏内崩了复位即可, 不需要重启 App); 只有根 `AppWithErrorBoundary` 才传 `scope="root"` — 因为 root 兜底屏本身就崩了, 必须 reload bundle 才能恢复。

## 3. 设计要点 (为什么这么写)

| 选择 | 备选 | 取舍 |
|---|---|---|
| `Updates.reloadAsync()` 做「重启 App」 | `DevSettings.reload()` (仅 dev), `nav.reset()` (复盖不到已崩子树) | release 包唯一可靠, OTA 装在老板真机上能直接验 |
| root scope 失败降级到 retry | 只走 reloadAsync | reloadAsync 在 dev (无 OTA) / OTA 禁用时抛; 降级让边界复位也能看到兜底屏本身 |
| 堆栈剔除 node_modules / RN 内置栈帧 | 全栈 | 截图上报时只看用户代码, 12 帧截断 |
| `errorMessageOf(err: unknown)` 兼容非 Error | 直接 `error.message` | 组件崩时 React 把抛上来的 string/object/null 也塞进 boundary, 必须兜住 |
| class component | function + hook | React 没暴露 hook 版 ErrorBoundary API |
| `state` 用 class field initializer | constructor | target ESNext + 单一 state, initializer 更短 |
| `Ionicons` `alert-circle-outline` + `refresh` | emoji 或纯文字 | 与 Coolie Web 视觉对齐 (后者也用 Ionicons) |

## 4. 验证

#### 4.1 TypeScript

```
$ cd clients/expo && npx tsc --noEmit
TypeScript: No errors found
exit: 0
```

#### 4.2 Token-gate 不触发

`scripts/check-token-gates.mjs` 仅扫 `ui/src/components/**` 和 `ui/src/pages/**` (`SCAN_DIRS = ["components", "pages"]`, 仓库 web UI), 不覆盖 `clients/expo/**` — `clients/expo/src/components/ErrorBoundary.tsx` 不在 gate 范围。即便如此, 我仍走 token (`SPACING` / `RADIUS` / `FONT_SIZE` / `ELEVATION` + `C.*`), 与既有 `ErrorRetry.tsx` / `AppCard.tsx` 同源。

#### 4.3 runtimeVersion 一致性

`app.json.version` 与 `strings.xml#expo_runtime_version` 都同步到 `0.6.9` — 这两条必须一致否则 OTA 下了不装 (`doc/memory/expo-ota-runtime-two-places.md` 已记)。

#### 4.4 真机模拟器复现 (待 0.6.9 APK 出来后)

模拟器装 0.6.9 → 触发屏崩 (例如临时给 `DashboardScreen` 抛 `throw new Error("wave178 测试崩")`) → 应见:

1. 红圆图标 + 「出了点问题」+ 「屏崩了，我们拦住了」副标题
2. 错误摘要卡: message + 堆栈 (剔除后约 5-8 帧)
3. 主按钮: 「重启 App」(brand 紫蓝底)
4. 副按钮: 「只重试这一屏」(边框线)
5. hint 文字: 「若反复重启都恢复不了, 试试完全杀进程再开 App」

点「重启 App」→ `Updates.reloadAsync()` → App 重新加载 bundle (开发模式应直接刷新, 装 OTA 时走原生 reload)。

#### 4.5 dev (无 OTA) 降级

dev mode 跑 `expo start` → `Updates.reloadAsync()` 会抛 `not enabled` → catch 后降级到 `handleRetry` (清 error state 重新渲染 children) — 用户至少能继续用, 不卡死。

## 5. 发版

`scripts/release-app.sh 0.6.9 "wave178 ErrorBoundary"` — 流程同 0.6.8 (改版本号 + 改 manifest + APK + coscli + OTA + version.json). 用户面对的升级路径不变。

## 6. 风险

| 风险 | 缓解 |
|---|---|
| 兜底屏本身抛错 (例如 `Updates.reloadAsync` 在没装 expo-updates 的场景里崩) | class component 自己也是 ErrorBoundary — 没法套娃, 但兜底屏只用基础 RN API (`View` / `Text` / `Pressable` / `Ionicons`), 不可能再崩 |
| 错误信息泄露 token / 用户隐私到日志 | console.error 只打 message + stack, 不打 component instance state; 没上抛 telemetry, 装机本地 |
| `Updates.reloadAsync` 在某些 Expo SDK 版本是 async generator | 0.27.5 是 Promise, 跟 OTA.ts:34 同款; 已交叉验证 |
| 老板截图时屏幕旋转导致堆栈显示不全 | `ScrollView` 兜底 + `selectable` text, 截图能复制; 横屏不够就杀进程截图 |
| Boundary 在 React 18 strict mode 下重复挂载 | RN 0.76 默认不开 strict mode; 即便开了, getDerivedStateFromError 幂等, 不影响 |

## 7. 不做的事 (out of scope)

- 没改 ErrorRetry — 它是屏内错误条/卡, 不是 render 抛错的兜底
- 没加 Sentry / Crashlytics — 老板没要, telemetry 路径敏感 (DESIGN.md "五条数据路径" 第 1 条); 想要上报走 paperclip task 单独开 wave
- 没改屏代码 — 老板明确说「不改屏」, 只兜
- 没动 server / ui (web) / OTA 协议 — 复用既有 release 脚本 + 双 runtimeVersion 同步约束