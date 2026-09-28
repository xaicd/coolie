---
name: qa-humanlike-e2e
description: >
  测试员工（QA）视角的拟真人走查 skill：双模拟器装机、真产物校验、Playwright 真驱动、
  API 真值回读、截图存证、本机 TUN 代理伪阴性识别。适用于「证明这个特性真能用」
  「发版前后装机走查」「UI 功能怎么算验证过」「模拟器异常是不是产品缺陷」等场景。
  完整脚本见 docs-coolie/playbooks/qa-humanlike-e2e.md。
---

# QA / 测试员工 — 拟真人装机走查

**一句话职责**：像真人一样装 App、点全流程、回读真值、截图存证——不让"单测绿"冒充"能用"。

## 何时用

- 特性"开发完了"，要证明真能用。
- 发版前后装机走查、出截图。
- 要判"模拟器异常"是环境问题还是产品缺陷。

## 核心纪律

1. 不许用单测绿当证据——有状态特性必须真写一遍再读回来。
2. 不许用读源码当证据——UI 必须真点（按钮/菜单/弹窗/tab/下拉）。
3. 不许改断言让结果变绿——真红就真红。
4. 截图只留本地，不上传 git。
5. **铁律：每发现一个问题，必须立即在系统里建一条缺陷任务**——不能只写进 markdown 报告。
   缺陷任务必须带：严重度（P0/P1/P2/P3）+ 截图作为附件 + 复现步骤 + 关联项目。
   markdown 报告只做**汇总索引**（列出缺陷编号 + 一句话），不承载缺陷本体。
   报告里没有对应缺陷任务的条目，视为没发现。

## 问题 → 缺陷任务（铁律步骤）

走查中**发现即建单**，不要攒到最后。三步入库（建缺陷 → 传截图 → 回写证据 id）：

```sh
H=(-H "Authorization: Bearer $PAPERCLIP_API_KEY" -H "x-paperclip-api-key: $PAPERCLIP_API_KEY" \
   -H "Content-Type: application/json")

# 1) 建缺陷任务（defect 出现即为「缺陷」，severity 必填）
curl -fsS "${H[@]}" -X POST "$API/companies/$CID/issues" -d '{
  "title": "[P1][网页走查] 登录后工作台空白",
  "description": "现象/影响",
  "status": "todo",
  "projectId": "<project-id>",
  "defect": {
    "severity": "P1",
    "source": "web_walkthrough",
    "reproSteps": "1. 打开 …\n2. 点击 …\n期望：…\n实际：…",
    "evidenceAttachmentIds": []
  }
}'   # 记下返回的 issue.id

# 2) 传截图/录屏作为证据（服务端 issue 必须已存在）
ATTACH_ID=$(curl -fsS "${H[@]:0:2}" -F "file=@screenshots/waveNNN/01.png" \
  "$API/companies/$CID/issues/<issue-id>/attachments" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")

# 3) 把证据附件 id 回写进缺陷元数据
curl -fsS "${H[@]}" -X PATCH "$API/issues/<issue-id>" \
  -d "{\"defect\": {\"severity\": \"P1\", \"source\": \"web_walkthrough\", \"evidenceAttachmentIds\": [\"$ATTACH_ID\"]}}"
```

按严重度分级：P0 阻断/数据损坏/安全，P1 核心功能不可用，P2 功能受损有绕行，P3 体验瑕疵。
`source` 取值：`web_walkthrough` / `app_walkthrough` / `api` / `customer_feedback`。

## 执行步骤

### 1 装真产物

```sh
VER=0.5.88
curl -fsS -o /tmp/$VER.apk "https://dls.xrobinai.cn/coolie/app/$VER/coolie-release.apk"
aapt2 dump badging /tmp/$VER.apk | head -1     # 验 versionCode/versionName
adb install -r /tmp/$VER.apk
```

### 2 净装（暴露缓存掩盖的 bug）

```sh
adb uninstall cloud.coolie.app || true
adb install /tmp/$VER.apk
adb shell pm clear cloud.coolie.app
adb shell am start -n cloud.coolie.app/.MainActivity
```

### 3 拟真人点全流程

- 每个 tab/下拉/弹窗/右键菜单都点到；每个非默认分支都走（空态/错误态/非默认筛选）。
- 无假按钮、无未捕获异常、无业务语义荒谬。
- Web 端用 `npx playwright test --config tests/e2e/playwright.config.ts` 真驱动。

### 4 API 真值回读

```sh
export API=https://xrobinai.cn/api
export CID=<company-id>
export KEY="$PAPERCLIP_API_KEY"
H=(-H "Authorization: Bearer $KEY" -H "x-paperclip-api-key: $KEY")

curl -fsS "${H[@]}" "$API/issues/$ISSUE_ID/work-products"
curl -fsS "${H[@]}" "$API/issues/$ISSUE_ID/attachments"
curl -fsS "${H[@]}" "$API/companies/$CID/dashboard"
```

### 5 截图存证（本地）

```sh
mkdir -p screenshots/waveNNN
adb shell screencap -p /sdcard/01.png && adb pull /sdcard/01.png screenshots/waveNNN/
adb shell uiautomator dump && adb pull /sdcard/window_dump.xml screenshots/waveNNN/
```

### 6 识别本机伪阴性（关键）

本机 Mac **TUN 代理会拦截模拟器对 `xrobinai.cn` 的 HTTPS**：写请求被本地 clone
（`127.0.0.1:3100`）吸收、读请求转发到 prod → 脑裂。判据：只有模拟器异常、真机正常；
okhttp→prod 而 WebView→clone。**必须把"环境伪阴性"与"真产品缺陷"分开写。**

## 已知坑

1. 装错版本 → 先 `aapt2 dump badging` 再装。
2. 模拟器 WebView 显示登录页 = 大概率 TUN 脑裂伪阴性，真机复核。
3. 单测绿但功能不通 = 测试跑了假替身，不达标即 FAIL。
4. 断言过不去 = 真缺陷，**不改断言**。
5. 截图别进 git（`screenshots/` 已 ignore）。
6. 净装才复现的 bug 要固定进回归。
7. **只写 markdown 报告、不在系统建缺陷任务 = 没记录**。报告是汇总索引，缺陷本体必须在任务系统里。

## 验收标准

1. 装的是真产物（badging 校验过）。
2. 每个交互真点过，每个非默认分支走过。
3. 每个写动作有 API 回读证据。
4. 每次失败落 dated 失败文档（根因+原始 stdout），真红不洗白。
5. 伪阴性明确标注为环境并给判据。

## 反例

- 用单测绿写"验证通过"。
- 只截图默认首页就宣布走查完成。
- 把模拟器环境问题写成产品缺陷。
- **发现问题只写进 markdown 报告，没在系统里建缺陷任务**（不可指派、不可跟踪、不可验收）。
- 建了缺陷任务但没挂截图附件、没写复现步骤、没关联项目。

## 关联

- 缺陷要修 → `swe-delivery-flow`；通过要上线 → `sre-release-and-deploy`
