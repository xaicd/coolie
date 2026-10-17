# 基于 agent-device 与 agent-browser 反向视角的自测试自运营开发最高法典 (Reverse-Engineered Testability & Ops Standard)

> **法典标识**: `RULE_REVERSE_ENGINEERED_TESTABILITY_AND_OPS`  
> **生效范围**: 全体数字员工 (Hermes / 墨斗 / 铁匠 / 门神 / 兑底渊 / 百晓生) 及全平台业务代码 (Web / Mobile / Server)  
> **核心工具**: `agent-device` (移动真机/模拟器) · `agent-browser` (Web 驱动) · `coolie-mcp` (自动化与运营 MCP)  
> **核心哲学**: **以测定研，以运定研 (Testability & Ops-Ready by Design)**。拒绝“先编码再想怎么测”，全面从自动化嗅探与运营遥测需求反向倒推代码设计，使所有功能在编写的瞬间，**天然 100% 具备自动化测试与智能运营能力**。

---

## 一、 研发认知范式重塑：正向盲目 vs 反向契约

```
【过去·正向盲目开发（被动落后）】
业务代码自由写 ──> 缺少定位符/状态黑盒 ──> agent-device / agent-browser 无法嗅探 
       ──> 测试工程师或 Agent 到处碰壁 ──> 只能写 ad-hoc 脚本甚至退回裸跑 curl ──> 假交付与高维护成本

【现在·反向视角重塑（Agent-Device & Agent-Browser 原生驱动）】
agent-device / agent-browser 自动化嗅探协议
& 掌柜驾驶舱 / 活体本体运营遥测契约
        │ (从终局反向推导代码规范)
        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. 结构自暴露：所有页面根节点强制输出 data-state="normal|empty|loading|error"   │
│ 2. 元素自寻址：所有交互控件强制语义层级 testID / data-testid="{r}:{m}:{a}"      │
│ 3. 触控自防御：强制集成 <AppSafeAreaFooter> 与 44dp 触控面，320dp 遮挡率 ≤ 5%   │
│ 4. 文本自极简：强制两字规范（中文 ≤ 2 字），对齐 qaTwoLetterAudit 机器秒检      │
│ 5. 动词自并轨：所有突变接口强制绑定 Palantir ActionType，自带审计凭证与两字审批 │
│ 6. 运营自遥测：所有业务模块标配导出 totalCount / pendingCount / errorRate        │
└─────────────────────────────────────────────────────────────────────────────┘
        │ (原子基类无感继承)
        ▼
研发通过标准基类组件（<AppButton>, <AppPageContainer>, <ActionRoute>）开箱即用
──> 代码写完的瞬间，天然具备 100% 的自动化测试、快照存证与实时运营遥测能力！
```

---

## 二、 前端反向契约：移动端与 Web 自动化四大法定标配

### 契约 1：DOM & Accessibility 元素自寻址契约 (Semantic TestID & A11y)
任何可交互元素（Button, Input, Switch, Tab, Modal, Card），**强制要求输出三段式语义定位符**，禁止无 ID 的裸组件：
1. **三段式层级规范**：`{route}:{module}:{action}`
   - 例：`orders:filter:btn-search`（订单页-筛选模块-查询按钮）
   - 例：`tickets:verify:btn-confirm`（门票页-核销模块-确认按钮）
   - 例：`auth:login:input-phone`（登录页-登录模块-手机号输入框）
2. **多端双向注入**：
   - **Web 端 (React / Next.js)**：强制同时渲染 `data-testid` 与 `aria-label`；
   - **原生移动端 (Expo / React Native)**：强制同时渲染 `testID` 与 `accessibilityLabel`。
3. **嗅探收益**：`agent-browser` 与 `agent-device` 0 猜测、0 依赖易脆的 XPath 或文本模糊匹配，毫秒级绝对精准定位。

### 契约 2：页面根节点四态自声明契约 (Self-Reporting Four-State Machine)
页面或列表容器根节点，**必须通过 `data-state` 属性显式声明当前状态**，且必须完整覆盖四态：
- `data-state="loading"`：数据加载中，内部必须挂载骨架屏 `data-testid="{route}:skeleton"`；
- `data-state="empty"`：无数据空态，内部必须挂载友好占位与引导按钮 `data-testid="{route}:empty-state"`；
- `data-state="error"`：接口或逻辑异常，内部必须挂载错误条 `data-testid="{route}:error-banner"` 与重试按钮 `data-testid="{route}:btn-retry"`；
- `data-state="normal"`：数据加载成功并正常渲染。
- **嗅探收益**：MCP 工具 `qaQuadSnapshot` 无需打桩猜测，直接读取根节点 `data-state`，全自动抓取四态快照并加盖 SHA-256 不可变存证。

### 契约 3：6 寸屏 320dp 几何防遮挡与最小触碰面契约 (Anti-Occlusion & 44dp Touch Area)
1. **吸底操作区强制容器**：所有处于视口底部的确认、提交、结算操作条，强制使用 `<AppSafeAreaFooter>`：
   - 移动端：自动绑定 `useSafeAreaInsets().bottom` 避让 iOS 虚拟横条与 Android 虚拟手势条；
   - Web 端：自动计算 `env(safe-area-inset-bottom, 16px)` 并保留滚动留白；
2. **最小触控面**：所有按钮与点击热区必须满足 `min-height: 44dp`, `min-width: 44dp`，较小图标必须设置 `hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}`；
3. **断言门禁**：与底部 5 槽位导航条的重叠遮挡率必须 `<= 5.0%`，确保 `qaOcclusionAssert` 静态与动态断言 100% 通过。

### 契约 4：极简两字 UI 契约与操作纯净化 (Two-Letter UI Discipline)
1. 所有操作类按钮、菜单项与弹窗动作，**中文文案严格 `<= 2 字`**（如“确定”、“驳回”、“新建”、“查询”、“重试”、“保存”、“核销”），英文严格 `<= 1 词`；
2. 状态标签（Tag/Badge）严格 `<= 2 字`（如“进行”、“完成”、“挂起”、“已驳”）；
3. **断言门禁**：直接挂载 `qaTwoLetterAudit` 自动化机检，超过 2 个字直接判定为违反规范。

---

## 三、 后端反向契约：业务动词与运营自度量两大标配

### 契约 5：业务动词与活体本体绑定契约 (ActionType & Provenance Ledger)
1. 任何数据突变接口（POST / PUT / DELETE），**必须在元数据中明确绑定 Palantir 活体本体动词**：
   ```ts
   export const actionBinding = {
     domain: "wenlv",
     objectType: "Ticket",
     actionType: "Ticket.Verify",
     requiredEvidence: ["operatorId", "qrCodeHash", "timestamp"],
   };
   ```
2. 每次写入执行必须在履约账本（`action_provenance`）留痕，自动关联调用者、前序状态、后续状态与 SHA-256 签名；
3. **运营收益**：彻底打通 `opsTriggerReconciliation`，财务对账与工件交付无漏单。

### 契约 6：运营大盘自度量标配与口语提案化契约 (Auto-Telemetry & Voice-to-Proposal)
1. **度量标配暴露**：每个业务模块必须导出标准化指标函数 `getOpsTelemetry()`，统一暴露三项指标：
   - `totalCount`：该模块当前实体总量；
   - `pendingCount`：当前待掌柜决策或待核销阻塞数；
   - `failureRate`：过去 24 小时内的异常/失败比率。
   MCP 工具 `opsMetricsTelemetry` 自动抓取并聚合，无需每次为新功能手写单独的大盘统计代码。
2. **一句话意图可执行映射**：核心 Action 必须定义口语匹配词与两字审批弹窗 Schema：
   - 当掌柜在工坊使用语音输入“核销张三的门票”时，`opsVoiceToProposal` 能够秒级转译为包含“同意/驳回”两字按钮的确认卡片。

---

## 四、 零负担“无感具备”原子基类库 (Zero-Boilerplate Primitives)

为避免开发者人肉编写样板代码，平台在 Web 与 Native 端提供标配基类组件：

### 1. 移动端与 Web 通用基类组件
- `<AppButton route="..." module="..." action="..." label="确定" />`：
  - 自动根据 `route:module:action` 派生 `testID` 与 `data-testid`；
  - 自动断言并裁剪文案至 2 个字；
  - 自动保障 44dp 触控面与触控反馈；
  - 自动上报点击遥测事件。
- `<AppPageContainer route="..." state={pageState} onRetry={refetch}>`：
  - 自动输出 `data-state="normal|empty|loading|error"`；
  - 自动在 loading 时渲染骨架屏、empty 时渲染空占位、error 时渲染两字重试横幅；
  - 自动计算 320dp 底部安全边距，彻底防遮挡。
- `useAutoState(fetcher)` Hook：
  - 自动将异步请求映射为四态，驱动容器自渲染。

---

## 五、 机器门禁守卫（Shift-Left to Machine Gates）

平台通过自动化脚本与 CI 门禁全面守卫本法典：

1. **静态 AST 扫描**：`scripts/check-testability-and-ops-gates.mjs`
   - 检查所有可交互组件是否带有符合规范的 `testID` / `data-testid`；
   - 检查所有按钮文案是否 `<= 2 字`；
   - 检查页面是否包含完整的四态兜底。
2. **Pre-commit / CI 硬阻断**：
   - 任何一项未达标，直接 Exit Code 1 阻断提单，杜绝将“不可自测、不可自运营”的半成品代码合入主干！
