# wave266 — 删除登录页「免密共享」入口

> 老板原话 (2026-10-01 22:07 真机 0.6.19 截图): 「不要什么共享提示」
> → 删登录页「🌐 直接使用 Web 全功能登录 (免密共享)」按钮

## 1. 改动范围

| # | 文件 | 改动 |
|---|---|---|
| 1 | `clients/expo/App.tsx` | 删 `SignInScreen` 的 `onSwitchToWeb` prop + 渲染该按钮的 Pressable + 死代码 `webLoginBannerBtn` / `webLoginBannerBtnText` styles |
| 2 | `clients/expo/app.json` | expo.version 0.6.19 → 0.6.20, expo.android.versionCode 619 → 620 |
| 3 | `clients/expo/package.json` | version 0.6.19 → 0.6.20 |
| 4 | `clients/expo/android/app/build.gradle` | versionName 0.6.19 → 0.6.20, versionCode 619 → 620 |
| 5 | `clients/expo/CHANGELOG.md` | 顶部插入 v0.6.20 节 |
| 6 | (release-app.sh 自动) | version.json + ota manifest + git tag v0.6.20 |

## 2. 不动的边界

- `clients/expo/src/screens/WebLoginScreen.tsx` — 文件保留, 仅失去入口
- `server/src/routes/auth*` / backend 业务 — 不动
- wave264 / wave265 残留 dirty tracked 文件 — 不动 (其他 session 在做)
- iOS — 不动 (老板: "iOS 不动")

## 3. 残留 `loginMode === "web"` 分支

`App.tsx` 仍保留 `loginMode` 状态 (默认 `"native"`), 仅去掉 SignInScreen
向它跳转的入口. WebLoginScreen 的 fallback 路径 (WebView 15s 白屏 → `setLoginMode("native")`)
也保留. 也就是说: 共享登录按钮消失, 但 WebLoginScreen 组件本身未删除,
只是从用户可见的入口链断开. 后续若需要恢复入口, 在 SignInScreen 加回
`<Pressable onPress={() => setLoginMode("web")}>` 即可, 无需重新实现.

## 4. 验证步骤

1. `cd clients/expo && npx tsc --noEmit` — 退出码 0
2. `bash scripts/VERSION-CONSISTENCY-CHECK.sh 0.6.20` — 7 源对齐
3. 真机装 0.6.20 → 启动 → 登录页只有 (Coolie 标题 / 副标题 / 邮箱 / 密码 / 登录 / 注册 / API Key 切换)
4. 截图存 `docs-coolie/evidence/wave266/QA-REPORT.md`

## 5. 发版路径

`bash scripts/release-app.sh 0.6.20 "wave266: 删登录页共享登录按钮, 邮箱密码/API Key/注册 三入口" --skip-server-deploy`

理由 skip-server-deploy: 本波纯 UI 改动, server 业务零修改, 不必联动重启.
