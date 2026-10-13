# COOA-133 · Stage 5 Expo App i18n 语言包对齐 — 真机单测验收存证

> 验收人: 兑底渊 (agent `8a288a46-8598-4c68-b52e-545360e11929`)
> 时间: 2026-10-13 (wave380)
> 派单来源: Hermes ← 📱 老板微信直通
> 分级: L2-标准功能 · CMMI 门禁 Phase 5.1

## 1. Echo · 核心业务阻碍与 Outcome

- **阻碍**: Expo 原生端与 Web 控制面的词库此前各自为政 —— Web 端 `ui/src/i18n/locales`
  持续扩充（batch 1→2，新增 `goals` / `mobile` 命名空间），而移动端无契约化语言包，
  造成界面「中英文混杂」、漏译、跨端文案漂移。
- **Outcome**: 移动端语言包与 Web `zh-CN`/`en` 基线**单一真源逐键逐值对齐**，
  并由 `pnpm check:governance` 内联的自动化守卫固化，消除中英文混杂并杜绝回归。

## 2. Delta · 真实验证方式与命令结果存证

| 验收项 | 命令 | 结果 |
| :--- | :--- | :--- |
| Stage 5 契约守卫 | `node scripts/check-expo-i18n.mjs` | ✅ R1–R6 全绿，**664 键 / 23 命名空间** |
| 治理硬门禁 | `pnpm check:governance` | ✅ 全绿（含 §20 Expo i18n 守卫） |
| 原生端类型 | `cd clients/expo && npx tsc --noEmit` | ✅ EXIT=0 |
| 控制面拓扑 | `lsof -nP -iTCP -sTCP:LISTEN` | ✅ Node 控制面 `:3100`、Vite 前端 `:5173`、Postgres `:54329` 均在监听 |
| DB 真值 | `GET /api/companies/:id/issues` | ✅ HTTP 200，实证 COOA-131/132/133 = `in_progress` |

### 守卫明细 (`check-expo-i18n.mjs`)

```
✅ R1 Expo 语言包 zh-CN/en 已装载
✅ R2 zh-CN/en 键路径完全对称 (664 键)
✅ R3 en 语言包不含残漏汉字 (语言名除外)
✅ R4 zh-CN 语言包无中英混排 (连续拉丁词)
✅ R5a Expo 命名空间均继承自 Web 契约 (23 个)
✅ R5b 继承命名空间键值与 Web 契约逐字一致
✅ R6 Expo 源码无残留英文 UI 文案 (中英混杂归零)
```

### 治理门禁 (§20 片段)

```
🌐 20. Expo 移动端 i18n 契约同步防退化守卫 (Stage 5):
  ✅ R1..R6 全部 [PASS]
🎉 全面管局审计全绿通过！
```

## 3. 拓扑与日志说明 (CMMI G5 军规)

- 本机为 **Dev 拓扑**: 控制面 Node `:3100` + Vite 前端 `:5173` + Postgres `:54329`。
- **Caddy 仅存在于 Prod 拓扑**，本机 Dev 无 Caddy 进程（符合 Dev/Prod 物理隔离法典）。
- macOS 无 `journalctl`；等价物为 Paperclip dev-server 运行日志
  （`.paperclip/dev-server-status.json` 记录 `dirty=true`，末次变更 `2026-10-13T12:34:38Z`）。

## 4. 结论与剩余项 (Remaining)

- **验收结论**: 在当前工作树上，Stage 5 i18n 契约对齐**条件通过** ——
  守卫 / 治理 / 类型三项全绿，中英文混杂护栏 (R3/R4/R6) 生效。
- **剩余项**:
  1. Stage 5 实现归 `COOA-131`（门神/FDSE），当前仍 `in_progress` 且**未提交**（工作树 WIP，
     键数分钟级增长 634→664）。最终签署须待其提交/冻结。
  2. 冻结构建上的**真机快照**（6 寸屏 320px 视口无截断）归 `COOA-134`（门神真机验收）。
- 本 issue 通过 first-class blocker 依赖 `COOA-131`；其 `done` 后自动唤醒复跑终验。
