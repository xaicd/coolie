# Coolie 移动端原生应用 (Mobile Cockpit) 0-1 全量重构规格说明书
# (Mobile Native App 0-to-1 Ground-Up Rebuild Specification: Super-Shell Architecture)

- **文档编号**: SPEC-COOLIE-MOBILE-001
- **版本**: v3.1.0 (顶级产品经理 0-1 全景蓝图 · Super-Shell 全量能力规格书)
- **创建日期**: 2026-09-26
- **主审架构师**: Principal Product Manager & Chief Architect (DS, FDA, Core SWE & PRE)
- **目标工程**: `clients/expo` (React Native / Expo · 包名 `cloud.coolie.app`)
- **关联工程**: `server/` (REST API & Better-Auth), `packages/shared/`, `ui/` (Web 全功能控制台), `packages/plugins/plugin-governance/`

---

## 1. 业务愿景与战略立论 (Vision & Strategic Thesis)

### 1.1 痛点本质反思：拒绝“重复造轮子却丢了 90% 功能”
在以往的移动端建设中，团队犯了典型的**“原生复刻陷阱 (The Native Rewriting Trap)”**：
1. **自定义手写把 Web 端的核心功能全丢了**：
   Web 端（`ui/`）倾注了全部研发心血，拥有极其庞大完备的企业控制面能力：
   - **项目全景与工程治理**：CMMI G1~G5 门禁会签、5+2 黄金文档基线（SRS/HLD/LLD/STP/SMR/CMP/DEP）、RTM 需求双向穿透、SPC 3σ 过程控制、SkyWalking 三态活拓扑、DSH API 契约中心、多源代码库与工作区运行时；
   - **任务与看板**：全状态看板流转、子任务依赖链、富文本 Markdown 详情、关联产物沙箱、执行心跳日志；
   - **自动化与成本**：例行定时调度 (Routines)、实时 Token 成本与模型定价、Agent 技能树与环境配置。
   而移动端早期试图用 React Native 从头重新手写这几百个功能，结果只写了几个干瘪的列表和静态卡片，**把 Web 端的精华功能全部丢了**！
2. **怪异生硬的“Web全功能”遮羞布破坏心智**：
   因为自定义手写的原生页严重缺失功能，旧版本在顶栏和各页面硬塞了一个叫 `[Web全功能]` 的按钮。
   这个按钮不仅极其怪异（给用户传达 App 是个残废玩具的负面心智），而且一旦点开，由于没有做好会话共享，还会弹窗要求用户“重新输入账号密码”，或者提示“本机未装独立版，请去下载另一个 APK”，体验极度割裂。
3. **关键资产（本体）被深埋**：
   企业核心的“业务本体 (Ontology)”原本是 Coolie 最具竞争力的数字孪生资产，却被埋在二级页面的 16px 小图标后，导致老板和架构师找不到入口，质疑“本体在哪个里面？”。

### 1.2 架构破局：超级原生外壳 + 泛在 Web 全功能内核 (Super-Shell Architecture)
参考 **Slack、Linear、Shopify Mobile、GitHub Mobile、Basecamp (Turbo Native)** 的跨端设计精髓：
- **Web 端是业务能力的单一事实来源 (Single Source of Truth)**：
  移动端直接无缝内嵌经过视口优化的 Web 全功能引擎。**Web 端有的功能，手机上 100% 都有，一个都不丢！**
  只要后端与 Web 端新增了功能或插件（例如 `@paperclipai/plugin-governance`、SkyWalking 拓扑或 SPC 算法），手机端零代码更新，立即同步具备！
- **原生层只做 Web 做不到的“硬件杀手级超能力”**：
  把移动端真机特权做到极致：**长按按住说话 (ASR 秒级派工)**、**原生相机拍摄电脑屏幕 Bug 上报**、**触感震动反馈 (Haptics)**、**锁屏系统级推送**、**硬件级紧急熔断制动器**。
- **底层建立零感知免密会话桥 (Zero-Reauth Session Bridge)**：
  原生端统一走 Web 登录流，Cookie Jar 与 LocalStorage 全端双向自动同步，**100% 杜绝二次输入密码**。
- **界面彻底纯净：消灭所有“Web全功能”字样**：
  用户在使用 App 时，感知到的就是完整、浑然一体的 Coolie 移动控制面。

---

## 2. 系统服务对象角色与完整旅程映射 (Personas & User Journeys)

Coolie 服务于企业数字员工协同的五大核心角色，每个角色在移动端都有精准对应的操作闭环：

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   Coolie 角色与功能旅程映射矩阵                                 │
├─────────────┬───────────────────────────────┬───────────────────────────────────────────────────┤
│ 服务角色    │ 核心关注点与日常痛点          │ 移动端专属落地页面与自然闭环                      │
├─────────────┼───────────────────────────────┼───────────────────────────────────────────────────┤
│ 1. 老板     │ • 钱花在哪了？Token 有无爆表？│ Tab 1: 汇览 (Cockpit) ── 经营态势决策舱           │
│ (Executive/ │ • 任务卡在哪个环节？          │ • 资金与 Token 实时燃尽（今日花销、预测、预警）   │
│  Boss)      │ • 发生失控能不能一秒掐死？    │ • 阻断卡点快审浮条（右滑通过/左滑驳回，带触感）   │
│             │ • 走在路上突然想到需求怎么发？│ • 业务本体态势速览卡（健康度 🟢，点击直达拓扑）   │
│             │                               │ • 硬件级紧急熔断制动器（毫秒级停机防刷爆）        │
│             │                               │ Tab 3: 中央调度 ── 🎙️ 长按 3 秒语音派单          │
├─────────────┼───────────────────────────────┼───────────────────────────────────────────────────┤
│ 2. 需求/方案│ • 需求有没有规范收敛 (EARS)？ │ Tab 2: 任务中心 (Tasks) + Tab 5: 项目中心         │
│ (PM / DS)   │ • 需求与代码/测试是否穿透？   │ • 任务详情全量查看、标签过滤、状态看板流转        │
│             │ • 交付物原型跑起来长什么样？  │ • CMMI G1 需求门禁与 5+2 黄金文档 (SRS) 会签     │
│             │                               │ • RTM 需求双向跟踪矩阵穿透下潜                    │
│             │                               │ • Tab 5 交付产物 (Artifacts) 实时真机预览沙箱     │
├─────────────┼───────────────────────────────┼───────────────────────────────────────────────────┤
│ 3. 架构师   │ • 业务实体关系有没有被乱改？  │ Tab 5: 组织与资产 -> 🧠 业务本体 (Ontology)       │
│ (Architect/ │ • 跨企业隔离与权限边界守死没？│ • 1800 行原生本体拓扑、实体域网络、安全锁死审计   │
│  FDA)       │ • 微服务调用拓扑有没有死循环？│ • 项目详情内嵌 SkyWalking 三态活拓扑与混沌演练    │
│             │ • API 契约协议有无漂移？      │ • DSH/MCP API 契约中心与多协议 Mock 沙箱          │
├─────────────┼───────────────────────────────┼───────────────────────────────────────────────────┤
│ 4. 核心研发 │ • 派给我的活背景是什么？      │ Tab 2: 任务 (Tasks) + Tab 4: 智能工坊 (Chat)      │
│ (Core SWE / │ • 代码改了哪些行？有没有冲突？│ • 移动端专属单列 Git Diff 语法高亮对比器          │
│  FDSE)      │ • 电脑屏幕报异常，怎么传给AI？│ • Tab 4 工坊 SSE 打字机流式输出与思考折叠         │
│             │                               │ • 原生调起真机相机拍摄电脑屏幕报错，圈选涂鸦发送  │
├─────────────┼───────────────────────────────┼───────────────────────────────────────────────────┤
│ 5. 质量/SRE │ • 阶段质量门禁卡点在哪？      │ Tab 5: 组织与资产 -> 📁 项目中心 (CMMI & SRE)     │
│ (PRE / SRE /│ • 缺陷率与耗时是否在 3σ 内？  │ • CMMI G2~G5 质量门禁一票否决与签署               │
│  CMMI Lead) │ • 缺陷根本原因有无鱼骨图固化？│ • SPC 3σ 统计过程控制与 5-Why 鱼骨根因防退化图谱  │
│             │ • 线上环境指纹是否一致？      │ • 投产前生产指纹会签与不可变发布基线              │
└─────────────┴───────────────────────────────┴───────────────────────────────────────────────────┘
```

---

## 3. Web 全功能与 App 映射矩阵 (Web Capability Inventory & Mobile Routing)

**原则：Web 端 100% 的功能在移动端全部可用，零遗漏！**

| Web 端路由 (`ui/src/pages/`) | 业务功能全称 | 移动端入口归位 | 移动端渲染承载形态 | 鉴权保障 |
| :--- | :--- | :--- | :--- | :--- |
| `/dashboard` | 经营态势与综合大盘 | Tab 1: 汇览 (Cockpit) | 原生高性能大盘 + 关键指标组件 | 原生 API (`coolie.getDashboard`) |
| `/issues` | 任务管理、全状态看板、列表过滤 | Tab 2: 任务 (Tasks) | 原生任务列表/看板 + 单列 Git Diff | 原生 API (`coolie.listIssues`) |
| `/issues/new` | 结构化建单抽屉 | Tab 3: 中央调度 ([+] / 🎙️) | 原生语音派单 + 敏捷抽屉 | 原生 ASR + 原生建单 API |
| `/chat` | 智能体实时协同工坊 | Tab 4: 工坊 (Chat) | 原生 SSE 打字机 + 相机多模态 | 原生 SSE + 原生相机 |
| `/projects` | 多源代码库、微服务项目中心 | Tab 5: 资产 -> 📁 项目中心 | 原生项目卡片导航器 | 原生 API (`coolie.listProjects`) |
| `/projects/:id` | 项目概览、分支、工作区配置 | 点击具体项目卡片 | 原生容器 (WebContainer) | `/api/auth/exchange` 自动 Cookie |
| `/projects/:id/baseline` | CMMI 5+2 黄金工程文档中心 | 项目卡片点击 `[5+2 文档]` | 原生容器 (WebContainer) | `/api/auth/exchange` 自动 Cookie |
| `/projects/:id/spc` | CMMI SPC 3σ 过程控制与控制图 | 项目卡片点击 `[SPC 控制]` | 原生容器 (WebContainer) | `/api/auth/exchange` 自动 Cookie |
| `/projects/:id/living-topology` | SkyWalking 三态活拓扑与演练 | 项目卡片点击 `[三态拓扑]` | 原生容器 (WebContainer) | `/api/auth/exchange` 自动 Cookie |
| `/projects/:id/api-lifecycle` | DSH / MCP API 契约协议中心 | 项目卡片点击 `[API 契约]` | 原生契约抽屉 + 原生容器 | 原生抽屉 / 容器自动 Cookie |
| `/ontology` | 业务本体设计器、域与实体拓扑 | Tab 5: 资产 -> 🧠 业务本体 | 1800 行原生大屏 (`OntologyDomainListScreen`) | 原生 API (`coolie.getOntology*`) |
| `/agents` | 数字员工花名册、状态、模型底座 | Tab 5: 资产 -> 👥 数字员工 | 原生员工卡片 (`AgentsScreen`) | 原生 API (`coolie.listAgents`) |
| `/agents/:id` | 员工详情、技能树、Token 用量配置 | 点击员工卡片 | 原生员工详情抽屉 (`AgentDetailSheet`) | 原生 API |
| `/routines` | 自动化定时例行计划调度 | Tab 5: 资产 -> 快捷入口 | 原生容器 (WebContainer) | `/api/auth/exchange` 自动 Cookie |
| `/costs` | 实时 Token 消耗与模型定价全景 | Tab 5: 资产 -> 快捷入口 | 原生容器 (WebContainer) | `/api/auth/exchange` 自动 Cookie |
| `/activity` | 企业全局审计日志流 | Tab 1: 汇览 -> 审计流 | 原生审计列表 (`ActivityFeed`) | 原生 API |
| `/inbox` | 待办通知、阻塞卡点提醒 | AppBar 顶部右侧 `[🔔 (3)]` | 原生收件箱抽屉 (`NotificationsSheet`) | 原生 API (`useNotificationsStore`) |
| `/settings` | 团队成员、企业凭证、环境配置 | AppBar 侧滑 / 设置抽屉 | 原生设置面板 (`SettingsSheet`) | 原生 API |

---

## 4. 全局信息架构：干净纯粹的 5 栏底盘 (5-Tab IA)

**彻底移除任何形如“Web全功能”的独立按钮，还给用户一个干净、高级的生产力工具界面：**

```
+-----------------------------------------------------------------------------------+
|  [🏢 XROA 智研科技 v]        [🟢 12 Agents 运行中]        [🔍 全局搜索]  [🔔 收件箱 (3)]  |
+-----------------------------------------------------------------------------------+
|                                                                                   |
|  Tab 1: 汇览 (Cockpit) ── 原生高管决策大盘                                        |
|  • 资金与 Token 实时燃尽大盘 (今日花销、本月预测、超额预警)                         |
|  • 阻断卡点快审浮条 (右滑同意 / 左滑驳回，带触感震动)                              |
|  • 业务本体数字孪生健康态势卡（展示 4 域 128 实体，点击直达本体拓扑）              |
|  • 紧急熔断制动器 (Emergency Kill Switch - 毫秒级停机防刷爆)                        |
|                                                                                   |
|  Tab 2: 任务 (Tasks) ── Web 全量任务中心无缝透传                                  |
|  • 完整呈现 Web 端任务体系：看板 (Kanban) / 列表视图自由切换                      |
|  • 支持高级标签过滤、父子任务分解、富文本 Markdown 详情与执行日志                   |
|  • 移动端专属单列 Git Diff 语法高亮对比器 (绿色添加/红色删除/行内建议)             |
|                                                                                   |
|  Tab 3: 调度中心 ([+] / 🎙️) ── 核心高管交互，悬浮大按键                           |
|  • 长按按住说话 (Hold-to-Talk)：腾讯云 ASR + 豆包语义提取，3 秒智能建单            |
|  • 轻触敏捷建单：单底抽屉式面板，支持关联项目与 EARS 验收标准输入                  |
|                                                                                   |
|  Tab 4: 工坊 (Chat) ── 协同工坊与实时会话                                         |
|  • SSE 打字机流式响应，智能折叠 Agent 内部推理思考过程 (CoT)                       |
|  • 多模态原生采集：调起真机相机拍摄电脑屏幕报错，圈选涂鸦后发入工坊                |
|  • 内嵌交互式卡片：构建进度、审批请求、交付物沙箱跳转                              |
|                                                                                   |
|  Tab 5: 资产与组织 (Org & Assets) ── 企业核心资产全景 (四合一)                    |
|  • 🧠 业务本体 (Ontology)：1800 行原生大屏，实体网络拓扑、快照审计、安全锁死       |
|  • 📁 项目中心 (Projects)：直达详情，全量支持 CMMI 质量门禁、三态活拓扑、API 契约   |
|  • 👥 数字员工 (Agents)：点击直接查看真实详情，配置模型底座与技能装备              |
|  • 📦 交付产物 (Artifacts)：交付件与运行态沙箱一键真机预览                         |
|                                                                                   |
+-----------------------------------------------------------------------------------+
|   [ 汇览 Cockpit ]   [ 任务 Tasks ]   [ 🎙️ 派工 ]   [ 工坊 Chat ]   [ 组织/资产 ]   |
+-----------------------------------------------------------------------------------+
```

---

## 5. 关键技术契约与协议规范 (Technical Architecture & Protocols)

### 5.1 零感知免密认证交换桥 (Zero-Reauth Session Bridge Protocol)

彻底解决原生端与内嵌 Web 容器之间的跨域会话同步问题：

```mermaid
sequenceDiagram
    autonumber
    actor User as 用户
    participant App as Expo 原生 App
    participant SecureStore as 设备安全存储 (Keychain/Keystore)
    participant WebView as 内嵌全功能容器 (WebContainer)
    participant Server as Coolie Server (/api/auth/exchange)
    participant WebApp as Coolie Web 全功能页面

    User->>App: 手机端登录 (账密/手机验证码)
    App->>Server: POST /api/auth/sign-in
    Server-->>App: 返回 Session Token
    App->>SecureStore: 安全持久化 token
    
    Note over App,WebView: 用户点击进入项目控制台 / CMMI / 拓扑
    App->>SecureStore: 获取有效 sessionToken
    App->>WebView: 加载桥接 URL: /api/auth/exchange?token=...&next=/projects/123
    WebView->>Server: GET /api/auth/exchange?token=...
    Server->>Server: 验证票据有效性并生成 session
    Server-->>WebView: HTTP 302 重定向到 targetUrl<br/>Header: Set-Cookie: better-auth.session_token=...; HttpOnly; SameSite=Lax
    WebView->>WebApp: 带着 Cookie 访问 /projects/123
    WebApp-->>WebView: 200 OK 渲染完整项目与治理控制台 (免密成功！)
```

**契约实现标准**：
```typescript
/**
 * 规范所有内嵌 Webview 容器的鉴权 URL 生成器。
 * 必须走 exchange 302 附带 Set-Cookie，确保 WebView cookie jar 立刻获得有效会话。
 */
export async function buildAuthenticatedAppUrl(targetPath: string = "/dashboard"): Promise<string> {
  const token = await getWebExchangeToken();
  const cleanPath = targetPath.startsWith("/") ? targetPath : `/${targetPath}`;
  const baseUrl = `${COOLIE_WEB_URL.replace(/\/+$/, "")}${cleanPath}`;
  
  if (!token) {
    return `${baseUrl}?shell=native`;
  }
  
  return `${COOLIE_WEB_URL.replace(/\/+$/, "")}/api/auth/exchange?token=${encodeURIComponent(token)}&next=${encodeURIComponent(baseUrl)}&shell=native`;
}
```

### 5.2 移动端双向 JSBridge 协议 (Bidirectional JSBridge)

Web 页面与原生 Shell 之间通过安全的结构化 JSON 消息进行通信：

```typescript
export interface JSBridgeMessage {
  protocol: "COOLIE_SHELL_V1";
  action: "COOLIE_NAVIGATE" | "COOLIE_HAPTIC" | "COOLIE_CAMERA_CAPTURE" | "COOLIE_EMERGENCY_STOP" | "COOLIE_CLOSE";
  payload?: Record<string, unknown>;
}
```

- `COOLIE_NAVIGATE`: Web 页面请求切换到原生 Tab 或子屏（如跳转到本体、任务）；
- `COOLIE_HAPTIC`: 门禁签署或危险操作时，触发原生线性马达震动（`Haptics.impactAsync`）；
- `COOLIE_CAMERA_CAPTURE`: 调起原生真机相机拍摄报错屏幕，图片 Base64 回调给 Web；
- `COOLIE_EMERGENCY_STOP`: Web 触发熔断保护，原生壳弹出全屏二次确认卡。

### 5.3 视口自适应与样式注入规则 (Mobile Viewport CSS/JS Injection)

当内嵌 Web 容器附带 `?shell=native` 参数时，注入以下 CSS 规则保证与原生 Shell 浑然一体：
1. **隐藏 PC 端冗余元素**：
   ```css
   .coolie-standalone-nav,
   .coolie-desktop-header,
   .pc-sidebar-toggle {
     display: none !important;
   }
   ```
2. **适配安全区与原生滚动**：
   ```css
   body {
     -webkit-touch-callout: none;
     -webkit-user-select: auto;
     overscroll-behavior-y: contain;
     padding-top: env(safe-area-inset-top);
     padding-bottom: env(safe-area-inset-bottom);
   }
   ```

---

## 6. 原生硬件杀手级能力实现细节 (Native Superpowers)

### 6.1 悬浮按住说话·秒级语音派工 (Hold-to-Talk Voice Dispatch)
- **按键形式**：底栏中央突出大悬浮按键 `[🎙️]`；
- **交互细节**：
  - 手指按下立即触发轻度震动反馈（`Haptics.impactAsync(Light)`），中央浮出声波雷达涟漪动画；
  - 采集麦克风音频流；
  - 松手即触发中度震动，音频提交服务端 ASR（支持腾讯云 ASR 与豆包大模型语音流）；
  - 智能解析意图并提取结构化字段：`title`（任务标题）、`priority`（紧急程度）、`assignee`（承接智能体）；
  - 弹出 3 秒倒计时快速确认卡片，支持一键确认或倒计时结束自动建单。

### 6.2 原生相机多模态录入 (Native Camera Bug Capture)
- 在工坊（Tab 4）输入框与建单抽屉中，提供 `[📷 相机]` 入口；
- 点击直接调用真机原生摄像头（`expo-image-picker`）拍摄电脑屏幕报错信息；
- 内置轻量画笔工具，支持用红框圈选异常文字或涂鸦；
- 圈选后的图片直接以多模态消息发入工坊会话，数字员工基于视觉信息精准排查。

### 6.3 硬件级紧急熔断制动器 (Emergency Kill Switch)
- 置于 Tab 1 汇览大盘顶端；
- 带有红白呼吸闪烁视觉，展示当前系统总运行中进程数；
- 点击弹出全屏警示确认，要求长按 2 秒或生物识别确认，防止误触；
- 确认后立即调用 `POST /api/companies/{companyId}/emergency-stop`，毫秒级暂停本公司所有正在运行的 Agent 进程并停机防刷爆。

---

## 7. EARS 形式化验收标准与质量门禁 (Acceptance Criteria & Gates)

### 7.1 G1 需求覆盖与体验门禁 (EARS Specification)
- **UBIQUITOUS-01 (全功能无遗漏)**：系统应当在移动端完整呈现 Web 全功能（包含 CMMI G1~G5 质量门禁、5+2 黄金文档、RTM 穿透、三态活拓扑、API 契约中心、Routines 定时例程、成本核算大盘），不得因移动端重写而丢失任何 Web 功能。
- **UBIQUITOUS-02 (零怪异按钮)**：系统界面中**严禁**出现任何形如“Web全功能”、“Web全量”、“本机未装 Coolie Web”、“安装独立 APK”的生硬按钮与弹窗。
- **EVENT-01 (免密自动漫游)**：WHEN 用户在移动端完成一次登录后，访问任何项目详情、治理门禁或工坊页面，系统应当通过 `/api/auth/exchange` 自动植入 Session Cookie，**100% 杜绝**弹出二次登录或要求输入密码的界面。
- **EVENT-02 (本体显性直达)**：WHEN 用户进入 Tab 5「组织/资产」或在 Tab 1 大盘点击“业务本体态势卡”，系统应当直接打开 `OntologyDomainListScreen`，完整展示业务本体域、实体网络与锁定状态。
- **EVENT-03 (项目中心全治理下潜)**：WHEN 用户在 Tab 5 项目中心点击任意项目卡片或其附属的“5+2 文档”、“SPC 控制”、“三态拓扑”、“API 契约”，系统应当在原生容器内无缝加载对应全功能治理控制台。
- **STATE-01 (按住说话派工)**：WHILE 用户按住中央 `[🎙️]` 键，系统应当调用真机麦克风录音并展示波纹动画；WHEN 松开按键时，应当在 2.5 秒内完成识别并提供派单倒计时。
- **EVENT-04 (紧急一键停机)**：WHEN 用户触发紧急熔断确认，系统应当在 500ms 内向服务端广播下电指令，并将大盘指示灯置为全红告警状态。

### 7.2 G2/G3 技术合规与代码门禁
- [ ] **TS 编译门禁**：`clients/expo` 目录下执行 `pnpm typecheck` 实现 **0 错误**。
- [ ] **Bundle 打包门禁**：`clients/expo` 目录下执行 `pnpm bundle` 离线打包通过。
- [ ] **设计系统规范**：严格遵循 `DESIGN.md` 暗黑层级（`#08090A` / `#0F1011` / `#191A1B`），严禁纯白文字与刺眼强光。
- [ ] **Fork 守卫门禁**：`node scripts/check-fork-surface.mjs --cumulative` 通过。

---

## 8. 实施代码清单与交付物 (Implementation Deliverables)

1. `clients/expo/src/components/AppBar.tsx`: 彻底清除旧残留的 Web 全功能按钮与兜底弹窗，对齐标题与通知搜索图标；
2. `clients/expo/src/screens/DashboardScreen.tsx`: 将怪异的“Web全功能”卡片重构成高管级“业务本体态势”与“企业核心资产态势”，直挂本体入口；
3. `clients/expo/src/screens/ProjectsScreen.tsx`: 删除头部“Web全量”按钮，保留新建与下潜治理动作，打通完整项目控制台；
4. `clients/expo/src/screens/OrgAssetsScreen.tsx`: 统一呈现 🧠业务本体、📁项目中心、👥数字员工、📦交付产物四大资产，直挂 Tab 5；
5. `clients/expo/src/components/TabBar.tsx`: 5 栏规范（汇览、任务、🎙️派工、工坊、资产）；
6. `clients/expo/App.tsx`: 5 栏与全功能容器无缝路由挂载；
7. `clients/expo/src/utils/openCoolieWeb.ts` & `coolie.ts`: 规范 `/api/auth/exchange` 零感知免密协议。
