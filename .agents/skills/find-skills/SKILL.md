---
name: find-skills
description: 需要扩展智能体能力时，从开放 Agent Skills 生态（skills.sh）发现、审计并安装现成 Skill。适用于「找一个能做 X 的 skill」「有没有现成能力」「怎么扩展数字员工/智能体能力」等场景。落地前强制审计第三方 SKILL.md、安全标记与出网行为，装后必须同步 AGENTS.md §5.1.5 索引。
---

# Find Skills（开放生态 Skill 发现与准入）

本 Skill 是项目接入开放 Agent Skills 生态（[skills.sh](https://www.skills.sh/)）的**唯一受控入口**。

> **宪法**：优先复用项目本地 `.agents/skills/`（AGENTS §5.1.5）；本地确实没有、且属于可复用通用能力时，才从开放生态引入。引入必须走「发现 → 审计 → 准入 → 同步索引」四步，禁止 `curl | bash` 式盲装。

---

## 一、何时使用

- 用户问「怎么让数字员工/智能体具备 X 能力」「有没有现成的 skill for X」
- 需要某域能力（视频/图像/文档/浏览器自动化/抓取/文案/协同）而本地无对应 Skill
- 想评估某个 skills.sh 上的 Skill 能否接入本项目

**不使用**：本地已有等价 Skill（如 `docx/` `xlsx/` `course-commerce-generation/` `agent-browser`）时，直接复用本地，不引入平行实现（AGENTS §1 零重复门禁）。

---

## 二、四步准入流程（强制）

### 第 1 步 · 发现
1. 先查 [skills.sh 排行榜](https://www.skills.sh/)，按安装量/来源判断是否为「久经考验」选项。
2. 再按关键词检索：`npx skills find <query> [--owner <owner>]`。
3. 质量门槛：**安装量 ≥ 1K 优先**，**来源优先官方**（`vercel-labs` / `anthropics` / `microsoft`），**仓库 star < 100 需高度警惕**。

### 第 2 步 · 审计（不审计不安装）
- 读**真实 `SKILL.md`**（skills.sh 只给 stub，须拉 GitHub raw），确认它实际做什么。
- 看 skills.sh 页面的**安全审计标记**（Gen Agent Trust Hub / Socket / Snyk）；出现 `Fail`/`Warn` 必须先弄清原因。
- 列出**依赖与出网**：需要的 CLI/运行时（Node 版本、FFmpeg、Chromium）、外部账号/token、默认遥测、成功后的公共反馈上报、`--file-issue` 之类会向公共 URL 发内容的命令。
- 对照 **AGENTS §0.1 无状态** 与 **deployment-workflow §2 凭据禁落盘**：任何密钥只能经远端 env / 内存传递，禁止写入仓库或日志。

### 第 3 步 · 准入决策
- **通过**：能力为本项目真实所需、无高风险出网、凭据可控 → 安装并按第 4 步同步。
- **有条件通过**：需先关掉遥测/公共上报、或需专用 token → 在项目内记录开关与凭据来源后才可用。
- **拒绝**：低信任来源（star 极低 / 需登录来路不明 SaaS）、与本地已有 Skill 重复、或引入不可控 egress → 记录拒绝原因，改用本地能力或自建。

### 第 4 步 · 落地与同步（pre-commit 门禁）
- 安装：`npx skills add <owner/repo@skill>`（`-g -y` 为全局+免确认，项目内落地请落到 `.agents/skills/`）。
- **必须**在 `AGENTS.md` §5.1.5 表格补一行 `` `find-skills/` `` 形式的索引，否则 `.husky/pre-commit` 门禁 3 直接拦截。
- 详见 `.agents/skills/pre-commit-environment-check/SKILL.md`。

---

## 三、数字员工（digital-employee）相关已验证结论（2026-09-27 审计）

用户面向「数字员工」选型时的既有审计结论，避免重复调研：

| Skill | 结论 | 理由 |
| :--- | :--- | :--- |
| `vercel-labs/skills@find-skills` | ✅ 已准入 | 纯文档、零依赖、零密钥、零出网；本技能即其项目适配版 |
| `anthropics/skills` 的 `pptx/pdf/docx/xlsx` | ♻️ 本地已有 | 已随 `docx/` `xlsx/` + `course-commerce-generation/` 落地，勿重复引入 |
| `heygen-com/hyperframes` | ⚠️ 高价值/重接入 | HTML→视频（GSAP），适合课程/商品/口播视频；需 **Node ≥22 + FFmpeg**、约 15 个子技能树，且默认遥测 + 成功渲染后向**公共频道**发反馈。**须先做受限 spike 并关闭 egress**，勿直接落库 |
| `qu-skills/superpowers@ai-avatar-video` | ❌ 拒绝 | 来源仓库 star=1，依赖第三方 `belt`(inference.sh) 登录，Socket 告警；信任不足 |
| `browser-use/browser-use@browser-use` | ⚠️ 暂缓 | 与本地 Playwright + 内置 `agent-browser` 能力重叠，AGENTS §1 禁平行实现 |
| `coreyhaines31/marketingskills` 的 `copywriting/seo-audit` | ⚠️ 可选 | 商品文案/直播话术/店铺 SEO，属通用能力；引入前评估是否与业务字典/文案规范冲突 |
| RunComfy 视频/图像模型族（`prime-skills/runcomfy-agent-skills`） | ⚠️ 可选 | 可补多模态模型池，但为第三方付费 SaaS（需 token），须先解决凭据与合规 |

---

## 四、反例（禁止）

- ❌ 未读真实 `SKILL.md` 就推荐/安装（只凭 skills.sh 名称或 stub）
- ❌ 在有安全审计 `Fail`/`Warn` 且未弄清原因时直接安装
- ❌ 引入与本地 Skill 重复的平行能力（AGENTS §1）
- ❌ 让第三方 Skill 默认遥测/公共上报在项目内跑通
- ❌ 新增 `.agents/skills/**` 却不同步 AGENTS §5.1.5（pre-commit 门禁拦截）
