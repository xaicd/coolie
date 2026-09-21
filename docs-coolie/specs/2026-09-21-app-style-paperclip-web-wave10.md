# Spec: 0.5.2 驾驶舱 App 对齐 Coolie Web 风格 (wave 10)

- 日期：2026-09-21
- 老板原话：「参考web做expo」= 0.5.2 驾驶舱 App 长成跟 0.6.0 Coolie Web 一样
- 优先级：P0（老板要求）
- PM：Hermes
- 状态：READY FOR DISPATCH

## 1. 背景

老板装了 0.6.0-paperclip-web (Coolie Web, cloud.coolie.app.web) 后认可「看着也行」。
现在要求 0.5.2 驾驶舱 App (cloud.coolie.app / Coolie工坊) **长得跟 Coolie Web 一样**。

当前 0.5.2 驾驶舱:
- 顶部: 简洁 hero header (Coolie + 副标题)
- 中间: 5 Tab (汇览/员工/工坊/任务/本体)
- 底部: 无 tab bar (paperclip 有)

老板期望（参考 Coolie Web 截图）:
- 顶部: 原生 appBar (← 标题 "Coolie工坊" → [Web App] 按钮)
- 中间: 主内容
- 底部: tab bar (Home/Tasks/New Task/Agents/Inbox) ← 这是 paperclip 风格

## 2. User Stories

1. **作为老板**：我希望 Coolie工坊 App 顶部是 appBar (左箭头/标题/右边按钮) 不再是 hero header
2. **作为老板**：我希望底部有 tab bar (Home/Tasks/New Task/Agents/Inbox) 直接点
3. **作为老板**：我希望点 [Web App] 按钮能跳到 Coolie Web (cloud.coolie.app.web)
4. **作为老板**：我希望主题色一致 (紫蓝 accent #5E6AD2 / 近黑 bg)

## 3. Acceptance Criteria (EARS)

### 3.1 App.tsx 重构

- WHEN 启动 App，THEN SHALL 直接进入 HomeScreen（不再需要登录？— 但要保留登录态）
- 顶部 appBar 高度 56px
  - 左侧: ← (web 后退) 或 Skip (已无 web)
  - 中间: 标题 "Coolie工坊" (粗体 17pt)
  - 右侧: [驾驶舱 Web] 按钮 (跳 coolieweb:// 深链)
- 底部 tab bar 高度 56px
  - 5 个 Tab: 汇览 / 任务 / 新建任务 / 员工 / 收件箱

### 3.2 现有 5 Tab 改名映射

| 现有 Tab | 改名 |
|---|---|
| 汇览 | 汇览 (留) |
| 员工 | 员工 (留) |
| 工坊 | 改为 任务 |
| 任务 | 删除 (合并到新「任务」) |
| 本体 | 改为 收件箱 (通知中心) |
| 新增 | 「新建任务」中央按钮（FAB）|

### 3.3 主题色统一

- 背景: #08090A (Coolie Web bg)
- 面板: #0F1011
- 文字: #E6E6E6 / #9BA1A6 / #8A8F98
- 强调色: #5E6AD2 (紫蓝)
- 与 0.6.0 Coolie Web 完全一致

### 3.4 新增 [Web App] 跳转

- AppBar 右侧按钮: 文本 [驾驶舱 Web] 或 [Web]
- onPress: `Linking.openURL('coolieweb://')`
- 深链注册在 app.json: `"coolieweb"` scheme

### 3.5 不动项

- ❌ ChatHome / BuildProgressCard / WorkspaceScreen (驾驶舱自有能力)
- ❌ 6 P0 屏 (Inbox/Notifications/Search/Register/AgentDetail/TaskDetail)
- ❌ server 任何代码

## 4. 文件范围（白名单）

**修改：**

```
clients/expo/App.tsx                       # 重构: 加 appBar + tab bar
clients/expo/app.json                       # 加 coolieweb 深链
clients/expo/src/components/AppBar.tsx     # 新增
clients/expo/src/components/TabBar.tsx     # 新增 (底部)
clients/expo/src/theme.ts                  # 抽颜色常量
```

## 5. 验证 gate

- [ ] 装 0.5.5 (wave 10 release) 后, 老板手机:
  - 顶部 appBar (Coolie工坊 + 驾驶舱Web 按钮)
  - 底部 tab bar (5 Tab)
  - 主题色跟 Coolie Web 一致
- [ ] 点 [驾驶舱 Web] → 跳 Coolie Web App
- [ ] 截图证据入 /tmp/emu-evidence/

## 6. 派单

第一波（门神 cmd）：
1. 重构 App.tsx
2. 新增 AppBar + TabBar 组件
3. 主题色统一
4. coolieweb 深链
5. release 0.5.5 (与 0.6.0-paperclip-web 共存)

第二波（掌柜）：模拟器验证 + 装机直链

## 7. 不回签就停在哪

如果老板认为「appBar 太宽 / tab bar 颜色不对 / 主题色要换」，改 spec 重派。

## 8. 版本管理

- 当前: 0.5.2 (生产)
- wave7+wave8 合并: 0.5.4 (待发, WhatsNewScreen + 6 屏) — 但被老板撤回批准
- wave10 合并到 0.5.4 (因为主要改 UI 不改 server) - 或者发 0.5.5

PM 建议发 0.5.5 (新版本号 = 老板认可的「升级」, 与 0.6.0-paperclip-web 形成 0.5/0.6 双线)

## 9. Done definition

App.tsx 重构 + AppBar/TabBar 新增 + 主题色统一 + 0.5.5 发版 + 模拟器验证 + commit + push + 装机直链给老板。