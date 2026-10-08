# Coolie 包架构合并评估 (PM 2026-09-23)

> 触发: 老板 2026-09-22 23:55 OOB「为啥一定要独立包」。装 Coolie工坊 0.5.18 看到
> 弹窗「未安装 Coolie Web (cloud.coolie.app.web)」, 问能不能并进一个 APK。
> **本文只评估, 不动代码**。对应 brief: `docs-coolie/briefs/2026-09-22-consolidation-assessment-wave39.md`。

---

## 0. 一句话结论

**"一定要独立包"在技术上不成立** —— Coolie Web 只是一个**壳**, 它不打包 React 应用,
而是用 webview 加载远端 `https://www.xrobinai.cn/XROA`; 而 `react-native-webview` 本来就是
Coolie工坊的依赖。所以并入 Coolie工坊的**增量成本远低于 brief 的估计** (不是 6-8 人天, 是 3-4)。

但「能不能并」是**产品问题, 不是体积问题**: 并了会失去 Coolie Web 独立发版 (独立 OTA 通道)、
并让一个 App 承载两种产品体验。**建议: 短期先改弹窗文案 (方案 C, 0.5 人天), 是否真并等老板按产品
取舍拍板。**

---

## 1. 当前架构

### 1.1 三个独立产物 (3 包)

| # | 产物 | 目录 | 包名 / scheme | 版本 | 运行时 |
|---|---|---|---|---|---|
| 1 | **Coolie工坊** (RN 自研) | `clients/expo/` | `cloud.coolie.app` / `coolie://` | 0.5.18 | Expo RN 0.76.5, 7 屏 + 工作空间 |
| 2 | **Coolie Web** (Paperclip 套壳) | `clients/expo-paperclip-web/` | `cloud.coolie.app.web` / `coolieweb://` | 0.6.4 | Expo RN 0.76.5, **单屏 webview** |
| 3 | **h5 web** | `clients/h5/` | (无 App) | 0.6.2 | Vite + React 19 |

> 注: h5 与 Coolie Web 是**两个不同的 web 资产**。h5 是 fork 自研的 Vite 应用; Coolie Web 的
> webview 加载的是**上游 Paperclip UI** (`/XROA`), 与 h5 无关。

### 1.2 构建与部署链路

```
Coolie工坊 (clients/expo)
  ├─ 本地:  gradle assembleRelease → clients/expo/android/.../app-release.apk  (74 MB)
  ├─ APK:   cos://gzbucket/coolie/app/<v>/coolie-release.apk
  │           → https://dls.xrobinai.cn/coolie/app/<v>/coolie-release.apk
  ├─ 升级:  version.json → tc-coolie-claw:/opt/coolie/ui/dist/version.json
  │           → https://xrobinai.cn/version.json
  └─ OTA:   expo export → /opt/coolie/ui/ota/  (runtimeVersion 0.5.18)
              → https://xrobinai.cn/ota/manifest          ← 脚本 scripts/release-app.sh + publish-ota.sh

Coolie Web (clients/expo-paperclip-web)
  ├─ 本地:  app-release.apk (63 MB)
  └─ OTA:   expo export → /opt/coolie/ui/ota/paperclip-web/  (runtimeVersion 0.6.4)
              → https://xrobinai.cn/ota/paperclip-web/manifest
              ← 脚本 scripts/publish-ota-paperclip-web.sh
  └─ 内容:  webview 加载远端 https://www.xrobinai.cn/XROA (不打包)

h5 web (clients/h5)
  └─ 部署:  pnpm --filter @coolie/h5 build → dist/ (820 KB)
              → rsync tc-coolie-claw:/opt/coolie/ui/dist/h5/
              → https://xrobinai.cn/h5/                     ← 脚本 scripts/publish-h5.sh
```

### 1.3 互跳 (deep link)

- Coolie工坊 顶栏 `[驾驶舱Web]` 按钮 → `coolieweb://` 深链打开 Coolie Web
  (`clients/expo/src/utils/openCoolieWeb.ts`; 没装则 `Alert('未安装 Coolie Web')`)。
- Coolie Web 顶栏 `[驾驶舱]` 按钮 → `coolie://` 打开 Coolie工坊。
- Coolie工坊 还声明了 `coolie://workspace` / `coolie://chat/build` 等内部路由。

### 1.4 "装几个 APK" 的现状

老板要在手机上用全功能 → **装 2 个 APK** (Coolie工坊 + Coolie Web); 没装 Coolie Web 时,
Coolie工坊 的 `[驾驶舱Web]` 按钮点下去只弹「未安装 Coolie Web」——**这就是老板看到的那颗弹窗**。

---

## 2. 关键技术事实核正 (brief 的三条前提需修正)

评估前先纠正 brief §3.2 里的三个技术判断, 否则方案 A 会被**高估成本而误杀**:

**① Coolie Web **不**内嵌 React 应用 —— 它是个薄壳。**
`clients/expo-paperclip-web/App.tsx` 的 webview `source={{ uri: "https://www.xrobinai.cn/XROA" }}`,
React 应用由**服务端**提供。该包自己的 JS bundle (`dist/`) 只有 **1.5 MB**。
APK 63 MB 的体积来自 RN 原生库, 与"web 应用体积"无关。
→ brief「体积大 (webview JS + RN bundle + 1 GB+ native libs)」**不成立**: 并入的**增量**只有 ~1.5 MB 壳 JS。

**② `react-native-webview` 已经是 Coolie工坊的依赖。**
`clients/expo/package.json` 有 `"react-native-webview": "~14.0.1"`, 且**已有 9 个文件**在用
(`CodeViewerWebView`、`InlinePreviewPanel`、`PrototypeSandboxScreen`、`ArtifactsScreen` …),
连 `SafeWebView` 的 `WebViewProps & undefined → never` 类型 workaround 都在两包里各写了一份。
→ 并入**不增加原生依赖**, 也不需要新 native 模块。

**③ 合并**不**改变上游 fork 边界。**
`FORK-SURFACE-AUDIT.md` 统计的是**上游拥有**的文件 (`ui/` `packages/` `server/` …: 91 文件 / 9295 行)。
`clients/expo/` 与 `clients/expo-paperclip-web/` **都是 fork 自有**。
→ brief「fork 边界模糊 (fork 仅含 App, 吞 Web = 边界重定义)」是把**内部结构变化**误当成**上游分歧面变化**;
  合并后上游分歧面数字**一个都不变**。

**四条真实成本**(这些才是要点, 不是体积):

- **i18n 运行时补丁层要迁移**: `expo-paperclip-web/App.tsx` 约 700 行里, 主体是
  `I18N_PATCH` 字典 (数百条整段文本替换) + `injectedJavaScript*` 注入脚本 + MutationObserver。
  这是套壳层**唯一有分量的资产**, 合并必须整套搬过去。
- **失去独立 OTA 通道**: 现在 Coolie Web 走 `runtimeVersion 0.6.4` / `/ota/paperclip-web/`,
  与 Coolie工坊 (`0.5.18` / `/ota/`) 完全隔离 —— 套壳层改一行文案就能**单独热更**, 不触动主 App。
  合并后两者共用一个 runtimeVersion, 发版节奏被绑死。
- **一个 App 承载两种产品体验**: Coolie工坊 是原生 7 屏, Coolie Web 是远端 PC web 套壳。合并后
  需要一个明确的入口/切换, 否则用户会困惑"我到底在原生 App 还是套壳 web 里"。
- **回退成本**: 一旦合并, 想恢复"独立 Coolie Web APK"要重新拆包 (i18n 补丁层已混进主 App)。

---

## 3. 三方案对比

### 方案 A —— 完全合并 (1 个 APK 含 webview)

Coolie工坊 内置一个「Coolie Web」webview 屏 (加载 `/XROA` + 迁移 i18n 补丁), 退休
`clients/expo-paperclip-web/` 独立包。`[驾驶舱Web]` 按钮改为打开内置屏。

- ✅ 一个 APK, 不用装 2 个
- ✅ 增量体积 ~1.5 MB (原判断误), 无新原生依赖
- ✅ i18n 补丁层收敛到一处, 不再两包各维护一份 `SafeWebView` / 主题 C
- ❌ **失去 Coolie Web 独立 OTA** (套壳层改动必须随主 App 走完整发版)
- ❌ 一个 App 两种体验, 需要入口/切换设计
- ❌ 拆包回退成本高

### 方案 B —— 渐进合并 (Coolie工坊 含 webview 兜底, Coolie Web 仍独立)

Coolie工坊 内置 webview **兜底页**: 检测到装了 Coolie Web → 深链 `coolieweb://` 打开独立版;
没装 → **在内置 webview 打开同一 URL** (不再弹「未安装」), 并给「安装 Coolie Web」引导。

- ✅ 不破坏现有 (老板可继续装独立版)
- ✅ **直接消灭「未安装 Coolie Web」弹窗** —— 没装也能用
- ✅ 保留独立 OTA
- ❌ 两套 webview 壳并存 (内置兜底 + 独立版), i18n 补丁层要**两份**或抽共享模块
- ❌ 深链检测 + 下载引导逻辑, 实现最复杂

### 方案 C —— 维持 3 包独立 (只优化弹窗体验)

只改 `clients/expo/src/utils/openCoolieWeb.ts`: 把 `Alert('未安装 Coolie Web')` 改成
「安装 Coolie Web (可选)」+ 下载链接 + 「跳过」按钮。

- ✅ 最稳, 改动最小 (单文件)
- ✅ 不碰 fork 结构 / OTA / 产品面
- ❌ 老板仍看到 2 个 APK; 弹窗仍在, 只是措辞更友好

### 对比表

| 维度 | A 完全合并 | B 渐进合并 | C 维持 |
|---|---|---|---|
| 装几个 APK | 1 | 2 (没装也能用) | 2 |
| 增量体积 | ~1.5 MB (非"大") | ~1.5 MB | 0 |
| fork 边界 (上游分歧面) | 不变 (91/9295) | 不变 | 不变 |
| 独立 OTA 通道 | 失去 | 保留 | 保留 |
| i18n 补丁层 | 收敛到 1 处 | 2 处 (或抽共享) | 1 处 (现状) |
| 「未安装」弹窗 | 消失 | 消失 (兜底) | 仍在 (改文案) |
| 实现复杂度 | 中 | 高 | 极低 |
| **人天** | **3-4** | **3-4** | **0.5** |
| 风险 | 中 | 中 | 极低 |
| 收益 | 中 | 中低 | 极低 |

---

## 4. 实施成本估算 (人天 / 风险 / 收益)

> brief 原估: A 6-8 / B 3-4 / C 0.5。**A 修正为 3-4** —— 依据 §2 三条核正:
> 无新原生依赖 (webview 已在)、无 React 应用打包 (远端加载)、无上游边界变化。
> A 的主要工作量是**迁移 700 行 i18n 补丁层** + 入口设计 + 回归测试, 不是"体积优化 + webview 嵌入"。

| 方案 | 人天 | 风险 | 收益 | 主要工作量 |
|---|---|---|---|---|
| **A 完全合并** | **3-4** | 中 | 中 | 迁 i18n 补丁层 + 新增 webview 屏 + 改入口 + 退休独立包 + 回归 |
| **B 渐进合并** | **3-4** | 中 | 中低 | 内置兜底 webview + 深链检测 + 安装引导 + i18n 补丁抽共享 |
| **C 维持** | **0.5** | 极低 | 极低 | 单文件改文案 + 跳过按钮 |

**风险明细 (A/B 共有)**:

- i18n 补丁层迁移漏条 → 套壳 web 又变英文 (老板 09-21 已为此返工过一轮, 有前科)。
- 发版节奏耦合: A 之后每次主 App 发版都会牵动套壳层。
- 回归面广: 深链、返回键、Android 手势、第三方登录 cookie 共享都要重测。

**收益明细**:

- A 的收益主要是**体验** (1 个包) + **代码收敛** (一份 SafeWebView / 主题 / i18n 补丁), 不是性能。
- B 的收益是**当场消灭弹窗**且不牺牲独立 OTA。
- C 的收益是把「报错」变「可操作提示」。

---

## 5. PM 推荐

| 时间 | 方案 | 理由 |
|---|---|---|
| **短期 (本周)** | **C** (0.5 人天) | 老板的核心痛点是「点进去弹未安装」, 不是「有 2 个包」。改文案 + 加「去安装 / 跳过」即可消除挫败感, 零结构风险。 |
| **中期 (若老板坚持 1 个 APK)** | **A** (3-4 人天) | 技术成本已核正为**可控** (webview 已在 / 无打包 / 无边界变化)。真正代价是**失去独立 OTA**, 这是产品取舍, 不是技术障碍。 |
| **备选** | **B** (3-4 人天) | 想"既保留独立包、又让没装也能用"时选它; 复杂度最高, 收益增量有限。 |
| **不推荐** | 因"体积大 / fork 边界"否决 A | 这两条前提经核实**不成立** (§2)。否决 A 可以, 但请以"要不要 1 个包 / 要不要独立 OTA"为由, 别以体积为由。 |

**一句话给老板**: 独立包**不是必须**的, 并进去技术上也不贵; 但它换来的是 Coolie Web 能**独立热更**。
如果老板更在意「手机上只装一个 Coolie」→ 走 A; 如果更在意「套壳层能随时单独修文案/翻译」→ 留独立包, 走 C。

---

## 6. 等老板拍板

- **短期先做 C** (改弹窗文案) —— 请老板回「C」即派单。
- **要做 A** (1 个 APK) —— 请老板回「A」, 已知代价=失去独立 OTA。
- **要做 B** (兜底 webview) —— 请老板回「B」。
- **不动** —— 请老板回「不动」。
- 自定义 → 直接说。

---

## 7. 证据清单 (只读, 未改动)

| 证据 | 位置 |
|---|---|
| Coolie工坊 配置 | `clients/expo/app.json` (version 0.5.18, `cloud.coolie.app`, scheme `coolie` + `coolieweb`) |
| Coolie Web 配置 | `clients/expo-paperclip-web/app.json` (0.6.4, `cloud.coolie.app.web`, 远端 URL) |
| Coolie Web 壳逻辑 | `clients/expo-paperclip-web/App.tsx` (~700 行, i18n 补丁层) |
| 未安装弹窗 | `clients/expo/src/utils/openCoolieWeb.ts` |
| 入口按钮 | `clients/expo/src/components/AppBar.tsx` (`openCoolieWeb`) |
| webview 已是依赖 | `clients/expo/package.json` + 9 个 `src/**` 文件 |
| 发版脚本 | `scripts/release-app.sh` / `scripts/publish-ota-paperclip-web.sh` / `scripts/publish-h5.sh` |
| OTA 脚本 | `clients/expo/scripts/publish-ota.sh` / `clients/expo-paperclip-web/scripts/publish-ota.sh` |
| fork 边界 | `docs-coolie/FORK-SURFACE-AUDIT.md` (91 文件 / 9295 行, 只算上游文件) |
| 实测体积 | `clients/expo/dist` 7.1M / `clients/expo-paperclip-web/dist` 1.5M / `clients/h5/dist` 820K |

**边界声明**: 本次为**纯评估**, 未修改任何代码/配置, 未合并任何包, 未改 fork 面。只新增本文件。

---

*PM Hermes · 2026-09-23*
