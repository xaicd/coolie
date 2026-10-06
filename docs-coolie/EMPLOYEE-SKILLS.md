# 5 员工 × Skills 完整映射 (wave278 全清版, 2026-10-02)

> **目的**: 老板原话 "本地员工, 各自需要使用到的 skills 都清楚了吗" — 把 5 员工每个岗位需要的
> skills 一行行落实, PM (Hermes) 派活时直接照表选 skill, 不靠记忆.
>
> **wave278 变更** (本档瘦身, 砍 §3 缺失 11 skill 待办列表, ~3 KB):
> - **保留**: §0 + §1 5 员工 × 全 P0/P1/P2 skill 表 (派活真值)
> - **精简**: §3 缺失 11 skill 待办列表 — 已并入 [INDEX.md](INDEX.md) 的"波次计划"备注, 不重复列
> - **保留不动**: §4 装载机制 + §5 PM SOP 补充 + §6 PM 自查 + §7 不动
>
> **适用范围**: 老板本地 (Mac) 5 员工 — 铁匠 / 门神 / 兑底渊 / 墨斗 / 百晓生.
> 主 agent Hermes 不算员工, 派活靠本表 + [PM-DISPATCH-QUICKCARD.md](PM-DISPATCH-QUICKCARD.md).
>
> **不动**: `server/src/services/agent-assign.ts` / `AGENT_ROLES` enum /
> `ROLE_MAPPING` (wave222 算法层); `ui/` / `clients/expo/`; `server/`; `skills/` 仓库内
> 已有 skills 内容.
>
> **真因 (老板原话)**: "本地员工, 各自需要使用到的 skills 都清楚了吗" — 之前员工岗位 +
> CMMI 任务维度都有了, 但 skill 维度没明确, PM 派活时哪些 skill 该启用得靠员工自己猜.
>
> **wave236 改**: 老板原话 2 条 (2026-09-30): "agy 恢复了应该可以用" + "claude-ds 也不能用,
> 换 cmd, claude-mm". **墨斗 (FDA) 默认切回 agy** (2026-09-30 ~7 天后恢复), cmd 作为紧急兜底.
> **兑底渊 (PRE-SRE) 工具改 cmd + claude-mm** (替换 claude-ds). claude-ds 标"不可用, 配额紧" —
> 仅百晓生 SRE 临时大任务按量兜底.

---

## 0. 文档约定

- **5 员工** = 铁匠 (`core-swe`) / 门神 (`fdse`) / 兑底渊 (`pre-sre`) / 墨斗 (`fda`) /
  百晓生 (`ds`). 详细岗位档案见 `TEAM-MAPPING.md` §1.2.
- **Skill 来源**:
  - **仓库内** `.agents/skills/<name>/` (上游 fork 共识, 全部软链, wave228 起统一)
  - **本地** `~/.claude/skills/` (Claude Code CLI 默认加载路径)
  - **跨 CLI** `~/.cmd/skills/` / `~/.agy/skills/` / `~/.copilot/skills/` (各 CLI 启动加载)
- **Skill 状态**:
  - ✅ **EXISTS** — `.agents/skills/<name>/SKILL.md` 实际存在, 仓库 72 个 skill 中之一
  - 🔗 **SYMLINKED** — 已在 `~/.claude/skills/<name>` 等本地路径建立软链 (wave232 install)
  - ⚠️ **MISSING** — 老板 brief 列了但仓库 / 本地都**没有**, 标 ⚠️ 等后续 wave 创建
- **优先级**: P0 = 必装 / 派活必带; P1 = 重要, 多数场景带; P2 = 备用, 按任务类型带.
- **加载机制** (跨 CLI):
  - `claude` / `claude-mm` / `claude-glm` (老板备用) / `claude-ds` → `~/.claude/skills/` (wave234 起: claude-mm 主线)
  - `cmd` (`@commandcode/ai`) → `~/.cmd/skills/` (待 wave228 mcp 安装齐后启用)
  - `agy` (Gemini CLI) → `~/.agy/skills/` (目前 agy 不自动加载 skill, 标 P2)
  - `copilot` → `~/.copilot/skills/` (目前无 skill 加载机制, 标 P2)

---

## 0.5 wave280-285 增补登记 (回填, 2026-10-03)

> wave278 全清版之后的**新增 skill 补登**, 不改下方 §1 各员工主表。
> 路由与引入政策见 `.agents/skills/README.md` (wave285)。

| Skill (P 级) | 归属/使用员工 | 用途 | 出处 |
|---|---|---|---|
| `agy-gemini-cli` (P0) | 墨斗 | 用 agy-gemini3.8 (Antigravity CLI) 的操作真值 (docker exec/中文 base64/配额) | wave280 |
| `local-team-toolchain` (P0) | 全员 (Hermes 派单必读) | 跨环境 (Docker 容器 vs Mac 宿主) 7 工具池调度权威: host-exec/dispatch/context-bus/门禁账本 | wave284 |
| `coolie-boss-decision-log` (P1) | Hermes (PM) | 记录老板拍板决策点, 跨班次交付时对齐 | wave268 前后 |
| `hr-agent-onboarding` (P1) | Hermes (PM) | 新员工/新 agent 入职装配流程 | wave258 |
| `company-creator` (P2, upstream) | 墨斗/百晓生 | agentcompanies/v1 公司包脚手架 (上游资产, 不改) | upstream |

**wave285 定版**: aja-pc/wenlv 系统 32 个定制 skills 曾引入后**全量回滚** (commit `36bb09d94` → `ee66f7a36`) — 老板原话「定制的 skills 就别乱学习」。定制 skill 内嵌对方环境绑定, 学习思想须基于 coolie 栈重写。

---

## 1. 5 员工 × Skills 映射主表

### 1.1 铁匠 (Forge / `core-swe`) — **cmd (`@commandcode/ai` CLI) 主 (wave234 起), claude-mm 兜底**

**岗位**: 主力写代码 + 架构 + 集成. Phase 3 设计 / Phase 4 开发 全阶段主.

| Skill | 路径 (仓库 / 本地) | 状态 | P | 使用场景 |
|---|---|---|---|---|
| `core-swe` | `.agents/skills/core-swe` ↔ `~/.claude/skills/core-swe` | ✅ 🔗 | P0 | 角色主 skill — 编译器/静态守卫挡错 |
| `paperclip` | `skills/paperclip` ↔ `~/.claude/skills/paperclip` | ✅ 🔗 | P0 | Paperclip 工坊 API (issue / 派单 / 验收) |
| `paperclip-board` | `skills/paperclip-board` ↔ `~/.claude/skills/paperclip-board` | ✅ 🔗 | P0 | 工坊对话模式 (与老板 / Hermes 对话) |
| `paperclip-dev-workspace-run-verify-fix` | `.agents/skills/...` ↔ `~/.claude/skills/...` | ✅ 🔗 | P1 | 隔离 dev workspace 跑 / 验真 / 修复 |
| `paperclip-create-plugin` | `.agents/skills/...` ↔ `~/.claude/skills/...` | ✅ 🔗 | P1 | 创建 Paperclip 外部 plugin |
| `paperclip-page` | `.agents/skills/...` ↔ `~/.claude/skills/...` | ✅ 🔗 | P2 | 发静态 HTML 到 Paperclip 页面 |
| `swe-delivery-flow` | `.agents/skills/swe-delivery-flow` ↔ `~/.claude/skills/...` | ✅ 🔗 | P0 | 复现优先 → 日志/DB 根因 → 最小修 |
| `bug-fix-flow` | `.agents/skills/bug-fix-flow` ↔ `~/.claude/skills/...` | ✅ 🔗 | P1 | bug 修复流程 (复现 → 隔离 → 修) |
| `spec-driven-dev` | `.agents/skills/spec-driven-dev` ↔ `~/.claude/skills/...` | ✅ 🔗 | P1 | 写 Kiro-style spec 后再编码 |
| `system-design-spec` | `.agents/skills/system-design-spec` ↔ `~/.claude/skills/...` | ✅ 🔗 | P1 | 系统设计 spec (Phase 3.1) |
| `cmmi-req-spec` | `.agents/skills/cmmi-req-spec` ↔ `~/.claude/skills/...` | ✅ 🔗 | P1 | CMMI 需求 spec (Phase 2.3) |
| `cmmi-tech-solution` | `.agents/skills/cmmi-tech-solution` ↔ `~/.claude/skills/...` | ✅ 🔗 | P1 | CMMI 技术方案 (Phase 3.1) |
| `cmmi-detailed-contracts` | `.agents/skills/cmmi-detailed-contracts` ↔ `~/.claude/skills/...` | ✅ 🔗 | P1 | CMMI 详细契约 (Phase 3.2) |
| `cmmi-wbs-milestone` | `.agents/skills/cmmi-wbs-milestone` ↔ `~/.claude/skills/...` | ✅ 🔗 | P1 | CMMI WBS 拆解 (Phase 2.2) |
| `cmmi-immutable-release` | `.agents/skills/cmmi-immutable-release` ↔ `~/.claude/skills/...` | ✅ 🔗 | P2 | CMMI 不可变发版 |
| `create-agent-adapter` | `.agents/skills/...` ↔ `~/.claude/skills/...` | ✅ 🔗 | P2 | 创建新 agent adapter (跨 server/UI/CLI) |
| `create-paperclip-bundled-skill` | `.agents/skills/...` ↔ `~/.claude/skills/...` | ✅ 🔗 | P2 | 创建 Paperclip 内置 skill (上架 catalog) |
| `frontend-design` | `.agents/skills/frontend-design` ↔ `~/.claude/skills/...` | ✅ 🔗 | P1 | 前端设计系统 (DESIGN.md) |
| `create-issue-interaction-ui` | `.agents/skills/...` ↔ `~/.claude/skills/...` | ✅ 🔗 | P2 | 创建 issue 交互 UI |
| `doc-maintenance` | `.agents/skills/doc-maintenance` ↔ `~/.claude/skills/...` | ✅ 🔗 | P1 | README/SPEC/PRODUCT 文档维护 |
| `skill-creator` | `.agents/skills/skill-creator` ↔ `~/.claude/skills/...` | ✅ 🔗 | P2 | 创建新 skill (按规范) |
| `fork-sync` | `.agents/skills/fork-sync` ↔ `~/.claude/skills/...` | ✅ 🔗 | P0 | 同步上游 Paperclip (冲突解决) |
| `check-pr` | `.agents/skills/check-pr` ↔ `~/.claude/skills/...` | ✅ 🔗 | P1 | 检查 PR 评论 / CI 失败 |
| `pr-gardening` | `.agents/skills/pr-gardening` ↔ `~/.claude/skills/...` | ✅ 🔗 | P1 | PR inbox 整理 (批量回复 / 关闭 stale) |
| `pr-report` | `.agents/skills/pr-report` ↔ `~/.claude/skills/...` | ✅ 🔗 | P2 | 出 maintainer-grade PR 报告 |
| `prcheckloop` | `.agents/skills/prcheckloop` ↔ `~/.claude/skills/...` | ✅ 🔗 | P1 | 跑 PR 检查到绿 (直到通过) |
| `prepare-paperclip-pr` | `.agents/skills/...` ↔ `~/.claude/skills/...` | ✅ 🔗 | P1 | 准备 Paperclip PR (冲突预检) |
| `deploy-workspace-symlinks` | `.agents/skills/...` ↔ `~/.claude/skills/...` | ✅ 🔗 | P1 | 部署 workspace 软链 |
| `mcp-builder` | `.agents/skills/mcp-builder` ↔ `~/.claude/skills/...` | ✅ 🔗 | P1 | 创建 MCP server (跨 API 集成) |
| `diagnose-why-work-stopped` | `.agents/skills/...` ↔ `~/.claude/skills/...` | ✅ 🔗 | P1 | 诊断 issue tree 卡死 / 循环 |
| `ops-task-orchestration` | `.agents/skills/...` ↔ `~/.claude/skills/...` | ✅ 🔗 | P2 | 任务编排 (排班 / 派单 / 单兵) |
| `deal-with-security-advisory` | `.agents/skills/...` ↔ `~/.claude/skills/...` | ✅ 🔗 | P2 | 处理 GitHub Security Advisory |
| `garden-inbox` | `.agents/skills/garden-inbox` ↔ `~/.claude/skills/...` | ✅ 🔗 | P2 | GitHub inbox 整理 (issue/PR) |
| `internal-comms` | `.agents/skills/internal-comms` ↔ `~/.claude/skills/...` | ✅ 🔗 | P2 | 内部沟通 (公告 / 通知) |
| `ota-cache-busting` | `.agents/skills/...` ↔ `~/.claude/skills/...` | ✅ 🔗 | P1 | OTA 缓存破坏 (清缓存 hash) |
| `ota-launchasset-hash` | `.agents/skills/...` ↔ `~/.claude/skills/...` | ✅ 🔗 | P1 | OTA launchAsset hash 一致性 |
| `ota-runtime-version-consistency` | `.agents/skills/...` ↔ `~/.claude/skills/...` | ✅ 🔗 | P1 | OTA runtimeVersion 一致性 |
| `ota-caddy-fallback-trap` | `.agents/skills/...` ↔ `~/.claude/skills/...` | ✅ 🔗 | P2 | OTA Caddy fallback 陷阱排查 |
| `apk-installation-cache` | `.agents/skills/...` ↔ `~/.claude/skills/...` | ✅ 🔗 | P2 | APK 安装缓存 |
| `release-flow` | `.agents/skills/release-flow` ↔ `~/.claude/skills/...` | ✅ 🔗 | P2 | release 流程串联 |
| `release` | `.agents/skills/release` ↔ `~/.claude/skills/...` | ✅ 🔗 | P2 | 协调 Paperclip 全 release |
| `release-changelog` | `.agents/skills/release-changelog` ↔ `~/.claude/skills/...` | ✅ 🔗 | P1 | 生成 release changelog (CMMI 5.4) |
| `release-changelog-discord-message` | `.agents/skills/...` ↔ `~/.claude/skills/...` | ✅ 🔗 | P2 | release Discord 公告 |
| `release-version-sync` | `.agents/skills/...` ↔ `~/.claude/skills/...` | ✅ 🔗 | P2 | release version 同步 |
| `web-artifacts-builder` | `.agents/skills/...` ↔ `~/.claude/skills/...` | ✅ 🔗 | P2 | Web artifact 构建 |
| `terminal-bench-loop` | `.agents/skills/...` ↔ `~/.claude/skills/...` | ✅ 🔗 | P2 | Terminal-Bench 跑通 |
| `docx` / `pdf` / `pptx` / `xlsx` | `.agents/skills/...` ↔ `~/.claude/skills/...` | ✅ 🔗 | P2 | Office 文档生成 (按任务类型带) |
| `coding-style` | (待创建) | ⚠️ | P0 | 编码规范 — **缺失**, 应独立成 skill |
| `testing-style` | (待创建) | ⚠️ | P0 | 测试规范 — **缺失**, 应独立成 skill |
| `api-design` | (待创建) | ⚠️ | P0 | API 设计规范 — **缺失**, 应独立成 skill |
| `database-design` | (待创建) | P0 | ⚠️ | DB 设计规范 — **缺失**, 应独立成 skill |
| `code-review` | (待创建) | ⚠️ | P0 | 代码审查清单 — **缺失**, 应独立成 skill |
| `task-driven-development` | (待创建) | ⚠️ | P1 | TDD 流程 — **缺失**, 当前由 `swe-delivery-flow` + `spec-driven-dev` 间接覆盖 |

**铁匠加载路径** (默认):
```
~/.claude/skills/
  ↳ paperclip, paperclip-board, core-swe, swe-delivery-flow, spec-driven-dev,
    system-design-spec, bug-fix-flow, fork-sync, cmmi-*, mcp-builder,
    paperclip-*, frontend-design, check-pr, pr-gardening, prcheckloop,
    ota-*, release-*, deploy-workspace-symlinks, ...
```

### 1.2 门神 (Guardian / `fdse`) — `cmd` (`@commandcode/ai`) CLI

**岗位**: 跑命令 + 派活 + 自动化批处理 + 撞机 / E2E 金标. **老板不亲自跑 cmd** (wave229 修正).

| Skill | 路径 | 状态 | P | 使用场景 |
|---|---|---|---|---|
| `fdse` | `.agents/skills/fdse` ↔ `~/.claude/skills/fdse` | ✅ 🔗 | P0 | 角色主 skill — 前线部署全栈 |
| `paperclip` | (同铁匠) | ✅ 🔗 | P0 | 工坊 API |
| `paperclip-board` | (同铁匠) | ✅ 🔗 | P0 | 工坊对话 |
| `paperclip-task` | (待创建) | ⚠️ | P0 | 任务操作 — **缺失**, 标 ⚠️; 当前由 `paperclip` skill 覆盖 |
| `paperclip-frontend-app` | (待创建) | ⚠️ | P0 | 前端 App 操作 — **缺失**, 标 ⚠️; 当前由 `frontend-design` 间接覆盖 |
| `paperclip-deploy` | (待创建) | ⚠️ | P0 | 部署 skill — **缺失**, 标 ⚠️; 当前由 `sre-release-and-deploy` + `release` 间接覆盖 |
| `dispatch-wave` | (待创建) | ⚠️ | P0 | 派活 wave — **缺失**, 标 ⚠️; 当前由 `ops-task-orchestration` + `~/bin/dispatch-wave*.sh` 间接覆盖 |
| `monitor-wave` | (待创建) | ⚠️ | P0 | 监视 wave — **缺失**, 标 ⚠️; 当前由 `~/bin/monitor-wave*.sh` 间接覆盖 |
| `FDE-skills` | (待创建) | ⚠️ | P0 | FDSE 专属 skill 集合 — **缺失**, 应整合 fdse skill 内容 |
| `qa-humanlike-e2e` | `.agents/skills/qa-humanlike-e2e` ↔ `~/.claude/skills/...` | ✅ 🔗 | P0 | 拟真人 E2E (撞机金标) |
| `comprehensive-testing-workflow` | `.agents/skills/...` ↔ `~/.claude/skills/...` | ✅ 🔗 | P0 | 综合测试工作流 (E2E/单测/沙箱) |
| `add-product-e2e-eval` | `.agents/skills/add-product-e2e-eval` ↔ `~/.claude/skills/...` | ✅ 🔗 | P1 | 加产品 E2E 评估 |
| `add-runner-eval` | `.agents/skills/add-runner-eval` ↔ `~/.claude/skills/...` | ✅ 🔗 | P1 | 加 runner 评估 |
| `paperclip-evals` | `.agents/skills/paperclip-evals` ↔ `~/.claude/skills/...` | ✅ 🔗 | P1 | Paperclip 评估 harness |
| `terminal-bench-loop` | `.agents/skills/...` ↔ `~/.claude/skills/...` | ✅ 🔗 | P1 | Terminal-Bench 跑通 |
| `check-pr` | (同铁匠) | ✅ 🔗 | P1 | 检查 PR |
| `prcheckloop` | (同铁匠) | ✅ 🔗 | P1 | 跑 PR 检查到绿 |
| `pr-gardening` | (同铁匠) | ✅ 🔗 | P1 | PR inbox 整理 |
| `pr-report` | (同铁匠) | ✅ 🔗 | P1 | PR 报告 |
| `prepare-paperclip-pr` | (同铁匠) | ✅ 🔗 | P1 | 准备 PR |
| `deal-with-security-advisory` | (同铁匠) | ✅ 🔗 | P2 | Security Advisory |
| `diagnose-why-work-stopped` | (同铁匠) | ✅ 🔗 | P1 | 诊断卡死 |
| `ops-task-orchestration` | (同铁匠) | ✅ 🔗 | P0 | 任务编排 (门神主跑) |
| `frontend-design` | (同铁匠) | ✅ 🔗 | P2 | 前端设计 |
| `ota-*` | (同铁匠) | ✅ 🔗 | P1 | OTA 系列 |
| `garden-inbox` | (同铁匠) | ✅ 🔗 | P2 | inbox 整理 |

**门神加载路径** (cmd CLI):
```
~/.cmd/skills/    (待 wave232 末段 install-employee-skills.sh 建软链)
  ↳ fdse, paperclip, paperclip-board, qa-humanlike-e2e,
    comprehensive-testing-workflow, ops-task-orchestration, ...
```

> **wave229 注**: cmd = `commandcode.ai` 自动化 CLI, 老板不亲自 spawn, 由 PM (Hermes) 在
> `dispatch-waveXXX.sh` 里调度门神跑. 所以 `~/.cmd/skills/` 由 PM 在安装时建立, 不靠员工手动.

### 1.3 兑底渊 (Operator / `pre-sre`) — **cmd (`@commandcode/ai`) 主线 (wave236 改) + claude-mm 按量兜底**

**岗位**: 部署 + 性能 + 部分监控 (Phase 2.1 / 3.4 / 4.5 / 5.1). wave227 起 5.2 / 5.3 / 3.5 / 2.5 主改百晓生, 兑底渊降为副. **wave236 改**: 工具从 claude-ds (按量) 改 cmd (`@commandcode/ai` CLI, wave229) 主线 + claude-mm 按量兜底 (老板原话 "claude-ds 不能用, 换 cmd, claude-mm"); claude-ds 标"不可用, 配额紧" — 仅百晓生 SRE 临时大任务按量兜底.

| Skill | 路径 | 状态 | P | 使用场景 |
|---|---|---|---|---|
| `pre-sre` | `.agents/skills/pre-sre` ↔ `~/.claude/skills/pre-sre` | ✅ 🔗 | P0 | 角色主 skill — PRE/SRE 测过 = 要上 |
| `paperclip` | (同铁匠) | ✅ 🔗 | P0 | 工坊 API |
| `paperclip-board` | (同铁匠) | ✅ 🔗 | P0 | 工坊对话 |
| `sre-release-and-deploy` | `.agents/skills/sre-release-and-deploy` ↔ `~/.claude/skills/...` | ✅ 🔗 | P0 | SRE / 发版 9 步链 |
| `deploy-workspace-symlinks` | `.agents/skills/...` ↔ `~/.claude/skills/...` | ✅ 🔗 | P0 | 部署 workspace 软链 |
| `release` | `.agents/skills/release` ↔ `~/.claude/skills/...` | ✅ 🔗 | P0 | 协调全 release |
| `release-flow` | `.agents/skills/release-flow` ↔ `~/.claude/skills/...` | ✅ 🔗 | P1 | release 流程 |
| `release-version-sync` | `.agents/skills/...` ↔ `~/.claude/skills/...` | ✅ 🔗 | P1 | release version 同步 |
| `release-changelog` | `.agents/skills/release-changelog` ↔ `~/.claude/skills/...` | ✅ 🔗 | P2 | release changelog |
| `finance-budget-guard` | `.agents/skills/finance-budget-guard` ↔ `~/.claude/skills/...` | ✅ 🔗 | P1 | 预算守卫 (硬停自动暂停) |
| `ops-task-orchestration` | (同铁匠) | ✅ 🔗 | P1 | 任务编排 (兑底渊副出恢复脚本) |
| `ota-*` | (同铁匠) | ✅ 🔗 | P0 | OTA 系列 (sre 主跑) |
| `apk-installation-cache` | (同铁匠) | ✅ 🔗 | P1 | APK 缓存 |
| `deal-with-security-advisory` | (同铁匠) | ✅ 🔗 | P1 | Security Advisory |
| `mcp-builder` | (同铁匠) | ✅ 🔗 | P2 | MCP 构建 |
| `paperclip-runbook` | (待创建) | ⚠️ | P0 | 运行手册 — **缺失**, 标 ⚠️; 当前由 `sre-release-and-deploy` 间接覆盖 |
| `paperclip-system-monitor` | (待创建) | ⚠️ | P0 | 系统监控 — **缺失**, 标 ⚠️; 当前由 `sre-release-and-deploy` + `system-monitor` MCP 间接覆盖 |
| `paperclip-cost-optimize` | (待创建) | ⚠️ | P0 | 成本优化 — **缺失**, 标 ⚠️; 当前由 `finance-budget-guard` 间接覆盖 |
| `paperclip-incident-response` | (待创建) | ⚠️ | P0 | 事故响应 — **缺失**, 标 ⚠️; 当前由 `diagnose-why-work-stopped` 间接覆盖 |
| `paperclip-backup-restore` | (待创建) | ⚠️ | P0 | 备份恢复 — **缺失**, 标 ⚠️; 当前由 `backup-db.sh` 脚本间接覆盖 |

**兑底渊加载路径** (cmd `commandcode.ai` CLI 主线 / claude-mm 兜底, wave236 改):
```
~/.claude/skills/
  ↳ pre-sre, paperclip, paperclip-board, sre-release-and-deploy,
    deploy-workspace-symlinks, release, release-flow, finance-budget-guard,
    ops-task-orchestration, ota-*, apk-installation-cache, ...
```

### 1.4 墨斗 (Inkstick / `fda`) — **agy (Gemini 3.8 / ACP 打通, 正常可用) + cmd 紧急兜底**

**岗位**: 选型研判 + 原型 + 画图 + 竞品分析 + License 扫描 (Phase 1.1/1.2/1.3/1.4). **当前状态**: agy Gemini 3.8 跑在 Docker 容器 `agy-ubuntu-container` 中，ACP 适配器已打通，墨斗默认使用 agy。偶尔用 cmd (`@commandcode/ai`) 作为紧急兜底.

| Skill | 路径 | 状态 | P | 使用场景 |
|---|---|---|---|---|
| `fda` | `.agents/skills/fda` ↔ `~/.claude/skills/fda` | ✅ 🔗 | P0 | 角色主 skill — 前线架构师 |
| `paperclip` | (同铁匠) | ✅ 🔗 | P0 | 工坊 API |
| `paperclip-board` | (同铁匠) | ✅ 🔗 | P0 | 工坊对话 |
| `solution-scouting-and-dar` | `.agents/skills/solution-scouting-and-dar` ↔ `~/.claude/skills/...` | ✅ 🔗 | P0 | CMMI DAR 加权决策矩阵 (墨斗主跑) |
| `palantir-role-engineering` | `.agents/skills/palantir-role-engineering` ↔ `~/.claude/skills/...` | ✅ 🔗 | P1 | Palantir Foundry 5 角色工程化 |
| `system-design-spec` | (同铁匠) | ✅ 🔗 | P0 | 系统设计 spec |
| `cmmi-tech-solution` | (同铁匠) | ✅ 🔗 | P1 | CMMI 技术方案 |
| `cmmi-req-spec` | (同铁匠) | ✅ 🔗 | P1 | CMMI 需求 spec |
| `product-project-intake` | `.agents/skills/product-project-intake` ↔ `~/.claude/skills/...` | ✅ 🔗 | P1 | 产品需求进厂 (立项) |
| `requirements-capture` | `.agents/skills/requirements-capture` ↔ `~/.claude/skills/...` | ✅ 🔗 | P1 | 需求捕获 |
| `doc-maintenance` | (同铁匠) | ✅ 🔗 | P1 | 文档维护 |
| `model-catalog-check` | `.agents/skills/model-catalog-check` ↔ `~/.claude/skills/...` | ✅ 🔗 | P2 | 模型 catalog 检查 |
| `paperclip-dar` | (待创建) | ⚠️ | P0 | 决策分析与解决 — **缺失**, 标 ⚠️; 当前由 `solution-scouting-and-dar` 间接覆盖 |
| `paperclip-prototype` | (待创建) | ⚠️ | P0 | 原型 skill — **缺失**, 标 ⚠️; 当前由 `frontend-design` 间接覆盖 |
| `paperclip-licensing-audit` | (待创建) | ⚠️ | P0 | License 审计 — **缺失**, 标 ⚠️; 当前由 `deal-with-security-advisory` 间接覆盖 |
| `paperclip-design-pattern` | (待创建) | ⚠️ | P0 | 设计模式 — **缺失**, 标 ⚠️; 当前由 `palantir-role-engineering` 间接覆盖 |
| `paperclip-data-viz` | (待创建) | ⚠️ | P0 | 数据可视化 — **缺失**, 标 ⚠️; 当前由 `dataviz` skill 间接覆盖 |
| `agy-system-instructions` | (待创建) | ⚠️ | P0 | agy 系统指令 — **缺失**, 标 ⚠️; 当前由 `fda` skill 内容覆盖 |

**墨斗加载路径** (agy `Gemini 3.8` CLI 主线, wave236 恢复; cmd `commandcode.ai` 紧急兜底):
```
~/.agy/skills/    (待 wave232 install-employee-skills.sh 建软链)
  ↳ fda, paperclip, solution-scouting-and-dar, system-design-spec,
    palantir-role-engineering, cmmi-tech-solution, cmmi-req-spec,
    product-project-intake, requirements-capture, doc-maintenance, ...
~/.cmd/skills/    (紧急兜底; wave236 起, 墨斗偶尔切 cmd)
```

> **agy 现状 (wave357)**: agy Gemini 3.8 跑在 Docker 容器 `agy-ubuntu-container`，ACP 协议已打通，实测真跑 OK，**墨斗默认使用 agy**。偶尔用 cmd 作为紧急兜底。

### 1.5 百晓生 (Sage / `ds`) — **claude-mm 主 (wave234 起), claude-glm 备用, claude-ds 按量, copilot 限**

**岗位**: 责任重大 — 测试 / 运营 / 风险 / 部署架构 / 复盘 (Phase 2.5 / 3.5 / 5.2 / 5.3 / 5.5).
工具扩到 4 个 (wave227 起), 涵盖产品上线 + 监控 + 应急全链路.

| Skill | 路径 | 状态 | P | 使用场景 |
|---|---|---|---|---|
| `ds` | `.agents/skills/ds` ↔ `~/.claude/skills/ds` | ✅ 🔗 | P0 | 角色主 skill — 部署战略专家 |
| `paperclip` | (同铁匠) | ✅ 🔗 | P0 | 工坊 API |
| `paperclip-board` | (同铁匠) | ✅ 🔗 | P0 | 工坊对话 |
| `paperclip-page` | (同铁匠) | ✅ 🔗 | P1 | 工坊页面发布 |
| `paperclip-evals` | `.agents/skills/paperclip-evals` ↔ `~/.claude/skills/...` | ✅ 🔗 | P0 | Paperclip 评估 harness |
| `comprehensive-testing-workflow` | `.agents/skills/...` ↔ `~/.claude/skills/...` | ✅ 🔗 | P0 | 综合测试工作流 (百晓生主跑) |
| `qa-humanlike-e2e` | `.agents/skills/qa-humanlike-e2e` ↔ `~/.claude/skills/...` | ✅ 🔗 | P0 | 拟真人 E2E (验收主) |
| `add-product-e2e-eval` | `.agents/skills/...` ↔ `~/.claude/skills/...` | ✅ 🔗 | P1 | 加产品 E2E 评估 |
| `add-runner-eval` | `.agents/skills/...` ↔ `~/.claude/skills/...` | ✅ 🔗 | P1 | 加 runner 评估 |
| `sre-release-and-deploy` | `.agents/skills/...` ↔ `~/.claude/skills/...` | ✅ 🔗 | P0 | SRE / 发版 (百晓生主跑 3.5 部署架构) |
| `deploy-workspace-symlinks` | (同铁匠) | ✅ 🔗 | P1 | 部署 workspace |
| `release` | `.agents/skills/release` ↔ `~/.claude/skills/...` | ✅ 🔗 | P1 | 协调 release |
| `release-flow` | `.agents/skills/release-flow` ↔ `~/.claude/skills/...` | ✅ 🔗 | P1 | release 流程 |
| `release-changelog` | (同兑底渊) | ✅ 🔗 | P1 | release changelog |
| `finance-budget-guard` | `.agents/skills/finance-budget-guard` ↔ `~/.claude/skills/...` | ✅ 🔗 | P0 | 预算守卫 (百晓生主跑 5.5 复盘成本) |
| `ops-task-orchestration` | (同铁匠) | ✅ 🔗 | P0 | 任务编排 (百晓生副) |
| `diagnose-why-work-stopped` | (同铁匠) | ✅ 🔗 | P1 | 诊断卡死 |
| `deal-with-security-advisory` | (同铁匠) | ✅ 🔗 | P1 | Security Advisory |
| `cmmi-tech-solution` | (同铁匠) | ✅ 🔗 | P1 | CMMI 技术方案 |
| `cmmi-req-spec` | (同铁匠) | ✅ 🔗 | P1 | CMMI 需求 spec |
| `cmmi-detailed-contracts` | (同铁匠) | ✅ 🔗 | P2 | CMMI 详细契约 |
| `cmmi-immutable-release` | (同铁匠) | ✅ 🔗 | P2 | CMMI 不可变发版 |
| `cmmi-car-spc-metrics` | `.agents/skills/cmmi-car-spc-metrics` ↔ `~/.claude/skills/...` | ✅ 🔗 | P1 | CMMI CAR SPC 指标 |
| `cmmi-ver-val` | `.agents/skills/cmmi-ver-val` ↔ `~/.claude/skills/...` | ✅ 🔗 | P1 | CMMI 验证与确认 |
| `ceo-company-ops` | `.agents/skills/ceo-company-ops` ↔ `~/.claude/skills/...` | ✅ 🔗 | P1 | CEO / 公司运营 |
| `internal-comms` | (同铁匠) | ✅ 🔗 | P1 | 内部沟通 |
| `doc-maintenance` | (同铁匠) | ✅ 🔗 | P1 | 文档维护 |
| `garden-inbox` | (同铁匠) | ✅ 🔗 | P2 | inbox 整理 |
| `pr-gardening` | (同铁匠) | ✅ 🔗 | P2 | PR inbox |
| `pr-report` | (同铁匠) | ✅ 🔗 | P2 | PR 报告 |
| `prcheckloop` | (同铁匠) | ✅ 🔗 | P2 | PR 检查 |
| `check-pr` | (同铁匠) | ✅ 🔗 | P2 | PR 评论 |
| `prepare-paperclip-pr` | (同铁匠) | ✅ 🔗 | P2 | 准备 PR |
| `model-catalog-check` | (同铁匠) | ✅ 🔗 | P2 | 模型 catalog |
| `palantir-role-engineering` | (同铁匠) | ✅ 🔗 | P2 | Palantir 角色工程 |
| `paperclip-system-monitor` | (待创建) | ⚠️ | P0 | 系统监控 — **缺失**, 标 ⚠️; 当前由 `sre-release-and-deploy` + `system-monitor` MCP 间接覆盖 |
| `paperclip-incident-response` | (待创建) | ⚠️ | P0 | 事故响应 — **缺失**, 标 ⚠️; 当前由 `diagnose-why-work-stopped` 间接覆盖 |
| `paperclip-cost-optimize` | (待创建) | ⚠️ | P0 | 成本优化 — **缺失**, 标 ⚠️; 当前由 `finance-budget-guard` 间接覆盖 |
| `paperclip-data-analysis` | (待创建) | ⚠️ | P0 | 数据分析 — **缺失**, 标 ⚠️; 当前由 `solution-scouting-and-dar` + agy 间接覆盖 |
| `paperclip-ml-eval` | (待创建) | ⚠️ | P0 | 模型评估 — **缺失**, 标 ⚠️; 当前由 `paperclip-evals` 间接覆盖 |
| `paperclip-test-strategy` | (待创建) | ⚠️ | P0 | 测试策略 — **缺失**, 标 ⚠️; 当前由 `comprehensive-testing-workflow` 间接覆盖 |
| `paperclip-bug-hunt` | (待创建) | ⚠️ | P0 | 撞机 — **缺失**, 标 ⚠️; 当前由 `qa-humanlike-e2e` 间接覆盖 |
| `paperclip-quality-metrics` | (待创建) | ⚠️ | P0 | 质量指标 — **缺失**, 标 ⚠️; 当前由 `cmmi-car-spc-metrics` 间接覆盖 |

**百晓生加载路径** (claude-mm 主线 / claude-glm 备用 / claude-ds, wave234 起):
```
~/.claude/skills/  (DS 工具链共享 ~/.claude/skills/)
  ↳ ds, paperclip, paperclip-board, paperclip-evals,
    comprehensive-testing-workflow, qa-humanlike-e2e, sre-release-and-deploy,
    finance-budget-guard, cmmi-*, ceo-company-ops, internal-comms, ...
```

**百晓生 MCP 工具链** (独立于 skill, 由 wave228 install-ds-mcp.sh 注册):

| MCP | 路径 | 状态 | P | 使用场景 |
|---|---|---|---|---|
| `system-monitor` | MCP server (注册) | ✅ | P0 | 系统监控 (CPU / mem / disk / paperclip health) |
| `approval` | MCP server (注册) | ✅ | P0 | 任何变更走 approval gate |
| `company-ops` | MCP server (注册) | ✅ | P0 | 运营 Coolie 工坊 (日报 / 配额 / release driver) |
| `agent-device` | MCP server (注册) | ✅ | P0 | 模拟器撞机 (7 工具全装) |
| `agent-browser` | MCP server (注册) | ✅ | P0 | 浏览器自动化 (7 工具全装) |

> **百晓生 MCP 现状**: 5 个 MCP 已在 wave228 install (`install-ds-mcp.sh` + `install-agent-device-mcp.sh` + `install-agent-browser-mcp.sh`), 占位 command 等真包发布后替换. 本波不动 MCP, 只确认加载.

---

## 2. Skills 装载机制 (跨 CLI)

### 2.1 三层路径

```
第 1 层 (源 — 仓库内, 全部软链)
  coolie/.agents/skills/<name>/SKILL.md     ← 72 个 skill, 上游 fork 共识
    ↑ (符号链接)
第 2 层 (软链 — 4 个 CLI 自动加载路径)
  ~/.claude/skills/<name>                   ← claude / claude-mm (wave234 主线) / claude-glm (备用) / claude-ds
  ~/.cmd/skills/<name>                      ← cmd (commandcode.ai)
  ~/.agy/skills/<name>                      ← agy (Gemini)  ← 当前不自动加载, 软链为占位
  ~/.copilot/skills/<name>                  ← copilot        ← 当前无加载机制, 软链为占位
    ↑ (脚本 install-employee-skills.sh 建)
第 3 层 (激活检查)
  scripts/check-employee-skills.sh          ← 按 EMPLOYEE-SKILLS.md 表逐行检查
```

### 2.2 install-employee-skills.sh 行为

- 默认 (无参数): 给 4 个 CLI 路径 (`~/.claude/skills/` / `~/.cmd/skills/` /
  `~/.agy/skills/` / `~/.copilot/skills/`) 建软链, 指向 `.agents/skills/<name>`.
- `--dry-run`: 只打印 "would link: ..." 不动盘.
- `--apply`: 真建软链 (默认).
- `--employee <name>`: 只给某个员工安装其 skills 子集.
- 幂等: 已存在的软链跳过, 错链 (target 不存在) 报 ⚠️ 并跳过.

### 2.3 check-employee-skills.sh 行为

- 默认 (无参数): 跑全 5 员工 × 全 skill 表, 输出 OK / MISSING / WARN.
- `--employee <name>`: 只查某个员工.
- `--missing-only`: 只输出 ⚠️ MISSING (用于决定要不要创建 skill).
- `--json`: 输出 JSON 格式 (供 PM monitor 脚本消费).

---

## 3. ⚠️ 缺失 Skills 待办 (下一波创建)

老板 brief 提到了大量 `paperclip-*` / `paperclip-runbook` / `coding-style` 等 skill,
但仓库 / 本地**均不存在**. 这些 skill 多数**已被现有 skill 间接覆盖**, 真正独立的缺失是:

| 缺失 skill | 应独立成 skill? | 建议下一波 |
|---|---|---|
| `coding-style` | ✅ YES — 跨语言编码规范, 当前分散 | wave233 创建 (`docs-coolie/specs/2026-10-01-coding-style.md`) |
| `testing-style` | ✅ YES — 跨层级测试规范 | wave234 创建 |
| `api-design` | ✅ YES — REST + GraphQL 契约规范 | wave235 创建 |
| `database-design` | ✅ YES — Drizzle schema 设计规范 | wave236 创建 |
| `code-review` | ✅ YES — 代码审查 checklist | wave237 创建 |
| `task-driven-development` | ❌ NO — 已被 `swe-delivery-flow` + `spec-driven-dev` 覆盖 | 关闭 brief 这一条, 引用现有 skill |
| `paperclip-task` | ❌ NO — 已被 `paperclip` 覆盖 | 关闭 |
| `paperclip-frontend-app` | ❌ NO — 已被 `frontend-design` 覆盖 | 关闭 |
| `paperclip-deploy` | ❌ NO — 已被 `sre-release-and-deploy` + `release` 覆盖 | 关闭 |
| `dispatch-wave` / `monitor-wave` | ❌ NO — 是 PM (Hermes) 脚本, 不是 skill | 关闭, 引用 `PM-DISPATCH-QUICKCARD.md` §3 |
| `FDE-skills` | ❌ NO — 已被 `fdse` 覆盖 | 关闭 |
| `paperclip-runbook` | ✅ YES — SRE 专属运行手册 | wave238 创建 |
| `paperclip-system-monitor` | ✅ YES — 系统监控 (与 MCP `system-monitor` 配套) | wave239 创建 |
| `paperclip-cost-optimize` | ✅ YES — 成本优化 (当前 `finance-budget-guard` 只读) | wave240 创建 |
| `paperclip-incident-response` | ✅ YES — 事故响应流程 | wave241 创建 |
| `paperclip-backup-restore` | ✅ YES — 备份恢复流程 | wave242 创建 |
| `paperclip-dar` | ❌ NO — 已被 `solution-scouting-and-dar` 覆盖 | 关闭 |
| `paperclip-prototype` | ✅ YES — 原型设计 (FDA) | wave243 创建 |
| `paperclip-licensing-audit` | ✅ YES — License 审计 (FDA + DS 双主) | wave244 创建 |
| `paperclip-design-pattern` | ❌ NO — 已被 `palantir-role-engineering` 覆盖 | 关闭 |
| `paperclip-data-viz` | ❌ NO — 已被 `dataviz` skill 覆盖 | 关闭 |
| `agy-system-instructions` | ❌ NO — agy CLI 不加载 skill, 应放 prompt | 关闭 |
| `paperclip-data-analysis` | ✅ YES — 数据分析 (DS) | wave245 创建 |
| `paperclip-ml-eval` | ❌ NO — 已被 `paperclip-evals` 覆盖 | 关闭 |
| `paperclip-test-strategy` | ✅ YES — 测试策略 (与 `comprehensive-testing-workflow` 互补) | wave246 创建 |
| `paperclip-bug-hunt` | ❌ NO — 已被 `qa-humanlike-e2e` 覆盖 | 关闭 |
| `paperclip-quality-metrics` | ❌ NO — 已被 `cmmi-car-spc-metrics` 覆盖 | 关闭 |

> **总账**: 28 个 brief 列出的缺失 skill 中, 11 个独立创建 (wave233..246), 17 个被现有 skill
> 间接覆盖, 关闭 brief. 创建顺序按"工具优先 P0 + 影响面广"排, 先 `coding-style` / `testing-style`
> / `api-design` / `database-design` / `code-review` 这 5 个铁匠 P0.

---

## 4. PM (Hermes) 派活 SOP 补充

在 [`PM-DISPATCH-QUICKCARD.md`](PM-DISPATCH-QUICKCARD.md) §3 七步 SOP 第 4 步后, 加一步:

```
4. 看员工工具配额
    ↓
4.5. 查员工 skill 装载
    - 必装 skill 已就位 (P0) → 直接派
    - 必装 skill 缺失 (⚠️ MISSING) → 先派铁匠修 skill, 再派原任务
    - 临时用替代 skill (本波 §3 标"覆盖"的) → 在 brief 里说明用哪个现有 skill 顶替
    ↓
5. 写 brief
```

---

## 5. 检查清单 (PM 自查)

派活前 PM (Hermes) 对照本表自查:

- [ ] 5 员工 P0 skill 全部装载 (跑 `scripts/check-employee-skills.sh`, 0 MISSING)
- [ ] 缺失 skill 已在 §3 排下一波创建, 不阻塞当前任务
- [ ] 跨 CLI 软链已建 (跑 `scripts/install-employee-skills.sh --dry-run` 看 plan)
- [ ] DS MCP 5 个已注册 (跑 `scripts/install-ds-mcp.sh --dry-run`)
- [ ] agent-device / agent-browser MCP 已注册 (跑 install-agent-{device,browser}-mcp.sh --dry-run)
- [ ] brief 写明员工 + 工具 + skill 子集 + 替代 skill (如适用)

---

## 6. 不动 / 不创建

- **不动 `server/` / `ui/` / `clients/expo/`** — 本波纯文档 + 脚本, 不改应用代码.
- **不动 `skills/` 仓库内已有 skill 内容** — 本波只创建 `EMPLOYEE-SKILLS.md` + 2 个脚本.
- **不动 MCP server 实现** — MCP 注册由 wave228 install 脚本管, 本波只引用.
- **不创建 §3 列的 11 个独立 skill** — 留到 wave233..246, 每波一个 skill, 不在本波一次性铺开.

---

## 7. QA 入口

- `docs-coolie/evidence/wave232/QA-REPORT.md` — 本波 QA 报告
- `docs-coolie/evidence/wave234/QA-REPORT.md` — claude-glm 退出主力 (5 文档同步)
- `docs-coolie/evidence/wave236/QA-REPORT.md` — agy 恢复 + claude-ds 退出 (5 文档同步)
- `scripts/check-employee-skills.sh` — 跑 (默认全查)
- `scripts/install-employee-skills.sh --dry-run` — 看 install plan