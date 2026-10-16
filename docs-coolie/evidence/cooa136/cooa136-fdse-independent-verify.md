# COOA-136 · 门神 (FDSE) 独立真机复验（blocker 解除收口轮）

- 日期: 2026-10-16
- 执行: 门神 (FDSE / claude_local) · run `7ed2f925-5786-4022-a47b-361359ab7a99`
- 唤醒原因: `issue_blockers_resolved`（COOA-184 → COOA-189 → COOA-228 全链 `done`）
- 设备: Android `emulator-5554` (coolie-test) · app `cloud.coolie.app` (Expo dev client)
  - 物理 1080×2400 @ density 420 → 逻辑 411dp × 914dp
- 设备锁: `scripts/device-claim.sh acquire --owner 门神:COOA-136 --ttl 1800`（COOA-232 串行化契约），复验结束释放
- 工具链: `agent-device 0.21.1` + `adb`（Mac 宿主机直连）

> **本轮定位**：非重跑 26×8×5（已由 COOA-189/COOA-228 落地），而是**门神对掌柜点名三大核心不变量的独立复验**，并如实登记残余。

---

## 一、独立复验结论（真机几何，本轮新采）

| 维度 | 复验动作 | 真机结果 | 判定 |
| :--- | :--- | :--- | :--- |
| **2.2.1 极限视口防撑爆** | `adb shell wm size 840x2400` 强置 **320dp** 宽，逐屏取 a11y `rect` | Studio / Tasks 两屏 **最大右边缘 = 840 = 视口宽 → overflow = 0px**；底栏 5 槽位 [21..819] 全在屏内 | ✅ 通过 |
| **2.2.3 软键盘几何避让** | 切至**真实 IME**（Gboard），聚焦工坊输入框，逐帧量取 | `mInputShown=true`；输入行/【发送】由 `bottom=2143` 抬到 **`bottom=1323`**，底栏抬到 `bottom=1499`，**键盘顶 ≈ y=1517** → **净空 ≈ 194px，零遮挡**（`ADJUST_RESIZE` 生效） | ✅ 通过 |
| **2.2.4 全局路由 LIFO** | 任务详情 → 点 `‹ 返回`，看 settle diff | 精确回到**父屏 Inbox**（`与我(101)/未读/最近/受阻/全部`），**未跳级回主 Tab 根** | ✅ 通过 |
| 黄金 5 槽位底栏 | a11y 枚举底栏结构 | `汇览 / 任务 / [+] / 工坊 / 资产` 五槽对称，中央「新建任务」凸起；与 `TabBar.tsx:67` 契约注释一致 | ✅ 一致 |

**证据**：`current.png`（起点任务详情）· `kb-real.png`（真实键盘避让）· `w320.png` / `w320-tasks.png`（320dp 防撑爆，overflow=0）。

---

## 二、本轮新发现：键盘避让复验的**方法论陷阱**（防止未来假阳性/假阴性）

本轮首测用默认 IME（`com.callstack.agentdevice.imehelper/.TestInputMethodService`，agent-device 在模拟器上**默认开启的无头测试输入法**）：
- `mInputShown=true` 但**屏幕无可见键盘、布局不 reflow** → 若据此判「避让失败」是**假阴性**，判「通过」也无法证明真实键盘避让。

**处置**：`adb shell ime set com.google.android.inputmethod.latin/com.android.inputmethod.latin.LatinIME` 切真实键盘后复测，才拿到上表的 194px 净空真值。

> **固化为经验**：任何「软键盘遮挡/避让」类真机断言，`MUST` 先确认 IME = 真实键盘（或 `open --no-test-ime`），无头测试 IME 下**不得**下结论。

---

## 三、环境态确认（清除上一轮 blocker 根因）

上一轮置 `blocked` 的根因是「走查设备停在登录页报 `账号或密码错误`」。本轮原生复验：
- `dumpsys window`: `mCurrentFocus=...cloud.coolie.app/.MainActivity`，应用**已登录**且可正常驱动全程。
- → 该环境 blocker **已自然解除**，不再构成本主线阻力。

---

## 四、结构性缺陷独立确证（→ 承接口 COOA-234）

掌柜所列「26 屏」中 3 屏为**结构性不可达/死代码**，本轮以静态 grep 独立确证（非听信）：
- `grep -n 'setPipelinesOpen(true)|setPlansOpen(true)|setProjectsOpen(true)' clients/expo/App.tsx` → **无输出**（3 个 `useState(false)` 死状态）
- `TasksScreen` 仅 `App.tsx:78` 死导入，全仓 0 渲染点。

**处置**：不擅自回收疑似有意废弃的 UI；已由 [COOA-234](/COOA/issues/COOA-234)（`in_review`，PM/前端裁决：补入口 or 下线残码）承接。

---

## 五、残余登记（诚实，不糊弄）

以下为本主线**未 100% 覆盖**项，均为**环境/数据依赖型**（非前端缺陷）：

1. `CodeDiffScreen`：需一个 `contentType` 含 `diff` 的交付物方可路由实证（源码入口在架）。
2. `RegisterScreen` / `WebLoginScreen`：登录前态，驱动需注销当前会话，会把**共享模拟器**留在未登录态 → 需专用设备会话，主动让行未做。
3. 审批签署闭环：实例当前 `待审批 = 0`（本轮 Inbox 复见空态「所有申请均已裁决完毕」），签署/驳回**无对象可驱动**。
4. 纯流式「**流式中途**解锚同帧」证据：需一次更长流（>5s）并在流内 swipe；COOA-228 已证流后解锚恒定不拽回。
5. 归档撤销复原：COOA-228 §3.2 已披露（per-user 软隐藏，可 `DELETE /api/issues/:id/inbox-archive` 复原）。

> 以上 1–4 已另立子工单跟踪，不在本主线内强行造数/造态。

---

## 六、证据清单

- `cooa136-run-report.json`（机读报告：逐维度 geometry 与判定）
- `kb-real.png`（真实 IME 避让）· `w320.png` / `w320-tasks.png`（320dp overflow=0）· `current.png`（起点）
- 关联既有证据：`docs-coolie/evidence/cooa189/*`、`docs-coolie/evidence/cooa228/*`
