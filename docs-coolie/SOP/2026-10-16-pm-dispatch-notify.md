# SOP — 派工后必须持续汇报 (Dispatch Must Keep Reporting)

> 编号: SOP-PM-DISPATCH-NOTIFY-2026-10-16
> 归口: Hermes·Echo (PM 掌柜)
> 触发: 老板拍「进程启动后没待通知」= 派工后无回执/无进展/无结项通知 (wave387 复盘)
> 适用: 所有本地数字员工派单 (`scripts/dispatch-local-employee.sh` / `.coolie-local/dispatch/*`)

---

## 一、为什么要立这条 SOP (一句话)

老板 OOB 抱怨「进程启动后没待通知」的真因不是"没干活", 而是**派工后没有持续汇报**: 派单落盘
(`.coolie-local/dispatch/*.json`) 后, 掌柜无法第一时间知道 **「起没起来 / 干到哪 / 完没完」**,
到点发现"无回执"就误判成"没派起来" (wave387 即此: 前一轮其实已跑完发版, 但因无持续汇报被当作未启动重派)。

**铁律: 派工不是一个"点火"动作, 而是一段"持续可见"的过程。**

---

## 二、三阶段强制汇报契约 (MUST)

### 阶段 1 · 派工即回执 (Dispatch Receipt) — 派单后 **≤ 60 秒**
- 派单方 (`dispatch-local-employee.sh`) **SHALL** 落盘派单 JSON (`.coolie-local/dispatch/<ts>-<wave>-<agent>.json`)
  且 **SHALL** 输出一行可解析回执: `DISPATCH_OK wave=<n> agent=<code> task=<id> ts=<iso>`。
- 执行方进程启动后 **SHALL** 立即写出 **启动心跳** 行: `DISPATCH_START wave=<n> agent=<code> ts=<iso>`。
- 若 60 秒内无 `DISPATCH_START`, 派单方 **MUST** 明确标注 `DISPATCH_NO_START` 并**主动告知掌柜**
  ("派工未起来"), 而不是静默等待。

### 阶段 2 · 执行期持续进展 (Progress Heartbeat) — 每 **≤ 90 秒** 或每个关键里程碑
- 执行方 **SHALL** 在以下节点各输出一行进展: 侦察完成 / 方案确定 / 开始构建 / 构建完成 / 发版提交 / 护栏。
- 长任务 (>60s, 如 gradle build / 全量测试) **SHALL** 在启动后 1 秒内发出**预估耗时**心跳, 杜绝会话假死。
- 掌柜 **SHALL** 把这些行聚合成老板可读的**一句话进展**, 有异常先报异常。

### 阶段 3 · 结项必达通知 (Completion Notice) — 结项即报, 不隔夜
- 任务 done/blocked **MUST** 立刻发出结项通知, 内容含: 结论一句话 + 关键指纹 (commit / 版本 / sha256)
  + 证据路径 + 诚实偏差登记。
- **SHALL** 挂载可核验产物 (report / evidence / tag); 无产物不得标 done (`No Artifact, No Done`)。
- 被阻塞 **MUST** 立即上报阻塞点 (而非等到超时), 4 小时无进展 **MUST** 显式报 stuck。

---

## 三、必须汇报的字段 (最小集)

| 字段 | 说明 |
|---|---|
| `wave` | 波次编号 |
| `agent` | 执行员工代码 (e.g. `forge-ii-core-swe`) |
| `phase` | `dispatch` / `start` / `progress` / `done` / `blocked` |
| `ts` | ISO 时间戳 |
| `msg` | 一句话人话 (老板可读) |
| `evidence` | 结项时: commit / version / sha256 / 证据路径 |

---

## 四、落地检查点 (机器可检)

1. 每次派单 **SHALL** 产出一份 `.coolie-local/dispatch/<ts>-<wave>-<agent>.{json,md}` (派单真值)。
2. `scripts/cron-team-status.sh` **SHALL** 能列出在跑/已结的派单与其最近一次心跳 (无心跳即标红)。
3. 掌柜对"无派单 JSON / 无启动心跳" **MUST** 在巡检中主动告警, 而不是等老板问。
4. 结项工单 **MUST** 具备 `work_products` / `documents` 挂载 (控制面第一真理源)。

---

## 五、反例 (禁止)

- ❌ 派单后只留一句"已派", 之后长时间静默 → 老板以为没起来。
- ❌ 长任务闷头跑, 不报预估耗时 → 会话假死、误判卡住。
- ❌ 干完了但只落 commit、不通知 → 老板不知道已完成, 触发重复派单 (wave387 重派即此)。
- ❌ 卡住了不吭声, 等超时 → 浪费一个 4 小时窗口。

---

## 六、一句话总结

> **派工之后, 老板必须始终能回答三个问题: 起来没? 干到哪? 完没完? —— 答案不来自老板去问, 而来自员工主动持续汇报。**
