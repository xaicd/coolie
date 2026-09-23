# Brief: wave 64 — Coolie工坊 整个页面功能审计 (boss 09-23 '整个页面功能审计一下')

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: claude

## 0. Boss 09-23 OOB 「整个页面功能审计一下」

老板让 PM 对 Coolie工坊整个 App 做功能审计 (PM 24:55 已吐槽 '反反复复'). 

## 1. PM 老实盘点 (背景)

```
最近波次回顾 (wave46 → wave63):
- wave46 收件箱 1:1 抄 Web (4 tab + 过滤 + 富行 + 阻塞视图 + 归档)
- wave47/48 MiniMax-M3 接通生产
- wave50 5 角色员工描述删 (brief 入档未实施)
- wave51 任务详情 in tab 显示
- wave54+55 DS Preview 真仿
- wave56 + 6 commits 0.5.35 (实际只 release 0.5.35)
- wave57+58 Coolie Web 不推了 (kill)
- wave59 PAPERCLIP_API_KEY 鉴权 (0.5.36)
- wave60 切身份 'Coolie 智能体工坊 董事长助理' (0.5.37)
- wave61 onboarding-assets 替换 (0.5.38)
- wave62 强制 LLM 不用 Paperclip (0.5.39)
- wave63 汇览页精简 (brief 入档未实施)
```

## 2. 任务: 全 Coolie工坊 App 功能审计 (5 类)

### 2.1 屏幕清单 + 状态

5 个底部 tab (汇览 / 任务 / [+] / 员工 / 收件箱):
- 汇览 (DashboardScreen.tsx): ❌ 标题 错 + 9+ 冗余 stat
- 任务 (TasksScreen.tsx): ✅ (wave18+ 修好)
- 新建 (CreateTaskModal): ✅ (wave26 1:1 抄 NewIssueDialog)
- 员工 (AgentsScreen.tsx): ⚠️ 5 角色员工描述 还在 (wave50 待实施)
- 收件箱 (InboxScreen.tsx): ⚠️ 反反复复 (wave46 抄 web + wave53 复核 + 老板反馈)

### 2.2 路由 / 底部导航 / Tab 切换

- App.tsx 5 tab routing
- TaskDetail in tab (wave51 修好)
- 收件箱 tap detail (wave53 修过)
- 反反复复原因: 每个新 wave 改 routing, 没回测 5 tabs

### 2.3 LLM / MiniMax / persona

- ✅ MiniMax-M3 接通生产 (wave49)
- ✅ 顶部 persona 切 (wave60)
- ✅ 兜底英文模板 (wave62 在跑)
- ⚠️ LLM 自发生成 'Paperclip' (wave62 强禁 prompt)

### 2.4 OTA / 签名 / 真发版

- ✅ 签名 v1+v2+v3 (wave52)
- ✅ OTA 链路真修 (wave13/15/16/23)
- ⚠️ 老板真机偶发 OTA 拉不到 (policy=appVersion + versionCode 升级时一次性)

### 2.5 周边功能

- BoardChatScreen (工坊对话): ✅ 仿豆包 (wave37/38/40)
- PrototypeSandboxScreen (任务详情 → 预览): ✅ DS PreviewWebView (wave55)
- CodeDiffScreen (任务详情 → 代码 Diff): ✅ (wave26 留)
- WebView fallback (驾驶舱Web 按钮): ✅ (wave40)
- OTA 提示 (WhatsNewScreen): ✅ (wave7)
- Edge swipe back: ✅ (wave28)

## 3. PM 真查 (claude audit)

claude 应主动跑:
1. cd ~/workspace/xaicd/coolie
2. 列出 clients/expo/src/screens/ 所有 .tsx + 各文件 stat 行数 + 是否 mock data / fetch 真值
3. 列出 clients/h5/src/screens/ 镜像同步情况
4. 列 App.tsx 5 tab routing + 各 tab 的入口屏
5. 列 server/src/routes/ 所有端点 + Coolie 工坊用到的端点
6. 列 .agents/skills/ 当前 + 是否旧文档 (Palantir / role 5 描述)
7. 列 git log 最近 30 commits 涉及的 screen / route / skill 改动
8. 列未实施 brief (PM 待办): wave50 5 角色员工描述 / wave63 汇览页精简 / 收件箱排查

## 4. 输出报告

claude 应写一份 **docs-coolie/AUDIT-2026-09-23-COOLIE-WORKSHOP.md**, 包含:

```
## 1. 屏幕清单
| 屏幕 | 文件 | 行数 | mock/fetch | 状态 |
|---|---|---|---|---|
| 收件箱 | InboxScreen.tsx | 1181 | fetch 真值 | ⚠️ 反反复复 |
| ...

## 2. 5 tab routing
| tab | 入口屏 | 状态 |
|---|---|---|
| 汇览 | DashboardScreen | ❌ 标题 + 冗余 stat |
| 任务 | TasksScreen | ✅ |
| [+] | CreateTaskModal | ✅ |
| 员工 | AgentsScreen | ⚠️ 5 角色描述待删 |
| 收件箱 | InboxScreen | ⚠️ |

## 3. LLM / MiniMax / persona
✅ 接通 + 顶部 persona + 兜底模板 (wave62 跑)

## 4. OTA / 签名 / 真发版
✅ 全部 4 类

## 5. 未实施 brief (PM 待办)
- wave50 5 角色员工描述 (brief 入档)
- wave63 汇览页精简 (brief 入档)
- 收件箱 client-side 排查 (老板反馈反反复复)

## 6. 反反复复原因
- 每个新 wave 改 routing 没回测 5 tabs
- emulator 飞没真 E2E 验
- 老板真机装是唯一验证

## 7. 优先级排序 (老板拍)
P0: ...
P1: ...
P2: ...
```

## 5. Constraints

- ❌ DON'T 改代码
- ❌ DON'T 派实施
- ✅ DO 只写报告 docs-coolie/AUDIT-2026-09-23-COOLIE-WORKSHOP.md
- ✅ DO commit + push

## 6. Done definition

报告入档 + 老板拍优先级 + 派后续实施波.