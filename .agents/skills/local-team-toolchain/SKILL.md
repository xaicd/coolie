---
name: local-team-toolchain
description: 本地施工队（本体团队：Hermes/铁匠/墨斗/门神/兑底渊/百晓生）跨环境（Docker 容器 vs Mac 宿主机）调度 7 大工具池（claude-glm, claude-mm, cmd, copilot, agy, kiro-cli, hermes）的权威指南。涵盖 host-exec 穿透调用、dispatch 派单分流、context-bus 上下文接力总线、gate-evidence-ledger 门禁阻断与 .coolie-local 规范。
---

# local-team-toolchain — 本地团队跨环境工具池调度指南

> **核心原则**: 工具与角色不硬绑定，工具是“手”，按任务强项与额度调度；容器与宿主机异构分布，通过标准脚本统一透明调度；所有本地运行态收敛在 `.coolie-local/`。

---

## 1. 物理环境与 7 工具池真实分布与调用契约

> **核心哲学（消灭万能网桥卡点）**：不搞重型中间件网桥/Proxy，以“透明工具规范 + 严格物理调用说明 + 免交互自愈脚本”直调底层 CLI。

| 工具名称 (`--tool`) | 真实物理分布 | 底层二进制与配置文件 | 标准调用方式 (必须带防挂死标志) | 最强工种 / 场景 |
|---|---|---|---|---|
| **`agy-gemini3.8`** (或 `agy`) | **Mac 宿主 Docker 容器** (`agy-ubuntu-container`) | 容器内 `/root/.local/bin/agy` (v1.3.0) + Gemini 3.8 | 宿主 base64 包装 Prompt -> `docker cp` -> 容器内 `LANG=C.UTF-8` + `base64 -d` -> `agy --dangerously-skip-permissions -p "$PROMPT"` | 墨斗 (FDA) — 原型草图、选型研判、长篇中文文档审计 |
| **`claude-glm`** | **Mac 宿主机** (`/opt/homebrew/bin/claude 2.1.287`) | **单一 `claude` CLI** + `~/.claude/settings.jsonglm` | `ln -sf ~/.claude/settings.jsonglm ~/.claude/settings.json && claude -p "$PROMPT" --dangerously-skip-permissions < /dev/null` (BigModel `glm-5.3[1m]`) | 铁匠 (Core SWE) / 百晓生 (DS) — 核心业务代码、契约守护 |
| **`claude-mm`** | **Mac 宿主机** (`/opt/homebrew/bin/claude 2.1.287`) | **单一 `claude` CLI** + `~/.claude/settings.jsonmm` | `ln -sf ~/.claude/settings.jsonmm ~/.claude/settings.json && claude -p "$PROMPT" --dangerously-skip-permissions < /dev/null` (MiniMax `MiniMax-M3`) | 铁匠贰号 (Core SWE 兜底) — 长输出、抗并发 |
| **`cmd`** | **Mac 宿主机** (`/opt/homebrew/bin/cmd 1.74.3`) | `@commandcode/ai` CLI | `cmd -p "$PROMPT" --yolo --tools-all -t < /dev/null` | 门神 (FDSE) / 铁匠贰号 — 单测、E2E、自动化批处理 |
| **`copilot`** | **Mac 宿主机** (`/opt/homebrew/bin/copilot 1.0.91`) | GitHub Copilot CLI | `copilot -p "$PROMPT" --yolo < /dev/null` | 兑底渊 (PRE-SRE) — 发版校验、OTA、监控、巡检 |
| **`Hermes`** | **通用（宿主/容器均有）** | Hermes 会话引擎（人即工具） | `scripts/dispatch-local-employee.sh` 调度派发 | Hermes (PM / 掌柜) — 派单、进度核查、门禁汇总 |
| **`kiro-cli`** | **Mac 宿主机（老板专属保留）** | AWS Kiro CLI | `kiro-cli -p "$PROMPT" < /dev/null` | Hermes / 墨斗 — 架构设计、Spec 驱动大重构 |

### 1.1 `claude-*` 工具族配置文件软链接切换铁律
机器上**没有任何名为 `claude-glm` 或 `claude-mm` 的独立二进制程序**，只有官方 `claude` CLI。
- 调 GLM (铁匠)：`ln -sf ~/.claude/settings.jsonglm ~/.claude/settings.json`（指向智谱 `glm-5.3[1m]`，1M 上下文）
- 调 MiniMax (铁匠贰号)：`ln -sf ~/.claude/settings.jsonmm ~/.claude/settings.json`（指向 MiniMax `MiniMax-M3`，32k 输出）
- 调 DeepSeek (备用)：`ln -sf ~/.claude/settings.jsonds ~/.claude/settings.json`（指向 `deepseek-v4-pro`）
- **两大执行铁律**：末尾必须带 `< /dev/null` 阻断 stdin 挂起；必须带 `--dangerously-skip-permissions` 跳过交互式询问。

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
