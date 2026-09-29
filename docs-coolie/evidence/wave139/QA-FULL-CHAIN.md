# WAVE139 — 放宽「建设目标」解析 + 全链路末段复测 · QA 报告

- 日期: 2026-09-29
- 公司: `4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e`（xrobinai）
- 客户需求文档: `/tmp/req.docx`《某公司产融智能体应用系统集成服务项目技术规范书》75,521 B（与 wave129/136 同一份）
- 环境:
  - **Web** `https://www.xrobinai.cn/XROA`（Playwright 真登录 + 真截图）
  - **App** `Coolie工坊` Android 发布包（`emulator-5556` / `coolie-api28`；`agent-device` 真点击 + 截图）
  - **解析单元测试/前后对比** 本地 `server/`（vitest / tsx）
- 承接基线: `docs-coolie/evidence/wave136/QA-RERUN.md`（端到端 ≈ **80%**，只覆盖到「需求进入 + 描述目标补齐 + 建单 + 交付物预览」）
- 上位清单: wave136 §5 N3「描述补齐了、goals 没有 → 需放宽解析规则」、N4「拆解→交付→回写→done 未重跑」

> 铁律遵守: 结论均来自**真实 UI**（Web 真截图 / App `agent-device` 真点击截图）；API/curl 仅用于 **setup**（建项目、上传、采纳 WBS、指派、唤醒）与**真值对照**。
> 未改 `PAPERCLIP_API_KEY` / `DEPLOYMENT_MODE`。本轮**无 APK 发版**（未改 `clients/expo`）。

---

## 0. 结论速览

| | wave136 | wave139 |
|---|---|---|
| 解析「建设目标」（真规范书） | 0 条（文档形态，未崩溃） | **8 条**，且 0 正文段落泄漏 |
| 端到端「客户需求 → 交付」 | ≈ 80%（缺员工交付闭环） | **≈ 93%**（闭环，余 1 处半通） |

1. **A 解析**：同一份真 docx，旧解析器抽 **0** 条，新解析器抽 **8** 条 —— 全部来自 `2.3 系统功能` 的 Word 表行短标签（`智能体应用平台标准功能 / 系统配置 / …`），正文长段落一条未进。
2. **生产真验**：新建项目上传同一份 docx，`description` 由 `null` 补齐、`goals` **0 → 8**，**784ms** 内落库（远小于 1s 上限）。
3. **B 全链路末段**：`拆解 → 派发 → 员工交付 → 回写 → done` 在**真实生产**闭环 —— 数字员工 `core-swe-agent` 真运行、真产出文件、真回写评论、状态真置 `done`；Web 与 App 双端截图佐证。
4. **诚实标注的缺口**：WBS 采纳生成的任务落在 `backlog`，**仅「派发」不会唤起员工**（本次经「激活 backlog→todo」后交付成功）；本次员工交付是最小交付（建一个文件 + 评论回写），未覆盖 artifact/work product 上传与原型沙箱渲染。详见 §5。

---

## 1. A-1 · 解析前后对比（同一份真《技术规范书》）

**方法**：把 `/tmp/req.docx` 抽文本（截断 8,000 字，与线上 enrichment 同口径）后，分别喂给 **wave139 前**与 **wave139 后**的 `extractProjectGoals`。

| 解析器 | `goals` 条数 | 抽取内容 |
|---|---|---|
| 旧（pre-wave139，`f733c8e63^`） | **0** | — |
| 新（wave139） | **8** | 智能体应用平台标准功能 / 系统配置 / 角色管理 / 菜单配置 / 子账户管理 / 登录管理 / 组织信息 / 员工定义 |

- **为什么旧规则是 0**：旧规则只认 markdown 标题（`#`/`##`）与「`-/*/+` 或 `数字[.)、]` 后**带空格**」的列表项。这份规范书用的是**纯文本编号标题**（`2.1 技术目标`、`★2.2 技术要求`、`★2.3 系统功能`）+ **Word 表**（每格导出成一行），旧规则一条都命不中。
- **新规则加了什么**：编号标题形态（`2.1`/`3.1.1`、`一、`、`第X章`，容忍 `★☆※` 前缀）、列表项形态（`1.`/`1)`/`1、`/`（1）`）、以及「**裸序号开头的扁平表格行短标签**」（`1` → `智能体应用平台标准功能` → `系统配置` → …），并用 `looksLikeProse`（>40 字 / 含 `。；！？：` / 行尾 `，,`）把**正文段落**挡在门外。
- 证据: `parse-before-after.txt`

### 1.1 覆盖确认（任务点名的章节词 + 编号形态）

逐项落到单测（`project-document-enrichment.test.ts`，本轮新增参数化用例）：

- **章节词** `建设目标 / 项目目标 / 业务目标 / 建设内容 / 交付内容 / 业务场景 / 功能清单 / 建设范围`（+ `技术目标 / 功能模块 / 系统功能 / 目标 / 里程碑 / 交付`）—— 8 个逐个断言 ✅
- **英文** `goals / objectives / scope / deliverables` ✅
- **编号形态** `一、`（标题）· `1.` · `1)` · `1、` · `（1）` · `第X章` · markdown 列表（`-`/`*`/`+`）✅

### 1.2 保守约束复核（仍未变）

| 约束 | 现状 | 证据 |
|---|---|---|
| 最多 8 条 | ✅ 真 doc 正好截到 8 | `parse-before-after.txt` |
| 每条 ≤ 80 字 | ✅ 最长 11 字 | 同上 |
| **仅当项目当前无 goals 才写入** | ✅ `projectAlreadyHasGoals()` 守卫（`goalIds`/`goals` 任一非空即跳过） | 单测 `projectAlreadyHasGoals` |
| 异步失败静默 | ✅ `scheduleProjectDocumentEnrichment` 内 `catch → logger.warn`，不抛给上传方 | 代码 |
| 不拖慢创建（<1s） | ✅ 全量解析 **2.82ms/次**；生产实测 **784ms** 内落库 | `wave139-timing` / §2 |

单测结果: `project-document-enrichment.test.ts` **29 passed**（含本轮新增），连同 `wbs-draft.test.ts` 共 **33 passed**。证据: `tests.txt`

---

## 2. A-2 · 生产真验（`goals` 0 → N）

在**生产** `xrobinai` 公司下新建临时项目，上传同一份 docx，轮询项目详情：

| 阶段 | `description` | `goals` |
|---|---|---|
| 上传前 | `null` | **0** |
| 上传后 (+784ms) | `某公司产融智能体应用系统集成服务项目 技术规范书` | **8** |

抽取内容（生产实测，与离线一致）:

```
1. 智能体应用平台标准功能   5. 子账户管理
2. 系统配置                 6. 登录管理
3. 角色管理                 7. 组织信息
4. 菜单配置                 8. 员工定义
```

- 同一次 enrichment 还顺带产出 **WBS 草案 25 项**（wave140）。
- 上传返回 `201`，**没有阻塞请求**（异步补齐）。
- 证据: `prod-before.json`、`prod-before-project-detail.png`

> **诚实标注**：该实例此前已随更早的一次部署带上了 wave139 解析器（见 §8），所以这里的「0」来自**旧解析器代码在同一文本上的结果**（§1），不是线上旧版的一个实时快照。生产上「新建项目→上传→0→8」这一段本身是本轮**现场跑出来**的。

---

## 3. B · 全链路末段逐环节表（拆解 → 派发 → 员工交付 → 回写 → done）

环境: 生产 `xrobinai`，项目 `b0e465c4-3a06-49e6-93cc-e97ca3eebf9f`（wave139 真验项目），数字员工 `core-swe-agent`（`95069d63…`，`claude_local`）。

| # | 环节 | 结果 | 证据 |
|---|---|---|---|
| B1 | **拆解** — 采纳 WBS 草案 → 里程碑主线 | ✅ 生成 **25 个任务 / 6 个里程碑**（需求确认→架构/设计→详细设计→开发→测试验收→上线移交，各带门禁） | Web 项目页「里程碑主线 / 6 个里程碑」截图 `prod-ux/01-project-mainline.png`；`project.wbs_adopted` 审计 |
| B2 | **派发** — 指派数字员工 | ⚠️ 指派成功（`assigneeAgentId=95069d63…`），**但任务仍在 `backlog`，员工不会被唤起** | Web 任务详情「分配」；`prod/chain-watch.json` |
| B2' | （补）**激活** backlog → `todo` 后再唤醒 | ✅ | `prod/chain-2.json` |
| B3 | **员工交付** — 真实 agent 运行并产出文件 | ✅ 运行 `dec26111` `succeeded`；产出 `…/wave139-delivery.txt` | 运行事件 `run succeeded`；员工评论 |
| B4 | **回写** — 结论写回任务评论 | ✅ 员工评论含**文件路径 + 文件内容** | Web 任务详情评论；App 任务详情评论 |
| B5 | **done** — 状态闭环 | ✅ 任务状态 `done`（App 显示「已完成」） | Web `prod-ux/02-issue-done.png`；App `app/05-task-detail.png` |

**员工回写原文**（任务 `XROA-168`，接口 `GET /api/issues/:id/comments`）:

```
wave139 全链路末段复测交付完成。

- 文件路径：/home/ubuntu/.paperclip/instances/default/projects/4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e/b0e465c4-3a06-49e6-93cc-e97ca3eebf9f/wave139-before-1790664333497/wave139-delivery.txt
- 文件内容：wave139 员工交付自检通过

自检通过，状态置为 done。
```

双端 UI 佐证：
- **Web**：`XROA-168` 详情显示 `Status Done / Assignee core-swe-agent`，评论气泡即上面这段（`prod-ux/02-issue-done.png`）。
- **App**：全局搜索「上线移交」→ 首条 `上线移交阶段工作包 · 已完成 · 5 分钟前`；点开显示 `状态: 已完成 · 编号 f3b3a82e… · 评论(1) core-swe-agent: wave139 全链路末段复测交付完成。`（`app/03-search-results.png`、`app/05-task-detail.png`）。

---

## 4. 完整链路完成度

| 段落 | 步骤完成 | 说明 |
|---|---|---|
| 需求文档入库（落档 `coolie-docs/`） | ✅ | 上传 `201`，`project.document_added` |
| 解析补齐「描述 + 建设目标」 | ✅ | 描述补齐；goals **0 → 8** |
| 拆解（WBS 草案 → 采纳 → 里程碑主线） | ✅ | 25 任务 / 6 里程碑 |
| 派发（指派数字员工） | ⚠️ 半通 | 指派成功，但落 `backlog` 不触发员工（见 §5 G1） |
| 员工交付（真实 agent 运行 + 产出） | ✅ | `succeeded`，产出文件 |
| 回写（结论评论） | ✅ | 文件路径 + 内容 |
| done（状态闭环） | ✅ | `done`（双端可见） |
| **端到端「客户需求 → 交付」** | **≈ 93%** | 7 段中 6 段全闭环、1 段半通（6.5/7 ≈ 93%）|

对照 wave136 的 ≈80%：本轮把**缺失的员工交付闭环**补上了（B3/B4/B5），并修好了 wave136 点名的 goals=0（§1/§2）。

---

## 5. 发现 / 剩余缺口（如实标注）

| # | 现象 | 级别 | 说明 |
|---|---|---|---|
| **G1** | **WBS 采纳生成的任务落在 `backlog`，「派发」不会唤起员工** | P2 | 仅 `PATCH assigneeAgentId` 后员工**不会**动；必须先 `backlog → todo` 再唤醒才交付（`chain-watch.json` 显示指派后 5 分钟无进展，激活后 24 秒内 `done`）。让「采纳 WBS → 派发」这一段自动闭环，需要采纳时给任务一个可执行状态、或让唤醒把 backlog 指派视为待办。**产品决策项。** |
| G2 | 员工交付本轮只验「最小交付」 | — | 验的是「建一个文件 + 评论回写 + 置 done」。**未**覆盖 artifact / work product 上传、原型沙箱渲染（wave141 产物）在该链路上的联动。 |
| G3 | App 装机自检页「本版更新说明未取到」仍在 | P3 | 与 wave136 N1 相同，未变；不影响 OTA。App 显示 APK `v0.5.95` / OTA 运行时 `0.5.96`（App 自述「OTA 下发属正常」）。 |
| G4 | `goals` 补齐的「描述」是文档标题 | P3 | 该规范书首段是标题行，`description` 补成了「某公司产融智能体应用系统集成服务项目 技术规范书」（与 wave136 观测一致）。旧行为，未在本轮范围内改动。 |
| G5 | 本地 dev 实例本次不可用 | — | 本机多个波次并发（工作区里有别的会话未提交的 `ui/` 改动、多个嵌入 postgres、3100 未起），本地实例无法稳定复跑；B 全段改在**生产**完成（生产本就运行 HEAD）。 |

---

## 6. 复跑脚本与证据索引

- 复用 `scripts/e2e/wave129/lib.mjs` 的 Playwright 登录/截图思路；本轮脚本（`scripts/e2e/wave139/`，可重放）:
  - `prod-enrichment.mjs` — 建项目 + 上传 docx + 轮询 `description/goals` 0→N（§2）
  - `prod-chain.mjs` — 采纳 WBS → 指派 → 唤醒（§3 B1–B3）
  - `prod-dispatch.mjs` — 激活 `backlog→todo` + 再唤醒 + 轮询到 `done`（§3 B2'/B5）
  - `prod-watch.mjs` / `prod-issue.mjs` / `prod-runs.mjs` / `prod-run-inspect.mjs` / `prod-state.mjs` — 真值对照（评论、运行、审计）
  - `prod-ux-shots.mjs` — Web 项目页/任务页真截图
  - `probe-prod.mjs` / `probe-local-ui.mjs` — 环境探针
- 离线: `parse-before-after.txt`（0→8 对比）、`tests.txt`（单测）
- 证据目录:
  - `docs-coolie/evidence/wave139/prod-before.json`、`prod-before-project-detail.png`（§2）
  - `docs-coolie/evidence/wave139/prod/{chain-2.json,chain-watch.json,chain-01-project.png}`（§3）
  - `docs-coolie/evidence/wave139/prod-ux/{01-project-mainline.png,02-issue-done.png}`（Web 真截图）
  - `docs-coolie/evidence/wave139/app/{01..05-*.png}`（App 真点击截图）

## 7. 清理

- 生产验证对象（**保留供复查**）：项目 `b0e465c4-3a06-49e6-93cc-e97ca3eebf9f`（wave139 真验项目）及其 25 个 WBS 任务 / 6 里程碑，含闭环任务 `XROA-168`（`f3b3a82e…`）。理由: 报告与复跑脚本均指向该对象，删掉即不可复查；如需清理可直接 `DELETE /api/projects/:id`。
- 未创建任何临时 API key；未改 `PAPERCLIP_API_KEY` / `DEPLOYMENT_MODE`。

---

## 8. 发版（加固部署）——**未执行，原因如实说明**

**计划**：`scripts/deploy-coolie.sh`（护栏: 部署前后 `${PUBLIC_URL}/version.json`、`/ota/manifest` 各 200 + `/api/health`）。

**实际**：**未部署**。原因不是遗漏，而是**共享工作区脏**：

- `deploy-coolie.sh` 的 preflight 对**已跟踪文件的未提交改动**硬阻断（防「部署的东西对应不上任何 commit」）。当前 `git status --porcelain --untracked-files=no` 非空，且**不是本轮的文件**：
  ```
   M skills/paperclip-board/SKILL.md
   M ui/src/components/IssueAttachmentsSection.tsx
   M ui/src/lib/issue-attachments.ts
   M ui/src/pages/BoardChat.tsx
  ?? ui/src/components/SandboxedHtmlAttachment.tsx
  ?? ui/src/lib/issue-attachments.test.ts
  ```
  这是**另一个波次在本机同一工作区里的未提交改动**（HTML 附件沙箱/重构向）。
- 两条路都不可取：`--allow-dirty` 会把**别人未提交的 UI 改动连同服务器一起推到生产**；擅自 `stash`/`revert` 会打断**别人正在跑**的会话。按「不动他人进行中的工作」的原则，本轮不动它们。
- **功能上也没有欠账**：生产 `GET /api/health` 的 `commit` 与 `version.json.commitSha` 均为 `aad411515`（=`main` HEAD），而 wave139 解析器早在这次部署里就随 `f733c8e63`（wave140）上线了（§2 已在生产实测 `0→8`）。本轮我改的**唯一 server 文件是测试**（`project-document-enrichment.test.ts`），不进运行时。

**发版护栏基线（本轮实测，部署前）**：

| 端点 | 状态 |
|---|---|
| `https://xrobinai.cn/version.json` | **200**（`version 0.5.96`，`commitSha aad411515`） |
| `https://xrobinai.cn/ota/manifest` | **200** |
| `https://xrobinai.cn/api/health` | **200** |

**建议**：待该并行波次提交/清空后，重跑 `scripts/deploy-coolie.sh` 即可（对本次 wave139 而言实际是无功能变化的空部署）。

本轮**无 APK 发版**（未改 `clients/expo`）。
