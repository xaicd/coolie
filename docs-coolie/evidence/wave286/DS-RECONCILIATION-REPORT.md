# DS 运营对账平账报告 — wave286 · COOA-110

**Wave**: wave286 · 老板微信诉求「运营对账平账看下」
**工单**: COOA-110 (`【微信·老板·wave286】运营对账平账看下`)
**日期**: 2026-10-11 22:28–22:5x CST (14:28–14:5x UTC)
**角色**: 百晓生 / DS (`baixiaosheng-ds`) · 工具 `cmd` (acpx:cmd) · 底腿 receipt `20261011T142817Z-wave286-baixiaosheng-ds` (pid 20578)
**仓库**: `/Users/mac/workspace/xaicd/coolie` · 分支 `main` · **只读对账 (不改产品代码 / 不碰脏文件)**
**性质**: 本次派单 = 老板「运营对账平账」诉求的一次真实端到端运行; 本报告即交付物

---

## 0. 结论 (TL;DR) — 三本账平账判定

| # | 账本 | 结论 | 一句话 |
|---|---|---|---|
| A | **本地派单执行账** (`.coolie-local/dispatch/`, 256 receipt) | ⚠️ **不平 (3 类差异)** | 同意图两记 (本腿活案例) + 12 条悬挂 queued 孤儿腿 + `tool` 字段账实不符 |
| B | **控制面工单账** (Dev Server COOA, 107 issue) | ⚠️ **悬挂** | COOA-109/111 `in_progress` 无执行腿无锁; 仅 COOA-110 有锁与运行收据 |
| C | **G7 商业运营账** (`docs/09_operations/`) | ✅ **留空合规 (零假 Demo)** | 未发生真实资金流水, `02_financial_reconciliation/` 与 `03_inspection/` 保持 `.gitkeep`; 但 2 件产物缺失 |

**综合判定: ⛔ 平账未达成 (NO-GO)** — 本地运营账有 3 类明确未轧平差异 + G7 产物不齐。链路本身在跑 (本腿即证明), 但「账实相符、笔笔可轧」尚未达成。
**注**: 「链路可用」≠「账平」 — 两者证据面不同, 分开判。

---

## 1. 对账范围与方法

**三本账** (对齐 `docs/09_operations/tenant-governance.md` §4 + `wiki/stages/09_operations.md`):

- **账本 A — 本地派单执行账**: `.coolie-local/dispatch/*.json` (schemaVersion=1 收据状态机) + `.coolie-local/locks/*.lock`
- **账本 B — 控制面工单账**: Dev Server 3100, 公司 `Coolie 本地施工总社` (`da2e705c-…`), issue 状态机
- **账本 C — G7 商业运营账**: `docs/09_operations/` (SOP / 平账单 / 巡检 `/ 零假 Demo 基线)

**对账口径 (一笔业务 = 一笔可轧账)**:
1. 老板一句诉求 (一句话意图) → 应唯一映射到 1 条**执行腿** (收据 status ∈ {running, done}) 或 1 条**明确关闭**记录;
2. 收据 `status` ↔ issue `status` ↔ 进程/锁三方互证, 缺一即「单边账」;
3. `queued` 且无控制面承接 = **悬挂孤儿腿** (悬空账)。

**执行命令** (只读):
```sh
# 账本 A
for f in .coolie-local/dispatch/*.json; do node -e "const r=require('./$f');console.log(r.status,r.wave,r.subagentType,r.tool,r.task)" ; done
ls -la .coolie-local/locks/
# 账本 B
curl -s http://localhost:3100/api/companies/da2e705c-c80a-411b-b2ae-e39372b1251f/issues
# 账本 C
find docs/09_operations -type f
```

---

## 2. 逐账对账明细

### 2.1 账本 A — 本地派单执行账 (256 收据)

| 状态 | 数量 | 说明 |
|---|---|---|
| done | 165 | 正常收口 |
| failed | 55 | 执行失败 (多为异构工具重试耗尽) |
| cancelled | 17 | 已撤销 |
| **queued** | **12** | **悬挂 (无执行腿)** — 见 §3 D2 |
| blocked | 5 | 门禁/降级阻断 |
| running | 1 | 本腿 142817 (pid 20578 实活) |
| undefined | 1 | schema 异构 (无 status 字段) — 见 §3 D4 |
| **合计** | **256** | |

### 2.2 账本 B — 控制面工单账 (COOA)

- 107 issue; wave286 (2026-10-11) 活跃 3 条:

| issue | 标题 | status | 责任人 | 锁 | 执行腿 |
|---|---|---|---|---|---|
| COOA-109 | 【微信·老板·wave286】测试一下已读未读 | `in_progress` | baixiaosheng-ds | ❌ 无 | ❌ 无 running (仅本地 142815 queued) |
| **COOA-110** | 【微信·老板·wave286】运营对账平账看下 | `in_progress` | baixiaosheng-ds | ✅ `COOA-110.lock`=20578 | ✅ 142817 running (pid 20578) |
| COOA-111 | 【微信·老板·wave286】单测一下用户登录流程 | `in_progress` | menshen-fdse | ❌ 无 | ❌ 无 running (仅本地 142822 queued) |

**Bridge 侧**: `coolie-task-runner-bridge.mjs` (pid 31409, 09:21 起) 串行认领; 日志实查 `自动认领工单: [COOA-110] … baixiaosheng-ds | 选用工具: cmd`。COOA-109/111 排在 COOA-110 之后 (串行未到), 故其本地收据仍停 `queued`。

### 2.3 账本 C — G7 商业运营账

| 应落盘产物 (wiki §09 承诺) | 实际 | 判定 |
|---|---|---|
| `tenant-governance.md` (G7 SOP) | ✅ 存在 | 合规 |
| `02_financial_reconciliation/RECONCILIATION-*.md` | ⚪ 仅 `.gitkeep` | ✅ 合规 (未发生真实资金流水, 零假 Demo) |
| `03_inspection/INSPECTION-*.md` | ⚪ 仅 `.gitkeep` | ✅ 合规 (未巡检, 严禁填未实测结论) |
| `agent-operations-ledger.md` | ❌ 缺失 | 产物不齐 |
| `system-inspection-report.md` | ❌ 缺失 | 产物不齐 |

### 2.4 老板 3 句诉求 × 三账对照 (本波活案例)

| 老板原话 | 账本 A 收据 | 账本 B issue | 锁 | 平账 |
|---|---|---|---|---|
| 测试一下已读未读 | 142815 **queued** (claude-mm) | COOA-109 in_progress | 无 | ⚠️ 悬挂 |
| 运营对账平账看下 | 142816 **queued** (claude-mm) **＋** 142817 **running** (cmd, pid20578) | COOA-110 in_progress | 20578 | ⚠️ 一笔两记 (D1) |
| 单测一下用户登录流程 | 142822 **queued** (claude-mm) | COOA-111 in_progress | 无 | ⚠️ 悬挂 |

---

## 3. 差异清单 (未轧平项)

**D1 (高) 同意图两记 — 一笔业务两本收据, 无关联键**: 老板一句话「运营对账平账看下」在账本 A 落 **两** 条收据:
- `20261011T142816Z-wave286-baixiaosheng-ds` — task=`运营对账平账看下`, tool=`claude-mm` (**queued**) — 系 `hermes-boss-intent-dispatcher.sh` 依「单写者防重门禁」落本地证据腿 (commit 91fe08ab2);
- `20261011T142817Z-wave286-baixiaosheng-ds` — task=`【微信·老板·wave286】运营对账平账看下`, tool=`cmd` (**running**) — 系 Bridge 认领 COOA-110 后落执行腿。
两腿 `task` 文本不同 (一为原话、一为 issue 标题), `dispatch-dedup-check.mjs` 去重键 `(wave, task, agent, status=done)` **无法命中** → 账簿不能自动轧平。**本腿即活案例。**
> 根因: 双账簿 (证据腿 ↔ 执行腿) 之间**无 correlationId/统一业务键**。

**D2 (中) 悬挂 queued 孤儿腿 12 条 (跨数日累积)**: 均 `queued` 且无控制面承接/无锁:
`wave358/forge-core-swe` (10-08), `wave365/modou-fda`×2 (10-09), `wave-local/menshen-fdse` daily-e2e ×2 (10-10/10-11), `wave-local/duidiyuan` daily-tool-deploy (10-11), `wave-local/modou` daily-business-interview (10-11), `wave-local/forge-ii` 通知页 (10-11), `wave-local/baixiaosheng` weekly-risk-report (10-11), `wave286/baixiaosheng`×2 + `wave286/menshen` (10-11)。**无 TTL、无对账日报, 只增不减。**

**D3 (中) `tool` 字段账实不符**: 同意图证据腿 `142816.tool=claude-mm`, 而实际执行腿 `142817.tool=cmd` → 账本 A 内同业务两记工具相悖, 无法据此复算算力/工具用量。

**D4 (低) 异构 schema 收据 1 条**: `20261004-004750-wave292-forge-ii.json` 无 `schemaVersion`/`status`, 字段为 `wave/issue/issueId/ts/dispatchedBy/dispatchedTo` — 破坏收据状态机一致性 (沿用旧 DS-REPORT R9 同类问题)。

**D5 (中/产品) G7 产物不齐**: `agent-operations-ledger.md` / `system-inspection-report.md` 缺失 (账本 C)。

---

## 4. 风险清单 (R11–R15, 承接本 wave 既有 R1–R10)

| # | 风险 | 等级 | 建议 |
|---|---|---|---|
| **R11** | 双账簿无统一业务键 → 同意图两记无法自动轧平 (D1, 本腿活案例) | 高 | intent-dispatcher 生成 `correlationId` 同时写入证据腿与 issue; 或去重键改用 `(wave, normalized-task, agent)` 且含 queued/running 态 |
| **R12** | 悬挂 queued 孤儿腿无 TTL/平账 (D2, 已积 12 条跨 wave358/365) | 中 | 收据加 `expiresAt` 自动归档 + 对账日报推送未平项 |
| **R13** | 收据 `tool` 与实际执行工具不符 (D3) → 账实不符 | 中 | 执行腿收口时回写实际工具; 证据腿标 `recommendedTool` |
| **R14** | 异构 schema 收据 (D4) → 解析/门禁分叉 | 低 | 统一走 `dispatch-local-employee.sh` 收口 |
| **R15** | G7 产物不齐 (D5) | 中 | 补 `agent-operations-ledger.md` / `system-inspection-report.md` |

> 说明: 本波 R11–R15 与既有 R1 (write_receipt 整体重写)、R10 (Bridge 重启孤儿腿致重复派单) 同源 — 均为「收据状态机 ↔ 控制面状态」两轨不同步。

---

## 5. 解阻路径 (走向平账)

1. **PM/掌柜确认双账簿设计** (证据腿 142816 + 执行腿 142817) 是否为「单写者防重门禁」预期形态; 若是 → 立即补 `correlationId` 关联键 (R11);
2. **清 12 条悬挂 queued** (D2): 已无意义的 daily/跨 wave 项归档, 活跃项催办或重派 (R12);
3. **收口时回写实际工具** (R13), 统一 schema (R14);
4. **补 G7 两件产物** (R15), 保持零假 Demo 留空铁律 (`02_financial_reconciliation/` 与 `03_inspection/` 严禁编造流水);
5. 完成后 DS 复审放行。

---

## 6. 变更文件列表 (本腿)

| 文件 | 动作 |
|---|---|
| `docs-coolie/evidence/wave286/DS-RECONCILIATION-REPORT.md` | 新增 (本报告) |

**不碰**: 产品代码 / 派单机制脚本 / 本会话无关脏文件 (`scripts/*`、`server/*` 等在制改动) / 任何 secret / 任何 09_operations 财务台账 (零假 Demo)。

## 7. 验证命令与输出摘录

```sh
curl -s http://localhost:3100/api/health            # {"status":"ok",... commit 51b620d3ca}
ls .coolie-local/locks/                             # 仅 COOA-110.lock (内容 20578)
ps -p 20578 -o pid,ppid,etime,command               # dispatch-local-employee.sh --agent baixiaosheng-ds ... --tool cmd --execute (活)
ps aux | grep -E "runner-bridge"                    # 31409 node scripts/coolie-task-runner-bridge.mjs (活)
tail .coolie-local/logs/runner-bridge.log           # 自动认领 COOA-110: baixiaosheng-ds | 选用工具: cmd
curl -s .../companies/da2e705c.../issues            # COOA-109/110/111 in_progress; 余 104 条历史
find docs/09_operations -type f                     # tenant-governance.md + 2×.gitkeep
# 账本 A 统计: done 165 / failed 55 / cancelled 17 / queued 12 / blocked 5 / running 1 / undefined 1 = 256
```

## 8. 口径与局限

- **只读对账**: 未改任何产品代码/派单机制; 未发微信; 未触碰 secret; 未编造任何财务流水。
- **时点快照**: 账本 B 为 22:2x CST 快照, COOA-109/111 可能在后续 Bridge 轮次被认领 (届时悬挂自动消解); R11 (同意图两记) 系结构性差异, 不受时点影响。
- **账本 C 为零假 Demo 基线**: `02_financial_reconciliation/` 严格留空 = **合规**, 非缺陷; 真实外部流水产生后方按 SOP §4.4 生成。

---

*百晓生 (DS) · wave286 运营对账平账 · 2026-10-11 · COOA-110*
