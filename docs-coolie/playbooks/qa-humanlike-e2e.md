# Playbook: QA / 测试员工 — 拟真人装机走查

> 角色:测试员工(匠人 + 模拟器)。定位:像真人一样装 App、点全流程、回读 API 真值、截图存证。
> 对应 skill:`.agents/skills/qa-humanlike-e2e/SKILL.md`
> 素材来源:`docs-coolie/E2E-WEB-LOGIN-AUTH-WAVE99.md`、`E2E-USER-PERSONA-TEST-WAVE101.md`、
> `.agents/skills/comprehensive-testing-workflow`、`.agents/skills/ota-*`、wave84–127 实况。

## 触发条件

- 一个特性"开发完了",要证明它真的能用(不是"单测绿了")。
- 发版前后要装机走查、要出截图存证。
- 老板/产品要看"到底通了没有"。

## 核心纪律(先说结论)

1. **不许用单测绿当证据**。有状态特性必须真写一遍再读回来("写进去读得出来")。
2. **不许用"读源码"当证据**。UI 功能必须真点:每个按钮、菜单、弹窗、tab、下拉。
3. **不许改断言让结果变绿**。真红就真红,写进失败文档。
4. **截图只留本地,不上传 git**(`screenshots/` 已 gitignore)。
5. **铁律:每发现一个问题,必须立即在系统里建一条缺陷任务**——不能只写进 markdown 报告。
   缺陷任务 = 严重度(P0/P1/P2/P3) + 截图附件 + 复现步骤 + 关联项目。
   markdown 报告**只做汇总索引**(缺陷编号 + 一句话),不承载缺陷本体;报告里没有对应
   缺陷任务的条目 = 没发现。**禁止只写文档不建任务。**

## 问题 → 缺陷任务(铁律步骤)

发现即建单,不要攒到最后。建缺陷 → 传截图 → 回写证据 id:

```sh
JSON=(-H "Authorization: Bearer $KEY" -H "x-paperclip-api-key: $KEY" -H "Content-Type: application/json")
BIN=(-H "Authorization: Bearer $KEY" -H "x-paperclip-api-key: $KEY")

# 1) 建缺陷任务(defect 出现即「缺陷」, severity 必填; projectId 关联项目)
curl -fsS "${JSON[@]}" -X POST "$API/companies/$CID/issues" -d '{
  "title": "[P1][App走查] 任务详情页崩溃",
  "description": "现象/影响",
  "status": "todo",
  "projectId": "<project-id>",
  "defect": { "severity": "P1", "source": "app_walkthrough",
              "reproSteps": "1. … 2. … 期望 … 实际 …", "evidenceAttachmentIds": [] }
}'                                                              # 记下 issue.id

# 2) 传截图作证据
AID=$(curl -fsS "${BIN[@]}" -F "file=@screenshots/waveNNN/01.png" \
  "$API/companies/$CID/issues/<issue-id>/attachments" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")

# 3) 回写证据附件 id
curl -fsS "${JSON[@]}" -X PATCH "$API/issues/<issue-id>" \
  -d "{\"defect\":{\"severity\":\"P1\",\"source\":\"app_walkthrough\",\"evidenceAttachmentIds\":[\"$AID\"]}}"
```

严重度:P0 阻断/数据损坏/安全 · P1 核心功能不可用 · P2 受损可绕行 · P3 体验瑕疵。
来源 `source`:`web_walkthrough` / `app_walkthrough` / `api` / `customer_feedback`。
验证缺陷进了系统:`GET $API/companies/$CID/issues?defect=true` 能筛出来。

## 前置

```sh
export API=https://xrobinai.cn/api
export KEY="$PAPERCLIP_API_KEY"
H=(-H "Authorization: Bearer $KEY" -H "x-paperclip-api-key: $KEY")
```

双模拟器(覆盖低版本 WebView + 现代 Android):

```sh
emulator -list-avds
emulator -avd <API28-Chromium66-avd> &      # 老 WebView 兼容
emulator -avd <Android14-avd> &             # 现代
adb devices
```

## 步骤

### 1. 装**真产物**(不是装工作区里的 APK)

```sh
VER=0.5.88
curl -fsS -o /tmp/$VER.apk "https://dls.xrobinai.cn/coolie/app/$VER/coolie-release.apk"

# 装前校验 APK 真值(versionCode/versionName 对不对,别装错包)
aapt2 dump badging /tmp/$VER.apk | head -1

adb install -r /tmp/$VER.apk
```

### 2. 净装(必要时)—— 暴露"老缓存掩盖的 bug"

```sh
adb uninstall cloud.coolie.app || true
adb install /tmp/$VER.apk
adb shell pm clear cloud.coolie.app
adb shell am start -n cloud.coolie.app/.MainActivity
```

### 3. 拟真人点全流程(每个交互都点到)

- 登录 → 工作台 → 目标页 → 每条 tab/下拉/弹窗/上下文菜单。
- **每个非默认分支都要走**:空态、错误态、非默认 tab、非默认筛选。
- 没有"点了没反应"的假按钮;没有未捕获异常;没有业务语义荒谬(不该审批的能审批)。
- H5/WebView 页面也要点(本仓 WebView 桥有历史 bug)。

### 4. Web 端用 Playwright 真驱动(不是 dump DOM)

```sh
npx playwright test --config tests/e2e/playwright.config.ts
# 交互式:点每个工具栏按钮/右键菜单/对话框后,记录"新出现了什么"
```

### 5. API 真值回读(证明写进去了)

对任何"创建/提交/上传"动作,回读确认行真的产生了:

```sh
curl -fsS "${H[@]}" "$API/issues/$ISSUE_ID/work-products"   # 产物在里面吗
curl -fsS "${H[@]}" "$API/issues/$ISSUE_ID/attachments"     # 附件在里面吗
curl -fsS "${H[@]}" "$API/companies/$CID/dashboard"         # 计数动了吗
```

### 6. 截图/录制存证(本地)

```sh
mkdir -p screenshots/waveNNN
adb shell screencap -p /sdcard/01-login.png
adb pull /sdcard/01-login.png screenshots/waveNNN/
adb shell uiautomator dump && adb pull /sdcard/window_dump.xml screenshots/waveNNN/
```

### 7. 识别本机环境伪阴性(关键!别把环境问题当产品缺陷)

本机 Mac 的 **TUN 代理会拦截模拟器对 `xrobinai.cn` 的 HTTPS**,造成"写请求被本地 clone
(127.0.0.1:3100 dev server)吸收、读请求转发到 prod"的**脑裂**:

```sh
# 复现脑裂:模拟器内 WebView 显示登录页 = 疑似伪阴性
# 判据(见 E2E-WEB-LOGIN-AUTH-WAVE99.md §4):
#  - 只有模拟器表现异常,真机正常
#  - okhttp 请求到了 prod,WebView 请求到了本地 clone
#  - trace/抓包里能看到流量被本机代理改写
```

判定:`本案 = 本机环境伪阴性`(prod 链路缺陷不成立)。**必须把"环境伪阴性"与"真产品缺陷"
分开写**,不可混为一谈。

## 验收标准

1. 装的是**真产物**(aapt2 badging 校验过 versionCode/versionName),不是工作区里的东西。
2. 每个交互都真点过,每个非默认分支都走过;无假按钮、无未捕获异常、无业务语义荒谬。
3. 每个写动作都有 API 回读证据(不是"看起来成功了")。
4. 每次失败都落一份 dated 失败文档(根因 + 原始 stdout),真红不洗白。
5. 截图/录制留本地;证据目录可复现(记录怎么拍的)。
6. 伪阴性被明确标注为环境问题并给出判据,不冒充产品结论。
7. **每个发现的缺陷都在系统里有对应任务**(严重度 + 截图附件 + 复现步骤 + 关联项目),
   markdown 报告只做索引;`GET /issues?defect=true` 能筛出全部缺陷。

## 失败分支

| 编号 | 症状 | 原因 | 处置 |
|---|---|---|---|
| F1 | 装不上 / 装错版本 | 拉了错 APK / 没校验 | `aapt2 dump badging` 先验,再 `adb install -r` |
| F2 | 模拟器 WebView 显示登录页 | 本机 TUN 代理脑裂(伪阴性) | 按 §7 判定,标为环境伪阴性;真机复核 |
| F3 | 单测绿但功能不通 | 测试跑了假替身 | 真写一遍再读回来;不达标即 FAIL |
| F4 | 断言过不去 | 真缺陷 | **不改断言**;写 dated 失败文档,报红 |
| F5 | 截图进了 git | 忘了 ignore | 确认 `screenshots/` 被忽略;`git rm -r --cached` 撤回 |
| F6 | 净装才复现的 bug | 老缓存掩盖 | 固定加一步"净装"回归 |
| F7 | 只写了报告,系统里没缺陷任务 | 违反铁律 | 立即按「问题 → 缺陷任务」三步入库;报告只留索引 |

## 关联

- 缺陷要修 → `swe-delivery-flow.md`
- 验收通过要上线 → `sre-release-and-deploy.md`
