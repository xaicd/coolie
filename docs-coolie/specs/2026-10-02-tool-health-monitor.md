# Spec: 本地工具健康与套餐状态监控

## 1. Requirement

本地施工队的工具池很多，工具不是员工硬绑定；Hermes 派活前必须知道哪些工具当前可用、套餐/额度是否危险、哪个工具最适合当前任务。

验收条件：

- WHEN 定时探测触发 THEN 系统 SHALL 真跑每个工具，而不是只检查 PATH。
- WHEN 工具失败 THEN 系统 SHALL 记录失败原因和建议兜底工具。
- WHEN Hermes 派活 THEN it SHALL 能读取最新工具健康状态，避免派给不可用工具。
- WHEN 工具套餐临近到期或额度耗尽 THEN 微信/状态输出 SHALL 能提示老板。

## 2. Design

### 2.1 本地状态文件

先做本地 JSON，不直接上 DB。

```text
.paperclip-local/tool-health/latest.json
```

### 2.2 JSON schema

```json
{
  "schemaVersion": 1,
  "checkedAt": "2026-10-02T15:00:00+08:00",
  "tools": {
    "agy-gemini3.8": {
      "status": "ok",
      "bestFor": ["原型", "选型", "架构研判"],
      "recommendedEmployees": ["墨斗"],
      "quota": null,
      "resetAt": null,
      "expiresAt": null,
      "latencyMs": 12000,
      "reason": null
    },
    "claude-glm": {
      "status": "warn",
      "bestFor": ["代码", "契约", "架构落地"],
      "recommendedEmployees": ["铁匠"],
      "quota": "78%",
      "resetAt": "22:55",
      "expiresAt": null,
      "latencyMs": 4000,
      "reason": "quota below warning threshold"
    }
  }
}
```

### 2.3 工具探测规则

| 工具 | 探测 |
|---|---|
| agy-gemini3.8 | `docker exec agy-ubuntu-container agy -p '回复 OK'` |
| claude-glm | `ANTHROPIC_MODEL=glm-5 claude -p '回复 OK'` |
| claude-mm | `ANTHROPIC_MODEL=MiniMax-M3 claude -p '回复 OK'` |
| cmd | `cmd -p '回复 OK'` |
| copilot | `copilot -p '回复 OK'` |
| Hermes | `cron-team-status.sh --print` 能运行 |
| kiro-cli | `kiro-cli -p '回复 OK'`，失败也要记录真实错误 |

### 2.4 输出格式

```text
【工具健康·15:00】
可用: claude-mm / claude-glm / agy / Hermes
警告: copilot 配额 95%, 1号8点重置
失败: cmd Unable to connect, 建议等 5min 或切 claude-mm
```

## 3. Task

1. 新增 `scripts/tool-health-monitor.sh`
   - 白名单：`scripts/tool-health-monitor.sh`
   - 支持 `--check` / `--print` / `--json` / `--register` / `--unregister`。
   - 默认 `--print`。
   - 写 `.paperclip-local/tool-health/latest.json`。

2. 复用 `scripts/daily-tool-probe.sh`
   - 白名单：`scripts/daily-tool-probe.sh`
   - 复用其真跑逻辑，不复制一份难维护的探测命令。

3. 接入 `scripts/cron-team-status.sh`
   - 白名单：`scripts/cron-team-status.sh`
   - 状态输出的工具字段可读取 latest health，显示 `ok/warn/fail`。

4. QA
   - 白名单：`docs-coolie/evidence/waveXXX/QA-REPORT.md`
   - 记录一次真实 `--print` 输出和 latest JSON 片段。

## 4. 不动项

- 不存工具密钥、账号、套餐购买信息。
- 不把本地工具套餐写进产品运行时 company/team 模型。
- 不要求所有工具都成功；失败要成为可见状态。
- 不删除 `daily-tool-probe.sh`，两者互补。

## 5. Gate

- G2: `bash -n scripts/tool-health-monitor.sh` 通过。
- G3: 至少一个工具失败时脚本仍完成并写 JSON。
- G4: 输出中文、简短、老板能一屏看懂。
- G5: cron 注册幂等，不重复添加。
