<!--
==========================================================================
【组织标准过程资产模版 (OSSP Template)】
类型: UI 设计与前端原型交互规范说明书 (UI/UX Prototype Specification)
归属: CMMI Phase 03 (03_design)
注意: 本文件为纯净空白母本，严禁直接填写项目业务数据！
      使用 node scripts/cmmi-doc-generator.cjs --type ui 或 --all 动态派生落盘。
==========================================================================
-->

# {{PROJECT_TITLE}} · UI 设计与前端原型交互规范说明书

> **文档代号**: {{SYSTEM_CODE}}-UI-SPEC-{{VERSION}}  
> **系统代号**: `COOLIE-FOUNDRY-CORE` ({{PROJECT_TITLE}})  
> **基线版本**: {{VERSION}} (生产冻结稳定版)  
> **制定日期**: {{DATE}}  
> **归属规范**: CMMI 03_design (TS) / 极简主义两字 UI 交互法典 / .agents/skills/minimalist-ui-and-cmmi-governance  

---

## 1. 人机交互设计哲学与两字动词准则 (Design Philosophy)

{{PROJECT_TITLE}} 面向企业掌柜、交付总监与前线 FDE，确立极简主义交互法典：
1. **两字动词原子化**: 核心业务交互按钮严格限制为 $\le 2$ 个汉字（如【派活】、【通过】、【驳回】、【签出】、【提额】、【归档】），消除一切歧义废话与模板感；
2. **黄金 5 槽位绝对对称底栏**: 移动端统一采用 5 槽位底栏导航架构（【首页】、【任务】、【智能体】、【审批】、【我】），单手拇指自然盲操可达；
3. **就地浮层防遮挡**: 所有二级操作、参数微调与确认弹窗强制以局部抽屉 (Drawer) 或就地覆盖浮层呈现，严禁遮挡底部核心底栏与返回栈；
4. **零白屏与四态防御**: 所有动态数据页面严格覆盖“加载中 (Loading)”、“空数据 (Empty)”、“正常展示 (Success)”、“网络或权限异常 (Error)”四态，杜绝假死与无感白屏。

---

## 2. Web 管理控制台全量页面与路由清单 (Web Console Pages Inventory)

Web 驾驶舱基于 React 19 + Vite 6 + Tailwind CSS 构建，统一收拢于 [`ui/src/pages/`](file:///host-workspace/xaicd/coolie/ui/src/pages/)：

{{UI_WEB_PAGES_TABLE}}

---

## 3. Expo 移动端全量屏幕清单与功能架构 (Expo Mobile Screens Inventory)

移动端驾驶舱基于 React Native + Expo SDK {{EXPO_SDK}} 构建，统一收拢于 [`clients/expo/src/screens/`](file:///host-workspace/xaicd/coolie/clients/expo/src/screens/)：

{{UI_MOBILE_SCREENS_TABLE}}

---

## 4. 移动端黄金 5 槽位绝对对称底栏架构 (Bottom Bar Architecture)

{{UI_BOTTOM_BAR_SPEC}}

- **首页 (Dashboard)**: 交付态势大盘、一句话语音/文字意图进厂、告警汇总与项目里程碑概览；
- **任务 (Issues)**: 任务看板与列表视图、工单详情、原子签出锁状态、交付工件检视；
- **智能体 (Agents)**: 7 工具池数字员工花名册、心跳健康实时监控、当前活跃任务追踪；
- **审批 (Approvals)**: 高管审批流卡片（直通派单审批、预算追加提额、生产投产发布）；
- **我 (Profile)**: 个人设置、环境与语言切换、版本号与 OTA 检查。

---

## 5. 移动端 6 寸屏物理防御与触控安全准则 (6-Inch Mobile Defense Spec)

为应对复杂的现场恶劣光照与小屏硬件碎片化，系统实施严格的几何与视觉防御：

{{UI_SCREEN_DEFENSE_SPEC}}

---

## 6. 无感就地导航与 LIFO 调用栈架构 (Navigation Stack & State Retention)

1. **就地导航栈 (In-Place Stack)**:
   - 跨 Tab 跳转时，自动记录来源 Tab 与页面深度；
   - 物理返回键（Android Back / iOS 侧滑）遵循 LIFO 严格后入先出规则，严禁发生“跨 Tab 乱跳”或“跳出 App”；
2. **状态就地保持 (State Retention)**:
   - 切换 Tab 时保留当前滚动位置与表单草稿，避免重新加载丢失现场上下文；
3. **触控震动反馈 (Haptic Feedback)**:
   - 审批决策、签出锁定、提交代码等破坏性/重要变更操作，统一触发轻微触感震动，强化操作确认感。
