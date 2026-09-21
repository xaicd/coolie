# Spec: App 端 P0 短板补齐 (wave 8)

- 日期：2026-09-21
- 老板原话：「功能特别差，还不如pc版」+「补短」
- 优先级：P0
- PM：Hermes
- 状态：READY FOR DISPATCH

## 1. 背景

老板在 Android 模拟器（带 GPU）实测 0.5.2 APK，对比 paperclip 上游 PC web (`xrobinai.cn`) 发现 App 端缺大量能力：

```
差距真值:

| 能力 | 上游 paperclip PC | Coolie App 0.5.2 |
|---|---|---|
| 任务详情/评论 | ✅ 完整 | ⚠️ 简化 |
| 收件箱 | ✅ | ❌ |
| 会议室 | ✅ | ❌ |
| Routines（循环工作流）| ✅ | ❌ |
| 审计 | ✅ | ❌ |
| 技能 | ✅ | ❌ |
| 连接器 | ✅ | ❌ |
| 搜索 | ✅ | ❌ |
| 通知中心 | ✅ | ❌ |
```

**老板的判断：「App 功能特别差」** = 真实。

## 2. 策略

```
PM 拍板:

App = 移动驾驶舱 (不重做 PM SaaS)
PC web = 走 paperclip 上游完整 PM 套件 (我们不做 web Routines)
App 必补 (P0) — 移动场景必须能用
P1-P2 — 等 P0 验完再说
```

## 3. User Stories (P0 短板)

1. **作为老板**，我想任务详情能查看评论 / 评论能发（含 @ 智能体）
2. **作为老板**，我想员工详情能看到技能 / 连接的 Routines / 最近的产物
3. **作为老板**，我想在 App 内注册账号（当前只邮箱+密码登录，无注册入口）
4. **作为老板**，我想收件箱显示分配给我的待审批 / 失败 / 等待回复
5. **作为老板**，我想通知中心（红点 + 推送）
6. **作为老板**，我想顶部有全局搜索（智能体 / 任务 / 文档）

## 4. Acceptance Criteria (EARS)

### 4.1 任务详情 / 评论

- WHEN 老板点任务列表里的某条 task，THEN SHALL 进入任务详情屏
- WHEN 详情屏加载，THEN SHALL 显示任务标题 / 描述 / 状态 / 分配的智能体 / 时间线 / 评论列表
- WHEN 老板点 [发评论]，THEN SHALL 弹出评论框（支持 @ 智能体）
- WHEN 评论发送成功，THEN SHALL 显示在评论列表里 + 老板的 bot 通知收到

### 4.2 智能体详情

- WHEN 老板点员工列表里的某个智能体，THEN SHALL 进入详情屏
- 详情屏显示：头像 / 名称 / role / 模型 / 当前任务 / 最近 5 个产物 / 技能清单

### 4.3 注册入口

- WHEN 老板在登录页，THEN SHALL 显示 [注册] 按钮（与 [登录] 并列）
- 点 [注册] → 进入注册页（邮箱 + 密码 + 确认密码 + 公司名）
- 注册成功 → 自动登录 + 跳到主页

### 4.4 收件箱

- WHEN 老板点 Tab 收件箱（或顶部收件图标），THEN SHALL 显示：
  - 待审批 (N)
  - 失败 / 异常 (N)
  - @我的 (N)
- 每条可点开看详情

### 4.5 通知中心

- WHEN 有新事件，THEN 顶部铃铛显示红点 + 数字
- 点铃铛 → 通知列表（最近 20 条）
- 每条可点开跳详情

### 4.6 全局搜索

- WHEN 老板顶部点搜索图标，THEN SHALL 弹搜索框
- 输入关键字 → 实时显示匹配（智能体 / 任务 / 文档）
- 点结果 → 跳对应详情

## 5. 不动项

- ❌ 不重做 Routines（PC web 专属能力）
- ❌ 不重做审计 / 技能管理 / 连接器（PC web）
- ❌ 不动 ChatHome / 5 Tab 主框架 / BuildProgressCard / WorkspaceScreen
- ❌ 不动 wave7 hotfix 范围（修登录 + WhatsNewScreen）

## 6. 文件范围（白名单）

**新增：**

```
clients/expo/src/screens/InboxScreen.tsx       # 收件箱
clients/expo/src/screens/NotificationsScreen.tsx  # 通知中心
clients/expo/src/screens/SearchScreen.tsx        # 全局搜索
clients/expo/src/screens/RegisterScreen.tsx      # 注册
clients/expo/src/screens/AgentDetailScreen.tsx   # 智能体详情
clients/expo/src/screens/TaskDetailScreen.tsx    # 任务详情（已有？升级）
```

**修改：**

```
clients/expo/App.tsx  # 加 Tab / 注册入口 / 通知铃铛 / 全局搜索 icon
clients/expo/src/components/EmptyState.tsx  # 复用
```

**服务端（最小扩）：**

```
server/src/routes/inbox.ts        # GET /api/inbox (聚合 待审批/失败/@我)
server/src/routes/notifications.ts # GET /api/notifications
server/src/routes/search.ts        # GET /api/search?q=
server/src/routes/auth.ts         # POST /api/auth/register
```

## 7. 验收 gate

- [ ] 6 个新屏都跑通
- [ ] 注册 → 自动登录 → 进主页
- [ ] 收件箱 / 通知 / 搜索 数据真来自 server API
- [ ] 点通知跳详情
- [ ] tsc 0 errors
- [ ] 装机模拟器验证（截图入 gitignored evidence）
- [ ] wave7 hotfix + wave8 一起发 0.5.4

## 8. 设计决定

1. 收件件 + 通知 + 搜索 = P0 三件套，先做完
2. 注册入口 = 必要（之前漏）
3. 智能体详情 + 任务详情 = 增强项
4. **Routines / 审计 / 技能 / 连接器 → 不在 App 做**（这是 PM 的事，PC web 已有）
5. 0.5.4 release 统一发（不要再分 0.5.3/0.5.4）

## 9. 派单

第一波（门神 cmd）：6 屏 + App.tsx 接线 + 服务端 4 个路由
第二波（铁匠/cmd）：wave7 hotfix 已在跑，等它完工后合并
第三波（掌柜）：模拟器装机验证 + 0.5.4 release + 给老板装机直链

## 10. 不回签就停在哪

如果老板认为「不动 Routines」不对（觉得 App 也应该能管 Routines），改 spec §1 加 Routines。