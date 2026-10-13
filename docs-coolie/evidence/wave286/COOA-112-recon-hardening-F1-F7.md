# COOA-112 · G7 运营对账平账硬化 F1–F7 闭环报告

> **工单**: COOA-112 `[G7·运营] 运营对账平账硬化 F1–F7 (真实流水启动前闭环)` (父 COOA-110)
> **波次**: wave286 / wave-local · **执行员工**: 铁匠 (ForgE · `forge-core-swe` · 平台核心研发) · **引擎** `cmd`
> **仓库**: `/Users/mac/workspace/xaicd/coolie` · **分支** `main`
> **上游**: COOA-110 DS 核验 `docs-coolie/QA/2026-10-11-wave286-COOA-110-运营对账平账-DS核验.md` (§四 F1–F8) · SOP `docs/09_operations/tenant-governance.md`
> **日期**: 2026-10-11 (CST) · **性质**: 真实端到端运行, 本报告即交付物

---

## 0. 一句话结论

DS 核验发现的 **F1–F7 硬化缺口全部闭环**, `pnpm check:governance` **GOV_EXIT=0 全绿** (含新增 F1–F7 守卫 + F6 模板守卫)。
F8 (P3 跨项目骨架不一致) 不在本次派单范围 (派单明示 F1–F7)。

---

## 1. 并发写者说明 (诚实标注)

本波存在**双写者**：COOA-112 的 Hermes 心跳腿（`hermes chat`, pid 58678, 22:39–22:46）与本腿（`forge-core-swe` 派单腿, 引擎 `cmd`）几乎同时作业同一 SOP。
经取证：Hermes 腿先行落盘了 SOP §4.2.1–§4.3.1 / §六 F1–F5 + F6 算法描述、`scripts/signature.cjs` (F6 实现) 与 `check-governance-audit.mjs` 16.1.1–16.1.7 F1–F7 守卫。
本腿在 Hermes 退出后接管为**单写者**，完成其遗留缺口（F6 模板未落地、F7 链接断链、§五 清单未对齐）并做端到端验证。全程使用「读后写」保护，未发生内容覆盖。

---

## 2. F1–F7 逐项闭环

| 编号 | 等级 | 缺口 | 闭环落点 | 状态 |
|---|---|---|---|---|
| **F1** | P1 | 空账期 (0 流水日) 口径未定义 → INV-5 卡死无交易日提现 | SOP §4.2.1：`is_empty_day` 判定 + 仍落空日结 (`status=balanced`) + 提现闸门豁免 (`reason=no_business_day`) | ✅ |
| **F2** | P1 | 差额调账缺 maker-checker (与 INV-6 不一致) | SOP §六：`ops:recon:adjust` 强制 `approver != applicant`，违者 `403 FORBIDDEN_SELF_APPROVE`；共用 `ForbiddenSelfApproveException` | ✅ |
| **F3** | P1 | 长款处置无 owner / SLA / 终态 | SOP §4.3 矩阵新增 owner/SLA/超时兜底/终态列 + §4.3.1 状态机 (`pending_review → {resolved, force_closed}`) | ✅ |
| **F4** | P2 | 短款自动补单缺幂等/去重锚 | SOP §4.2.2：幂等键 `vendor_txn_id` + `pay_recon_replay_log` NO-OP + `uk_replay_vendor_txn` 唯一约束 | ✅ |
| **F5** | P2 | 跨日/部分退款 `recon_date` 归属未定义 | SOP §4.2.3：按外部渠道清算日 `vendor_settled_at` 归属，标注 `recon_date_source` | ✅ |
| **F6** | P2 | 报告校验指纹算法未定义 + 模板未输出 | SOP §4.4 定义 `sha256(canonicalJSON(payload))`；`scripts/signature.cjs` 落地 `computeReconciliationFingerprint` / `verifyReconciliationFingerprint`；**脚手架 reconciliation 模板显式输出 `fingerprint` 字段**（本腿补齐） | ✅ |
| **F7** | P2 | 上游契约断链 (引用不存在的 `docs/02_requirements/software-requirements.md`) | SOP 头注删除 `02_requirements/` 断链；指向现存法定真源（COOA-97 SRS + 平台合同/产品定位），**相对链接全部可解析**（本腿修正断链 href） | ✅ |

---

## 3. 变更文件清单

| 文件 | 动作 | 归属 |
|---|---|---|
| `docs/09_operations/tenant-governance.md` | 修改：F1–F6 硬化正文（Hermes 腿）+ 本腿补 F7 头注链接修正、§五 F1–F7 清单行 | 本腿 + Hermes 腿 |
| `scripts/signature.cjs` | 新增：F6 指纹库 (`computeReconciliationFingerprint` / `verifyReconciliationFingerprint`，纯内置 crypto) | Hermes 腿 |
| `scripts/cmmi-asset-scaffold.cjs` | 修改：reconciliation 模板显式输出 `fingerprint` + F1/F3/F4/F5 字段区 | 本腿 |
| `scripts/check-governance-audit.mjs` | 修改：16.1.1–16.1.7 F1–F7 守卫 (Hermes 腿) + 本腿 F6 模板指纹输出守卫 | 本腿 + Hermes 腿 |
| `docs-coolie/evidence/wave286/COOA-112-recon-hardening-F1-F7.md` | 新增：本报告 | 本腿 |

**未触碰**：产品代码 / 派单机制脚本 / 其它在制脏文件 (`server/*`、`scripts/e2e/*` 等) / 任何 secret / `docs/09_operations/02_financial_reconciliation/` 财务台账（严守零假 Demo）。

---

## 4. 验证命令与输出摘录

```sh
# F6 指纹库自证 (稳定/可复现/可验篡改)
node -e "const s=require('./scripts/signature.cjs');const r={reportId:'B-DEMO',reconDate:'2026-10-11',tenantId:1001,totalOrderCount:12,totalPayAmount:'128.00',totalRefundAmount:'0.00',diffCount:0,status:'balanced',generator:'@ops-recon',generatedAt:'2026-10-11T14:00:00Z'};const fp=s.computeReconciliationFingerprint(r);console.log(fp,s.verifyReconciliationFingerprint(r,fp),s.verifyReconciliationFingerprint({...r,diffCount:1},fp));"
# → 57769d2c…278e6d true false

# F6 模板真实产出 (临时项目生成后即刻清理)
node scripts/cmmi-asset-scaffold.cjs new --project __sigcheck --phase 09 --type reconciliation --slug SIGCHECK --real
grep -n "fingerprint" projects/__sigcheck/docs/09_operations/02_financial_reconciliation/*.md
rm -rf projects/__sigcheck
# → 7:- **fingerprint**: sha256:<待回填> …

# F7 头注链接逐一解析 (从 docs/09_operations/ 出发)
# → OK ../../docs-coolie/specs/2026-10-10-cooa-97-community-life-service-mvp-srs.md
# → OK ../../doc/SPEC-implementation.md ; OK ../../doc/PRODUCT.md

node scripts/cmmi-asset-scaffold.cjs check   # → ✅ 0 散落 / 0 假 Demo  EXIT=0
pnpm check:governance                        # → 🎉 全绿 GOV_EXIT=0
#   16 节含: F1 空账期 / F2 maker-checker / F3 长款终态 / F4 短款幂等 /
#            F5 跨日归属 / F6 指纹算法 + fingerprint lib + 模板指纹输出 / F7 上游契约修复  全 ✅ [PASS]
```

---

## 5. 三视角价值锚点 (wave298 铁律)

- **Echo (业务价值)**：真实资金流水启动前，打通 0 流水日平账、调账双人复核、长款终态兜底、短款防双入账、跨日退款归属、报告防伪指纹、上游契约可追溯 —— 直接消除 INV-5/INV-6 触发的业务死路与内控失效。
- **Delta (真实环境验证)**：非 Mock。指纹库实跑出 64 位 SHA-256 并验证稳定/复现/篡改检测；脚手架模板真实生成含 `fingerprint` 的报告；头注链接真实解析；`pnpm check:governance` GOV_EXIT=0。
- **Dev (自动化守卫沉淀)**：`check-governance-audit.mjs` 固化 F1–F7 反退化守卫（含本腿补的 F6 模板指纹输出守卫），任何后续删改将导致编译级门禁 Exit 1。

---

## 6. 未验证 / 局限 (诚实标注，严禁写 PASS)

| 项 | 状态 | 原因 |
|---|---|---|
| 真实三方轧差 (A/B/C 实跑)、真实资金流水 | **未验证** | 无真实外部资金流水；严守零假，不得伪造 |
| 指纹在真实对账上报流水线二处的线上校验 | **未验证** | 无运行中对账服务；当前仅保证算法/模块/模板就绪 |
| F8 跨项目骨架一致性 (sys-chanrong-agent 缺槽位) | **未闭环** | 派单范围为 F1–F7；F8 为 P3，建议另单跟踪 |

---

*铁匠 (ForgE · forge-core-swe) · wave286/COOA-112 · G7 运营对账平账硬化 · 2026-10-11*
