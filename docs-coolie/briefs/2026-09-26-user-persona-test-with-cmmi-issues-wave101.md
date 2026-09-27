# Brief: wave 101 — 测试员工拟人化测试系统 (截图 + CMMI 记录 + 研发任务闭环) (boss 24:00 OOB '测试员工')

PM: Jason
Worker: claude

## 0. Boss 09-26 24:00 OOB 「我们的测试员工，要能拟真人访问系统，截图发现问题，定位问题，然后cmmi记录，然后研究研发识别任务解决问题」

老板要求测试员工 (claude 跑测试任务) 拟人化:
1. 访问系统 (adb logcat + 真截图)
2. 截图发现问题
3. 定位问题 (真因 + 文件 + 行号)
4. CMMI 记录 (issue + description + repro)
5. 研究研发识别任务解决 (派issue + 自动派给研发)

## 1. 目标

**wave101 测试员工** — 让 claude 模拟"老板装机试用"全流程, 拟人化发现真问题:

A. **拟人化访问系统**:
   - adb install 0.5.69 / 0.5.70 APK 模拟器
   - 模拟老板:登录 → 工作空间 → 5 栏 Tab → 点 CMMI 门禁 → WebView 自动登录
   - 模拟老板:点 Task → 点 Inbox → 点 Org Assets → 点 Dashboard
   - 模拟老板:点击各个按钮 + 真截图

B. **截图发现问题**:
   - 每步截图 (10-15 张)
   - 看截图发现真问题 (UI 残留 / 文字 / 按钮 / 流程)

C. **定位问题**:
   - grep 定位文件 + 行号
   - 看 git log 看最近改了什么
   - 真因真值

D. **CMMI 记录**:
   - server `/api/companies/:id/issues` 创建 issue
   - 每个真问题派issue (title + description + repro steps + priority)

E. **派研发任务**:
   - issue 创建后, 自动派给相应 agent (claude 拟人化分析谁该修)

## 2. 任务 (4 步)

### 2.1 拟人化访问系统 + 截图 (adb 真验)

1. cd ~/workspace/xaicd/coolie
2. adb install emulator-5554 0.5.70 APK (最新)
3. adb shell am start -n cloud.coolie.app/.MainActivity
4. 截图 1: 装机自检屏 (WhatsNew)
5. 登录 (用 boss 账号) - 截图 2: 工作空间
6. Tab 1 汇览 → 截图 3: 仪表盘
7. Tab 2 任务 → 截图 4: 任务列表
8. Tab 4 工坊 → 截图 5: ChatHome
9. Tab 5 资产 → 截图 6: OrgAssets
10. 点进入 CMMI 门禁 → 截图 7: WebView 自动登录 web
11. 收件箱 Tab → 截图 8: Inbox
12. 点老板头像 → 截图 9: Settings
13. 点进入各子页 → 截图 10-15

### 2.2 截图发现真问题

1. 看每张截图, 列出真问题:
   - UI 残留 (按钮 / 文字 / 描述)
   - 流程 bug (WebView 仍登录页 / 不跳转)
   - 视觉 bug (重叠 / 截断 / 颜色)
   - 数据 bug (空状态 / 加载失败)
2. 给每个问题打 severity (critical / major / minor)

### 2.3 定位问题真因

按问题清单逐个:
- grep 定位文件 + 行号
- 看 git log 看最近改了什么
- 看 paperclip 上游 web 看是否也有
- 写 issue description 含真因

### 2.4 CMMI 记录 + 派研发任务

1. 用 server POST /api/companies/:id/issues 创建 issue
2. 每个 issue:
   - title (简短)
   - description (含截图真值 + repro steps + 真因)
   - priority (1-5)
   - assignee (claude 拟人化分析谁该修)
3. 老板看 issue list

## 3. Constraints

- ❌ DON'T 用 agy
- ❌ DON'T 改 PAPERCLIP_API_KEY / PAPERCLIP_DEPLOYMENT_MODE
- ❌ DON'T bump 0.5.70 之外
- ❌ DON'T 改 boss Claude 后 commit / wave84-100 release
- ✅ DO 拟人化测试
- ✅ DO 截图真验
- ✅ DO 定位真因
- ✅ DO 创建 CMMI issue
- ✅ DO 派研发任务

## 4. semver + PM-CHECKLIST

- 当前 0.5.70 (待发版, wave100 跑中)
- 测试员工 = 一次性测试 + 报告 + issue
- PM-CHECKLIST 32 项: J1-J3 + I1 + I2

## 5. Done definition

4 步全完 + 10-15 张截图真值 + 真问题清单 + grep 定位真因 + 创建 CMMI issue + 派研发任务 + 报告老板:

```
Output:
- docs-coolie/E2E-USER-PERSONA-TEST-WAVE101.md
- 截图: clients/expo/replays/evidence/w101-*.png
- CMMI issue list: <issue url>
- 派研发任务清单
```