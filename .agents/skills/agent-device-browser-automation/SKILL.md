---
name: agent-device-browser-automation
description: 驱动移动真机/模拟器 (agent-device) 与 Web 浏览器 (agent-browser) 执行 E2E 自动化走查与四态截图存证。适用于接到「真机走查」「跑UI自动化」「移动端截图」「检查页面白屏」「测试多视口适配」时启用。
---

# Agent-Device & Agent-Browser 自动化测试、真实验收与运营法典

> **所属生态位**: 端到端商业交付工厂 · 自动化质量与常态化运营中枢  
> **核心工具池**: `agent-device` (移动原生端/模拟器) · `agent-browser` (Web 控制台/H5 浏览器)  
> **责任数字员工**: 🤖 百晓生 (DS / 部署战略专家) · 🤖 门神 (FDSE / 前线全栈工程师) · 🤖 兑底渊 (PRE-SRE / 稳定性负责人)  
> **最高铁律**: 真实环境优先 · 物理遮挡几何穿透 · 状态机四态穷举 · 假按钮零容忍 · 无工件未完工 (No Artifact, No Done)

---

## 0. 规范索引与参考清单

在执行任何自动化测试、验收与运营前，必须严格对照规范清单：
- 完整核查条目：[《自动化测试、真实验证与常态化运营规范清单》](./references/verification-checklist.md)
- 规则底座法典：[《Agent-Device & Agent-Browser 验证铁律》](../../rules/AGENT-DEVICE-BROWSER-VERIFICATION.md)
- 既有测试工作流：[comprehensive-testing-workflow](../comprehensive-testing-workflow/SKILL.md) · [qa-humanlike-e2e](../qa-humanlike-e2e/SKILL.md)

---

## 1. 核心架构与多环境调用拓扑

数字员工体系运行于多机混合拓扑中，必须严格按照物理通道调用，杜绝环境错位：

| 运行环境 | 驱动工具 | 物理宿主 | 调用通道与语法 | 适用场景 |
| :--- | :--- | :--- | :--- | :--- |
| **移动原生端** | `agent-device` | `mac` (Mac Studio) | 容器内必须穿透：<br>`host-exec "agent-device <subcmd>"` | Android AVD 模拟器 / iOS 模拟器 / 原生 APK 真机走查 |
| **Web 控制台** | `agent-browser` (Playwright) | 本地容器 / 宿主机 | 直接调用或 host-exec：<br>`node packages/agent-automation/..."` | PC 管理后台 / Vue3 Admin / React 控制面 |
| **标准 MCP 桥**| Stdio MCP | 宿主机 / 容器 | `agent-device mcp` / `agent-browser mcp` | 数字员工通过自然语言及工具协议直接调度 |

```
 ┌────────────────────────────────────────────────────────┐
 │            数字员工调度中枢 (Hermes / 百晓生 / 门神)       │
 └───────────────────────────┬────────────────────────────┘
                             │
            ┌────────────────┴────────────────┐
            ▼                                 ▼
   [Web 自动化链路]                  [移动端真机自动化链路]
   ├── agent-browser (Playwright)    ├── agent-device (ADB / WDA)
   ├── DOM 物理几何遮挡断言            ├── 6寸屏局部一跳 / 对称底栏
   ├── A11y 触摸面可达性嗅探          ├── 软键盘弹出避让检测
   └── 跨租户物理隔离拦截验证          └── Expo OTA 增量版本对齐
            │                                 │
            └────────────────┬────────────────┘
                             ▼
 ┌────────────────────────────────────────────────────────┐
 │      不可变机器证据库 (docs/05_verification/ & artifacts/) │
 │  ├── 结构化自动化报告 (run-report.json)                    │
 │  ├── 四态真机高保真截屏 (screenshots/*.png)                 │
 │  └── G4/G5 门禁自动化准出凭据 (No Artifact, No Done)       │
 └────────────────────────────────────────────────────────┘
```

---

## 2. 两大阶段 10 大标准化 Playbook 执行矩阵

统一依托平台标准自动化引擎 `scripts/run-persona-automation.sh`（底层映射 `packages/agent-automation`）：

### 阶段一：本地测试与交付验收 (Testing & Verification)
1. **`test-governance-waiver`** [门神 FDSE]: 架构治理门禁特批会签流走查（Web 浏览器驱动）；
2. **`test-inbox-approvals`** [百晓生 DS]: 掌柜与高管收件箱审批卡片流交互走查（Web 浏览器驱动）；
3. **`test-ontology-domains`** [墨斗 FDA]: 活体本体多域与实体属性联动走查（Web 浏览器驱动）；
4. **`test-mobile-app`** [门神 FDSE]: 移动原生端 6 寸屏冷热启动、零白屏与对称底栏走查（`agent-device` 驱动）；
5. **`prod-go-live-verification`** [百晓生 DS]: 生产上线首日关键业务主旅程冒烟全量签收（双端混合驱动）。

### 阶段二：长效常态化运营与监控 (Operations Patrol)
6. **`ops-governance-patrol`** [兑底渊 SRE]: 门禁越界与无工件违规提交主动巡查（每日定时拨测）；
7. **`ops-inbox-triage`** [Web Ops]: 待办工单督办、超期流转提醒与收件箱整理（常态运营）；
8. **`ops-ontology-patrol`** [百晓生 DS]: 孤立死实体与未绑定业务动词扫描（周度巡检）；
9. **`ops-mobile-ota-check`** [兑底渊 SRE]: 7 处版本源强一致性与 OTA 增量拉取自检（发版巡检）；
10. **`prod-continuous-patrol`** [百晓生 DS]: 生产全天候 SLO 核心业务探活与异常捕获（持续巡检）。

---

## 3. 四步标准作业程序 (SOP)

### 第一步：前置探活与环境握手 (Pre-flight Check)
在执行任何用例前，必须确认底层工具链与设备在线状态：
```bash
# 1. 检查 Mac 宿主机移动端模拟器/设备状态
host-exec "adb devices -l"
host-exec "agent-device status" || host-exec "agent-device --help"

# 2. 检查 Web 服务与端点探针
curl -fsS http://localhost:3100/api/health
```

### 第二步：场景驱动与物理几何断言 (Execution & Assertions)
- **拒绝假成功 (Anti-False-Positive)**：
  严禁仅凭 HTTP 200 或 DOM 存在即判定成功；
  必须断言点击后的界面发生实质性变化（URL 变更、抽屉浮层弹出、Toast 出现、或表格新增行）。
- **物理遮挡几何断言代码规范 (Browser)**：
  ```typescript
  // 必须断言顶层实际触碰面为目标元素本身
  const isOccluded = await page.evaluate((selector) => {
    const el = document.querySelector(selector);
    if (!el) return true;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const topEl = document.elementFromPoint(cx, cy);
    return !el.contains(topEl) && topEl !== el;
  }, buttonSelector);
  expect(isOccluded).toBe(false); // 严禁被上层 Fixed 栏或浮窗遮挡
  ```
- **移动 6 寸屏极限小视口防撑爆与状态栏防挡断言 (Mobile Viewports)**：
  ```typescript
  // 必须覆盖 320px~360px 极限小屏真机视口走查
  const testViewports = [
    { width: 332, height: 720 }, // 极限小屏 Android
    { width: 375, height: 667 }, // iPhone SE
    { width: 393, height: 852 }, // 现代灵动岛全面屏
  ];
  for (const vp of testViewports) {
    await page.setViewportSize(vp);
    // 断言页面横向无溢出撑爆
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(vp.width);
    // 断言顶部关闭按钮/Header 不与状态栏刘海 (0-44px) 盲目重合
    const headerRect = await page.locator('[data-testid="screen-header"]').boundingBox();
    if (headerRect) {
      expect(headerRect.y).toBeGreaterThanOrEqual(0);
    }
  }
  ```

### 第三步：多模态截图与不可变工件存证 (Evidence Artifacts)
- **真机截屏规范**：
  - 移动端：通过 `host-exec "agent-device screenshot --output /path/to/evidence/screen.png"` 截取物理屏幕；
  - Web 端：通过 `page.screenshot({ path: '...', fullPage: true })`；
- **测试报告落盘**：
  执行结果必须写入 `evidence/automation-run-report.json`，包含每个步骤的耗时、截屏相对路径、四态状态机覆盖率。

### 第四步：门禁闭环与长效防退化 (Verdict & Anti-Regression)
- 若发现任何 **Blocker / Critical** 缺陷（白屏、假死按钮、物理遮挡）：
  1. 立即阻断流水线，严禁擅自标记任务为 `done`；
  2. 自动生成 CAR 5-Whys 根本原因分析记录；
  3. 将复现用例固化为防退化用例，防止历史缺陷复活。

---

## 4. 快捷指令与诊断备忘

```bash
# 1. 查看所有可用自动化 Playbook 清单
bash scripts/run-persona-automation.sh --list

# 2. 运行移动端专项自动化走查 (agent-device)
bash scripts/run-persona-automation.sh --persona=mobile --scenario=test-mobile-app

# 3. 运行 Web 端审批流自动化测试 (agent-browser)
bash scripts/run-persona-automation.sh --persona=ds --scenario=test-inbox-approvals

# 4. 执行全量自动化用例验证
bash scripts/run-persona-automation.sh --all
```
