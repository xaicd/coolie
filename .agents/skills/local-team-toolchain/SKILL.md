---
name: local-team-toolchain
description: 本地施工队（本体团队：Hermes/铁匠/墨斗/门神/兑底渊/百晓生）跨环境（Docker 容器 vs Mac 宿主机）调度 7 大工具池（claude-glm, claude-mm, cmd, copilot, agy, kiro-cli, hermes）的权威指南。涵盖 host-exec 穿透调用、dispatch 派单分流、context-bus 上下文接力总线、gate-evidence-ledger 门禁阻断与 .coolie-local 规范。
---

# local-team-toolchain — 本地团队跨环境工具池调度指南

> **核心原则**: 工具与角色不硬绑定，工具是“手”，按任务强项与额度调度；容器与宿主机异构分布，通过标准脚本统一透明调度；所有本地运行态收敛在 `.coolie-local/`。

---

## 1. 物理环境与 7 工具池真实分布

| 工具名称 (`--tool`) | 真实物理分布 | 调用方式 | 最强工种 / 场景 |
|---|---|---|---|
| **`agy-gemini3.8`** (或 `agy`) | **Docker 容器内** (`agy 1.2.15`) | 本地直接调用 `agy -p ...` | 墨斗 (FDA) — 原型、选型研判、长篇中文审计 |
| **`claude-glm`** | **Mac 宿主机** (`/opt/homebrew/bin/claude 2.1.287`) | `bash scripts/host-exec.sh claude -p ...` | 铁匠 (Core SWE) / 百晓生 (DS) — 核心业务代码、契约守护 |
| **`claude-mm`** | **Mac 宿主机** (`/opt/homebrew/bin/claude`) | `bash scripts/host-exec.sh claude -p ...` | 铁匠 (Core SWE) — 长文本、备用大模型调度 |
| **`cmd`** | **Mac 宿主机** (`/opt/homebrew/bin/cmd 1.74.0`) | `bash scripts/host-exec.sh cmd -p ...` | 门神 (FDSE) / 铁匠贰号 — 单测、E2E、自动化批处理 |
| **`copilot`** | **Mac 宿主机** (`/opt/homebrew/bin/copilot 1.0.91`) | `bash scripts/host-exec.sh copilot -p ...` | 兑底渊 (PRE-SRE) — 发版校验、OTA、监控、巡检 |
| **`Hermes`** | **通用（宿主/容器均有）** | 调度脚本 (`cron-team-status.sh` 等) | Hermes (PM / 掌柜) — 派单、进度核查、门禁汇总 |
| **`kiro-cli`** | **Mac 宿主机（老板专属保留）** | `bash scripts/host-exec.sh kiro-cli` | Hermes / 墨斗 — 架构设计、Spec 驱动大重构 |

---

## 2. 核心调度与协同四件套

在容器或宿主机中，**严禁口头传话或手动执行混乱的 CLI 命令**。必须统一走标准化脚本：

### 2.1 派单与分流执行 (`scripts/dispatch-local-employee.sh`)
Hermes 派单给员工的标准入口，自动生成收据、继承上游上下文，并在 `--execute` 时按工具真分流：

```bash
# 1. 派单并记录 receipt (初始 queued 状态，自动拼装 prompt)
bash scripts/dispatch-local-employee.sh --agent forge-core-swe --task "修复接口超时缺陷" --wave wave285

# 2. 查看当前排队工单
bash scripts/dispatch-local-employee.sh --queued

# 3. 真实启动工具执行
bash scripts/dispatch-local-employee.sh --agent forge-core-swe --task "修复接口超时缺陷" --execute

# 4. 任务完成回写并附带证据 (受 G1-G5 门禁强制阻断保护)
bash scripts/dispatch-local-employee.sh --update <receipt-id> --status done --commit <hash> --evidence <report-path>
```

### 2.2 跨工具/跨工种上下文接力总线 (`scripts/context-bus.sh`)
解决“墨斗 FDA -> 铁匠 Core SWE -> 门神 FDSE -> 兑底渊 PRE-SRE -> 百晓生 DS”的上下文断层：

```bash
# 工序完成时推送到总线 (不可变流转链)
bash scripts/context-bus.sh --push \
  --wave wave285 \
  --agent modou-fda \
  --tool agy-gemini3.8 \
  --files "docs-coolie/specs/xyz.md" \
  --artifacts "docs-coolie/specs/xyz.md" \
  --gate G1_FDA \
  --note "架构方案已完成，请铁匠接单编写核心实现"

# 下游拉取前序所有成果与交接嘱托
bash scripts/context-bus.sh --pull wave285
```

### 2.3 CMMI 质量门禁合规账本 (`scripts/gate-evidence-ledger.sh`)
每一波交付必须独立固化 5 大角色证据，严禁跨工种借用：

```bash
# 初始化波次账本
bash scripts/gate-evidence-ledger.sh --init wave285 --task "核心功能重构"

# 登记门禁结果
bash scripts/gate-evidence-ledger.sh --set G2_CoreSWE --status passed --summary "typecheck 0 报错，单测全绿" wave285

# 强校验当前波次门禁是否合规（工单标记 done 时的硬阻断检查器）
bash scripts/gate-evidence-ledger.sh --verify wave285
```

### 2.4 工具可用性与健康探针 (`scripts/tool-health-monitor.sh`)
真跑每个工具并测试毫秒级响应，带有 15 分钟 TTL 缓存防止风控：

```bash
# 终端与微信 3 行简报
bash scripts/tool-health-monitor.sh --print

# 强制真跑全量探针（穿透 Mac 宿主机）并刷新 .coolie-local/tool-health/latest.json
bash scripts/tool-health-monitor.sh --check --force
```

---

## 3. 运行态目录规范 (`.coolie-local/`)

所有本地施工态数据统一存放在仓库根目录下的 `.coolie-local/`：
- `.coolie-local/dispatch/`：派单收据 (`.json`) 与生成的 Prompt (`.md`)
- `.coolie-local/evidence-ledger/`：各波次 CMMI 门禁证据账本
- `.coolie-local/context-bus/`：多工具协同接力链记录
- `.coolie-local/tool-health/`：健康状态探针与 TTL 缓存
- `.coolie-local/event-trigger/`：通知状态机
- `.coolie-local/credentials.md`：本地调试凭据

> **红线警示**：`.coolie-local/` 已经配置在 `.gitignore` 中。任何临时文件只允许落在此目录，严禁在根目录乱建临时文件污染 Git。
