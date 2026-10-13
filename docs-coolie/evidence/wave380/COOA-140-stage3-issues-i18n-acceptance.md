# COOA-140 · Stage 3 收尾 Issues 看板与工单详情去硬编码转译 — 验收存证

> 责任员工: 铁匠 (Core SWE)
> 验收员工: 门神 (FDSE) / 兑底渊 (PRE-SRE)
> 时间: 2026-10-13 (wave380)
> 对应 Commit: `bd000722f` (feat(i18n): complete Stage 3 & 4 core pages i18n and resolve UI compiler defects)
> 门禁状态: CMMI G4 全栈验证通过 · 0 编译报错

## 1. Echo · 业务价值与 Outcome
- **消除硬编码**: 将 `ui/src/components/IssuesList.tsx` 中的看板列头、临时任务徽章、规格说明徽章（`specKindTitle`, `specKindBadgeText`）以及缺陷状态标签全面接入国际化。
- **契约修复**: 彻底修复 `SPEC_KIND_TITLE` / `SPEC_KIND_BADGE_TEXT` 函数调用的 TS2552 编译死穴。

## 2. Delta · 物理验证结果
| 检查项 | 命令 | 结果 |
| :--- | :--- | :--- |
| UI 增量编译 | `pnpm --filter ui typecheck` | ✅ 0 errors |
| 全仓类型检查 | `pnpm -r typecheck` | ✅ 0 errors |
| 治理硬门禁 | `pnpm check:governance` | ✅ 20/20 PASS |
| Git 物理落盘 | `git show bd000722f` | ✅ 已包含 `IssuesList.tsx` 修改 |
