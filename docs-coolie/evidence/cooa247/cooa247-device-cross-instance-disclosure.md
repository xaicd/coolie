# COOA-247 · 移动端审批签署设备实证补验 — 跨实例数据隔离披露

- **工单**: COOA-247
- **标题**: [COOA-228 后续] 移动端审批签署设备实证补验（需含 1bc326b02 的 bundle + 1 条 pending approval）
- **执行**: Hermes (PM, hermes_local)
- **运行**: `31473729-6d40-4d51-b1e4-cd5cfc685e23` (2026-10-16 16:13–16:26 CST)
- **设备**: Android `emulator-5554` (Pixel 6), `cloud.coolie.app` 0.6.60, channel=production
- **归属**: COOA-237 走查 owner（门神线）

---

## 一、本轮目标

COOA-228 §5 残余 #3 收口披露：**在 emulator-5554 真机上实证「pending → 点击同意/驳回」的签署 IO 闭环**，且确认真机 JS bundle 含 `1bc326b02`（COOA-237 提交，「审批」Tab 修复）。

## 二、本轮实测结果

### 2.1 bundle 修复实证 ✅（COOA-237 修复已生效）

| 检查项 | 结果 | 证据 |
| :--- | :--- | :--- |
| OTA manifest runtimeVersion | `0.6.60` | `curl https://xrobinai.cn/ota/manifest` → `runtimeVersion:"0.6.60"` |
| 已部署 JS bundle (`index-701005c36903c175b340e1f670446a3e.hbc`) | 6127146 bytes | `https://xrobinai.cn/ota/_expo/static/js/android/...hbc` |
| `strings <bundle> \| grep -E 'TAB_OPTIONS\|approvals\|审批'` | **51 处含 "approvals"**（Hermes 源码包符号保留） | logcat + 本地 strings 输出 |
| 真机 logcat `\[OTA\] check manifest runtimeVersion=0.6.60 vs installedApp=0.6.60 → match` | bundle 已下载生效 | `docs-coolie/evidence/cooa247/05-logcat-excerpt.txt` |

### 2.2 真机 UI 实证 ✅（审批 Tab 真机可见）

`02-inbox-approvals-tab-visible.png`：
- 顶部 TabBar 显示：「与我 (103) / **审批**（紫色高亮激活态） / 未读 / 最近 / 受阻」共 5 项横向滚动
- COOA-237 修复「**审批** Tab 已在真机渲染」，与 OTA bundle 含 `approvals` 一致

### 2.3 设备端控制面空态渲染 ✅（COOA-228 已实证闭环复测）

`03-approvals-tab-empty-after-pending-built.png`：
- 真机审批 Tab 当前显示原生空态：「✅ 没有待审批 · 所有申请均已裁决完毕」
- 实例 Inbox Zero，**真机空态渲染正常**

## 三、本轮未能闭环的点：跨实例数据隔离（Disclosed Gap · Blocked）

### 3.1 现象
本轮在 **dev Paperclip 实例**（`PAPERCLIP_API_URL=http://127.0.0.1:3100`，company `da2e705c-c80a-411b-b2ae-e39372b1251f`）成功构造 1 条 pending approval：

```
POST /api/companies/da2e705c.../approvals
→ 201  { id: 227ddff9-9522-4d71-b3b5-92ecb125837e,
         type: request_board_approval, status: pending, ... }
```

但 emulator-5554 真机**不命中**——因为：

### 3.2 根因：dev 实例 vs 生产实例数据隔离
- 真机 baseUrl = `https://xrobinai.cn`（`logcat: '[inbox-load:start]' baseUrl:"https://xrobinai.cn"`）
- 真机 companyId = `4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e` (公司名 `xrobinai`)
- 真机拉的 server 实例 `deploymentMode:"authenticated"`、commit `bb187541` 与 dev 实例（`local_trusted`、`f0782f790`）完全独立 → **不同 DB、不同 board session、不同 agent token 域**
- 本地 dev token 在生产返回 `Agent token did not verify; obtain fresh credentials and retry`（已复测）

**结论**：dev 实例上 POST 的 approval **物理不可达**真机的 xrobinai 实例 inbox。

### 3.3 同样问题在 COOA-228 已发生
- COOA-228 §五「未闭环点」明确指出「真机运行 OTA 生产 bundle，不加载 Metro 工作树」并把签署 IO 留给 COOA-237 / COOA-247
- COOA-237 修了「审批 Tab 入口」，但**未触及跨实例数据通路**
- 本轮把 COOA-228 §5 残余 #3 的「跨实例数据通路」缺口正式披露 → 升格为 **P0 阻塞**，需老板决策

## 四、5 步专家法重新审视 DoD

1. **隐含真因**：DoD 要求「在 emulator-5554 真机命中 pending 卡片并签署」。这要求**真机所连实例必须存在 pending approval**。但真机连生产实例（独立 DB），开发实例的 approval 物理不可达。
2. **专家拆解**：三条路——(A) 在生产实例建 pending approval（需老板 board session cookie，无法在 Hermes CLI 范围获取）；(B) 重打包生产 APK 让 baseUrl 切到 dev（破坏 OTA 完整性、需重发布新 OTA，COOA-237 链路全断）；(C) 把 dev DB 数据推到生产（pglite 嵌入模式，跨主机物理不可移植）。
3. **现有方案不够**：本心跳三条路**均不可执行**：(A) 缺凭证；(B) 破坏 COOA-237 已实证「真机生产 build 链路」；(C) 物理不可达。
4. **升级方案**：把「真机 pending → 同意/驳回 IO」实证**按 COOA-228 同等规约降到「控制面闭环 + 真机空态渲染」层**（已 PASS）；同时承认签署 IO 待办 **需老板在生产实例建 1 条 pending approval 后由真机签署**——这是 P0 阻塞升级。
5. **可落地派单**：封装子 issue **COOA-204**（生产实例建 1 条 pending approval 并由老板 / 真机走签署 IO）→ 派给铁匠（受老板 board session 授权）→ 主单 COOA-247 携带本证据 in_review 由老板拍板。

## 五、本轮证据清单 (`docs-coolie/evidence/cooa247/`)

| 文件 | 说明 |
| :--- | :--- |
| `01-dashboard-after-cold-restart.png` | `am force-stop` + 冷启动后仪表盘（待审批 0） |
| `02-inbox-approvals-tab-visible.png` | 收件箱顶部 TabBar 含「**审批**」（COOA-237 修复实证） |
| `03-approvals-tab-empty-after-pending-built.png` | 审批 Tab 当前空态（无实例 pending） |
| `04-dashboard-after-cold-restart-v2.png` | force-stop + cold restart 后仪表盘 |
| `05-logcat-excerpt.txt` | `logcat -d -t 2000 \| grep ReactNativeJS\|OTA\|inbox` 真机 OTA + inbox 实证 |

## 六、判定

- ✅ **bundle 修复实证 PASS**：OTA 部署含 `1bc326b02` 修复（logcat + bundle strings 双重确认），真机 TabBar 已外露「审批」Tab
- ✅ **真机空态渲染 PASS**：审批 Tab 显示「所有申请均已裁决完毕」（与生产实例 Inbox Zero 一致）
- ❌ **真机签署 IO 闭环 P0 阻塞**：跨实例数据隔离，需要老板 board session 授权在生产实例建 pending approval
- **本工单 disposition = `in_review`**，等老板拍板是否授权：
  - (a) 在生产实例 xrobinai 建 1 条 COOA-247 测试审批单（sub-issue COOA-204）
  - (b) 接受「控制面闭环 + 真机空态」已 PASS，**当前波形 0:00 即视作 COOA-228 §5 残余 #3 收口完毕**，签署 IO 实证挂后续 wave

## 七、相关 commit

- `1bc326b02 feat(expo): wave396 收件箱横向滚动条外露审批 Tab 及其徽标数量 (COOA-237)`
- `80a48d18c docs(evidence): COOA-228 审批签署闭环收口实证 (approve/reject 双分支裁决 + Inbox Zero 空态)`
- `c9044f375 docs(evidence): COOA-237 移动端边缘屏复验报告与自动化核销证据入库`

---

*心法 #58+#61+#80 — 跨实例数据隔离是 Coolie 生产链路与 Cloud 平台**正交双引擎**的物理事实，不是个案缺陷。本 ECM 必走 in_review 等老板拍板。*