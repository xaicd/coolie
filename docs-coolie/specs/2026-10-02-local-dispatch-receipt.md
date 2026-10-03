# Spec: 本地施工队派单 Receipt

## 1. Requirement

Hermes 给本地施工队派活时，必须写入结构化 receipt，让“谁接了什么活、用什么工具、状态如何、证据在哪”成为可读取真值，而不是只存在于微信聊天、brief 文档或 `ps` 推断中。

验收条件：

- WHEN Hermes 通过本地派单脚本派给任一员工 THEN 系统 SHALL 在 `.coolie-local/dispatch/` 写入一条 JSON receipt。
- WHEN 老板问“啥进展” THEN `cron-team-status.sh` SHALL 优先读取 receipt 状态，再回退到进程探测。
- WHEN 任务完成 THEN receipt SHALL 能记录 commit、验证命令、QA 报告、artifact/evidence 路径。
- WHEN 任务卡死或失败 THEN receipt SHALL 记录 blocked/failed reason，供 Hermes 缩小范围接力重派。

## 2. Design

### 2.1 数据位置

本地施工队 receipt 只服务建设 Coolie 产品，不进入产品运行时数据库。

```text
.coolie-local/dispatch/
  20261002T150000Z-wave283-forge-core-swe.json
```

`.coolie-local/` 已是本机运行态目录，不应提交。

### 2.2 Receipt schema

```json
{
  "schemaVersion": 1,
  "id": "20261002T150000Z-wave283-forge-core-swe",
  "wave": "wave283",
  "createdAt": "2026-10-02T15:00:00+08:00",
  "bossInput": "派铁匠修登录 bug",
  "pm": "Hermes",
  "employee": "铁匠",
  "subagentType": "forge-core-swe",
  "task": "修登录 bug",
  "tool": "claude-glm",
  "fallbackTools": ["claude-mm", "cmd"],
  "branch": "main",
  "specPath": "docs-coolie/specs/...",
  "briefPath": "docs-coolie/briefs/...",
  "allowlist": [],
  "status": "queued",
  "pid": null,
  "startedAt": null,
  "completedAt": null,
  "commit": null,
  "verification": [],
  "evidence": [],
  "blockedReason": null
}
```

### 2.3 状态机

```text
queued → running → done
queued → blocked
running → blocked
running → failed
blocked → running
blocked → cancelled
failed → queued  (retry/new attempt)
```

### 2.4 输出接入

`cron-team-status.sh --print` 输出 3 行以内：

```text
【wave进展·15:00】
跑: 铁匠 wave283 (26m, claude-glm + forge-core-swe)
卡: 门神 wave281 (4h12m, cmd, 建议切铁匠)
完: wave282 落仓 8914181d8
```

## 3. Task

1. 修改 `scripts/dispatch-local-employee.sh`
   - 白名单：`scripts/dispatch-local-employee.sh`
   - 创建 `.coolie-local/dispatch/`。
   - 默认写 receipt。
   - `--execute` 时把 status 更新为 `running`，并记录 pid/startedAt（能拿到时）。

2. 修改 `scripts/cron-team-status.sh`
   - 白名单：`scripts/cron-team-status.sh`
   - 先读取 `.coolie-local/dispatch/*.json`。
   - receipt 存在时优先使用 receipt 生成 3 行输出。
   - 没有 receipt 时保留现有 `ps` 兜底。

3. 增加最小验证
   - 白名单：`docs-coolie/evidence/waveXXX/QA-REPORT.md`
   - 验证 `dispatch-local-employee.sh --agent forge-core-swe --task demo` 会写 receipt。
   - 验证 `cron-team-status.sh --print` 能读到 receipt。

## 4. 不动项

- 不写入产品数据库。
- 不改变 Coolie 产品内置 company/team/agent/task 模型。
- 不注册无人值守 cron。
- 不把本地员工工具硬编码到产品运行时。

## 5. Gate

- G2: shellcheck 或 `bash -n` 通过。
- G3: 本地 dry-run 产生 receipt，并能被 status 脚本读取。
- G4: 老板视角输出不超过 3 行，不含调试噪音。
