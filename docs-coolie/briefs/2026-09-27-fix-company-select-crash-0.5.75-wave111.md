# Brief: wave 111 — 排查修复 0.5.75 选公司进入后闪退 (boss 15:46 真机)

PM: Jason
Worker: claude

## 0. Boss 09-27 15:46 OOB 「新版本app选择公司进入后闪退了」

老板真机装 0.5.75, 登录 → 选择公司 → 进入后**闪退**。

## 1. PM 已排查的真值

- 模拟器装 0.5.75 (versionCode=575) + 启动 → **装机自检屏正常** (无 FATAL, OTA 下发全绿)
- PM 手头 boss 密码登录被拒 (`INVALID_EMAIL_OR_PASSWORD`) — 走不到"选公司"步
- 生产 version.json = 0.5.75 / commitSha `205321ab0`
- 最近大改动 (wave105-110, 全是老板 Claude 提的):
  - wave105: **公司级紧急熔断** (companies.status paused, Dashboard 红 chip/banner)
  - wave108: 审计清账 (CMMI 深链去重 + 术语统一)
  - wave109: **D03 会话桥修** + 成本下钻面板 + 字重清理
  - wave110: 审批决策辅助 + 技能 chip 下钻
- ⚠️ 高嫌疑: wave109 的 D03 修动过凭证处理逻辑 (现在"只区分明确拒鉴才清凭证") + wave105 的 companies.status 字段 — 选公司进入后首屏要拉 dashboard/agents, 若这两个改动在选公司路径上抛异常(如 undefined map / status 字段新枚举), JS error 在 release bundle 无 redbox 直接白屏/闪退

## 2. 任务 (4 步)

### TASK 1: 复现闪退 (拿到 crash 真因)

1. cd ~/workspace/xaicd/coolie
2. 模拟器已装 0.5.75 + 装机自检正常。用测试路径走完登录:
   - 若实例开放注册不可用, 用 prod DB 直接造测试账号 (ssh tc-coolie-claw psql 或 Better Auth sign-up API), 或复用之前 wave99/101 造过的会话/board key
   - 登录后停在**公司选择屏** (老板闪退点)
3. adb logcat -c 后点击公司进入
4. 抓完整 crash: `adb logcat -d | grep -B 5 -A 40 -iE "FATAL|AndroidRuntime|ReactNativeJS.*(error|undefined|cannot|null)"`
5. 同时抓 JS soft error: ReactNativeJS 前后 200 行

### TASK 2: 定位真因 + 修

按 crash 栈定位 (grep 文件+行号)。高嫌疑区 (按 wave105-110 diff 优先查):
- DashboardScreen 选公司后首渲染 (wave105 paused banner / wave109 成本下钻)
- 会话桥 D03 改动 (`676518396`): 凭证处理状态机
- wave110 审批决策辅助 + 技能 chip (`cabe7f0b4`)
- companies.status 新枚举 (paused) 在客户端的 map
修法必须覆盖 crash 栈真因, 不许猜着修。

### TASK 3: 回归 + 发版 0.5.76

1. 全流程模拟器真验: 登录 → 选公司 → 进入工作空间 → 5 Tab 走一遍 → 无闪退
2. force-stop 重开仍正常 (D03 场景)
3. bump 0.5.75 → 0.5.76 (versionCode 576), gradle build + coscli + version.json + publish-ota (走 release-app.sh 惯例)

### TASK 4: commit + push + 报告

- git add + commit + push (SSH proxy bypass)
- 报告: crash 栈 + 真因 + 修法 + 真验截图

## 3. Constraints

- ❌ DON'T 用 agy
- ❌ DON'T 改 PAPERCLIP_API_KEY / PAPERCLIP_DEPLOYMENT_MODE
- ❌ DON'T bump 0.5.76 之外
- ❌ DON'T 重建 prod DB / 动老板账号数据 (测试账号可建可删)
- ✅ DO 拿到真 crash 栈才修 (不许猜)
- ✅ DO 真验"选公司进入"不再闪退
- ✅ DO 用 zsh-safe single quotes

## 4. Done definition

crash 真因 + 修法 + 0.5.76 真发版 + 模拟器全流程真验 (登录→选公司→进入→5Tab→force-stop 重开) + commit push:

```
Coolie工坊 0.5.76: https://dls.xrobinai.cn/coolie/app/0.5.76/coolie-release.apk
```