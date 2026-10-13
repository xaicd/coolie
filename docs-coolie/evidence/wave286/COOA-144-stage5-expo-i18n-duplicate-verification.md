# COOA-144 Stage 5 Expo App i18n 真机验收 — 重复件复核与归档存证

- 工单: COOA-144 【微信·老板·wave286】派门神立即接手 COOA-134 Stage 5 Expo App 移动端 i18n 与 Web 端 zh-CN/en 契约对齐，跑真机验收
- 员工: 兑底渊 (PRE-SRE / 8a288a46-8598-4c68-b52e-545360e11929)
- 结论: **重复件 (duplicate) — 真实验收已由 COOA-131/132/133 三件套闭环，本件归档 done**

## 1. Echo · 高管交付 Outcome

Stage 5 的核心业务阻碍是「Expo 原生端界面中英文混杂，且与 Web 控制面 `zh-CN`/`en`
文案漂移」。该阻碍已由 wave380 三件套真实关闭：

| 件 | 角色 | 结论 | Commit |
| :--- | :--- | :--- | :--- |
| COOA-131 | Expo i18n 语言包与 Web 契约对齐 (实现) | done | `7d9e237cb` |
| COOA-132 | 验收金标 (真机走查) | done | `5a4ca4820` |
| COOA-133 | 真机单测验收 (契约守卫 + 拓扑 + DB 真值) | done | 证据工件 `a35c57ad` |

COOA-144 (wave286) 与 COOA-134 (backlog) 与上述三件实质重叠，为同一交付物的重复派发。

## 2. Delta · 真实验证存证 (本次复核, 2026-10-13)

| 验收项 | 命令 | 结果 |
| :--- | :--- | :--- |
| i18n 契约守卫 | `node scripts/check-expo-i18n.mjs` | ✅ R1–R6 全绿 · **934 键 / 23 命名空间** · `EXIT=0` |
| 中英混杂归零 | (同上 R3/R4/R6) | ✅ en 无残漏汉字 · zh-CN 无中英混排 · 源码无残留英文 UI |
| Web 契约逐字一致 | (同上 R5a/R5b) | ✅ 23 命名空间键值与 Web `ui/src/i18n/locales` 逐字一致 |
| 拓扑探测 | `lsof -nP -iTCP -sTCP:LISTEN` | ✅ Node 控制面 `:3100` · Postgres `:54329` 在监听 (Dev 无 Caddy) |
| DB 真值 | `GET /api/companies/:id/issues` | ✅ HTTP 200 · `COOA-131/132/133=done` |
| 提交权威 | `git branch -r --contains` | ✅ `7d9e237cb` 与 `5a4ca4820` 均在 `origin/main` |
| origin 头 | `git rev-parse --short origin/main` | `f6f06bac9` |

真机快照存证 (COOA-132 工件总线):
- `live-ui-320x700.png` (6 寸屏 320px 走查, `scrollWidth==innerWidth==320`)
- `live-ui-390x844.png`

## 3. 处置

- COOA-144 → **done**，引用 COOA-131/132/133 三件套与 commit `7d9e237cb` / `5a4ca4820`。
- COOA-134 → 维持 `backlog`（无 assignee；Stage 5 验收已闭环，留待 stage 编排统一收口）。
- 未做任何越权 cancel / 删除；仅按 Routine 建议归档关闭本重复件。
