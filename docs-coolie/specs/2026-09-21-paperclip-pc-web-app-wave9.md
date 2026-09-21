# Spec: paperclip PC Web → App via Expo + WebView (wave 9)

- 日期：2026-09-21
- 老板：「我看这些可以用」+「expo包」
- 优先级：P0（替换现有 expo App / 或并行新 App）
- PM：Hermes
- 状态：READY FOR DISPATCH

## 1. 背景

老板看到 `https://www.xrobinai.cn/XROA/board-chat` 完整 PC web 后决定：
- 12 项导航（新建任务/搜索/仪表盘/收件箱/会议室/工作/任务/项目/例行任务/产物/Voice/Ontology/组织/智能体/技能/连接器/审计）
- 会议室 + Agent Feed + Agent Chat 全有
- 完整 paperclip 上游能力 = 比 Coolie App 强

**老板决策：「弄成 app 就行」+ 「expo 包」** = 用现有 expo 框架 + WebView 包 paperclip PC web。

## 2. User Stories

1. **作为老板**，我想装一个 App，打开就是 paperclip PC web 完整版
2. **作为老板**，我想 App 内能登录（用邮箱+密码）
3. **作为老板**，我想在 native 壳 + WebView 之间能切换（比如深链或开发者工具栏）
4. **作为老板**，我希望 WebView 在弱网时能加载本地缓存
5. **作为老板**，我希望 WebView 内能调起 native 能力（语音 / 通知 / 拍照）通过 bridge

## 3. Acceptance Criteria (EARS)

### 3.1 项目结构

- 在 `clients/paperclip-mobile/`/` 新建 expo 项目（**独立**项目，不污染现有 clients/expo/）
- 或者**直接复用** clients/expo/ + 加一个 WebView 屏（更简单 → 选这个）
- 仓库里加 `clients/expo-paperclip-web/` 单独目录（PM 决定）

### 3.2 主屏

- WHEN 老板打开 App，THEN SHALL 直接进入 PaperclipWebScreen（单屏 App）
- PaperclipWebScreen 内 react-native-webview 装 `https://www.xrobinai.cn/XROA`
- WebView 占满屏，含返回 / 刷新 / 前进 三按钮 toolbar

### 3.3 登录

- WHEN WebView 加载，THEN 浏览器原生 cookie + sessionStorage（web 自带）
- App 不再要求登录态（跟 h5 一致）

### 3.4 Toolbar

- 顶部 toolbar：← 返回 / 刷新 / → 前进 / URL 显示 / [切换到 Coolie 驾驶舱]
- 点 [切换到 Coolie 驾驶舱] → 跳到 ExpoClients/src/screens/HomeScreen（v0.5.2 已有的 Tab App）

### 3.5 WebView 配置

- react-native-webview already installed
- WebView source: `{ uri: "https://www.xrobinai.cn/XROA" }`
- mixedContentMode: "compatibility"（https 站允许）
- allowsBackForwardNavigationGestures: true
- javaScriptEnabled: true
- domStorageEnabled: true（cookie / localStorage）
- allowFileAccess: false

### 3.6 Android 打包

- 包名 `cloud.coolie.app`（沿用现有）
- 应用名 "Coolie"（沿用）
- icon 沿用现有
- versionCode: 1（全新 APK）
- versionName: "0.6.0-paperclip-web"（区别驾驶舱版）

### 3.7 装机自检

- 安装 0.6.0-paperclip-web APK 到模拟器
- 启动 → 直接是 web 看板
- 登录邮箱 + 密码 → 进 XROA 看板
- 12 导航 全部能点
- 截图入 gitignored evidence

## 4. 文件范围（白名单）

**新增：**

```
clients/expo-paperclip-web/          (新独立 expo 项目)
├── package.json
├── app.json                         # 应用名 "Coolie", version 0.6.0-paperclip-web
├── App.tsx                          # PaperclipWebScreen 单屏
└── tsconfig.json
```

**OR 复用现有 clients/expo/：**

```
clients/expo/App.tsx                  # 加 PaperclipWebScreen 入口
clients/expo/src/screens/PaperclipWebScreen.tsx   # react-native-webview
```

**PM 推荐：复用现有**（已装 500MB 依赖能共享）。

## 5. 边界

- ❌ 不重做 paperclip PC web（上游已有）
- ❌ 不改 paperclip 上游代码
- ❌ 不动 ui/ 目录
- ❌ 不做自定义原生能力 bridge（先用纯 WebView）

## 6. 验收 gate

- [ ] `paperclip-mobile` APK 装得上模拟器
- [ ] 启动直接是 XROA 看板
- [ ] 12 导航可点
- [ ] 登录 + 进入会议室
- [ ] 截图证据入 /tmp/emu-evidence/
- [ ] 装机直链给老板

## 7. 派单

第一波（门神 cmd）：
1. 在 `clients/expo-paperclip-web/` 新建 expo 项目
2. 单屏 PaperclipWebScreen 装 react-native-webview
3. android 打包（gradle assembleRelease）
4. coscli 上传 cos://gzbucket/coolie/app/0.6.0-paperclip-web/coolie-release.apk
5. 模拟器装机验证

第二波（掌柜）：老板装机反馈

## 8. 不回签就停在哪

如果老板认为 expo 不合适 / 改用 Capacitor，撤回本 spec 重派。

## 9. 与现有 App 并存策略

- 0.5.2 现有 App（Coolie 驾驶舱）继续维护（mobile 子集能力）
- 0.6.0-paperclip-web 新 App（完整 PC web 套壳）= 老板装机主用
- 同一个包名 cloud.coolie.app 覆盖装？或不同包名？
  - **不同包名**：`cloud.coolie.app`（Coolie 驾驶舱） + `cloud.coolie.app.web`（Web 套壳）→ 老板手机可并存两个 App
  - **PM 决策**：建议**不同包名**，老板手机可并存，**先试 0.6.0-paperclip-web**

## 10. 文件命名

```
cloud.coolie.app        → 现有 0.5.2 (Coolie 驾驶舱)
cloud.coolie.app.web    → 新 0.6.0 (paperclip PC web 套壳)
cloud.coolie.app.pcb    → 不存在 (占位)
```