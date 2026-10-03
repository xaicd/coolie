# .agents/skills 路由索引 (wave285)

> 老板规矩: **定制的 skills 不跨机搬运** (学习思想, 不搬文档); 重复/混乱要清理。
> 新 skill 必须 `git add -f` (本目录被 `.gitignore:63 /.agents/` 整体忽略)。

## 选 skill 的三条轨道 (别混)

| 轨道 | 用 When | 技能链 |
|---|---|---|
| **Kiro 规格流水线** (功能从 0 到 1) | 老板说「做个 X」 | `requirements-capture` (requirements.md) → `system-design-spec` (design.md) → 匠人 tasks.md |
| **CMMI 治理门禁** (项目阶段验收) | 项目立项/阶段门/投产 | `cmmi-wbs-milestone` (骨架) → `cmmi-req-spec` → `cmmi-tech-solution` → `cmmi-detailed-contracts` → `cmmi-ver-val` → `cmmi-immutable-release` → `cmmi-car-spc-metrics` |
| **每次改动轻流程** (单任务落地) | 领到一条开发/修 bug 任务 | `spec-driven-dev` (requirement→design→task, 落 issue spec 字段); 修 bug 用 `bug-fix-flow`; 交付走 `swe-delivery-flow` |

三轨关系真值: `spec-driven-dev` 头部「CMMI 定项目怎么走, spec 定这一次改动怎么做」。
角色分工细化: `palantir-role-engineering` (总纲) + `fda` / `core-swe` / `fdse` / `pre-sre` / `ds` (§细化, 非重复)。

## 专项区

- **发版**: `release-flow` (fork 4 类资产怎么发) / `release-version-sync` (版本号一致) / `sre-release-and-deploy` (9 步 playbook) / `cmmi-immutable-release` (G5 门禁视角) — 四个是不同高度, 不是重复
- **OTA**: `ota-cache-busting` / `ota-launchasset-hash` / `ota-runtime-version-consistency` / `ota-caddy-fallback-trap` / `apk-installation-cache` (每个对应一种历史翻车模式)
- **本地团队运转**: `local-team-toolchain` (跨环境调度权威) / `ops-task-orchestration` / `ceo-company-ops` / `finance-budget-guard` / `model-catalog-check` / `coolie-boss-decision-log` / `fork-sync`
- **测试**: `comprehensive-testing-workflow` (总) / `qa-humanlike-e2e` (拟真走查) / `add-product-e2e-eval` / `add-runner-eval` / `terminal-bench-loop`

## 上游边界

`check-pr` / `release` / `release-changelog*` / `garden-inbox` / `pr-*` / `prepare-paperclip-pr` / `terminal-bench-loop` / `doc-maintenance` / `deal-with-security-advisory` / `company-creator` / `create-*` / `paperclip-*` / `diagnose-why-work-stopped` 等 20 个来自 **upstream** (`master` 分支也有) — 不删不改, 动了会撞 fork-sync。

## 引入政策 (wave285 教训)

1. 其他机器 (aja-pc/cwall) 的 **定制 skills 不引入** — 它们内嵌对方的环境绑定 (主机名/镜像/镜像同步路径), 搬过来就是双源漂移。
2. 确有通用的**思想**值得学 → 基于 coolie 自己的栈重写, 不复制文档。
3. 引入前查重: 先 `ls .agents/skills/` + 本索引比对职责, 再决定。
4. 引入后回填: 更新本索引 + `docs-coolie/EMPLOYEE-SKILLS.md` 装配矩阵。
