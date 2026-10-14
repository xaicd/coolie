# COOA-136 移动端 FDSE 真机走查报告 (2026-10-14 · round 2)

> 责任人: 🤖 门神 (FDSE) · 驱动: `agent-device` (Android AVD `emulator-5554`, cloud.coolie.app) + `adb`
> 法典: `.agents/skills/agent-device-browser-automation/references/verification-checklist.md`
> 铁律: 真实环境优先 · 物理遮挡几何穿透 · 状态机四态穷举 · 假按钮零容忍 · No Artifact, No Do.
> 本报告 100% 基于真实拉起模拟器 + Metro 热更后的真机实测，无 mock、无 `expect(true)`。

## 0. 本轮结论

- **发现并修复 3 个真实缺陷**（2 个 Critical 级 + 1 个 Major 级），全部在真机复测通过。
- 4 大主 Tab + 设置/插件层级 + 任务详情在 **411dp 与 320dp 双视口**下 **0 横向撑爆**。
- 覆盖 8 大维度中的 2.2.1 / 2.2.2 / 2.2.3 / 2.2.4 / 2.2.5 已过；**2.2.3 软键盘避让在 round 3 已实测通过**（见 §3.2）。

## 0.1 Round 3 增量 (软键盘几何避让实测)

前轮 2.2.3 因 AVD 默认 IME 为 agent-device 测试输入法、无可见键盘，如实标注「未验证」。本轮将默认 IME 切回 `com.google.android.inputmethod.latin`（LatinIME）后重测：

| 指标 | 实测值 |
| :--- | :--- |
| 屏幕 | 1080×2400 px (density 420 → 411dp) |
| IME 键盘顶边 | **y = 1517 px**（`dumpsys window` touchableRegion） |
| 评论输入框底边 | y = 1307 px |
| 【发送】按钮底边 | y = 1307 px |
| **避让净空** | **210 px**（输入框/按钮完全在键盘之上，0 遮挡） |
| 窗口 softInputMode | `ADJUST_RESIZE`（应用随键盘上移） |
| 【发送】按钮态 | 空输入=禁用；有文本=可用（非假按钮） |

证据: `73-round3-taskdetail-keyboard-real.png`、`74-round3-keyboard-send-enabled.png`。

## 1. 运行环境 (真实)

| 项 | 值 |
| :--- | :--- |
| 设备 | Android AVD `emulator-5554` (sdk_gphone64_arm64) |
| 物理屏 | 1080×2400 px / density 420 → **411dp 宽** |
| 极限视口 | 覆写 `wm size 840×1780` (420dpi) → **320dp 宽** |
| 应用 | `cloud.coolie.app` (Expo dev client, Metro `:8081` 热更) |
| API | `http://10.0.2.2:3100` (本地靶场) |
| 驱动 | `agent-device` + `adb screencap` / `dumpsys` |

## 2. 缺陷台账 (Defect Ledger)

| # | 等级 | 现象 | 根因 | 修复 | 真机复测 |
| :-- | :-- | :--- | :--- | :--- | :-- |
| **F1** | **Critical** | 打开「插件管理」时屏幕底部弹出 RN 红屏警告浮层：`Text strings must be rendered within a <Text> component.`（裸英文异常暴露给用户） | `src/ui/ScreenHeader.tsx` 把 `subtitle` 直接作为 `<View>` 子节点渲染；`PluginManagerScreen` 传 `subtitle={company.name}`（字符串）→ RN 抛警告 | `ScreenHeader` 对 string/number 型 subtitle 自动包 `<Text style={styles.subtitle}>`，ReactNode 保持原样 | ✅ 复测 overlay=0 |
| **F2** | **Critical** | 系统返回键 **跳级 LIFO 违规**：设置页 → 插件管理/插件设置/Git 凭证/原生能力/版本更新 → 按一次返回，直接跳回主 Tab 根，**跨过了设置页** | App.tsx 里设置页各子入口 `onOpen*` 均 `setSettingsOpen(false)`，把父层销毁 → 返回栈断链 | 保留 `settingsOpen`（父层），子屏分支在三元中先于 `settingsOpen`；同步修正 `swipeBack` 出栈顺序（`pluginSettingsId` 先于 `pluginManagerOpen`，`nativeModulesOpen` 移到 `settingsOpen` 前） | ✅ 设置→插件管理→返回=设置；插件设置→插件管理→设置逐级返回 |
| **F3** | **Major** | 插件单页设置 **永远打不开**（点插件卡片「配置」无反应，死路径） | 渲染三元中 `pluginManagerOpen` 分支排在 `pluginSettingsId` 之前，恒被盖住 | 交换分支顺序：`pluginSettingsId` 先于 `pluginManagerOpen` | ✅ 点插件卡片成功进入单插件设置页 |

## 3. 26 屏 × 8 维 × 5 旅程覆盖矩阵 (本轮)

### 3.1 屏幕覆盖 (real device)

| 里程碑导航 | 屏幕 | 本轮 | 结果 |
| :--- | :--- | :-- | :-- |
| 登录前 | `CompanyGate` 选公司 | ✅ | 正常，无白屏 |
| Tab 1 汇览 | `DashboardScreen` | ✅ | KPI/进度/待审批 正常，0 溢出 |
| Tab 2 任务 | `TasksScreen` | ✅ | 列表 + 过滤器 + 26 任务，0 溢出 |
| Tab 2 任务 | `TaskDetailScreen` | ✅ | 属性/描述/评论框/发送(禁用态) 正常 |
| Tab 3 工坊 | `BoardChatScreen` | ✅ | 0 溢出 |
| Tab 4 资产 | `OrgAssetsScreen` 等 | ✅ | 0 溢出 |
| 设置 | `SettingsScreen` | ✅ | 管理/配置/检查/清理/探测 两字按钮正常 |
| 设置→插件 | `PluginManagerScreen` | ✅ (修复 F1) | 无红屏浮层 |
| 设置→插件→单页 | `PluginSettingsScreen` | ✅ (修复 F3) | 首次可达 |
| 其余 17 屏 | Search/Notifications/NewTask/Spec/Artifacts/Agents/… | ⏳ | 由前轮 round1 部分覆盖，本轮未逐一复测 |

### 3.2 8 大物理防御维度

| 维度 | 状态 | 证据 |
| :--- | :-- | :--- |
| 2.2.1 极限视口防撑爆 (320–360px) | ✅ 通过 | `70-320-tasks.png` + `wm size 840×1780` 下 4 Tab `overflow=0` |
| 2.2.2 安全区防遮挡 | ✅ 通过 | 顶栏内容 y≥128（状态栏之下）；底栏含手势条避让 |
| 2.2.3 软键盘贴合避让 | ✅ 通过 (round 3) | 切回 LatinIME 后实测: 键盘顶 y=1517, 输入框/【发送】底 y=1307, **净空 210px 0 遮挡**; softInputMode=ADJUST_RESIZE; `73/74-round3-*.png` |
| 2.2.4 LIFO 物理导航栈 | ✅ 通过 | 多级返回实测（见 F2 复测）；根页双击退出保护已存在 |
| 2.2.5 两字规范与零死穴 | ✅ 抽检通过 | 管理/配置/检查/清理/探测/发送/返回/停用/重置 均两字；空输入时【发送】为禁用态（非假按钮） |
| 2.2.6 离线弱网降级 | ⏳ 未测 | 本轮未做飞行模式 |
| 2.2.7 活体本体动词抽屉 | ⏳ 未测 | - |
| 2.2.8 工件就地查验 | ⏳ 未测 | - |

### 3.3 5 大闭环旅程

本轮聚焦「设置 → 插件」导航闭环与返回栈；其余 4 条（意图派单 / 审批签署 / 流式打字机 / 本体穿透 / 终验归档）未在本轮逐一走通。

## 4. 变更清单 (code)

- `clients/expo/src/ui/ScreenHeader.tsx` — subtitle 安全包裹（修 F1，全站 ScreenHeader 受益）
- `clients/expo/App.tsx`
  - `swipeBack` 出栈顺序修正（修 F2）
  - Settings 子入口保留 `settingsOpen`（修 F2）
  - `pluginSettingsId` 分支前置（修 F3）
  - `hasSubHeader` 纳入 `pluginSettingsId`

`npx tsc --noEmit` → **exit 0**（0 报错）。

## 5. 证据工件

- 缺陷原图: `01-DEFECT-rn-text-overlay.png`
- 修复后: `52-round2-pluginmanager.png`（无浮层）, `55-round2-pluginsettings.png`（单页可达）
- LIFO: `53/54/56/57/58-round2-*.png`
- 320dp: `70-320-tasks.png`（+ round1 30-33）
- 机器报告: `automation-run-report.json`

> 凡未真实跑通项一律标注 ⏳/⚠️，不以 mock 冒充通过（Zero Tolerance on Fabricated Tests）。
