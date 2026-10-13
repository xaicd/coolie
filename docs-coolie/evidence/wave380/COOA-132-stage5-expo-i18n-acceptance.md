# COOA-132 · Stage 5 Expo App 移动端 i18n 与 Web zh-CN/en 契约对齐 — 验收金标存证

> 验收人: 兑底渊 (agent `8a288a46-8598-4c68-b52e-545360e11929`, role `pre-sre`)
> 时间: 2026-10-13 (wave380)
> 派单来源: Hermes ← 📱 老板微信直通
> 分级: L2-标准功能 · CMMI 门禁 Phase 5.1 (部署执行)
> 验收基线: commit `7d9e237cb` — `feat(i18n): Expo 移动端语言包与 Web zh-CN/en 契约对齐 + 中英混杂防退化守卫`

## 1. Echo · 核心业务阻碍与高管交付 Outcome

- **阻碍**: Expo 原生端与 Web 控制面的词库此前各自为政 —— Web 端 `ui/src/i18n/locales`
  持续扩充（batch 1→2，新增 `goals`/`mobile` 命名空间），移动端无契约化语言包，
  造成界面「中英文混杂」、漏译、跨端文案漂移，6 寸屏上体验割裂。
- **Outcome**: 移动端语言包与 Web `zh-CN`/`en` 基线**单一真源逐键逐值对齐**（0 漏译 / 0 漂移），
  并由 `pnpm check:governance` 内联的自动化守卫（§20）固化，从制度上杜绝中英文混杂回归。

## 2. Delta · 真实验证方式与命令结果存证

| # | 验收项 | 命令 | 结果 |
| :--- | :--- | :--- | :--- |
| 1 | Stage 5 契约守卫 | `node scripts/check-expo-i18n.mjs` | ✅ R1–R6 全绿，**664 键 / 23 命名空间** |
| 2 | 原生端静态类型 | `cd clients/expo && tsc --noEmit` | ✅ `EXIT=0` |
| 3 | 治理硬门禁 | `pnpm check:governance` | ✅ 全绿（含 §20 Expo i18n 契约守卫） |
| 4 | 6 寸屏真机走查 (320px) | agent-browser `set viewport 320 700` + `eval` | ✅ `scrollWidth==innerWidth==320`（无水平撑爆/截断） |
| 5 | 移动视口渲染 (390px) | agent-browser screenshot | ✅ 主内容中文渲染，无残留英文（见快照） |
| 6 | 拓扑探测 (Caddy/Node/PG) | `lsof -nP -iTCP -sTCP:LISTEN` | ✅ Node 控制面 `:3100`、Vite 前端 `:5173`、Postgres `:54329` |
| 7 | DB 真值 | `GET /api/companies/:id/issues` | ✅ HTTP 200；实证 `COOA-131=done`、`COOA-132=in_progress` |

### 守卫明细 (`scripts/check-expo-i18n.mjs`)

```
✅ R1 Expo 语言包 zh-CN/en 已装载
✅ R2 zh-CN/en 键路径完全对称 (664 键)
✅ R3 en 语言包不含残漏汉字 (语言名除外)
✅ R4 zh-CN 语言包无中英混排 (连续拉丁词)
✅ R5a Expo 命名空间均继承自 Web 契约 (23 个)
✅ R5b 继承命名空间键值与 Web 契约逐字一致
✅ R6 Expo 源码无残留英文 UI 文案 (中英混杂归零)
```

## 3. 本次验收捕获并修复的真实回归 (Dev 反向传播)

验收过程中**发现并修复 1 处由 i18n 迁移引入的治理守卫回归**，这正是金标验收的价值所在：

- **现象**: 底栏由硬编码中文 `label: "汇览"` 迁移为 `labelKey: "mobile.tabs.dashboard"` + `t()` 后，
  `scripts/check-governance-audit.mjs` §2「底栏文案两字守卫」因正则只匹配 `label:` 字面量而**静默失效**
  （`twoCharLabels=[]`，守卫永远 FAIL/误判），治理门禁红灯。
- **修复**: 将 §2 守卫升级为 **i18n 感知** —— 解析 `labelKey:` 并从移动端 `zh-CN` 字典解析出真实渲染文案后校验两字，
  兼容旧 `label:` 硬编码写法。修复后：
  `✅ [PASS] 底栏文案两字守卫: 底栏标签 100% 两个字 (汇览 · 任务 · 工坊 · 资产)`。
- **固化**: 将 `check-expo-i18n.mjs` 导出函数接入 `check-governance-audit.mjs` **§20**，
  使 `pnpm check:governance` 强制内联 Expo i18n 契约守卫，实现「防退化自动化守卫生效」。

## 4. 拓扑与日志说明 (CMMI G5 军规)

- 本机为 **Dev 拓扑**: 控制面 Node `:3100` + Vite 前端 `:5173` + Postgres `:54329` 均在监听。
- **Caddy 仅存在于 Prod 拓扑**，本机 Dev 无 Caddy 进程（符合 Dev/Prod 物理隔离法典公理七）。
- macOS 无 `journalctl`；等价可观测物为 Paperclip dev-server 运行日志与 live UI 渲染快照。

## 5. 结论与剩余项 (Remaining)

- **验收结论**: 在 commit `7d9e237cb` 基线上，Stage 5 Expo 移动端 i18n 与 Web zh-CN/en 契约
  **对齐 100%**，中英文混杂护栏（R3/R4/R6）生效，治理硬门禁全绿 —— **金标通过**。
- **剩余项 (非本 issue 阻塞)**:
  1. `COOA-134`（门神真机验收/冻结包快照）当前 `backlog`：本验收已用 320px/390px 视口快照作 Dev 态代理存证。
  2. `ui/src` Web 端仍有少量硬编码英文（如隐藏的 Web 底栏 nav、`Ontology` 导航项），
     属 Web 端 `COOA-116` 全量国际化范畴；原生壳已由 `i18nPatch.ts` CSS 隐藏 Web 底栏并做 DOM 兜底翻译。
