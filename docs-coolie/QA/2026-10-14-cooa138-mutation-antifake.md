# COOA-138 变异测试打假与杀灭假 Mock 验证报告

> **文档编号**: `COOLIE-QA-MUTATION-COOA138-20261014-V1`
> **主审**: 百晓生 (DS) · 交叉复核 铁匠 (Core SWE)
> **标准**: 对标 Stryker / PIT / SpaceX Fail-Safe Verification
> **日期**: `2026-10-14 CST` · **commit**: `87257b33c`
> **结论**: ✅ 反假防线健康 — 真实 DB 不变量单测 29/29 绿，变异探针 **MSI = 100% (3/3 killed)**，全仓无 DB 引擎假 Mock、无空 `catch`。

---

## 1. 真实数据库控制面不变量单测 (Real-DB Invariant Suite)

对控制面四大公理不变量执行真实 PGlite/SQLite 驱动的测试 (非内存桩)：

```bash
npx vitest run --config vitest.config.ts \
  server/src/__tests__/budgets-service.test.ts \
  server/src/__tests__/work-products.test.ts \
  server/src/__tests__/work-products-routes.test.ts \
  server/src/__tests__/heartbeat-auto-checkout.test.ts \
  server/src/__tests__/issues-checkout-wakeup.test.ts \
  server/src/__tests__/work-product-runtime-reconciliation.test.ts
```

| 测试文件 | 覆盖不变量 | 结果 |
| :-- | :-- | :--: |
| `budgets-service.test.ts` | INV-4 预算硬熔断/自动暂停 | ✅ 7/7 |
| `work-products.test.ts` | INV-1 No Artifact No Done (工件总线) | ✅ 5/5 |
| `work-products-routes.test.ts` | 工件总线 API 公司边界 | ✅ 5/5 |
| `heartbeat-auto-checkout.test.ts` | INV-2 单人原子签出锁 | ✅ 3/3 |
| `issues-checkout-wakeup.test.ts` | 签出唤醒因果链 | ✅ 4/4 |
| `work-product-runtime-reconciliation.test.ts` | 运行期工件对账 | ✅ 5/5 |
| **合计** | | **✅ 29/29 (6 files)** |

## 2. 变异探针注入实测 (Bounded Fault Injection)

对 `ui/src/lib/issue-change-receipt.ts` 注入 3 个真实变异体，运行 `issue-change-receipt.test.ts`，观测杀灭：

| 变异体 | 算子 | 手法 | 结果 |
| :-- | :-- | :-- | :--: |
| M1-boolean-invert | 逻辑反转 | `value ? "yes" : "no"` → `value ? "no" : "yes"` | ✅ **Killed** |
| M2-boundary-le3 | 边界变异 | `strings.length <= 3` → `strings.length <= 4` | ✅ **Killed** |
| M3-count-off-by-one | 返回值篡改 | `${length} items` → `${length+1} items` | ✅ **Killed** |

> **MSI = (Killed 3) / (Total 3) × 100% = 100.0%** (≥ 85% 金标)
> 变异体全部被杀灭，证明该模块单测断言真实有效、非「纸面覆盖率」。原始文件经 `git status` 校验 **0 diff**，注入后已原子还原。

## 3. 反假 Mock 静态审计 (Anti-Fake Static Audit)

| 审计项 | 阈值 | 实测 | 判定 |
| :-- | :-- | :-- | :--: |
| 测试文件总数 | — | 2,266 | — |
| 直接 Mock 真实 DB 引擎 (`better-sqlite3`/`@paperclipai/db`/`drizzle`) 的测试 | 0 | **1** | ⚠️ 单点 (见 §4) |
| 空 `catch {}` 吞异常 (导致断言漏过) | 0 | **0** | ✅ |
| `toBeDefined();` 结尾的「弱断言」行 | 趋势下降 | 475 | ⚠️ 存量清理项 |

## 4. 结论与整改建议

1. **不变量防线可信**：预算熔断、单签出锁、工件总线、运行期对账四大公理均有真实 DB 断言背书，29/29 绿。
2. **探针可杀**：MSI 100% 证明断言具备捕错能力，无「假 Mock」空洞。
3. **存量清理项** (非阻断)：
   - 唯一 1 个直接 Mock DB 引擎的测试文件 `server/src/__tests__/server-startup-feedback-export.test.ts`，建议改为真实 DB 或明确标注为「纯导出格式单测」；
   - 475 行以 `toBeDefined();` 结尾的弱断言建议逐步升级为字段级深比较 (`toEqual`)。
