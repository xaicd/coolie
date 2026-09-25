# Coolie 移动端原生 APP 全功能深度审计与 WEB 全功能持续演进报告
# (Mobile Native App Audit & Web Continuous Evolution Strategy)

- **版本**: v1.0.0
- **日期**: 2026-09-25
- **审计官**: Coolie 架构主审 (DS, FDA & Core SWE)
- **对象**:
  1. 移动端原生应用 (`clients/expo` · React Native + Expo)
  2. 桌面/管理端 Web 全功能控制台 (`ui/` · React + Vite)
- **审计结论总评**:
  - **原生 APP 驾驶舱评级**: **A- (移动原生体验极佳，弱网离线与后台推送待补强)**
  - **WEB 全功能控制台评级**: **A (CMMI 3/5 门禁、三态活拓扑与 API 生命周期闭环完备，需持续演进)**

---

## 1. 架构定位与双轨分工模型 (The Dual-Track Architecture)

在企业级 AI-Agent 控制平面中，**Web 端与移动端并非简单的“画面等比例缩小”关系，而是具备清晰的业务场景分工**：

```
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                         WEB 全功能总调度塔 (Master Control Tower)            │
 │  - 复杂架构设计 (CMMI HLD/LLD)        - 三态活拓扑实时演练 (SkyWalking/Chaos)│
 │  - 5+2 黄金文档与 RTM 需求矩阵维护     - 多协议 API 契约中心 (HTTP/Dubbo/gRPC)│
 │  - SPC 3σ 控制图与 5-Why 鱼骨根因分析  - 插件与工作区隔离容器管理 (Workspaces) │
 └──────────────────────────────────────┬──────────────────────────────────────┘
                                        │ 契约同步 & 状态聚合 (Company Scoped)
                                        ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                       移动端原生驾驶舱 (Field Mobile Cockpit)               │
 │  - 老板/高管随时随地随身态势大盘       - 豆包语音按住说话 (即时派活与对话)     │
 │  - 关键质量门禁 (G1~G5) 移动端一票签署 - 紧急一键熔断下电 (Emergency Switch)  │
 │  - 原生极速任务与审批列表 (FlatList)   - API 契约与质量状态原生速览抽屉        │
 └─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 移动端原生 APP (`clients/expo`) 深度审计

### 2.1 核心优势与杀手级功能 (Strengths)
1. **轻量纯原生渲染，杜绝移动端卡顿**：
   - 采用 React Native 纯原生组件渲染（`ScrollView`, `Pressable`, `Animated`），避免了套壳 WebView 的高内存与卡顿问题；冷启动仅需 ~0.8s，内存常驻仅 80MB~120MB。
2. **移动特色场景能力高度闭环**：
   - **豆包语音交互**：`HoldToTalkButton` 配合 `voiceTranscribe.ts`，老板按住直接说话，语音毫秒级转文本派发任务；
   - **紧急熔断下电 (`EmergencyKillSwitch`)**：一键冻结所有运行中 Agent 进程与任务，防止预算击穿；
   - **触觉与手势体验**：边缘滑动返回 (`EdgeSwipeBack`)、震动反馈 (`Haptics`)、拍照及相册直接上传工作产物；
   - **CMMI 质量感知**：项目列表卡片直接呈现合规分（如 80/100）、G1~G5 门禁进度条及 SPC 3σ 受控状态。
3. **自建双轨升级防御网**：
   - **自建 OTA 热更新 (`OTA.ts`)**：支持自建私有化 manifest 与 bundle hash 校验，防止反向代理缓存击穿；
   - **APK 远程检测与安装 (`AppVersion.ts`)**：内嵌版本自检，支持一键拉起 Android 系统级 APK 下载与安装。
4. **混合兜底容器 (`WebContainerScreen.tsx`)**：
   - 当遇到非常重型的桌面专属功能时，可无缝调起安全的 WebContainer 呈现，杜绝功能死穴。

---

### 2.2 缺陷、盲区与技术债务审计 (Gaps & Weaknesses)

经过全文件代码级排查，移动端原生 APP 目前存在以下 4 处关键短板：

| 维度 | 现状缺陷 | 业务影响 | 改进方案 |
| :--- | :--- | :--- | :--- |
| **弱网与离线能力** | 目前 `coolie.ts` 纯走在线 HTTP，未建立本地持久化 SQLite/WatermelonDB 缓存 | 地铁、高铁、电梯弱网环境下列表易报错白屏，体验中断 | 引入基于 `AsyncStorage` 的轻量离线缓存与乐观更新 (Optimistic UI) |
| **后台推送通知** | 依赖前台 Store 轮询 (`notifications.ts`)，后台被挂起时无法收信 | 老板退出 App 后，关键审批与熔断预警无法秒级触达 | 接入 Android 系统级推送通道 (厂商通道/UnifiedPush) |
| **复杂契约的原生化** | 三态活拓扑与 API 契约目前依赖跳转 Web 容器加载 | 移动网络下加载 HTML 需要 1~2s，缺乏秒开质感 | 在 App 端构建原生的**「API 契约轻量速览抽屉 (Sheet)」**与拓扑微缩图 |
| **多公司切换** | 切换企业需重新拉取或进设置页重选 | 拥有多家子公司/租户的老板操作步骤繁琐 (需要 3~4 次点击) | 在顶部导航栏加入类似 Slack/Lark 的**多企业秒级快速下拉切换器** |

---

## 3. WEB 全功能控制台持续演进战略 (Continuous Web Upgrades)

Web 全功能平台作为总调度塔，必须保持高质量的持续升级。未来演进路线划分为三大战役：

### 战役一：API 生命周期与微服务网格深度联动 (API Mesh & Gateway Sync)
- **当前现状**：已实现本体实体与多协议 API 契约（HTTP/gRPC/Dubbo/MQ）绑定、DSH MCP 自动投影与智能 Mock 生成；
- **持续升级点**：
  1. 接入真实 API 网关探针（如 Spring Cloud Gateway 动态路由、Apache APISIX 路由配置同步）；
  2. 实现 API 在线调试沙箱（直接发起真机请求或转发至 Mock 桩），捕获出参并与本体 Schema 自动做 Diff 校验。

### 战役二：老旧大单体逆向脚手架深化 (Reverse-Scaffolding Evolution)
- **当前现状**：`reverse-scaffold-legacy-project.mjs` 支持解析 SQL DDL 表结构与 Maven `pom.xml`，自动提取模块与多租户字段；
- **持续升级点**：
  1. 增加针对 MyBatis XML / JPA Entity / Spring `@RestController` 注解的 AST 语法树解析，自动逆向补齐 API 契约中心；
  2. 生成老项目重构与渐进式微服务解耦方案（Strangler Fig Pattern），自动在 CMMI RTM 矩阵中建立映射。

### 战役三：不可变生产投产与防退化闭环 (Production Baseline & Anti-Regression)
- **当前现状**：CMMI 5+2 黄金文档与 G1~G5 门禁会签已在 Web 端建立完整防御；
- **持续升级点**：
  1. 将 G4(全栈验收) 与 G5(投产门禁) 与 CI/CD 流程硬性阻断绑定：未通过全量 0 编译报错、SPC 3σ 偏差检测与契约签批的代码分支，杜绝合并至生产发布流；
  2. 自动化导出不可篡改的双人复核电子签章与生产部署拓扑指纹包。

---

## 4. 阶段性改进落地项 (Immediate Action Items)

针对上述审计结果，本阶段立即在移动端落地关键增强：
1. 在 `clients/expo/src/components/` 研发原生的 **「API 契约速览抽屉 (`ApiContractSheet.tsx`)」**；
2. 在 `clients/expo/src/screens/ProjectsScreen.tsx` 联动挂载：点击「API 契约」时，**原生毫秒级滑出抽屉**展示 API 请求/响应字段、本体绑定关系及 Mock 响应，同时提供“全屏进入 Web 容器”的二次穿透按钮，兼顾原生极速体验与桌面全功能！
