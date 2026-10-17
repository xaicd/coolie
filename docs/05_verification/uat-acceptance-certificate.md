# Coolie AI 原生商业软件交付工厂控制面平台 · 客户终验核销单 (UAT Acceptance Certificate)

> **单据编号**: `COOLIE-UAT-COOA138-20261014-03`
> **生成方式**: 由 `SignOffUat` 动作链自动生成 (m6 端到端旅程 step 7)
> **项目**: Coolie AI 原生商业软件交付工厂控制面平台
> **公司**: Coolie 本地施工总社 (`COOA`)
> **生成日期**: `2026-10-14 CST` · **版本**: `0.6.57` (versionCode 657) · **基线 commit**: `824e289df` (tag `v0.6.57`)
> **签署日期**: `2026-10-14 CST` · **签署人**: 掌柜 / 甲方 (`local-board`) · **签署动作**: `SignOffUat` (审批 [05690721](/COOA/approvals/05690721-b702-42a3-a52a-580cce3dab84))
> **法定状态**: **✅ 已签署生效 (SIGNED & EFFECTIVE)**

---

## 一、门禁核验结果 (依据 CMMI 证据账本 `.coolie-local/evidence-ledger/cooa138.json`)

| 门禁 | 名称 | 签署角色 | 状态 | 依据 |
| :--: | :-- | :-- | :--: | :-- |
| G0 | 需求与立项 | PM · Hermes | ✅ passed | 立项资产与活体本体模型 m1~m7 落盘 |
| G1 | 架构与技术选型 | FDA · 墨斗 | ✅ passed | `ontology/domain.json` 5 大不变量 + DAR |
| G2 | 详细设计与契约 | Core SWE · 铁匠 | ✅ passed | `docs/03_design` (11 文件) + interface-contracts |
| G3 | 编码构建与实现 | Core SWE · 铁匠 | ✅ passed | 控制面不变量单测 29/29 绿；变异探针 MSI=100% |
| G4 | 全栈验证与体验 | **DS · 百晓生** | ✅ **passed (复试 GO)** | F1 闭幕后原始 i18n 键外泄归零；`check:ui-i18n`/`check:governance`/守卫单测全绿 |
| G5 | 发版投产与交付 | PRE-SRE · 兑底渊 | ✅ **passed** | 7 处版本指纹 100% 一致 `0.6.57`；投产 SOP [COOA-75](/COOA/issues/COOA-75) done |

**门禁闭环**: **6/6 ✅ 全部达标** — `gate-evidence-ledger.sh --verify cooa138 --strict` → **exit 0**。全部门禁质量准则满足，仅余**法定签署动作**。

## 二、甲方视角核验结论

| 核验维度 | 结论 |
| :-- | :-- |
| 端到端业务旅程 | ✅ 全面通过 (13 段旅程；第 9 步「例行任务」页 F1 已闭环，无代码键外泄) |
| 语义隔离 | ✅ 通过 (首轮 F1 的 `routines.*` 代码键外泄已清除) |
| 临界场景 (0/1/海量/超长/特殊字符/重复提交) | ✅ 全部通过，含 XSS 转义安全 |
| 变异测试充分性 | ✅ MSI=100% (探针 3/3)，真实 DB 不变量 29/29 绿 |
| 横向回归抽检 | ✅ 12 页面 0 真实键外泄 |
| 不可变证据挂载 | ✅ 见 §三 |

## 三、不可变证据挂载清单 (No Artifact, No Done)

| 证据 | 类型 | 路径 / 实体 |
| :-- | :-- | :-- |
| DS 对抗走查报告 (首轮 NO-GO) | 文档 | `docs-coolie/QA/2026-10-14-cooa138-ds-adversarial-walkthrough.md` |
| **DS G4 复试报告 (GO)** | 文档 | `docs-coolie/QA/2026-10-14-cooa138-ds-g4-reverification.md` |
| 变异测试打假报告 | 文档 | `docs-coolie/QA/2026-10-14-cooa138-mutation-antifake.md` |
| 真机/浏览器截图 (首轮 11 张 + 复试 4 张) | 快照 | `docs-coolie/evidence/cooa138/*.png` · `docs-coolie/evidence/cooa138-r2/*.png` |
| CMMI 门禁证据账本 | 机器证据 | `.coolie-local/evidence-ledger/cooa138.json` |
| **活体本体物化证据 (域 `coolie_ai`)** | 机器证据 | `docs-coolie/evidence/cooa138-r2/ontology-materialization.json` |
| **活体本体对象 (4 类对象 + 1 动词 + 9 实例 + 8 血缘边)** | 本体对象 | Paperclip 活体本体域 `coolie_ai` (`07829118-943a-4388-8638-608cbb102cd2`) |
| 回款结算触发登记 | 台账 | `docs/09_operations/2026-10-14-cooa138-uat-settlement-trigger.md` |
| Paperclip 工件总线 | 工件 | 见 COOA-138 `issue_work_products` |

## 四、核销裁决

> **裁决: ✅ 已签署生效 (SIGNED & EFFECTIVE)。** 六道 CMMI 门禁 (G0~G5) 全部达标，掌柜 / 甲方负责人已于 `2026-10-14 15:15:45Z` 经审批 [05690721](/COOA/approvals/05690721-b702-42a3-a52a-580cce3dab84) **批准生效**（裁决语：「准予通过。F1 (routines i18n) 已彻底修复并固化守卫，G4 门禁复试放行，同意核销。」），`SignOffUat` 动作链执行完毕。
>
> **生效结果**:
> 1. ✅ 本核销单**正式生效**，COOA-138 商业交付终验核销闭环达成；
> 2. ✅ 回款结算触发已登记 — 见 `docs/09_operations/2026-10-14-cooa138-uat-settlement-trigger.md`（真实事件：验收批准；实际回款金额待商务入账，未发生不虚记）。`docs/09_operations/02_financial_reconciliation/` 按公理十 (Zero Fake Demo) 保持 `.gitkeep` 空基线，仅在实际外部流水发生后存入对账产物；
> 3. ✅ 活体本体对象已物化 — 域 `coolie_ai` 生成 4 类对象 + 1 类动词 (`SignOffUat`) + 9 个对象实例 + 8 条血缘边，详见 §三「活体本体物化证据」。
>
> **范围说明 (Dev/Prod 隔离 + 持续演进)**: 本核销单验收对象为平台发布版本 `v0.6.57`，**非**终止 `Coolie 工坊 AI 原生交付工厂本体系统` 项目本身。该项目为持续演进旗舰，其交付主线例行巡检 (公理四 §9) 保持 `in_progress` 存续；项目级终验完成属独立的治理裁决，不由本单触发。
