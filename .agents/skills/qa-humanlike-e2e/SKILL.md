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

## 关联

- 缺陷要修 → `swe-delivery-flow`；通过要上线 → `sre-release-and-deploy`
