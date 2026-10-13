---
name: swe-delivery-flow
description: 研发员工（SWE/铁匠）视角的代码交付与缺陷修复法典。适用于接到「派活给铁匠」「修bug」「修复缺陷」「接工单改代码」「最小化修复」时启用。遵循复现优先与1Task=1Commit。
---

# SWE / 研发员工 — 复现→定位→最小修→测→提交

**一句话职责**：把工单从"红"改成"绿"，并留下可复核的证据链。

## 何时用

- 接到 bug / 小功能工单。
- 有复现路径或错误原文。

## 执行步骤

### 1 复现优先（没复现不盲修）

- 拿错误原文（logcat/Alert）+ 截图（带 URL）+ 复现路径。
- 能 curl 命中后端就先 curl；UI 问题必须真点。
- 复现失败：**不硬修**，简报存档 `docs-coolie/briefs/_failed-<date>-*.md`。

### 2 根因（日志 / DB 真值）

```sh
ssh tc-coolie-claw 'journalctl -u coolie -n 200 --no-pager | tail -40'
ssh tc-coolie-claw "sudo -u postgres psql coolie -tAc \"<SQL>\""
```

**投影层与 DB 真值不一致时，信 DB**。写下证据：日志行号 + 表/行，不写"好像是"。

### 3 最小修

- 只改白名单文件；不重构、不格式化无关代码、不换依赖。
- 反复出现的失败类 → 变成机制（测试/守卫），不是再加警告注释。
- 不改断言迁就数据。

### 4 自测

```sh
pnpm -r typecheck
pnpm test
pnpm --filter @paperclipai/<pkg> test
```

有状态/写库的特性必须"写一遍再读回来"（单测绿不算）。

### 5 提交（按显式路径）

```sh
git add <文件1> <文件2>
git commit -F - <<'EOF'
fix(<scope>): <一句话因果>

<为什么这么修 + 验证证据>
EOF
git diff HEAD~1 HEAD --stat     # 复核只有白名单
```

**NO PUSH**（默认）。放行后：

```sh
GIT_SSH_COMMAND='ssh -o ProxyCommand=none' git push origin main
```

### 6 挂载物理 Work Product 与汇报 (No Artifact, No Done)

- 必须挂载真实产物：调用 `skills/paperclip/scripts/paperclip-upload-artifact.sh` 上传 inspectable 附件，或挂载 `commit` / `pull_request` / `artifact` Work Product。
- 严禁口头声明“做完了”而不挂实体交付物。
- 回报格式：`任务 / 根因 / 修改 / 验证 / 物理产物链接 / 未做`。

## 已知坑（编自 PM-FAILURE-CASES）

1. 简报缺复现信息 → 要截图+错误原文+复现路径，或存档不硬修。
2. claude 沙箱拦 git/pnpm/gradle → 写 fallback；keystore/发版交门神。
3. 命令炸 zsh → 只用单引号 ASCII。
4. `git add .` 夹带任务外文件 → 按显式路径 add。
5. 紧急跳过 typecheck 就发版 → 必跑 `pnpm -r typecheck` + prod 烟测。
6. 密码进 transcript → 用环境变量/secret 注入，泄露即轮换。
7. 别人的 WIP 不能动、不能提交。
8. **无产物点 Done** → 严重违纪，触发治理门禁审计拦截。
9. **`git stash` 掩埋未提交代码假完工** → 严禁把前置任务或未提交代码 stash 进堆栈以逃避编译检查；严禁代码压在 stash 栈底时向控制面标记 done。工单结项必须代码落库、工作区 clean。
10. **同步死等耗时构建导致超时崩溃** → 严禁使用带短超时的同步 REPL (如 execute_code 300s) 死等超过 1 分钟的重型构建或测试；必须重定向后台日志并首秒透出心跳回执。

## 验收标准

1. 有复现证据（先红后绿），或记录"无法复现及原因"。
2. 根因有日志/DB 证据。
3. `pnpm -r typecheck` 0 报错，相关测试绿。
4. commit 只含白名单文件，信息说清因果与验证。
5. 有状态特性做了写入-回读实证。
6. **必须挂载物理 Work Product (No Artifact, No Done)**，无不可变实体产物禁止关闭工单。
7. **工作区洁净性验证 (Clean Working Tree)**：特性交付后工作区必须处于 0 dirty、0 untracked 状态，严禁遗留未入库代码。

## 反例

- 没复现就改，"看起来修好了"。
- 一个 commit 大扫除。
- 单测绿就宣布能用。
- 无 Work Product 挂载直接关闭工单。
- 将同伴未提交代码 stash 起来逃避类型检查后强行结项（假完工）。
- 在会话中同步死等 10 分钟 Docker 构建导致界面假死超时。

## 关联

- 拟真人验收 → `qa-humanlike-e2e`；发版 → `sre-release-and-deploy`
