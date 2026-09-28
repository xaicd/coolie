---
name: swe-delivery-flow
description: >
  研发员工（SWE）视角的交付 skill：复现优先 → 日志/DB 根因 → 最小修 → typecheck/test →
  按显式路径 commit → SSH 直推。适用于「接一条工单改代码」「怎么定位根因」
  「改完怎么证明没破」「怎么提交」等场景。
  完整脚本见 docs-coolie/playbooks/swe-delivery-flow.md。
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

### 6 回报

`任务 / 根因 / 修改 / 验证 / 产出 / 未做`。

## 已知坑（编自 PM-FAILURE-CASES）

1. 简报缺复现信息 → 要截图+错误原文+复现路径，或存档不硬修。
2. claude 沙箱拦 git/pnpm/gradle → 写 fallback；keystore/发版交门神。
3. 命令炸 zsh → 只用单引号 ASCII。
4. `git add .` 夹带任务外文件 → 按显式路径 add。
5. 紧急跳过 typecheck 就发版 → 必跑 `pnpm -r typecheck` + prod 烟测。
6. 密码进 transcript → 用环境变量/secret 注入，泄露即轮换。
7. 别人的 WIP 不能动、不能提交。

## 验收标准

1. 有复现证据（先红后绿），或记录"无法复现及原因"。
2. 根因有日志/DB 证据。
3. `pnpm -r typecheck` 0 报错，相关测试绿。
4. commit 只含白名单文件，信息说清因果与验证。
5. 有状态特性做了写入-回读实证。

## 反例

- 没复现就改，"看起来修好了"。
- 一个 commit 大扫除。
- 单测绿就宣布能用。

## 关联

- 拟真人验收 → `qa-humanlike-e2e`；发版 → `sre-release-and-deploy`
