# Brief: wave 96 — 精简 DashboardScreen + 修 3 bug + 0.5.68 (boss 22:14 OOB '更复杂了')

PM: Jason
Worker: claude

## 0. Boss 09-26 22:14 OOB 「更复杂了」

老板装 0.5.67 后看截图觉得太复杂. PM 老实盘点历史老板多次要求"精简" 都没真简化:
- 09-25 "汇览 页, 别叫 驾驶效能舱, 别这么多统计, 留之前web版首页的核心统计就行了" — wave65 简了第一版
- 09-25 "5角色员工 描述都去掉" — wave69/70 stripRoleDescription
- 09-25 "左上角 工坊 驱动5角色员工 这些描述都不要了" — wave73
- 09-25 "该用下拉框的别展开"
- 09-25 "工坊对话要再精简, 别叫 驾驶舱智能问答"
- 09-25 "全面审计一下" — wave64
- 09-25 "页面要开始审计精简收敛, 选择" — wave36
- 09-25 "整体页面功能审计一下" — wave64

## 1. PM 老实盘点 (老板看到太复杂的元素)

**DashboardScreen (0.5.67 截图 1+4 显示)**:
- 4 KPI 卡: 已启用员工 / 执行中任务 / 本月花费 / 待审批 (OK 保留)
- 业务本体态势 大卡 + 5 子入口 + 状态守卫 (太大, 应精简)
- CMMI 质量工程与 API 治理 卡 + 5 角色 (G1-G5) + DSH API + 活态拓扑 + SkyWalking + ChaosBlade + 2 按钮 (太复杂, 应精简到 1-2 项核心)
- 🔴 熔断 modal (boss OOB 没要求)
- ⚙️ 设置齿轮 + 检查更新 按钮 (wave76 已删, boss Claude 重构时加回去 — bug)

**TasksScreen (0.5.67 截图 2 显示)**:
- 6 个垂直图标卡 (Build/Pipeline/Plan/项目/仓库绑定/CMMI门禁) — 太复杂
- 4 筛选 chip (列表/看板/分列/漏斗) — 太多
- 6 TODAY任务 + EARLIER (任务列表)

**TasksScreen vs InboxScreen (boss 09-25 OOB 任务导航与收件箱是不是功能重复了)**:
- TasksScreen (任务 Tab) + InboxScreen (收件箱 Tab) = 功能重复
- 老板曾要求排查, 没真修

## 2. 目标

**Coolie工坊 0.5.68** 精简 + 修 bug:

A. **精简 DashboardScreen** (核心):
   - 删 "业务本体态势" 卡 (太大, 5 子入口冗余)
   - 精简 "CMMI 质量工程与 API 治理" 卡到 1 项核心 + 1 按钮
   - 保留 4 KPI 卡 (核心统计)
   - 保留 "本月花费 + 待审批" 简版

B. **精简 TasksScreen**:
   - 删 6 个垂直图标卡 (冗余, 与其他 Tab 重复)
   - 删 4 筛选 chip 中 3 个 (留 列表 1 个)
   - 删 4 个右上角 icon (💬🌐📦⚙️) (boss Claude 重构时新增, 老板没要求)
   - 留 任务列表 + 新建任务按钮

C. **修 3 bug**:
   - 删 🔴 熔断 modal (boss OOB "工坊对话要再精简" — 不需要紧急制动)
   - 删 ⚙️ 设置齿轮 按钮 (wave76 已删, 22c17a392 重构时加回去)
   - 删 检查更新 按钮 (wave76 已删, 22c17a392 重构时加回去)

D. **任务 Tab vs 收件箱 Tab 区分** (boss 09-25 OOB pending):
   - TasksScreen 留 "今日 + 进行中"
   - InboxScreen 留 "通知 + 提及"
   - 不重叠

E. **打包 boss Claude 后 2 commit** (`48703d93c feat(project-chat)` + `aca2c70b1 feat(build)`) + 0.5.68

F. **修 WebView 自动登录**:
   - 截图 3 显示 WebView 仍看到登录页, bridge 没生效
   - wave92 修了 server 端, 但 App 端 fetchReleaseNotes/getWebExchangeToken 路径可能还有问题

## 3. 任务 (6 步)

### 3.1 精简 DashboardScreen

1. cd ~/workspace/xaicd/coolie
2. clients/expo/src/screens/DashboardScreen.tsx: 删 业务本体态势大卡 + CMMI 卡精简到 1 项 + 1 按钮
3. 保留 4 KPI + 简版 本月花费 + 待审批
4. 删 🔴 熔断 modal 引用
5. 删 ⚙️ + 检查更新 按钮 (wave76 应已删, 22c17a392 加回)

### 3.2 精简 TasksScreen

1. clients/expo/src/screens/TasksScreen.tsx: 删 6 垂直图标卡 + 4 筛选 chip (留 列表) + 4 右上角 icon (💬🌐📦⚙️)
2. 留 任务列表 + 新建任务按钮
3. 任务列表只显示 "今日 + 进行中"

### 3.3 修 WebView 自动登录

1. 看 WebContainerScreen.tsx 链路
2. 看 server 端 /api/auth/session-token 是否真活
3. 看 coolie.ts 的 getWebExchangeToken 路径
4. 真验: App login → 调 session-token → fetch getWebExchangeToken → bridge 302 + Set-Cookie

### 3.4 任务 Tab vs 收件箱 Tab 区分

1. TasksScreen: "今日 + 进行中"
2. InboxScreen: "通知 + 提及" (已有)
3. 不重叠

### 3.5 打包 + 发版

1. bump 0.5.67 → 0.5.68 (clients/expo/{app.json, package.json, CHANGELOG.md}, versionCode 567 → 568)
2. prebuild + gradle build
3. coscli 上传 0.5.68 APK
4. version.json 真值
5. publish-ota.sh 真跑 (runtimeVersion 0.5.68)
6. adb 真验 (精简后 + bridge 真生效)

### 3.6 commit + push

1. git add + commit + push (SSH proxy bypass)

## 4. Constraints

- ❌ DON'T 用 agy
- ❌ DON'T 改 PAPERCLIP_API_KEY / PAPERCLIP_DEPLOYMENT_MODE
- ❌ DON'T bump 0.5.68 之外
- ❌ DON'T 改 boss Claude 24 commit / wave84-95 release
- ✅ DO 精简 DashboardScreen + TasksScreen
- ✅ DO 修 3 bug (熔断 modal + 设置 + 检查更新)
- ✅ DO 修 WebView 自动登录
- ✅ DO 任务 Tab vs 收件箱 Tab 区分
- ✅ DO 用 zsh-safe single quotes

## 5. semver + PM-CHECKLIST

- 当前 0.5.67
- 精简 + 修 bug = patch bump → 0.5.68
- PM-CHECKLIST 32 项: J1-J3 + I1 + I2

## 6. Done definition

6 步全完 + DashboardScreen 精简 + TasksScreen 精简 + 修 3 bug + WebView 自动登录 + 任务 vs 收件箱区分 + 0.5.68 APK 真发版 + coscli + version.json + publish-ota + adb 真验 + commit + push:

```
Coolie工坊 0.5.68: https://dls.xrobinai.cn/coolie/app/0.5.68/coolie-release.apk    ← NEW (精简 + 修 bug + WebView 自动登录)
OTA manifest: runtimeVersion 0.5.68
```