# Coolie 移动端原生应用 (Mobile Cockpit) 0-1 全量重构规格说明书
# (Mobile Native App 0-to-1 Ground-Up Rebuild Specification)

- **文档编号**: SPEC-COOLIE-MOBILE-001
- **版本**: v1.0.0
- **创建日期**: 2026-09-26
- **主审架构师**: Principal Product Manager & Chief Architect (DS, FDA & Core SWE)
- **目标工程**: `clients/expo` (React Native / Expo · 包名 `cloud.coolie.app`)
- **关联工程**: `server/` (REST API & Auth), `packages/shared/`, `ui/` (Web 全功能参考实现)

---

## 1. 业务背景与愿景 (Vision & Background)

### 1.1 业务诉求
当前 Coolie 控制面已在 Web 端建立了完整的 AI-Agent 组织治理能力（CMMI G1~G5 门禁、5+2 黄金文档、RTM 需求穿透、SPC 3σ 过程控制、SkyWalking 三态活拓扑、API 生命周期与插件生态）。然而现有的移动端原生应用存在以下根本性断层：
1. **体验断层与二次登录痛点**：移动端原生与 Web 全功能（内嵌 WebView / WebContainer）登录态割裂，用户在原生端登录后点进 Web 页面仍需重复输入账号密码。
2. **入口冗余与死入口**：审批操作分散在 5 处不同页面；员工详情页只能靠搜索撞到（列表无法点击）；新建任务存在多个重复表单与弹窗外壳。
3. **新功能完全不可见**：Web 端新增的企业级治理、API 契约中心、三态动态拓扑在原生端缺乏系统性映射与原生轻量载体。
4. **角色定位不清晰**：未能充分针对“老板随时掌握大盘与审批”、“业务专家真机走查原型”、“工程师随身查验 Diff 与流水线”提供极速原生交互。

### 1.2 愿景与 0-1 重构目标
彻底推倒冗余历史包袱，从 0 到 1 重新定义并构建 **Coolie 移动端原生控制舱 (Mobile Cockpit)**：
- **老板 3 秒掌控**：经营大盘、资金燃尽、一键手势审批、按住说话秒级语音派工、紧急一键熔断。
- **全端一次登录，零二次认证**：原生端通过原生 Cookie Jar 注入与 Token 漫游，打通 Webview / WebContainer，彻底消灭二次登录。
- **极致移动原生**：5 栏精简底栏、单手操作手势、触感震动反馈、单列 Git Diff 语法高亮查看器、原生真机沙箱热载。

---

## 2. 系统服务对象角色与场景矩阵 (Target Roles & Scenarios)

| 服务角色 | 角色定位 | 移动端核心痛点 | 原生杀手级功能 |
| :--- | :--- | :--- | :--- |
| **老板 / 创始人 (Boss / Executive)** | 最终决策者、出资人、一票否决权持有人 | 差旅中无法看清 Token/资金消耗；审批慢阻断研发；打字建单太繁琐 | • 资金燃尽与健康度大盘<br>• 一键滑动批量审批<br>• 豆包/腾讯云语音按住派活<br>• 紧急防爆熔断器 (Kill Switch) |
| **业务方案 / DS (Deployment Strategist)** | 用户体验主审、需求全链路穿透验收人 | 手机上看不了 Agent 交付的原型效果，无法在真机上验证白屏与死按钮 | • 真机原生运行沙箱 (Native Sandbox)<br>• 交付物中心 (Artifacts Stream)<br>• 工坊拍照/截图标注反馈 |
| **研发 / FDSE / SWE / SRE** | 代码质量第一责任人、交付闭环者 | 移动端无法看代码 Diff，构建失败无法排查步骤日志 | • 移动单列高亮 Git Diff 查看器<br>• 流水线分步骤实时日志展开<br>• API 契约与质量门禁速览抽屉 |
| **AI 员工 (Agent Workforce)** | 被管理者、自主执行者 | 缺乏透明呈现，用户不知道 Agent 在干什么 | • 数字员工档案与动态心电图<br>• 实时心跳监控与思考链 (CoT) 折叠展开 |

---

## 3. 需求说明书 (EARS 形式化语法规格)

### 3.1 认证与会话漫游 (Authentication & Session Sync)
- **UBIQUITOUS-01**: 系统应当支持账号密码 (`POST /api/auth/sign-in/email`) 与 Agent API Key 两种原生登录机制，并持久化到设备安全存储 (`SecureStore`)。
- **EVENT-01**: WHEN 用户在原生端登录成功后打开任何内嵌 Web 页面（包括 WebContainer、项目深度配置或 H5 视图），系统应当在 WebView 初始化阶段自动注入 `better-auth.session_token` Cookie 与 LocalStorage 凭证，**禁止**展示任何登录界面。
- **UNWANTED-01**: IF 原生 Session Token 过期或被服务端吊销，THEN 系统应当优雅拦截 401 响应，弹出原生轻量重新鉴权弹窗，并在成功后自动重试刚才的请求，不得导致应用白屏闪退。

### 3.2 汇览驾驶舱 (Cockpit & Dashboard)
- **UBIQUITOUS-02**: 驾驶舱应当在一屏内呈现：资金/Token 本月燃尽图、六维态势指标（完成率、交付均时、吞吐量、故障率）、实时在线 Agent 心跳动态。
- **EVENT-02**: WHEN 存在待处理的人工阻断审批（如预算超额、高危代码合入、生产投产会签），系统应当在驾驶舱最显眼区域展示**滑动批准卡片 (Quick Approval)**，支持右滑通过、左滑驳回。
- **EVENT-03**: WHEN 用户点击右上角“紧急熔断 (Kill Switch)”并完成生物识别/二次确认后，系统应当立即向服务端广播下电指令，毫秒级终止本公司所有正在运行的 Agent 进程并停止计费。

### 3.3 中央调度与语音派工 (Dispatch Hub & Voice-to-Task)
- **STATE-01**: WHILE 用户在底栏中央大按钮上长按 (Hold-to-Talk)，系统应当调用设备原生麦克风录制音频，并提供波形触感震动反馈。
- **EVENT-04**: WHEN 用户松开录音手势，系统应当将音频发送至 ASR 语音识别与大模型解析网关，自动提取任务标题、描述、优先级（`critical|high|medium|low`）并推荐指派 Agent。
- **OPTIONAL-01**: WHERE 用户希望手动精细建单，点击中央按钮唤醒单底抽屉式智能建单面板，支持关联项目、父任务及 EARS 验收标准输入。

### 3.4 协同工坊与执行流 (Board Chat & Execution Stream)
- **EVENT-05**: WHEN 用户进入工坊与 Agent 沟通，系统应当通过 SSE 流式接收消息，并以打字机动效平滑上屏。
- **UBIQUITOUS-03**: 系统应当将 Agent 内部推理链路 (`<thinking>` / CoT) 默认折叠展示，并提供“展开思考过程”开关。
- **EVENT-06**: WHEN Agent 在会话中提交中间交付物（如 HTML 页面、架构图、代码补丁），系统应当在气泡内渲染交互式卡片，点击可直接拉起原生真机沙箱或 Diff 查看器。
- **EVENT-07**: WHEN 用户在工坊点击“发送截图/拍照”，系统应当支持直接调起相机或手机相册，并附带涂鸦画笔标注后上报。

### 3.5 任务看板与代码 Diff (Tasks & Code Diff)
- **UBIQUITOUS-04**: 任务页面应当提供“列表”与“看板 (Kanban)”双重视图，支持按项目、负责人、优先级、状态进行多维度即时过滤。
- **EVENT-08**: WHEN 用户点击任意任务详情中的“代码变更 (Git Diff)”，系统应当在单列优化视图中渲染变更文件树与增删行（绿色添加/红色删除），支持行内高亮与代码折叠。
- **EVENT-09**: WHEN 用户点击任务“执行全景日志”，系统应当结构化分段呈现 Agent 的执行心跳与工具调用明细。

### 3.6 组织、资产与原生沙箱 (Workforce, Assets & Sandbox)
- **EVENT-10**: WHEN 用户在员工名册中点击任意 Agent 行，系统应当打开该 Agent 的原生专属详情页，展示其当前任务、模型底座、Token 消耗及技能工具箱，并提供“指派任务”入口（杜绝死入口）。
- **UBIQUITOUS-05**: 系统应当提供集中的“交付物中心 (Artifacts)”，分类归集 HTML 原型、Markdown 文档、架构图及部署包。
- **EVENT-11**: WHEN 用户点击预览 HTML/React 原型交付物时，系统应当以独立原生沙箱容器（`PrototypeSandbox`）加载，提供真实手机视口模拟与浮动调试菜单（刷新、错误日志、视口旋转）。

### 3.7 统一收件箱 (Unified Inbox)
- **UBIQUITOUS-06**: 顶栏铃铛入口应当统一汇聚通知与待办，并严格划分为三个分段：
  1. `待我审批` (Pending Approvals)
  2. `求助受阻` (Blocked Issues)
  3. `系统与@动态` (Activities & Mentions)
  彻底移除通知中心与收件箱两套重叠数据流的现状。

---

## 4. 全新信息架构与导航模型 (Navigation & IA Model)

### 4.1 五大底栏导航 (Main Bottom Navigation)
```
+-----------------------------------------------------------------------+
|  [ 汇览 Cockpit ]   [ 任务 Tasks ]   [ 🎙️ 派工 ]   [ 工坊 Chat ]   [ 资产 Org ]  |
+-----------------------------------------------------------------------+
```
1. **汇览 (Cockpit)**：经营态势、预算消耗、快速审批、熔断制动。
2. **任务 (Tasks)**：列表/看板双视图、搜索过滤、任务执行全生命周期追踪。
3. **调度中心 ([+] / 🎙️)**：突出悬浮大按钮：长按语音派工、点击打开敏捷建单。
4. **工坊 (Chat)**：实时会话、流式思考链、多模态拍照/涂鸦、富交互嵌入卡片。
5. **资产 (Org)**：数字员工档案（带真实详情）、项目代码库、交付物中心、治理轻量入口。

### 4.2 顶栏全局状态 (Global AppBar)
- **左侧**：多公司/工作空间快速下拉选择器 (Company Switcher)。
- **中央**：当前公司状态指示灯与在线员工计数。
- **右侧**：
  - 智能全局搜索图标 (`[🔍]` 打开 Cmd+K 搜索层：支持搜索任务、员工、文档、代码)。
  - 统一收件箱图标 (`[🔔 (N)]` 红色未读角标，点击打开三段式收件箱抽屉)。

---

## 5. 技术架构与工程实现方案 (Technical Architecture)

```
clients/expo/
├── src/
│   ├── api/
│   │   ├── authBridge.ts           # 统一鉴权、Cookie 注入与自动静默刷新
│   │   ├── client.ts               # 基于 @coolie/api-client 的类型化单例
│   │   └── sseStream.ts            # 工坊 SSE 流式消费驱动器
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppBar.tsx          # 顶栏全局组件 (公司切换 + 搜索 + 统一收件箱)
│   │   │   └── TabBar.tsx          # 5 栏底栏规范组件 (带长按语音触感)
│   │   ├── approval/
│   │   │   └── QuickApprovalCard.tsx # 单手滑动快审卡片 (左驳回/右通过)
│   │   ├── voice/
│   │   │   └── VoiceDispatchOverlay.tsx # 语音录制、声波动画与意图提取弹窗
│   │   ├── diff/
│   │   │   └── UnifiedDiffViewer.tsx   # 移动端优化单列 Git Diff 高亮组件
│   │   └── sandbox/
│   │       └── NativeWebContainer.tsx  # 免密 Cookie 注入的真机沙箱容器
│   ├── screens/
│   │   ├── DashboardScreen.tsx     # Tab 1: 汇览驾驶舱大屏
│   │   ├── TasksScreen.tsx         # Tab 2: 任务看板与列表
│   │   ├── TaskDetailScreen.tsx    # 任务详情 (执行链 + 工作区 + 评论)
│   │   ├── BoardChatScreen.tsx     # Tab 4: 工坊实时会话 (思考链折叠 + 多模态)
│   │   ├── OrgAssetsScreen.tsx     # Tab 5: 组织员工 + 项目 + 交付物多合一
│   │   ├── AgentDetailScreen.tsx   # 员工专属详情 (从列表直接下潜)
│   │   ├── UnifiedInboxSheet.tsx   # 顶栏收件箱抽屉 (审批/受阻/动态)
│   │   └── PrototypeSandboxScreen.tsx # 交付原型真机走查沙箱
│   └── stores/
│       ├── authStore.ts            # 登录凭证与会话状态
│       ├── companyStore.ts         # 当前激活公司与公司列表
│       └── offlineStore.ts         # AsyncStorage 离线数据缓存
```

### 5.1 零二次登录 (Zero-Reauth) 原生与 Webview 桥接方案
在 `NativeWebContainer.tsx` 中实现前置注入：
```typescript
import { WebView } from "react-native-webview";
import { getStoredSessionToken } from "../api/authBridge";

export function NativeWebContainer({ uri }: { uri: string }) {
  const sessionToken = getStoredSessionToken();
  const injectedCode = `
    (function() {
      // 1. 注入 Better-Auth 关键 Cookie
      document.cookie = "better-auth.session_token=${sessionToken}; path=/; max-age=2592000; SameSite=Lax";
      // 2. 注入 LocalStorage 备份
      try {
        localStorage.setItem("paperclip_session_token", "${sessionToken}");
      } catch(e) {}
    })();
    true;
  `;

  return (
    <WebView
      source={{ uri }}
      injectedJavaScriptBeforeContentLoaded={injectedCode}
      sharedCookiesEnabled={true}
      thirdPartyCookiesEnabled={true}
      domStorageEnabled={true}
      javaScriptEnabled={true}
    />
  );
}
```

### 5.2 移动端单列 Git Diff 语法高亮
彻底剔除重量级 PC 专用 Monaco/CodeMirror，采用轻量抽象解析语法树：
- 增量行标记为 `diff-added` (淡绿底色 + 绿色行首 `+`)。
- 删减行标记为 `diff-removed` (淡红底色 + 红色行首 `-`)。
- 未改动上下文折叠为“展开更多上下文 (20 行)”按钮。
- 行首点击支持弹出“快速指派改进建议”。

---

## 6. 验收标准与验证方案 (Acceptance Criteria & G1~G5 Gates)

### 6.1 G1 需求覆盖门禁 (EARS 验收)
- [ ] **AC-01 (免密漫游)**：在 App 登录后打开任何 Web 容器页面，100% 无需输入账号密码直接进入，Cookie 注入成功率 100%。
- [ ] **AC-02 (语音派工)**：长按录音 5 秒说话，松手后 2 秒内返回 ASR 识别文本并自动填入标题与优先级。
- [ ] **AC-03 (审批收敛)**：整车间仅在收件箱与大盘两处保留统一卡片，不存在第 3 处不同样式的审批弹窗。
- [ ] **AC-04 (零死入口)**：在员工列表中点击任何一个 Agent，均能正常打开其详情页；在任务列表点击任何任务，均能打开详情。
- [ ] **AC-05 (紧急熔断)**：点击紧急熔断后，本地所有任务倒计时暂停，后端活跃 Agent 状态变为 `paused`。

### 6.2 G2/G3 技术合规与编译门禁
- [ ] `cd clients/expo && pnpm typecheck`：**0 TypeScript 编译报错**。
- [ ] `cd clients/expo && pnpm bundle`：**Metro/Expo 离线 Bundle 打包通过**。
- [ ] 符合 `DESIGN.md` 设计规范：底色、边框、文字亮度严格遵守四档阶梯，无纯白与刺眼高对比度。

---

## 7. 实施落地步骤 (Implementation Plan)

1. **Step 1 (底座打通)**：实现 `authBridge.ts` 与 `NativeWebContainer.tsx`，彻底打通原生与 Web 容器的免密会话共享。
2. **Step 2 (架构收敛)**：将 `App.tsx` 与导航重构为 5 栏规范底栏；把通知中心与收件箱合并为 `UnifiedInboxSheet.tsx`。
3. **Step 3 (三大杀手屏研发)**：
   - 升级 `DashboardScreen`：资金燃尽图 + 六维指标 + 紧急熔断器；
   - 升级 `BoardChatScreen`：流式打字机 + 思考链折叠 + 多模态图片上传；
   - 研发原生 `UnifiedDiffViewer` 与真机沙箱 `PrototypeSandboxScreen`。
4. **Step 4 (真机回归与打包验证)**：本地运行 Metro 编译，执行双轨 OTA 与 Android APK 验证。
