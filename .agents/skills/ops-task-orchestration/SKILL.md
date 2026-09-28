---
name: ops-task-orchestration
description: >
  运营总监视角的任务编排 skill：匠人池排班、7 要素派单简报、单写者/冷却纪律、进度追踪、
  断网猝死接力重派。适用于「把这活派给谁」「现在谁在干活/哪条卡住了」「匠人断了怎么接」
  「怎么保证两个匠人不互相踩」等场景。
  完整脚本见 docs-coolie/playbooks/ops-task-orchestration.md。
---

# Operations Director / 运营总监 — 任务编排与匠人池

**一句话职责**：让活有主、有节奏、不互相踩；断了能接力，不是从零重做。

## 何时用

- 有工单要派给匠人（cmd / claude；本仓 **不用 agy**）。
- 要看谁在干活、哪条 blocked、要不要重派。
- 某个匠人断网/猝死，活卡在半路。

## 匠人池与纪律

| 匠人 | 特长 | 冷却 |
|---|---|---|
| 门神 cmd | 发版/打包/跨端 | 同匠人 ≥3 分钟 |
| 铁匠 claude | 纯代码改（有沙箱限制） | ≥30 秒 |
| 墨斗 agy | 本波不用 | 暂缓 |

铁律：
- **同一仓库单写者**：同一时间只让一个匠人写同一仓库；并发只在白名单互不相交时。
- **日上限** ~8 个派单；连环派单会撞速率限制。
- 涉及发版 → 派门神，`max-turns 80+`，明写"不审 bug 不发版"。

## 执行步骤

### 1 派单简报必须齐 7 要素

`背景 / 目标 / 分支 / 文件范围(白名单) / 步骤 / 验收 / 规则`，缺一拒接。
简报里**不要**出现 heredoc 反引号或 `$`（会炸 zsh）；写文件用 `cat > x <<'EOF' ... EOF`。

### 2 派前自检

```sh
git status --porcelain            # 干净?
git rev-parse --abbrev-ref HEAD   # 分支与简报一致?
```

分支不对 → abort（历史上有过版本/分支错位被拒发）。

### 3 进度追踪（2 分钟汇报）

```sh
export API=https://xrobinai.cn/api
export CID=<company-id>
export KEY="$PAPERCLIP_API_KEY"
H=(-H "Authorization: Bearer $KEY" -H "x-paperclip-api-key: $KEY")

curl -fsS "${H[@]}" "$API/companies/$CID/dashboard"
curl -fsS "${H[@]}" "$API/companies/$CID/issues?status=blocked"
curl -fsS "${H[@]}" "$API/issues/$ISSUE_ID/active-run"
```

派单时记 receipt（pid/匠人/brief/分支），完工补 commit hash + 产物 URL。

### 4 改派 / 唤醒

```sh
curl -fsS -X PATCH "${H[@]}" -H 'Content-Type: application/json' \
  --data '{"assigneeAgentId":"<新agent>","status":"todo"}' "$API/issues/$ISSUE_ID"
curl -fsS -X POST "${H[@]}" "$API/agents/$AGENT_ID/wakeup"
```

### 5 断网猝死接力重派

1. 判真假死：`ps aux | grep -E 'cmd -p|claude -p'`；`GET /companies/$CID/live-runs`。
2. 死透 → `pkill -f 'cmd -p.*yolo'`，**等 5 分钟**再重试。
3. 看活到哪（最新 comment + 工作区 git 状态）。
4. **只派未完成的那段**，白名单收窄，简报点名"卡在 X，从 Y 继续"。
5. 确认无残留写者再派（单写者）。

## 已知坑（编自 PM-FAILURE-CASES）

| 症状 | 处置 |
|---|---|
| cmd "Unable to connect" | pkill + 等 5 分钟；间隔 ≥3 分钟 |
| claude 被沙箱拦 git/pnpm/gradle | 简报写 fallback；发版交门神 |
| 简报炸 zsh | 单引号 EOF，ASCII 引号 |
| commit 夹带任务外文件 | 白名单 + `git diff --stat` 复核 |
| "找不到 bug/没法复现" | 补截图+错误原文+复现路径；不能复现则存档 `_failed-*` |
| max-turns 不够 | 发版 80-160，普通 30-50 |

## 验收标准

1. 每个派单可追到 brief + commit（receipt 齐）。
2. 同时段同仓库只有一个写者。
3. 重派简报写明"卡点 + 续跑起点"。
4. `blocked` 每条都有归属，无无人认领。
5. 冷却真实执行。

## 反例

- 同一仓库两个匠人同时写。
- 10 分钟连派 4 个，全撞限流。
- 重派让下一个人从零重做。

## 关联

- 开发 → `swe-delivery-flow`；测试 → `qa-humanlike-e2e`
- 上线 → `sre-release-and-deploy`；钱 → `finance-budget-guard`
