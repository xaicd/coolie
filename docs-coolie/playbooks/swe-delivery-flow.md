# Playbook: SWE / 研发员工 — 复现→定位→最小修→测→提交

> 角色:研发员工(cmd / claude)。定位:把一条工单从"红"改成"绿",并留下可复核的证据链。
> 对应 skill:`.agents/skills/swe-delivery-flow/SKILL.md`
> 素材来源:`.agents/skills/bug-fix-flow`、`core-swe`、`docs-coolie/PM-FAILURE-CASES.md`、wave84–127 真实提交链。

## 触发条件

- 接到一条工单(bug / 小功能 / 修复)。
- 老板/产品给了复现路径或错误原文。

## 前置

- 已在工单要求的**分支**上(`git rev-parse --abbrev-ref HEAD` 确认)。
- 工作区干净或只含本次相关的改动;别人的 WIP **不动、不提交**(F14)。
- 本仓命令一律 **zsh 安全**:只用单引号。
- 推送必须绕过本地代理:`GIT_SSH_COMMAND='ssh -o ProxyCommand=none' git push origin main`。

```sh
git rev-parse --abbrev-ref HEAD     # 期望 main
git status --porcelain
```

## 步骤

### 1. 复现优先(没复现不发版、不盲修)

- 拿到错误原文(logcat / Alert 文案)+ 截图(带 URL)+ 复现路径。
- 能自动化就自动化:能用 curl 命中后端的先 curl;UI 问题必须真点。
- **复现失败**:不硬修。把简报存档 `docs-coolie/briefs/_failed-<date>-*.md`,回报"无法复现 + 缺什么"(F5)。

### 2. 根因(日志 / DB 真值,不看投影)

```sh
# 生产日志抓真凶(本地/远端同样命令)
ssh tc-coolie-claw 'journalctl -u coolie -n 200 --no-pager | tail -40'

# DB 真值核对(库是唯一真值,API 是投影)
ssh tc-coolie-claw "sudo -u postgres psql coolie -tAc \"<SQL>\""
```

铁律:**投影层(state/dashboard)与 DB 真值不一致时,信 DB**。写下证据:
"日志第 N 行 + 表 X 第 M 行",不要只写"我看到好像是这样"。

### 3. 最小修(不顺手改别的)

- 只改工单白名单里的文件;不重构、不格式化无关代码、不换依赖。
- 一个失败类反复出现 → 把它变成**机制**(测试/守卫/断言),不是再加一句警告注释。
- 不改断言去迁就数据("我没有放松断言去迁就数据,那不叫修")。

### 4. 自测(typecheck + 单测,红不交)

```sh
pnpm -r typecheck                     # 全仓 0 报错
pnpm test                             # 默认 Vitest 套件(便宜的那套)
# 涉及具体包时先跑最小相关验证,别一上来全量
pnpm --filter @paperclipai/<pkg> test
```

判据:typecheck 0;相关测试绿。**"单元测试绿"不等于特性可用** —— 有状态/写库的特性
必须真写一遍再读回来(见 `qa-humanlike-e2e.md`,本仓反复踩过)。

### 5. 提交(按显式路径,不用 `git add .`)

```sh
git add <明确列出的文件1> <明确列出的文件2>
git commit -F - <<'EOF'
fix(<scope>): <一句话因果,不是复述 diff>

<为什么这么修 + 验证证据:跑了哪个门、哪条测试从红变绿>
<非显而易见的坑写进提交信息,给下一个读者>
EOF
git diff HEAD~1 HEAD --stat           # 自查:文件清单是否只有白名单
```

- **一次一个独立 commit**(一个逻辑一个提交),不要一次大扫除。
- 不加没有必要的向后兼容 shim;删掉的代码真删掉。
- **NO PUSH**(默认):推送由老板/运营批量执行。老板放行后:
  ```sh
  GIT_SSH_COMMAND='ssh -o ProxyCommand=none' git push origin main
  ```

### 6. 回报格式(给运营/产品验收)

```
任务: <工单>
根因: <日志/DB 证据,file:line 或 SQL>
修改: <文件清单>
验证: <命令 + 结果,typecheck / 测试>
产出: <commit hash(+APK URL / 产物路径,如适用)>
未做: <明确清单,如"未发版,等放行">
```

## 验收标准

1. 有复现证据(先红后绿),或明确记录"无法复现及原因"。
2. 根因定位有日志/DB 证据,不是猜测。
3. `pnpm -r typecheck` 0 报错,相关测试绿。
4. commit 只含白名单文件(`git diff --stat` 可证),提交信息说清因果与验证。
5. 有状态特性做了"写一遍再读回来"的实证。

## 失败分支

| 编号 | 症状 | 原因 | 处置 |
|---|---|---|---|
| F1 | 没法复现 | 简报缺信息 | 要截图+错误原文+复现路径;或存档 `_failed-*` 不硬修 |
| F2 | git/pnpm/gradle 被 sandbox 拒 | claude 沙箱 | 写 fallback;keystore/发版交门神 |
| F3 | 命令被 zsh 拆碎 | 弯引号/反引号/heredoc | 只用单引号 ASCII |
| F4 | commit 夹带任务外文件 | 用了 `git add .` | 改按显式路径 add;`git diff --stat` 复核 |
| F6 | 分支/版本错位 | 没 checkout | 发版前 `git rev-parse --abbrev-ref HEAD` 断言 |
| F8 | 没 typecheck 就发版 | 紧急跳过验收 | 必跑 `pnpm -r typecheck`,并 prod 烟测 |
| F9 | 密码进了 transcript | 明文写密码 | 用环境变量/secret 注入;泄露即轮换 |
| F14 | 干了别人 WIP 的活 | 跨派单 WIP 叠加 | 简报明写"不动 X";必要时只 stash 冲突的单个文件 |

## 关联

- 改完要拟真人验收 → `qa-humanlike-e2e.md`
- 要发版上线 → `sre-release-and-deploy.md`;线上抓真凶 → `sre-release-and-deploy.md` 的排障小节
