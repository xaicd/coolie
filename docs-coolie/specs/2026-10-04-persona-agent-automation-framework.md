# 2026-10-04 基于 Personas 的 agent-device / agent-browser 自动化测试与自动化运营架构规范

> **状态**: PROPOSED & APPROVED  
> **责任角色**: FDA 墨斗 (架构设计) / FDSE 门神 (测试驱动) / DS 百晓生 (业务验收) / PRE-SRE 兑底渊 (运营巡检)  
> **对应阶段**: CMMI G1-G5 主线体系支撑

---

## 1. 业务背景与战略目标

老板核心指示：
> 「考虑到后续所有的测试，运营要用到 agent-device, agent-browser 来自动化测试，自动化运营，要在代码开发过程就同步写好对应的测试，运营框架代码，同时旧的已经写好的代码功能也要补充对应的用例代码，personas 就是为了这个主线任务做的，你认真架构设计交付。」

### 核心痛点与战略演进
1. **测试与运营脱节**：过去功能代码交付后，测试常依赖人工点按或一次性冒烟脚本，缺乏持续运营巡检能力。
2. **数字员工缺乏实体操作手眼**：数字员工（Personas）不能仅停留在对话框中打字，必须装备真实的操作手眼：
   - **`agent-browser`**：负责 Web 控制台端、管理端及 H5 视图的 DOM 嗅探、表单交互、截图存证与无障碍 A11y 审查；
   - **`agent-device`**：负责 Android / iOS 原生 App（`cloud.coolie.app`）的模拟器与真机操作、深链直达、无白屏验证与物理遮挡审查。
3. **开发左移（Shift-Left）**：任何功能代码在研发时，必须同步交付**自动化验收用例（Testing Spec）**与**自动化运营剧本（Operations Playbook）**，否则不予通过 CMMI G3/G4 门禁。
4. **历史资产补齐**：对已上线的核心功能（架构治理 G1-G5 门禁、审批中心与收件箱、业务本体多域与图谱防爆、移动原生端核心工作台），全量补齐自动化用例与运营剧本。

---

## 2. 总体架构设计

```mermaid
flowchart TD
    subgraph Personas["数字员工人设层 (Personas)"]
        DS["百晓生 (DS)<br/>用户视角验收 / 语义审查"]
        FDSE["门神 (FDSE)<br/>四态状态机 / 异常兜底"]
        SRE["兑底渊 (PRE-SRE)<br/>拨测 / 监控 / 秒级告警"]
        OPS["运营专员 (Web/Mobile Ops)<br/>日常打理 / 巡检报告"]
    end

    subgraph CoreEngine["双引擎驱动抽象层 (Dual Driver Engines)"]
        BrowserDriver["BrowserDriver<br/>(封装 agent-browser / Playwright)"]
        DeviceDriver["DeviceDriver<br/>(封装 agent-device / ADB / Simctl)"]
    end

    subgraph PlaybookHub["用例与剧本中心 (Scenarios & Playbooks)"]
        TestCases["自动化测试用例库 (Testing Suite)<br/>- 门禁特批会签验收<br/>- 收件箱全流转验收<br/>- 本体多域防爆验收<br/>- App 净装无遮挡验收"]
        OpsPlaybooks["自动化运营剧本库 (Operations Suite)<br/>- 阻断门禁常态巡航<br/>- 积压审批单每日督促<br/>- 业务本体健康度打理<br/>- 移动端 OTA 指纹监控"]
    end

    subgraph EvidenceLedger["CMMI G1-G5 证据账本与结果闭环"]
        Ledger[".coolie-local/evidence-ledger/"]
        WebBoard["Web 审批中心 / 治理控制台"]
        WeChatAlert["微信 / 钉钉运营告警通知"]
    end

    Personas -->|驱动| CoreEngine
    CoreEngine -->|执行| PlaybookHub
    PlaybookHub -->|存证与告警| EvidenceLedger
```

---

## 3. Personas 角色与操作能力映射矩阵

| Persona (员工) | 核心职责 | 绑定工具引擎 | 测试关注维度 (Testing Duty) | 运营巡检维度 (Operations Duty) |
|---|---|---|---|---|
| **百晓生 (DS)** | 业务主审官 / 最终用户 | `agent-browser` + `agent-device` | 业务旅程从头到底连贯性、文案语义一致性、零假按钮、零死链接 | 业务数据孤岛巡检、未关联实体的本体排查、业务阻塞工单走查 |
| **门神 (FDSE)** | 全栈工程交付 / 交互防御 | `agent-browser` + `agent-device` | UI 四态穷举（加载态、空态、成功态、错误态）、极端输入防御、按钮防抖 | 前端性能劣化巡检、客户端崩溃捕获、DOM 物理遮挡嗅探 |
| **兑底渊 (PRE-SRE)** | 产品可靠性 / 发版守卫 | `agent-browser` + `agent-device` | 环境版本指纹握手（7处版本号一致性）、不可变部署验证 | 端点可用性分钟级拨测、DB/PGlite 空间健康度、OTA 缓存失效监控 |
| **墨斗 (FDA)** | 架构设计 / 领域防线 | `agent-browser` | 多组织/企业物理隔离方案、RBAC 权限防线、本体模型守恒 | 数据模型漂移排查、图谱节点连通性巡检 |
| **Web Ops** | Web 端专属日常运营 | `agent-browser` | 浏览器跨内核渲染兼容性、暗黑/明亮主题切换 | 待办收件箱积压巡检、每日早 8 点控制台仪表盘健康巡航 |
| **Mobile Ops** | 移动端专属日常运营 | `agent-device` | Android/iOS 模拟器装机体验、深链回跳完整性 | 生产版本 OTA 生效校验、启动耗时与首屏帧率监测 |

---

## 4. 双引擎抽象层 (Dual Driver Contract)

### 4.1 BrowserDriver (agent-browser 包装)
统一封装以下能力：
- `navigate(url: string)`: 页面路由直达与就绪等待；
- `click(selector: string, options?: ClickOptions)`: 智能元素点击（支持防抖检测与 A11y 名称匹配）；
- `fill(selector: string, value: string)`: 输入框填充与变更事件触发；
- `assertVisible(selector: string, timeoutMs?: number)`: 元素可见性断言；
- `assertText(selector: string, expectedPattern: string | RegExp)`: 文本真值校验；
- `takeScreenshot(name: string)`: 屏幕快照存证并保存至产物目录；
- `getA11ySnapshot()`: 获取无障碍可达树，用于无头嗅探死穴；
- `checkVisualOverlap()`: 几何坐标重叠计算，审查是否存在浮层遮挡。

### 4.2 DeviceDriver (agent-device 包装)
统一封装以下能力：
- `launchApp(appId: string)`: 启动原生/Expo 客户端应用；
- `pressKey(key: "back" | "home" | "enter")`: 系统物理键事件注入；
- `tap(selectorOrCoordinates: string | { x: number, y: number })`: 触屏点击；
- `swipe(direction: "up" | "down" | "left" | "right")`: 手势滑动审查长列表；
- `assertScreen(screenName: string)`: 屏幕标题或核心锚点断言；
- `takeDeviceScreenshot(name: string)`: 原生设备截图存证；
- `openDeepLink(url: string)`: 验证深链协议回跳与 WebView 登录态穿透。

---

## 5. 代码开发同步左移规范 (Shift-Left Contract)

从本波次（wave296+）开始，凡在仓库内新增业务功能，研发人员（Core SWE / FDSE）必须遵循 **「三位一体交付铁律」**：
1. **代码实体**：业务前端与后端代码（`ui/`、`server/`、`clients/expo/` 等）；
2. **自动化测试用例**：放置在 `packages/agent-automation/src/scenarios/testing/` 下，命名为 `<feature-domain>.test.ts`；
3. **自动化运营剧本**：放置在 `packages/agent-automation/src/scenarios/operations/` 下，命名为 `<feature-domain>.ops.ts`。

**CMMI 门禁强制阻断规则**：
- **G3 详细设计契约门禁**：校验是否存在对应的 test-spec 签名；
- **G4 全栈验收门禁**：必须由门神（FDSE）或百晓生（DS）以 Persona 身份调用 `agent-browser` / `agent-device` 跑通该用例，并将执行成功证据写进 `.coolie-local/evidence-ledger/`，否则禁止进入 G5 投产阶段。

---

## 6. 旧功能补齐用例清单 (Legacy Feature Coverage)

本波次首先完成以下 4 大核心旧功能的自动化测试与运营用例闭环：

| 业务域 | 自动化测试用例 (Testing) | 自动化运营剧本 (Operations) | 责任 Persona |
|---|---|---|---|
| **1. 架构治理与特批放行** | `test-governance-waiver.ts`<br/>验证 G1-G5 门禁列表、阻断申请特批弹窗、填写放行理由提交、审批通过后点亮紫色 Waived 徽章 | `ops-governance-patrol.ts`<br/>定期扫描全企业门禁健康分，统计超期未放行阻断项并向 PM 生成督查报表 | FDSE / PRE-SRE |
| **2. 审批中心与收件箱** | `test-inbox-approvals.ts`<br/>验证收件箱审批卡片专属渲染（门禁特批/雇佣/策略）、一键 Approve/Reject、状态即时流转 | `ops-inbox-triage.ts`<br/>定期扫描滞留 > 24h 的待办审批单，按优先级聚合提醒掌柜 | DS / Hermes |
| **3. 业务本体多域与图谱** | `test-ontology-domains.ts`<br/>验证默认域自生、新增多项目/多本体域、2000+ 关系图谱防爆采样与边聚合渲染 | `ops-ontology-patrol.ts`<br/>每周扫描本体库孤岛实体、冗余连线并给出拓扑优化建议 | FDA / DS |
| **4. 移动原生端工作台** | `test-mobile-app.ts`<br/>验证模拟器 App 冷启、登录态保持、工作空间与资产 Tab 浏览、零白屏零物理遮挡 | `ops-mobile-ota-check.ts`<br/>每次发布前自动核对原生 runtimeVersion 与生产 manifest 哈希一致性 | Mobile Ops / PRE-SRE |

---

## 7. EARS 验收标准 (Acceptance Criteria)

1. **[UBIQUITOUS]** 框架提供统一的 `packages/agent-automation` 独立模块，导出 `BrowserDriver`、`DeviceDriver`、`PersonaRegistry` 与 `PlaybookRunner`。
2. **[EVENT-DRIVEN]** WHEN 执行 `pnpm test:personas` 或 `bash scripts/run-persona-automation.sh` 时，系统 SHALL 能够装载指定 Persona，无缝调用 `agent-browser` 或 `agent-device` 驱动目标环境并生成结构化证据 JSON 与截图。
3. **[STATE-DRIVEN]** WHILE 处于脱机沙箱测试环境且未连接外部真机时，Driver SHALL 自动降级为 Mock/Headless 验证模式，确保 CI 与本地研发不会因外部依赖阻断构建。
4. **[UNWANTED-BEHAVIOR]** IF 任何用例执行失败或页面出现致命错误（白屏、遮挡、假按钮），THEN Runner SHALL 立即捕获失败现场截屏并生成带有 5-Why 根因追溯的 CMMI 缺陷卡片。
