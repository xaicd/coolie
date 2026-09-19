# Coolie App 版本记录

Coolie工坊移动驾驶舱 App（React Native + Expo）版本流水。

---

## v0.2.0

> Released: 2026-09-19 · Android release APK

### 新增功能

- **效能仪表盘** — 六大核心效率指标卡片 + 下拉刷新（车间效率、失败率、交付周期等）。
- **代码查看器** — 内嵌 CodeMirror 6，高亮阅读代码与 Diff；配套 UnifiedDiffViewer 虚拟化滚动。
- **本体域控制台** — 业务本体域列表 + 状态管理，附 EmergencyKillSwitch 紧急熔断开关。
- **产物中心** — 产物卡片流展示（ArtifactsScreen）。
- **原型沙箱** — 内嵌 WebView 预览原型（PrototypeSandboxScreen）。
- **看板聊天流** — 看板消息流式渲染 + QuickApprovalCard 快速审批卡片。
- **OTA 增量更新** — expo-updates 自托管 manifest（`https://xrobinai.cn/ota/manifest`），ON_LOAD 自动检测。
- **Linear 设计系统** — 深色控制平面视觉统一。

### 技术说明

- Expo SDK 52（expo@52.0.0），runtimeVersion 采用 appVersion 策略。
- 依赖修正：expo-updates@0.27.5、expo-constants@17.0.8、expo-image@2.0.7（对齐 SDK52）。

---

## v0.1.0

> 初始版本（品牌化 Coolie，一期 5 个 Bug 修复后基线）。
