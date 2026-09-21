# Brief: Coolie Workspace-as-Company 骨架（5 角色 + ruoyi 子模块 + new-company.sh stub）

SPEC: `docs-coolie/specs/2026-09-21-coolie-platform-company-template.md`（**先读第 1-7 节**）
Repo: `~/workspace/xaicd/coolie` (branch `main`)
PM: Hermes
Status: WAVE 1 OF 3 — 骨架。**不碰平台代码**（铁匠第二波做），只做：

## 本波必交付（5 块，全是骨架，编译通过就行）

### 1. 5 角色细化 skill 范本（`git add -f`！）

`.agents/skills/` 下新建 5 个目录，每个含 `SKILL.md`（60-100 行）和 `references/<role>-checklist.md`（30-50 行）：

- `.agents/skills/fda/SKILL.md` —— 从现有 `palantir-role-engineering` 拆 §2.5
- `.agents/skills/core-swe/SKILL.md` —— 拆 §2.3
- `.agents/skills/pre-sre/SKILL.md` —— 拆 §2.4
- `.agents/skills/fdse/SKILL.md` —— 拆 §2.1
- `.agents/skills/ds/SKILL.md` —— 拆 §2.2

每个 SKILL.md 必须含 5 节：职责 / 门禁 / 自查脚本 / 必交付物 / 反例。
每个 references/<role>-checklist.md 必须含 ≥ 8 项 yes/no 自检。

### 2. `templates/workspace-skel/` workspace 骨架

新建 `templates/workspace-skel/`，含：

- `README.md`（说明：这就是「一个公司=一个项目」的模板）
- `specs/.gitkeep`
- `docs/.gitkeep`
- `.agents/skills/.gitkeep`（空，公司自己加角色 skill）
- `cli/fda.sh`、`cli/core-swe.sh`、`cli/pre-sre.sh`、`cli/fdse.sh`、`cli/ds.sh`
  - 每个 5-10 行，`#!/usr/bin/env bash` + echo "role <role>: use ai-workshop-dispatch"
  - chmod 0755
- `models.yaml`（5 角色的主备 CLI/模型映射）
- `.gitmodules`（含 `ruoyi-all-next` 子模块 URL：`https://github.com/xaicd/ruoyi-all-next.git`）
- `scripts/bootstrap.sh`（检测 5 个 role 文件齐全 + chmod + 子模块 init，退出码 0）
- `scripts/import-ruoyi.sh`（stub：`git submodule update --init --recursive` + 提示）

### 3. `scripts/new-company.sh`（主仓根目录）

stub 版（铁匠第二波接通平台 API）：本版只做「mkdir + 拷贝骨架 + git init + 子模块 init」，**先不调任何 API**。

```
scripts/new-company.sh <公司名>
  ↓
1. NAME=$1; test -n "$NAME" || exit 1
2. ROOT=~/workspace/xaicd/$NAME
3. mkdir -p $ROOT
4. cp -R $(git rev-parse --show-toplevel)/templates/workspace-skel/* $ROOT/
5. cd $ROOT && git init -b main
6. cd $ROOT && git submodule add https://github.com/xaicd/ruoyi-all-next.git 2>&1 | head -5 || echo "submodule placeholder"
7. echo "OK: $ROOT" ; ls -la $ROOT | head -10
```

**实测**：跑一次 `bash scripts/new-company.sh acme-skeleton-test`，证明脚本可跑通，输出 workspace 路径；然后 `rm -rf ~/workspace/xaicd/acme-skeleton-test`。

### 4. `scripts/register-roles.sh`（主仓根目录）

stub：列5个 role 名到 stdout，**不调 API**（铁匠第二波接）：

```
scripts/register-roles.sh [company_id]
  ↓
echo "fda core-swe pre-sre fdse ds"
```

### 5. `templates/` 主仓目录下放 3 个平台模板的 TS stub

新建 `packages/templates/`，含：

- `packages/templates/template-palantir-5-role.ts`（含 5 角色 + workspace 骨架指针）
- `packages/templates/template-paperclip-default.ts`（最小，名字/成员/owner）
- `packages/templates/template-empty.ts`（名字+owner）

每个文件 20-40 行，TS 类型与 Coolie 已有 `Company` 类型一致。**导出即可，铁匠第二波接 service**。

## 约束（不变）

- **不动**：`clients/expo/android/**`、任何 version 号、`AGENTS.md` 根目录、`release-app.sh` 发版逻辑本体
- **必须 git add -f**：`/.agents/` 是 gitignored，新 skill 必须 `git add -f`
- **新建的 templates/workspace-skel/** 跟主仓一起 commit（不 gitignore）
- 不可跑 `pnpm -r typecheck` 全仓库（5 个 stub 文件 + 5 个 skill md 不至于破 tsc，但要跑一次 `pnpm -r typecheck` 确认）

## 输出报告必须包含

1. 5 角色 skill 文件名 + 行数
2. `templates/workspace-skel/` 目录树（`find templates/workspace-skel -type f` 输出）
3. `scripts/new-company.sh` 跑通的真实输出（`bash scripts/new-company.sh acme-smoke-$(date +%s)` → 真实 stdout + 真实 `ls -la $ROOT`）
4. `scripts/register-roles.sh` 跑通的输出
5. `pnpm -r typecheck` 真实输出（最后 20 行）
6. `git log --oneline -1` + push 确认

## 完成定义

- 所有 5 块骨架就位
- `pnpm -r typecheck` 0 errors
- 一键立项脚本真跑通一次（哪怕是空 API stub）
- 5 个 role skill SKILL.md 真的写完 ≥60 行（不是 placeholder）
- commit message 引本 brief 路径

如果某块超 30 turns 没完，做完能 commit 的部分就 commit，剩下标 partial 报。**不要全空 commit**。