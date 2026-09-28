# Playbook: Operations Director / 运营总监 — 任务编排与匠人池

> 角色:运营总监。定位:匠人池排班、任务编排、进度追踪、断网猝死接力重派。
> 对应 skill:`.agents/skills/ops-task-orchestration/SKILL.md`
> 素材来源:`docs-coolie/PM-DISPATCH-RULES.md`、`docs-coolie/PM-FAILURE-CASES.md`、wave84–127 派单实况。

## 触发条件

- 有工单要派给匠人(cmd / claude / agy 本地员工)。
- 需要看"现在谁在干活、哪条卡住了、要不要重派"。
- 某个匠人进程断网/猝死,活卡在半路,要接力。

## 匠人池(本地员工)

| 匠人 | 代号 | 特长 | 并发纪律 |
|---|---|---|---|
| 门神 | cmd | 发版、打包、跨端(cmd 1.5x 有 API 速率限制) | 同一匠人间隔 ≥3 分钟 |
| 铁匠 | claude | 纯代码改、有 sandbox 限制 | 间隔 ≥30 秒 |
| 墨斗 | agy | **本波明确不用**("不要用 agy") | 暂缓 |

**排班铁律**:
- **同一仓库单写者**:同一时间只让一个匠人写同一个仓库,避免互相踩。并行只用于
  互不相交的文件范围(白名单必须不重叠)。
- **冷却**:cmd 连环派单会撞速率限制(F1/F12),派单之间要有冷却。
- **日上限**:自约束 ~8 个派单(4 cmd + 2 claude + 2 人工 review)。

## 前置

```sh
export API=https://xrobinai.cn/api
export CID=4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e
export KEY="$PAPERCLIP_API_KEY"
H=(-H "Authorization: Bearer $KEY" -H "x-paperclip-api-key: $KEY")
```

## 步骤

### 1. 派单简报必须齐 7 要素(缺一项匠人拒接)

模板(`docs-coolie/briefs/<date>-<slug>.md`):

```
# <一行动词任务标题>
## 背景      <为何做 + 关联 commit/文档/用户场景>
## 目标      <一句话可验收目标>
## 分支      <main / release/x.y / 新建分支名,写明 git checkout>
## 文件范围(白名单)  <绝对路径列表,声明"不动 X">
## 步骤      <1..n,含 typecheck 命令>
## 验收      <tsc 0 / commit 约定 / 产出物路径>
## 规则      <NO PUSH / 不碰敏感区 / fallback>
```

坑:简报里**不要**出现 heredoc 反引号或 `$`(会炸 zsh,F3);写文件用
`cat > /tmp/brief.md <<'EOF' ... EOF`(单引号 EOF)。

### 2. 派单前自检(决策树)

```sh
git status --porcelain          # 工作区是否干净
git rev-parse --abbrev-ref HEAD # 当前分支是否与简报一致
```

- 分支不对 → **abort,不派**(F6:曾两次 v0.3.6 错位被拒发)。
- 文件范围列不出白名单 → 拆任务,别硬派。
- 涉及发版 → 派门神,`max-turns 80+`,明写"不审 bug 不发版"(F7)。

### 3. 进度追踪(2 分钟汇报纪律)

派单时记 **receipt**:`pid + 匠人 + brief 路径 + 分支`;完工补
`commit hash + 产物 URL + 验收反馈`(F13)。看系统侧实时状态:

```sh
# 大盘:谁在跑、几条 blocked
curl -fsS "${H[@]}" "$API/companies/$CID/dashboard"

# 逐条看 blocked 工单(卡住的活)
curl -fsS "${H[@]}" "$API/companies/$CID/issues?status=blocked"

# 看某条工单的活跃 run(正在执行的会话)
curl -fsS "${H[@]}" "$API/issues/$ISSUE_ID/active-run"
```

### 4. 改派 / 唤醒(接力重派的执行侧)

工单改派给另一个匠人:

```sh
curl -fsS -X PATCH "${H[@]}" -H 'Content-Type: application/json' \
  --data '{"assigneeAgentId":"<新匠人 agent id>","status":"todo"}' \
  "$API/issues/$ISSUE_ID"
```

叫醒一个 agent 去接活:

```sh
curl -fsS -X POST "${H[@]}" "$API/agents/$AGENT_ID/wakeup"
```

### 5. 断网猝死接力重派(本角色最重要的动作)

1. 先判真死还是假死:进程表 + 心跳。
   ```sh
   ps aux | grep -E 'cmd -p|claude -p' | grep -v grep
   curl -fsS "${H[@]}" "$API/companies/$CID/live-runs"
   ```
2. 死透了 → `pkill -f 'cmd -p.*yolo'` 清场(F1),**等 5 分钟**再重试。
3. 活干到哪:看工单最新 comment / 工作区 git 状态,别让接力的人从零重来。
4. **只派"未完成的那一段"**,白名单收窄到剩余文件;新简报里点名"上一位卡在 X,从 Y 继续"。
5. 重派前确认没有残留写者(单写者纪律),否则两个匠人同时写同一仓库。

### 6. 验收派单产出

```sh
git diff HEAD~1 HEAD --stat     # 复核文件清单,防止匠人夹带任务外改动(F4)
git show --stat <commit>
```

### 7. 任务受阻排查：403 RESPONSIBLE_USER_UNAVAILABLE

症状:员工干完活交不上——agent run 里每次 `POST/PATCH /api/issues/:id/comments` 等都吃 403,
系统等不到 disposition,periodic heartbeat recovery 就把工单判 `blocked`
(`missing disposition ... board decision required`),而且自己修不好(`dispositionRepairQueued` 恒为 0)。

先在生产服务器上确认是不是这一类:

```sh
# 近 24h 有没有这条拒绝;有 → 命中本类问题
ssh tc-coolie-claw "sudo journalctl -u coolie --since '-24 hours' --no-pager \
  | grep RESPONSIBLE_USER_UNAVAILABLE | tail -5"

# 判据:日志里出现 responsibleUserId 而且它的值是合成身份(不是任何真实用户),
#   典型就是 paperclip-concierge —— 来自本机 x-paperclip-api-key(loopback board concierge)。
#   真正原因是建单时把合成身份写进了 issue 的 responsible_user_id,run 继承后过不了
#   "responsible-user company access intersection"(authz.ts assertCompanyAccess)。

# 受影响工单(应为 0;非 0 就是存量脏数据)
ssh tc-coolie-claw 'DBU=$(sudo sed -n "s/^DATABASE_URL=//p" /etc/coolie/secrets.env | tr -d "\r"); \
  psql "$DBU" -c "select identifier,status,responsible_user_id from issues \
  where responsible_user_id='"'"'paperclip-concierge'"'"';"'
```

处理:

1. **代码**(本波已修,勿回退):所有写入路径(建单 / run seed / run identity / agent key / routine)统一走
   `server/src/services/responsible-user.ts` 的 `resolveCompanyScopedResponsibleUserId`,只把合成
   concierge 换成公司真实默认用户。改这条链路前先读 `docs-coolie/audit/WAVE134-RESPONSIBLE-USER-403.md`。
2. **存量**:把 issue/run/identity 三类表的 `paperclip-concierge` 批量改成公司真实 owner
   (`companies.default_responsible_user_id`);`created_by_user_id` 是历史归属,不改。
3. **解封验证**:对受影响工单重新 wake 其 assignee,看两件事——
   ```sh
   # 日志里不再出现该拒绝(窗口内计数为 0)
   # 工单脱离 blocked(blocked → done / in_progress)
   ```
   注意:重派后仍 `blocked` 的,要读其最新 comment 判断是不是 agent 依**自身业务**给出的正常
   board 决策阻塞,而不是把「没解封」都算到这条 auth bug 头上。


1. 每个派单都能追到一个 brief 文件 + 一个 commit(receipt 齐备,F13)。
2. 同一时段同一仓库只有一个写者;并发只在白名单互不相交时出现。
3. 重派的任务简报明确写了"卡点 + 续跑起点",没有从零重做。
4. `dashboard.tasks.blocked` 的每一条都有归属(有主/已重派/已关),没有无人认领的活。
5. 冷却是真的:相邻派单间隔达 ≥3min(cmd)/≥30s(claude)。

## 失败分支

| 编号 | 症状 | 原因 | 处置 |
|---|---|---|---|
| F1 | cmd "Unable to connect"/静默退出 | cmd 撞自身 API 速率限制 | pkill 清场,等 5 分钟,间隔 ≥3 分钟再派 |
| F2 | claude 被 sandbox 拦 git/pnpm/gradle | Claude Code 默认沙箱 | 简报写 fallback;keystore/真发版改用门神 |
| F3 | `zsh: command not found` / `unexpected EOF` | 简报含 heredoc/反引号 | 用单引号 EOF;代码示例用 ASCII 引号 |
| F4 | commit 夹带任务外文件 | 白名单不清 | `git diff --stat` 复核 + 简报强制白名单 |
| F5 | 匠人回"找不到 bug/没法复现" | 简报缺复现信息 | 补:截图+错误原文+复现路径;仍不能复现则存档 `_failed-*.md`,不硬派 |
| F6 | 版本号与分支错位 | 简报没写 checkout | abort 重写简报;不信"门神会自己看" |
| F7 | "Reached maximum turns" | max-turns 不够 | 发版类 80–160,普通 30–50,单文件 20 |
| F12 | 10 分钟连派 4 个 → 全撞限流 | 无冷却 | 强制冷却 + 日上限 |
| F14 | 工单被判 blocked,agent 报 403 `RESPONSIBLE_USER_UNAVAILABLE` | 建单/run 写入了合成身份 `paperclip-concierge` 当 responsibleUser | 见 §7:修入归属 + 存量改正 + 重派验证 |

## 关联

- 派的是开发活 → `swe-delivery-flow.md`;派的是测试活 → `qa-humanlike-e2e.md`
- 上线 → `sre-release-and-deploy.md`;卡在钱上 → `finance-budget-guard.md`
