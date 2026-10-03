# wave284 墨斗 (FDA) 架构真审：本地施工队总线与工具链加固蓝图

> **报告版本**: wave284-fda-audit  
> **审计角色**: 墨斗 (FDA 前线架构师) · agy-gemini3.8 (Antigravity + Gemini 3.8)  
> **审计触发**: 老板对当前 5 大基建评分与 7 大架构拷问  
> **审查对象**: `scripts/dispatch-local-employee.sh`、`scripts/context-bus.sh`、`scripts/gate-evidence-ledger.sh`、`scripts/tool-health-monitor.sh`、`scripts/host-exec.sh` 及 `.coolie-local/` 边界  

---

## 0. 评审打分与痛点对账

| 模块 | 老板打分 | 核心短板与真实缺陷 | FDA 评级 |
|---|---|---|---|
| **dispatch receipt** | **80%** | `queued` 任务未在状态大盘聚合展示；`--execute` 硬编码执行 `CLAUDE_BIN`，未按员工工具真实分流（cmd/copilot/agy 无法执行） | 需分流路由 |
| **G1-G5 evidence ledger** | **80%** | 可记录但弱约束，任务更新 `status=done` 时没有校验对应门禁证据，容易“证据挂科依然强行交付” | 需分级门禁 |
| **context bus** | **75%** | 上下文接力方向完全正确，但默认兜底 `git rev-parse HEAD` 导致纯文档/方案工序产生假代码 Commit，下游易被误导 | 需区分产物类型 |
| **tool-health monitor** | **55%** | 仅检测了宿主机 binary 存在（静态 which），未向工具真发 prompt 并断言响应包含 "OK"，属于假探针 | 需真发真回 |
| **host-exec bridge** | **65%** | 跑通了容器到宿主机的免密穿透，但写死 IP `192.168.3.85`；SSH 拼接参数存在 quoting 注入风险；无网络漂移自愈机制 | 需安全加固 |

---

## 1. 深度剖析：FDA 视角 7 大架构命题

### 命题 1：本地施工队运行态与 Coolie 产品运行时是否隔离清楚？

#### 1.1 现状审查
- **物理与代码边界**：
  - **清晰之处**：本地施工队（Hermes、墨斗、铁匠、铁匠贰号、门神、兑底渊、百晓生）的派单脚本、Cron、Receipt、Context-Bus 均严格收敛在 `scripts/`、`.agents/` 与 `.coolie-local/` 中，未侵入 `server/src/routes/` 和客户端视图。
  - **模糊红线**：历史迁移文件 `packages/db/src/migrations/9022_delete_13_digital_employees.sql` 与 `dispatch-skill-matcher.ts` 中曾出现过将本地员工逻辑反哺到产品 DB 的痕迹。
- **FDA 架构红线**：
  - **产品运行时 (Product Runtime)** 是交付给客户的企业级 AI 员工协同管控平台，其概念模型是 `companies -> teams -> agents -> tasks -> budgets -> approvals`。
  - **本地施工队 (Local Construction Team)** 是开发这套开源/商业化产品的“外挂装配工”，不能把本地的 Mac 路径、固定员工姓名、Homebrew 工具硬编码进客户的企业租户逻辑中。

---

### 命题 2：receipt / tool-health / ledger / context-bus 四个对象边界是否合理？

#### 2.1 四大对象职责与正交性模型

```
┌─────────────────────────────────────────────────────────────┐
│                Tool-Health (基础设施健康探针)                  │
│       关注工具活不活、额度够不够 (节点维度，生命周期：持续轮询)       │
└──────────────────────────────┬──────────────────────────────┘
                               │ 提供可用工具池
┌──────────────────────────────▼──────────────────────────────┐
│                Dispatch Receipt (派单执行凭证)               │
│       记录一次具体任务的执行过程 (动作维度，生命周期：瞬态流水账)     │
└───────────────┬─────────────────────────────┬───────────────┘
                │ 驱动工序完成                 │ 产生交付物
┌───────────────▼─────────────┐ ┌─────────────▼───────────────┐
│  Context Bus (上下文接力总线)  │ │ Evidence Ledger (CMMI合规账本)│
│  解决「下游怎么接着上游干」   │ │  解决「凭什么证明质量合格可交付」│
│  (数据流维度，生命周期：单波次) │ │  (合规门禁维度，生命周期：里程碑) │
└─────────────────────────────┘ └─────────────────────────────┘
```

#### 2.2 边界重叠与收敛建议
- **Receipt 与 Ledger 解耦**：Receipt 负责记录“**干了没有、谁干的、退出码是什么**”；Ledger 负责判定“**符不符合架构标准与测试规范**”。Receipt 不包含详细测试指标，只留指针 `ledgerPath`。
- **Receipt 与 Context-Bus 解耦**：Receipt 是单工具视角，Context-Bus 是多工具流转图谱。Context-Bus 引用 Receipt 的 ID，不冗余深层执行日志。

---

### 命题 3：哪些留在 `.coolie-local`，哪些未来产品化？

| 对象 / 能力 | 归宿划分 | Rationale (理由) |
|---|---|---|
| **host-exec (SSH 穿透桥接)** | **纯本地 (.coolie-local)** | 依赖宿主物理机 IP 与本机私钥，纯属特定开发沙箱环境的物理胶水，不可进入产品运行时。 |
| **tool-health 宿主机探针** | **纯本地 (.coolie-local)** | 检测老板 Mac 上的 `/opt/homebrew/bin` 工具，属于本地建设环境特化逻辑。 |
| **G1-G5 角色证据隔离账本** | **未来产品化 (Product Core)** | 企业级交付必须具备的门禁能力，未来应转化为 `company_gate_ledgers` 数据库表与审批流原生卡片。 |
| **多工具上下文总线 (Context Bus)** | **未来产品化 (Product Core)** | 跨不同大模型、跨异构 Agent 协同工作的核心是不可变 Handover Packet，未来应作为 Coolie Workflow 的标准协议。 |
| **结构化派单 Receipt 状态机** | **未来产品化 (Product Core)** | 当前任务系统的底层执行轨迹，未来应与 `heartbeat_run_events` 和任务执行状态机深度融合。 |

---

### 命题 4：tool-health 如何补成真跑 OK？

#### 4.1 当前缺陷
当前 `tool-health-monitor.sh` 仅检查 `which binary`，无法发现：
- API Key 欠费或失效；
- 宿主机网络代理中断；
- CLI 模型版本被官方弃用。

#### 4.2 真正实现「真发真回」的架构方案
每个工具定义专属轻量探测探针（超时时间统一为 8s）：
1. **`claude-glm` / `claude-mm`**：
   - 探针指令：`bash scripts/host-exec.sh "claude -p '回复 OK' < /dev/null"`
   - 判定断言：退出码 0 且标准输出匹配 `/(ok|OK)/`
2. **`cmd`**：
   - 探针指令：`bash scripts/host-exec.sh "cmd -p '回复 OK' < /dev/null"`
   - 判定断言：退出码 0 且响应包含 `OK`
3. **`copilot`**：
   - 探针指令：`bash scripts/host-exec.sh "copilot -p '回复 OK' < /dev/null"`
   - 判定断言：退出码 0 且无 Authentication 报错
4. **`agy-gemini3.8`**：
   - 探针指令：容器内直接检查或使用轻量 node ping 测试 Gemini API
   - 判定断言：响应包含 OK

> **防烧 Token 与防风控机制**：
> - 探针增加 15 分钟结果缓存（TTL = 900s），未过期直接读取 `.coolie-local/tool-health/latest.json`，仅在 `--force-probe` 或定时巡检时发起真实推理请求。

---

### 命题 5：dispatch 如何按 tool 真分流？

#### 5.1 当前缺陷
`dispatch-local-employee.sh:383` 统一硬编码了 `CLAUDE_BIN`，导致门神派单执行时用的依然是 Claude，而不是 `@commandcode/ai` (cmd)。

#### 5.2 统一工具路由矩阵 (Tool Router)
根据派单指定的 `TOOL` 变量，动态解析执行命令链：

```bash
dispatch_tool_runner() {
  local tool="$1"
  local prompt_file="$2"
  
  case "$tool" in
    claude-glm)
      bash scripts/host-exec.sh "ANTHROPIC_MODEL=glm-5.3 claude -p \"\$(cat '$prompt_file')\""
      ;;
    claude-mm)
      bash scripts/host-exec.sh "ANTHROPIC_MODEL=MiniMax-M3 claude -p \"\$(cat '$prompt_file')\""
      ;;
    cmd)
      bash scripts/host-exec.sh "cmd -p \"\$(cat '$prompt_file')\""
      ;;
    copilot)
      bash scripts/host-exec.sh "copilot -p \"\$(cat '$prompt_file')\""
      ;;
    agy-gemini3.8)
      # 容器内原生执行
      if command -v agy >/dev/null 2>&1; then
        agy -p "$(cat "$prompt_file")"
      else
        echo "[dispatch] agy binary not present in container; prompt saved to $prompt_file"
      fi
      ;;
    hermes)
      echo "[dispatch] hermes internal orchestration prompt saved to $prompt_file"
      ;;
  esac
}
```

---

### 命题 6：ledger 是否应阻断 done？

#### 6.1 FDA 架构裁定：**必须实行分级阻断，不能一刀切，但绝不能无门禁强通！**

#### 6.2 分级门禁策略矩阵

| CMMI 角色门禁 | 性质 | 阻断策略 (Done Blocker) | 豁免条件 (Override) |
|---|---|---|---|
| **G1_FDA (需求与架构)** | 核心红线 | **阻断**：若无 Spec/方案产物，禁止进入 G2 开发 | 纯 Bugfix 微调允许提供 Commit 级别原因 |
| **G2_CoreSWE (代码与契约)** | 工业红线 | **绝对硬阻断**：`pnpm -r typecheck` 或编译存在哪怕 1 个报错，**严禁回写 done** | **不可豁免** |
| **G3_FDSE (交互与状态机)** | 交付红线 | **阻断**：前端页面必须覆盖四态防御与真机防遮挡 | 纯后端/脚本修改可标记 `not_applicable` |
| **G4_DS (业务旅程与否决)** | 业务红线 | **一票否决**：DS 标 `blocked` 时，任务状态自动跃迁为 `blocked`，不可标 `done` | 必须 DS 重新 review 通过 |
| **G5_PRE (版本指纹与发版)** | 发布红线 | **绝对硬阻断**：7 处版本号源不一致时禁止完成发布闭环 | 仅在非发版代码提交时为 `not_applicable` |

**落地机制**：
在 `dispatch-local-employee.sh --update <id> --status done` 时：
1. 必须检查关联的 `.coolie-local/evidence-ledger/<wave>.json`；
2. 如果指定了 `--strict-gate`（默认建议开启），只要当前波次的核心门禁（G1/G2）处于 `failed` 或 `blocked`，脚本立即以退出码 1 终止并报错，**阻止非法标记 done**！

---

### 命题 7：host-exec 的安全和可迁移风险

#### 7.1 风险清单
1. **静态 IP 漂移风险**：硬编码 `192.168.3.85`，如果老板 Mac 连接到新 Wi-Fi 或在家/公司切换网络，IP 必然变化导致桥接彻底断开。
2. **命令注入风险 (Shell Quoting)**：使用 `CMD_STR="$*"` 并在远程拼字符串执行，若任务 Prompt 中包含反引号、美元符或多重双引号，会导致宿主机执行非预期命令。
3. **权限扩散风险**：SSH 直接以宿主机 `mac` 用户执行，拥有 Mac 本地完全控制权，沙箱隔离实质被穿透。

#### 7.2 安全与可迁移加固设计
1. **动态解析替代硬编码 IP**：
   - 优先通过 `host.docker.internal` 解析；
   - 备用通过 Mac 的 mDNS 主机名 `macdeMac-Studio.local` 或网关 ARP 自动嗅探；
   - 允许通过环境变量 `MAC_HOST_IP` 手动覆盖，但不作为唯一死依赖。
2. **Base64 封装防 Quoting 注入**：
   - 容器将指令字符串在本地 Base64 编码，传给宿主机后解码执行：
     ```bash
     B64_CMD="$(printf '%s' "$*" | base64)"
     ssh mac@host "echo '$B64_CMD' | base64 -d | bash"
     ```
   - 彻底避免双重引号转义灾难与转义丢失。
3. **宿主机工作目录严格限定**：
   - 远程执行前固定锁定 `cd /Users/mac/workspace/xaicd/coolie`，严禁越界访问 Mac 用户个人私有目录（如 Downloads、Documents）。

---

## 2. 墨斗 (FDA) 总结与演进路线

老板提出的 5 项打分针针见血，直切这套本地协同工具链当前的工程痛点。这套系统从 wave282 到 wave284 已经完成了**“从无到有”的拓荒阶段**，现在的核心任务是**“从可用到严谨”的工业化抛光**。

建议下一步施工工序（由 Core SWE 铁匠执行落地）：
1. **P0 级加固**：
   - 重构 `dispatch-local-employee.sh` 的工具分流器（按 tool 执行对应 CLI，不再独尊 claude）；
   - `host-exec.sh` 改造为 Base64 管道与动态 host 嗅探；
2. **P1 级加固**：
   - `tool-health-monitor.sh` 补齐真实响应探测与 15min 缓存；
   - `dispatch-local-employee.sh --status done` 增加 Ledger 门禁阻断逻辑；
3. **P2 级收尾**：
   - Context-Bus 增加对“纯文档/方案工序”的 Commit 显式空值标记，消除假 HEAD 误导。
