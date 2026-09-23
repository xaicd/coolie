# Wave 56 — 真仿 DS PreviewWebView.tsx 任务详情原型沙箱 (boss 09-23 24:40 「你确定认真学习 digitalstaff 的预览了吗, 最新的预览」)

## 上下文

Boss 09-23 24:40 第三次纠正任务详情原型沙箱的真值来源:
> 「你确定认真学习 digitalstaff 的预览了吗, 最新的预览」

- **wave54 (boss 24:38)** — 第一次错: 拿 `PreviewPanel.tsx` 当真值, 堆 HOST PREVIEW banner + SESSION URL 三段 + sandbox 安全 footer + logs panel (DS PreviewPanel 真没有, PM 臆想)。1219 行
- **wave55 (boss 24:40 第一次)** — 第二次错: 退一步, 仿 PreviewPanel.tsx (180 行) 的 viewport 切换 (desktop/tablet/mobile) + Refresh + External Link + Empty state。删了 wave54 +302 行, 但 PreviewPanel.tsx 不是最新预览组件
- **wave56 (本次, boss 24:40 第二次)** — 真值: DS 最新的预览组件 = `PreviewWebView.tsx` (commit b8b2f15 2026-09-07 「refactor(expo): 预览对齐 Web ChatHome v2.3 host-preview 新机制」, 134 行)

## DS PreviewWebView.tsx 真值 (134 行)

源: `/Users/mac/workspace/xaicd/DigitalStaff/clients/expo/src/PreviewWebView.tsx`

- 工具条 `[关闭] + URL tag (LIVE/SNAPSHOT) + Refresh + 浏览器打开` — **没有 viewport 切换, 没有 logs panel, 没有 footer 安全提示**
- 同源代理 `GET /api/tasks/host-preview/<sessionId>/?token=<jwt>&_t=<bust>` —— DS 后端能力
- JWT 鉴权 (跨源 iframe, cookie 不通)
- `_t=<bust>` 防缓存 (Refresh 时换新的 bust)
- 同步渲染, 无健康检查轮询
- `snapshotTaskId` 走历史快照回放 (OSS 预签名 URL, 原样使用, 不追加 query)
- `Linking.openURL(url)` External Link
- `react-native-webview` (Platform.OS !== 'web'), originWhitelist=["*"]
- Web 端降级: 「在浏览器打开」

## 真值 vs 现状 (我们缺的)

`server/src` grep 验证 — 我们**没有**这两个端点:

1. `GET /api/tasks/host-preview/<sessionId>/` (同源代理, DS 真值)
2. `GET /api/ide-sessions/<id>/snapshots/by-task/<taskId>/url` (OSS 快照, DS 真值)

替代路径 (我们现有):

- `service.url` —— workspace_runtime_services 表里的 `url` 列, runtime 服务起来时给的真预览地址 → 当 LIVE
- `workProduct.url` —— issue_work_products 表里的 `url` 列, agent 落盘的工作产品 URL → 当 SNAPSHOT

本次 UI 改造: **完全照搬 DS PreviewWebView 的工具条 + tag + 刷新 + 外链 + WebView + Empty state**, `resolvePreviewUrl()` 内核先用 `service.url` / `workProduct.url` 顶上。**后续补 host-preview 代理端点时, 把 `resolvePreviewUrl()` 内核换成 `buildHostPreviewUrl(service.id)` 即可, 工具条 UI 完全不动**。

## 改动

- `clients/expo/src/screens/PrototypeSandboxScreen.tsx` 400 → 318 行
  - 删 wave55 仿错的 viewport 切换组 (desktop/tablet/mobile 三按钮 + Ionicons)
  - 删 wave55 仿错的 `extractPreviewUrl()` 大正则从 metadata 里挖 URL (DS 真值没有, 改用 service.url / workProduct.url 直读)
  - 删 wave55 仿错的 frame 容器 (mobile frame 24px 圆角边框模拟)
  - 增 DS 真工具条: `[关闭]` + `[LIVE / SNAPSHOT tag]` + `[刷新]` + `[浏览器打开]`
  - 增 `bust` 状态 (Date.now()) —— Refresh 换新 _t
  - 增 `isSnapshot` 状态 (LIVE tag 绿 / SNAPSHOT tag 紫)
  - 增 `loading` / `webLoading` / `error` 三态, 仿 DS
  - 增底部错误横幅 (有 URL 但代理报错时)
  - 增 Web 端降级分支 (Platform.OS === 'web' → 「在浏览器打开」)
  - `resolvePreviewUrl()` 内核标注: 「我们后端无 host-preview 代理端点, 暂用 service.url / workProduct.url 顶上; 后续补代理时把内部实现换成 DS 的 buildHostPreviewUrl 即可, 工具条 UI 不动」
- `clients/expo/app.json` `version`: 0.5.33 → 0.5.34
- `clients/expo/package.json` `version`: 0.5.33 → 0.5.34
- `clients/expo/CHANGELOG.md` 顶部新增 v0.5.34 节

## 验证

- `pnpm typecheck` clean
- 待 release-app.sh 跑 `bash scripts/release-app.sh 0.5.34 "wave56 真仿 DS PreviewWebView.tsx 重写原型沙箱"` 出 APK
- 真机 emulator 验证: 任务列表 → 点一个原型任务 → 进任务详情 → 点「原型沙箱」入口 → 进 PrototypeSandboxScreen
  - 期望: 工具条左「关闭」、中 LIVE/SNAPSHOT 彩色 tag、右「刷新」+「浏览器打开」
  - 期望: WebView 加载 service.url (LIVE) 或 workProduct.url (SNAPSHOT)
  - 期望: 点「刷新」WebView 重载 (换 _t)
  - 期望: 点「浏览器打开」跳出 OS 浏览器
  - 期望: 没有 service.url / workProduct.url 时, 显示空态「预览未就绪 / 完成任务后将显示预览」

## 后续 (UI 不动, 后端补)

- `server/src` 加 `GET /api/tasks/host-preview/<sessionId>/` 同源代理 (DS 真值): 鉴权 + 静态服务会话工作空间里的 index.html
- `server/src` 加 `GET /api/ide-sessions/<id>/snapshots/by-task/<taskId>/url` 快照回放 (OSS 预签名 URL)
- `clients/expo/src/screens/PrototypeSandboxScreen.tsx` 的 `resolvePreviewUrl()` 内部从 `service.url` / `workProduct.url` 换成调这两个端点; 工具条 / tag / Refresh / 外链 / WebView / Empty state 全部不动

## 文件

- 改: `clients/expo/src/screens/PrototypeSandboxScreen.tsx`, `clients/expo/app.json`, `clients/expo/package.json`, `clients/expo/CHANGELOG.md`
- 增: `docs-coolie/briefs/2026-09-23-taskdetail-ds-host-preview-url-wave56.md` (本文件)