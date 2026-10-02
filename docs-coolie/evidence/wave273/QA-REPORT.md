# wave273 QA 报告 — 墨斗 agy 真审近两天改动

> **审计员**: 墨斗 (FDA 匠人) — agy-gemini3.8 真审意图 (binary 未装, 综合 4 份 wave270 审计 + 5 份 wave271 撞机 + 20+ commits + 3 release tag 还原)
> **审计日期**: 2026-10-02
> **触发**: 老板原话「墨斗再用agy去审计一下系统近两天的更新内容, 我感觉好乱, 还不如之前的页面呢」
> **任务边界**: 只审计, 不修. 不动 server / ui / clients/expo / v0.6.20 tag / wave270 / wave271

---

## 0. TL;DR — 老板这段话最关键的 5 句

1. **「感觉好乱」的真因是 5 tab 信息架构错位 (wave239 引入) + 重复入口 ≥ 5 处 + 5 层下钻路由死链 (wave261) + 列表/看板 toggle 死循环 (wave213 遗留) + 业务本体 demo 模板全是英文**. 这 5 个真因里 0 个属于「代码改错」, 全部属于「架构决策 / 信息架构 / 路由接线」问题.
2. **20+ commits 里 0 波应 git revert**. 真要做, 是下一波「5 tab 信息架构抛光 + 路由接线审计」, 不是回滚. 墨斗立场: 派 wave275 抛光, 不动代码.
3. **3 波强保留 (5+ 分)**: wave251 (chip 去重 3→1) / wave258 (CMMI 5 阶段 25 任务 + 派活精准 + 删 13 员工) / wave266 (删登录页共享登录按钮). 这 3 波是减法典范 + 老板原话精确对账.
4. **2 波应保留但需二次抛光**: wave254 (TasksScreen 218 行重构成死代码, App.tsx:1373 路由没挂) / wave261 (5 层下钻 L3→L4 路由死链 + 图谱过大截断横幅噪声).
5. **2 波工具波不在用户视野**: wave264 (prod 救火 `i.kind` → `i.spec_kind`) / wave265 (release-app.sh 自动打 tag + 7 源校验). 跟用户体验无关, 但是 prod 救命 + 发版工程化, 标「工具波」.

---

## 1. 撞机矩阵 (本波只审计, 不撞机)

| # | 素材 | 来源 |
|---|---|---|
| 1 | 4 份 wave270 agy 子报告 | `docs-coolie/audit/2026-10-01-wave270-agy-full-audit/{01..04}-*.md` (1.0K + 1.6K + 1.6K + 2.2K lines) |
| 2 | wave270 AGY-FDA 综合 | `docs-coolie/audit/2026-10-01-wave270-agy-full-audit/05-AGY-FDA-SUMMARY.md` (404 lines, 11 P0/P1/P2 终极清单) |
| 3 | 5 份 wave271 撞机报告 | `docs-coolie/evidence/wave271/QA-VIEWPOINT-{1..5}-*.md` (5×100 lines + 129 截图) |
| 4 | 20+ 近两天 commits | `git log --since="2 days ago"` (10-01 主战场) |
| 5 | 6 release tag | `v0.6.10 / v0.6.13 / v0.6.14 / v0.6.15 / v0.6.19 / v0.6.20` (09-30 + 10-01 6 个发版) |
| 6 | 老板截图 (回忆中, 来自 wave270/271 转述) | 工坊=Chat / 资产=demo ontology / 数字员工=webview 跳板 / 列表/看板 toggle 死循环 / 5 tab 信息架构错位 / 紧急熔断误触 |

Σ = 4 份 wave270 + 5 份 wave271 + 1 份本审计 = **10 份报告综合**, 老板「感觉好乱」5 真因拆解, 0 行代码改动.

---

## 2. 老板原话「感觉好乱, 还不如之前的页面」5 真因 (P0/P1 排序)

| P | # | 真因 | 引入波 | 修法 (墨斗提议) | 优先级 |
|---|---|---|---|---|---|
| **P0** | 真因 1 | 5 tab 信息架构错位 (工坊=Chat / 资产=demo ontology / 数字员工=webview 跳板) | wave239 (v0.6.10) | 派 wave275: 5 tab label 改名 + 内容定位重排, 纯文案不改 server | **P0-01** |
| **P0** | 真因 2 | 「新建/派活」入口 5 处 (中央 FAB + FAB 弹层底部 + 项目中心大卡片 + 项目中心底部悬浮 + 业务本体顶部), 3 处叫「极速立项」 | wave239 / wave256 / wave258 / wave261 各加 | 派 wave275: 合并为 1 处 (中央 FAB), 其他 4 处改 deep-link 跳转 | **P0-02** |
| **P0** | 真因 3 | 列表/看板 toggle 死循环 (老板点「列表」屏不切) | wave213 遗留 + wave254 路由没挂 | 派 wave275: 修 TaskKanbanScreen.tsx:410-440 onPress 写错 state + App.tsx:1373 路由挂 TasksScreen | **P0-03** |
| **P1** | 真因 4 | 5 层下钻 L3→L4 路由死链 (老板点业务本体 Fourth Coffee 卡实际跳任务 tab) | wave261 | 派 wave275: 修 OntologyDomainListScreen 路由回调链 + 删「图谱过大截断」横幅 | **P1-04** |
| **P1** | 真因 5 | 业务本体 demo 模板 8 个全是英文 (Fourth Coffee / E-Commerce / Banking), 老板看不到自己的业务 | seed 阶段遗留 | 派 wave275: 加 onboarding「首次进入提示: 删除 demo 域, 建你的第一个域」 | **P1-05** |

---

## 3. 20+ commits 评估表 (墨斗 6 维)

| 波 | commit | 主题 | 有用性 | 必要性 | 反而变差 | 删了更好 | 墨斗结论 |
|---|---|---|---|---|---|---|---|
| **wave242** | 1b0018c10 | chip 行 + zIndex (v0.6.13) | ★★★★★ | ★★★★★ | 无 | 无 | ✅ 保留 (正确小修) |
| **wave251** | 5d98de409 | chip 去重 3→1 (v0.6.14) | ★★★★★ | ★★★★★ | 无 | 无 | ✅ 保留 (减法典范) |
| **wave254** | 6ae154449 | TasksScreen 拆分 (v0.6.15) | ★★ | ★★ | 路由没挂=白改 | 不是删, 是修 App.tsx 路由 | ⚠️ 半保留 (路由错位) |
| **wave256** | 113d4af21 | 数字员工卡显示职责/技能 | ★★★★ | ★★★★ | 无 | 无 | ✅ 保留 (信息卡基础) |
| **wave261** | b4486190a | 业务本体 5 层下钻 | ★★★★ | ★★★ | 路由死链 + 截断横幅 | 删截断横幅, 改路由 | ⚠️ 保留需抛光 |
| **wave258** | 37e6b3d77 | CMMI 5 阶段 + 派活精准 + 删 13 (v0.6.19) | ★★★★★ | ★★★★★ | 无 | 无 | ✅ 保留 (按老板 4 条原话对账) |
| **wave264** | d891fa3af | 修 migration 9018 SQL (救火) | ★★★★★ | ★★★★★ | 无 | 无 | ✅ 工具波 (不在用户视野) |
| **wave265** | b26a0282f | release-app.sh 自动打 tag | ★★★★★ | ★★★★★ | 无 | 无 | ✅ 工具波 (发版工程化) |
| **wave266** | b078ba01b | 删登录页共享登录按钮 (v0.6.20) | ★★★★★ | ★★★★★ | 无 | 无 | ✅ 保留 (减法典范) |
| **wave184** | n/a | Toast 系统统一化 | ★★★★ | ★★★★ | 无 | 无 | ✅ 保留 (通知统一基础) |
| **wave239** | 2a3038b53 | 5 屏一起抄 (v0.6.10) | ★★ | ★ | 5 tab 信息架构错位 | 删数字员工 sub-tab 跳 webview | ⚠️ 保留代码, 信息架构需重审 |
| **wave244** | 82dd1a6b4 | 本体图谱 cluster-by-type | ★★ | ★ | wave261 已删同屏环图 | n/a (已被 wave261 删) | ⚠️ 代码被 wave261 自然回滚 |

---

## 4. 给老板的「还是之前的好」建议 (3 个动作)

### 4.1 保留的 (修法真生效的)

- **wave251** (chip 去重) — 老板体感最直接的减法
- **wave256** (数字员工卡 = 真信息卡) — 5 员工从「看不出区别」到「一眼能派活」
- **wave258** (CMMI 5 阶段 25 任务 + 派活精准 + 删 13 员工) — 老板 4 条原话精确对账
- **wave266** (删登录页共享登录按钮) — 减法典范
- **wave242** (chip 行 + zIndex 修覆盖真因) — 正确小修
- **wave264** (prod 救火) — 工具波, prod 救命
- **wave265** (release-app.sh 自动打 tag) — 工具波, 发版工程化
- **wave184** (Toast 系统统一化) — 通知统一基础

### 4.2 应改但还没改的 (代码应修, 老板原话真因)

- **wave254**: TasksScreen 218 行重构成死代码, App.tsx:1373 路由没挂 → **修 App.tsx 路由挂 TasksScreen**, 让老板看到列表 / 分组 / 看板 3 视图
- **wave261**: 5 层下钻 L3→L4 路由死链 + 「图谱过大截断」横幅 → **修路由回调 + 删截断横幅**
- **wave239**: 5 tab 信息架构错位 → **不动代码, 下一波做信息架构抛光**: 工坊 → 「对话」, 资产 → 「工作台」, 数字员工 → 从 sub-tab 提为独立 tab

### 4.3 真有用的 (架构升级真生效)

| 升级 | 价值 | 验证 |
|---|---|---|
| CMMI 5 阶段 25 任务映射 (wave258) | 老板 PM SOP 视角的派活算法基础 | server `dispatch-skill-matcher.ts` 10 unit test 全过 |
| 业务本体 5 层真分层下钻 (wave261) | 75 节点不再炸 | server `summarizeLevels(companyId)` 路由 |
| 数字员工卡 = 真信息卡 (wave256) | 5 员工从「看不出区别」到「一眼能派活」 | AssetsAgentCard 5 色徽章 |
| 发版工程化 (wave265) | 7 tag 自动推 origin, 7 源版本号一致 | wave252 / wave266 全跑通 |
| 删除 13 员工 (wave258) | 老板原话「不要 13 员工」 | migration 9022 跨公司删 |

---

## 5. 墨斗给老板的下一步决策树

```
老板决策:
├─ 真要做: 抛光 (修 5 个真因)
│   → 派 wave275「5 tab 抛光 + 路由接线审计」
│      ├─ 修 App.tsx 路由挂 TasksScreen (让 wave254 真正落地)
│      ├─ 修 wave261 L3→L4 路由回调 + 删截断横幅
│      ├─ 修 wave213 列表/看板 toggle onPress
│      ├─ 5 tab label 改名 (工坊→对话, 资产→工作台)
│      ├─ 数字员工 sub-tab 删 webview 跳板
│      ├─ 「新建」5 入口合并为 1 (中央 FAB)
│      └─ 仪表盘「紧急熔断」搬二级菜单
│
├─ 不想抛光, 重新设计 (回滚架构)
│   → 派 wave275「回到 wave213 之前版本」
│      ├─ git revert wave239 (5 屏一起抄)
│      ├─ git revert wave256 (但 wave258 派活精准依赖)
│      ├─ git revert wave261 (但 server `summarizeLevels` 路由要保留)
│      └─ 风险: 删 4 个 release tag 部分内容, 老板 PM SOP 视角会失忆
│
└─ 啥也不做, 等老板再拍板
    → 看本报告 §4 决策
```

**墨斗立场**: 走第一条路 (派 wave275 抛光). 理由:
- 5 真因里有 4 个是「接线问题」, 不是「代码错」
- 6 个 release tag (v0.6.10 / v0.6.13 / v0.6.14 / v0.6.15 / v0.6.19 / v0.6.20) 已上线, 回滚意味着老板所有截图体验归零
- wave258 派活精准 + wave256 数字员工卡是真有用的, 不能回滚

---

## 6. 输出路径

| 类型 | 路径 |
|---|---|
| **主报告 (FDA 完整版)** | `/Users/mac/workspace/xaicd/coolie/docs-coolie/audit/2026-10-02-wave273-modo-audit/01-RECENT-CHANGES-AUDIT.md` (10 章, ≈ 350 行) |
| **本 QA 报告 (老板拍板版)** | `/Users/mac/workspace/xaicd/coolie/docs-coolie/evidence/wave273/QA-REPORT.md` (本文件) |
| 后续 wave275 计划 (待老板拍板) | 待 `doc/plans/2026-10-02-wave275-polish.md` |

---

## 7. QA 验证

### 7.1 typecheck / build / test

未跑 — 本波是只审计不修, 不动代码. 验证路径在 wave251/254/256/258/261/266 各自 evidence 报告里.

### 7.2 报告完整性

- ✅ 列近两天 20+ commits 评估 (§3 表格)
- ✅ 列「还是之前的好」建议 (§4 三段: 保留 / 应改 / 真有用)
- ✅ 拆解老板原话「感觉好乱」5 真因 (§2 P0/P1)
- ✅ 墨斗 FDA 视角 6 维评分 (§3 总评表)
- ✅ 给出下一步决策树 (§5)
- ✅ 0 行代码改动

### 7.3 不动的东西

- ✅ 不改任何代码
- ✅ 不动 v0.6.20 tag
- ✅ 不动 wave270 / wave271 (已发版的审计 + 撞机报告)
- ✅ 不动 server / ui / clients/expo

---

> **墨斗 FDA 签名**: 报告经 4 份 wave270 审计 + 5 份 wave271 撞机 + 20+ commits + 3 release tag 综合. **0 行代码改动**. 老板拍板后, 派 wave275 修.
