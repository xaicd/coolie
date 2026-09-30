# CMMI 5 阶段 × 25 任务 × 5 员工分工 (wave225 + wave227)

> **目的**: 把老板的"5 员工 + 1 主 agent"规范落到 CMMI 5 阶段 × 25 任务维度. 老板对 PM
> 说一句话, PM 查本表 → 知道派哪个员工.
>
> **Why**: 之前 `ROLE-MAPPING.md` (wave222) 已把 CMMI 25 任务映射到本体 5 角色 (fda / core-swe /
> pre-sre / fdse / ds), 但 5 角色是算法层, 不直接对应老板本地的 5 员工 (铁匠/门神/兑底渊/
> 墨斗/百晓生). 本表把"角色 → 员工"补齐, PM 派单速查.
>
> **wave227 增**: 测试/运营/风险/部署/复盘 共 5 个 CMMI 任务主员工改百晓生 (`ds`), 因为这些
> 都是"责任重大"事项 — 老板原话 "测试 + 运营 责任重大, 建议 DS". DS 工具扩到多工具
> (claude-glm 主 / claude-mm 兜底 / copilot 限 / claude-ds 按量).
>
> **wave234 改**: claude-glm 退出主力 (老板原话 "额度不够"). 铁匠主线切 cmd
> (`@commandcode/ai` CLI, wave229); 百晓生主线切 claude-mm (按量); claude-glm 降为
> 老板备用 (GLM 充裕时百晓生仍可用). 工具切换规则与 `HOW-TO-DELEGATE.md` §4 一致.
>
> **wave236 改**: 老板原话 2 条 (2026-09-30): "agy 恢复了应该可以用" + "claude-ds 也不能用,
> 换 cmd, claude-mm". **墨斗 (FDA) 默认切回 agy** (2026-09-30 ~7 天后恢复), cmd 作为紧急兜底.
> **兑底渊 (PRE-SRE) 工具改 cmd + claude-mm** (替换 claude-ds). claude-ds 标"不可用, 配额紧" —
> 仅百晓生 SRE 临时大任务按量兜底. 工具切换规则与 `HOW-TO-DELEGATE.md` §4 一致.
>
> **不动**: `ROLE_MAPPING` (wave222 算法层); `AGENT_ROLES` enum; `server/src/services/agent-assign.ts`.

---

## 0. 文档约定

- **5 阶段** — Phase 1 立项 / Phase 2 规划 / Phase 3 设计 / Phase 4 开发 / Phase 5 部署 (老板版).
- **25 任务** — 每阶段 5 任务, 见 `ROLE-MAPPING.md` §1.
- **5 员工** — 铁匠 / 门神 / 兑底渊 / 墨斗 / 百晓生, 见 `TEAM-MAPPING.md` §1.2.
- **主 agent Hermes** — PM, 不算入 5 员工, 只在"老板拍板位"出现 (Phase 1.5 G0 门禁 / Phase 5.5 复盘).
- **5 角色 ↔ 5 员工** — 一一对应:
  - `core-swe` ↔ 铁匠 (Forge)
  - `fdse` ↔ 门神 (Guardian)
  - `pre-sre` ↔ 兑底渊 (Operator)
  - `fda` ↔ 墨斗 (Inkstick)
  - `ds` ↔ 百晓生 (Sage)

---

## 1. CMMI 5 阶段 × 25 任务 × 5 员工分工表

### Phase 1: 立项

| 任务 | 主员工 | 副员工 | 默认工具 (主) | 默认工具 (副) | 说明 |
|---|---|---|---|---|---|
| 1.1 业务目标 | 墨斗 (`fda`) | - | **agy (wave236 恢复)** | - | 客户前线需求, 墨斗跑业务访谈 |
| 1.2 技术约束 | 墨斗 (`fda`) | 铁匠 (`core-swe`) | **agy (wave236 恢复)** | **cmd (`@commandcode/ai`, wave234)** | 架构选型, 墨斗出方案铁匠审 |
| 1.3 License 合规 | 墨斗 (`fda` / `ds` 双) | - | **agy (wave236 恢复)** | - | 开源协议扫描 (FDA + DS 工作重叠) |
| 1.4 选型研判 (DAR) | 墨斗 (`fda`) | 百晓生 (`ds`) | **agy (wave236 恢复)** | copilot (限) | 竞品对标 + 原型 + 画图, 墨斗主判百晓生兜底 |
| 1.5 G0 选型门禁 | 铁匠 (`core-swe`) | 墨斗 (`fda`) + **Hermes (拍板)** | **cmd (`@commandcode/ai`, wave234)** | agy | 立项前门禁, Hermes 拍板 |

### Phase 2: 规划

| 任务 | 主员工 | 副员工 | 默认工具 (主) | 默认工具 (副) | 说明 |
|---|---|---|---|---|---|
| 2.1 端口策略矩阵 | 兑底渊 (`pre-sre`) | 铁匠 (`core-swe`) | **cmd (`@commandcode/ai`, wave236 改)** + claude-mm 兜底 | **cmd (`@commandcode/ai`, wave234)** | 网络策略, 兑底渊主规划 (claude-ds 退出, wave236) |
| 2.2 WBS 拆解 | 铁匠 (`core-swe`) | 门神 (`fdse`) | **cmd (`@commandcode/ai`, wave234)** | cmd | 主线支线临时拆解 |
| 2.3 Spec 编写 | 铁匠 (`core-swe`) | - | **cmd (`@commandcode/ai`, wave234)** | - | 4 类 spec schema (Kiro Feature / Bugfix / …) |
| 2.4 工时估算 | 铁匠 (`core-swe`) | 门神 (`fdse`) | **cmd (`@commandcode/ai`, wave234)** | cmd | 评估工作量, 门神验证 |
| 2.5 风险评估 | **百晓生 (`ds`)** | 墨斗 (`fda`) | **claude-mm (wave234)** | agy | **责任重大** (wave227) — 风险预案 + 数据决策; 墨斗出险百晓生汇总统筹 |

### Phase 3: 设计

| 任务 | 主员工 | 副员工 | 默认工具 (主) | 默认工具 (副) | 说明 |
|---|---|---|---|---|---|
| 3.1 系统设计 | 铁匠 (`core-swe`) | 墨斗 (`fda`) | **cmd (`@commandcode/ai`, wave234)** | agy | 架构 + 数据模型 |
| 3.2 API 契约 | 铁匠 (`core-swe`) | - | **cmd (`@commandcode/ai`, wave234)** | - | REST + GraphQL 契约 |
| 3.3 DB Schema | 铁匠 (`core-swe`) | 百晓生 (`ds`) | **cmd (`@commandcode/ai`, wave234)** | copilot (限) | 数据模型, 百晓生兜底 |
| 3.4 安全设计 | 兑底渊 (`pre-sre`) | 铁匠 (`core-swe`) | **cmd (`@commandcode/ai`, wave236 改)** + claude-mm 兜底 | **cmd (`@commandcode/ai`, wave234)** | 鉴权 + RBAC (claude-ds 退出, wave236) |
| 3.5 部署架构 | **百晓生 (`ds`)** | 兑底渊 (`pre-sre`) | **claude-mm (wave234)** | claude-ds | **责任重大** (wave227) — CI/CD + 网络策略 + 风险评估联动; 兑底渊给恢复方案 |

### Phase 4: 开发

| 任务 | 主员工 | 副员工 | 默认工具 (主) | 默认工具 (副) | 说明 |
|---|---|---|---|---|---|
| 4.1 编码 | 铁匠 (`core-swe`) | - | **cmd (`@commandcode/ai`, wave234)** | - | 主力代码 (cmd 排满时切 claude-mm) |
| 4.2 单元测试 | 铁匠 (`core-swe`) | - | **cmd (`@commandcode/ai`, wave234)** | - | 自己写 |
| 4.3 代码审查 | 门神 (`fdse`) | 铁匠 (`core-swe`) | cmd | **cmd (`@commandcode/ai`, wave234)** | 互审 (门神 spawn cmd, wave229) |
| 4.4 集成测试 | 铁匠 (`core-swe`) | 门神 (`fdse`) | **cmd (`@commandcode/ai`, wave234) → claude-mm (兜底)** | cmd | 端到端, mm 擅长长上下文 |
| 4.5 性能优化 | 兑底渊 (`pre-sre`) | 铁匠 (`core-swe`) | **cmd (`@commandcode/ai`, wave236 改)** + claude-mm 兜底 | **cmd (`@commandcode/ai`, wave234)** | 性能瓶颈 (claude-ds 退出, wave236) |

### Phase 5: 部署

| 任务 | 主员工 | 副员工 | 默认工具 (主) | 默认工具 (副) | 说明 |
|---|---|---|---|---|---|
| 5.1 部署执行 | 兑底渊 (`pre-sre`) | 门神 (`fdse`) | **cmd (`@commandcode/ai`, wave236 改)** + claude-mm 兜底 | cmd | systemd + OTA (claude-ds 退出, wave236) |
| 5.2 监控告警 | **百晓生 (`ds`)** | 兑底渊 (`pre-sre`) | **claude-mm (wave234)** | claude-ds | **责任重大** (wave227) — 日志 + 指标 + 应急响应; 兑底渊副出恢复脚本 |
| 5.3 验收测试 | **百晓生 (`ds`)** | 门神 (`fdse`) | **claude-mm (wave234)** | cmd | **责任重大** (wave227) — 30 项 E2E + 撞机; 老板金标仍走门神 cmd 兜底 |
| 5.4 发布说明 | 铁匠 (`core-swe`) | - | **cmd (`@commandcode/ai`, wave234)** | - | release notes |
| 5.5 复盘 | **百晓生 (`ds`)** + **Hermes (拍板)** | 墨斗 (`fda`) | **claude-mm (wave234)** | agy | **责任重大** (wave227) — 数据决策 + 老板拍板 |

---

## 2. 5 员工 × 任务数 分布 (主任务, wave227 改后)

| 员工 | 本体角色 | 主任务数 | 任务编号 |
|---|---|---|---|
| **铁匠 (Forge)** | `core-swe` | **11** | 1.5 / 2.2 / 2.3 / 2.4 / 3.1 / 3.2 / 3.3 / 4.1 / 4.2 / 4.4 / 5.4 (Phase 4 + Phase 3 全 + Phase 2.2/2.3/2.4) |
| **门神 (Guardian)** | `fdse` | **1** | 4.3 |
| **兑底渊 (Operator)** | `pre-sre` | **4** | 2.1 / 3.4 / 4.5 / 5.1 (wave227 起 5.2/3.5 主改百晓生, 兑底渊降为副) |
| **墨斗 (Inkstick)** | `fda` | **3** | 1.1 / 1.2 / 1.4 (1.3 双主保留, 2.5/5.5 wave227 起主改百晓生) |
| **百晓生 (Sage)** | `ds` | **5** | 2.5 / 3.5 / 5.2 / 5.3 / 5.5 (5.5 Hermes 拍板, wave227 起责任重大) |
| **Hermes (PM, 拍板)** | - | **2** | 1.5 (门禁拍板) / 5.5 (复盘拍板) |

> **合计 25 主任务** (= 25 CMMI 任务行): 铁匠 11 + 门神 1 + 兑底渊 4 + 墨斗 3 + 百晓生 5 = **24**,
> 差 1 是因为 Phase 1.3 License 合规是双主 (墨斗 `fda` + 百晓生 `ds` 各占 0.5), 按整行算两个员工
> 都算 +1 即 +1 行覆盖 (25 = 24 + 1 双主). Hermes 拍板位不占主任务, 只在 1.5/5.5 流程上拍板.
> PM 派单按本表 (5 员工维度), 主任务 × 25 行覆盖见 §3.

---

## 3. 主任务修正表 (主员工 × 25 行 = 25, wave227 改后)

| CMMI 任务 | 主员工 | 算法层主角色 (`ROLE_MAPPING`) | 是否一致 |
|---|---|---|---|
| 1.1 业务目标 | 墨斗 | `fda` | ✅ |
| 1.2 技术约束 | 墨斗 | `fda` | ✅ |
| 1.3 License 合规 | 墨斗 | `ds` (ROLE_MAPPING 主 ds, 副 fda) | ⚠️ 本表主 = 墨斗 (`fda`), ROLE_MAPPING 主 = `ds` — 因为 FDA 主访谈, DS 副出协议扫描; PM 派单按本表 (墨斗主) |
| 1.4 选型研判 (DAR) | 墨斗 | `fda` | ✅ |
| 1.5 G0 选型门禁 | 铁匠 + Hermes 拍板 | `core-swe` | ✅ (Hermes 拍板是流程, 不占主任务) |
| 2.1 端口策略矩阵 | 兑底渊 | `pre-sre` | ✅ |
| 2.2 WBS 拆解 | 铁匠 | `core-swe` | ✅ |
| 2.3 Spec 编写 | 铁匠 | `core-swe` | ✅ |
| 2.4 工时估算 | 铁匠 | `fdse` | ⚠️ 本表主 = 铁匠 (`core-swe`), ROLE_MAPPING 主 = `fdse` — 因为老板偏好铁匠出估算, 门神验证; PM 派单按本表 |
| 2.5 风险评估 | **百晓生** | `ds` | ✅ **wave227** — 测试/运营/风险/部署 = DS 主 (责任重大) |
| 3.1 系统设计 | 铁匠 | `core-swe` | ✅ |
| 3.2 API 契约 | 铁匠 | `core-swe` | ✅ |
| 3.3 DB Schema | 铁匠 | `core-swe` | ✅ |
| 3.4 安全设计 | 兑底渊 | `pre-sre` | ✅ |
| 3.5 部署架构 | **百晓生** | `pre-sre` | ⚠️ **wave227** — 5 员工层改百晓生主 (责任重大), ROLE_MAPPING 仍 `pre-sre` |
| 4.1 编码 | 铁匠 | `core-swe` | ✅ |
| 4.2 单元测试 | 铁匠 | `core-swe` | ✅ |
| 4.3 代码审查 | 门神 | `fdse` | ✅ |
| 4.4 集成测试 | 铁匠 | `core-swe` | ✅ |
| 4.5 性能优化 | 兑底渊 | `pre-sre` | ✅ |
| 5.1 部署执行 | 兑底渊 | `pre-sre` | ✅ |
| 5.2 监控告警 | **百晓生** | `pre-sre` | ⚠️ **wave227** — 5 员工层改百晓生主 (责任重大), ROLE_MAPPING 仍 `pre-sre` |
| 5.3 验收测试 | **百晓生** | `core-swe` | ⚠️ **wave227** — 5 员工层改百晓生主 (责任重大), ROLE_MAPPING 主 `core-swe`; 老板金标仍走门神 cmd 兜底 |
| 5.4 发布说明 | 铁匠 | `core-swe` | ✅ |
| 5.5 复盘 | **百晓生** + Hermes 拍板 | `fda` | ⚠️ **wave227** — 5 员工层改百晓生主 (责任重大), ROLE_MAPPING 主 `fda` |

**主员工分布 (本表, wave227 起)**: 铁匠 ×11 / 百晓生 ×5 / 兑底渊 ×4 / 墨斗 ×3 / 门神 ×1
(25 行 + Phase 1.3 双主 = 1 墨斗 + 1 百晓生). wave227 起百晓生主任务扩到 5 个
(2.5 / 3.5 / 5.2 / 5.3 / 5.5) — 因为测试 + 运营 + 风险预案 + 部署架构 + 复盘都是责任重大事项,
老板原话"建议 DS 主负责".

铁匠仍是绝对主力 (11/25 = 44%), 与 `ROLE-MAPPING.md` §1 算法层 `core-swe` ×11 一致 (Phase 5.3
"验收测试"算法层归 `core-swe`, 5 员工层归百晓生 — wave227 改; 但老板金标仍走门神 cmd).

**算法层 vs 员工层差异 (6 处, wave227 起)**:

| CMMI 任务 | 算法层主 (`ROLE_MAPPING`) | 5 员工层主 (本表) | 差异原因 |
|---|---|---|---|
| 1.3 License 合规 | `ds` | 墨斗 (`fda`) + 百晓生 (`ds`) 双 | FDA 主访谈, DS 副扫描; 老板原话偏好墨斗 (FDA) 主跑, DS 副 |
| 2.4 工时估算 | `fdse` | 铁匠 (`core-swe`) | 老板偏好铁匠 (core-swe) 出估算, 门神验证 |
| **2.5 风险评估** | `fda` | **百晓生 (`ds`)** | **wave227** 改主 — 测试/运营/风险 责任重大, 老板原话"建议 DS" |
| **3.5 部署架构** | `pre-sre` | **百晓生 (`ds`)** | **wave227** 改主 — 部署架构 + 风险预案联动, DS 数据决策 |
| **5.2 监控告警** | `pre-sre` | **百晓生 (`ds`)** | **wave227** 改主 — 运营监控 责任重大, DS 跑监控指标 |
| **5.3 验收测试** | `core-swe` | **百晓生 (`ds`)** | **wave227** 改主 — 测试策略 + E2E 撞机, DS 主; 老板金标仍走门神 cmd 兜底 |
| **5.5 复盘** | `fda` | **百晓生 (`ds`)** + Hermes 拍板 | **wave227** 改主 — 数据决策 + 复盘, DS 跑数据分析 |

> **PM 派单规则**: PM 派单按本表 (5 员工维度), 不按 `ROLE_MAPPING` (算法层维度). 算法层是
> 工坊数字员工的派活路由, 与本波本地 5 员工无关. 二者各管各的.

---

## 4. 5 员工 × 默认工具 矩阵 (wave227 DS 多工具)

| 员工 | 默认工具 | 兜底工具 | 配额状态 | 默认 MCP (wave228) |
|---|---|---|---|---|
| **铁匠 (wave234 改)** | **cmd (`@commandcode/ai` CLI, wave229)** | claude-mm | commandcode.ai CLI 配额 / 队列 (wave229: 不是老板亲自跑); claude-mm 按量; **claude-glm 退出主力 (wave234)** | agent-device + agent-browser |
| 门神 | cmd (`@commandcode/ai`, wave229) | (无) | commandcode.ai CLI 配额 / 队列 (wave229: 不是老板亲自跑, 无 180s 冷却) | agent-device + agent-browser |
| **兑底渊 (wave236 改)** | **cmd (`@commandcode/ai` CLI)** | claude-mm (按量) | cmd 配额 / 队列 (wave229: 老板不亲自跑); claude-mm 按量; **claude-ds 退出兑底渊主线 (wave236, 配额紧)** | agent-device + agent-browser |
| **墨斗 (wave236 恢复)** | **agy (Gemini 3.8)** | cmd (紧急兜底) | agy 长期按量 (2026-09-23 耗尽, **2026-09-30 ~7 天后恢复**); cmd 紧急时兜底 | agent-device + agent-browser |
| **百晓生 (wave227 多工具 + wave228 DS MCP + wave234 主线切 claude-mm)** | **claude-mm** (主线, wave234 起) | claude-glm (老板备用, GLM 充裕时) → copilot (限) → claude-ds (按量) | wave234 起主线切 claude-mm (按量); claude-glm 降为老板备用; copilot 2026-09-29 已弃用但岗位恢复; claude-ds 按量 | **agent-device + agent-browser + system-monitor + approval + company-ops (5 个 MCP, DS 工具链专属)** |

**百晓生工具切换 (wave234 改)**:
- 默认 → `claude-mm` (主线, wave234 起, 按量不限额) — 取代 wave227 的 claude-glm 默认
- GLM 充裕时 → `claude-glm` (老板备用, wave234 起降级) — 配额监控见 `HOW-TO-DELEGATE.md` §4
- 数据 + 文档轻任务 → `copilot` (限, 当前额度已耗尽, 待恢复)
- 部署/监控 SRE 强任务 → `claude-ds` (按量, 与兑底渊同款)

> **Why 多工具**: DS 现在跑 5 个主任务 (2.5 风险 / 3.5 部署架构 / 5.2 监控 / 5.3 验收 / 5.5 复盘),
> 任务类型多样 — 文档分析 (GLM) + 长上下文 (mm) + 数据决策 (copilot) + SRE (ds), 一个员工多工具
> 是 wave225 确立的"工具是手, 员工是岗位"原则. 不增员工, 只给 DS 加工具.

完整工具切换规则见 `HOW-TO-DELEGATE.md` §4.

---

## 4.1 MCP 默认安装 (wave228 新)

每个工具启动时自动加载的 MCP servers, 通过 `~/.claude/settings.json` 的
`mcpServers` 子树注册. 安装脚本幂等, 重复运行 no-op.

| MCP server | 注册脚本 | 加载到哪些工具 | 用途 |
|---|---|---|---|
| **agent-device** | `scripts/install-agent-device-mcp.sh` | claude / claude-mm / claude-glm / claude-ds / agy / copilot / cmd (7 个全部装) | 设备自动化 (iOS / Android / web / macOS / TV) — 跑测试 / 撞机 |
| **agent-browser** | `scripts/install-agent-browser-mcp.sh` | 同上 (7 个全部装) | 浏览器自动化 — E2E 撞机 / 验收 / 拖拽 |
| **system-monitor** | `scripts/install-ds-mcp.sh` | **仅 DS 工具链** (claude-mm 主线 / claude-glm 备用 / claude-ds 按量兜底, wave234 起; **wave236 起 claude-ds 仅 SRE 临时按量兜底**) | 监控系统运行状态 (CPU / mem / paperclip health) |
| **approval** | 同上 | 同上 | 任何变更走 approval gate (PM 自动审批 / 老板拍板) |
| **company-ops** | 同上 | 同上 | 运营 Coolie 工坊 (日报 / 配额 / release driver) |

**安装命令** (老板一次性跑完):

```bash
bash scripts/install-agent-device-mcp.sh --apply
bash scripts/install-agent-browser-mcp.sh --apply
bash scripts/install-ds-mcp.sh --apply
bash scripts/cron-copilot-reset.sh --register  # 每月 1 号 8:01 切 copilot → gpt5 sol
```

> **占位符说明**: `system-monitor` / `approval` / `company-ops` 的 `command`
> 字段当前指向尚未发布的 MCP 包 (`mcp-server-system-monitor --stdio` 等).
> 真包上线后改 `scripts/install-ds-mcp.sh` 的 `MCP_DS_SERVER_SPEC` 行即可
> 一行改完. 安装脚本今日已 idempotent, 真包到位后无需重装.
>
> **详细工具/MCP 配对 + 配额说明 + copilot cron 行格式** 见
> [`docs-coolie/TOOL-USAGE.md`](TOOL-USAGE.md) (wave228 新).

---

## 5. 紧急派活 (老板亲自跑) — 优先看

老板说"紧急, 老板亲自跑" → 切门神 cmd → 老板本人在 Mac 终端跑:

```bash
cmd -p "<老板一句话需求>"
```

不经过 PM, 不经过 `~/bin/dispatch-waveXXX.sh`. PM 只负责验收.

适用范围: 紧急 bug / 真机金标 / 老板亲自拍板. (wave227 起, Phase 5.3 验收测试的"老板金标"
仍走门神 cmd, 即使主员工改百晓生.)

---

## 6. 双轨 (Dev + Infra) 映射 (员工视角, wave227 起加 DS 第三轨)

| 轨道 | 主员工 | 副员工 | 任务 |
|---|---|---|---|
| **Dev Track** | 铁匠 (`core-swe`) | 门神 (`fdse`) | Phase 3 设计 + Phase 4 开发 |
| **Infra Track** | 兑底渊 (`pre-sre`) | 铁匠 (`core-swe`) | 端口策略 + 部署执行 + 性能优化 |
| **DS 数据决策轨 (wave227 新)** | **百晓生 (`ds`)** | 视任务定 | 风险评估 + 监控告警 + 验收测试 + 复盘 |

老板原意: Dev 轨与 Infra 轨并行, 由两个不同的员工各自负责, 避免单点. 铁匠是 Dev 轨的主心骨,
兑底渊是 Infra 轨的当家人. wave227 起百晓生加开"数据决策"第三轨 (测试/运营/风险/复盘), 与双轨
并行, 不取代. 双轨交汇点是 Phase 5.3 验收测试 (wave227 起主改百晓生, 副门神 — 老板金标) —
它必须在 Infra 轨部署完成之后才能开跑.

---

## 7. 不做什么 (反向约束)

- **不动 `ROLE_MAPPING`** — wave222 算法层 25 行主/副角色不变.
- **不动 `server/src/services/agent-assign.ts`** — 算法只看 5 角色, 不看 5 员工.
- **不动 `AGENT_ROLES` enum** — 5 个 fork 角色 + 12 个上游不变.
- **不动 Coolie 工坊系统** — 本表是老板本地派单维度, 工坊数字员工派活走算法层.
- **不动 UI / clients/expo** — 本波纯文档.
- **不动 wave217 / wave220 数字员工** — qa / ops bootstrap 不动.
- **不动 wave226 quota** — agent ≤ 6 / 公司 不动.

---

## 8. 出处与索引

- 团队规范: [`docs-coolie/TEAM-MAPPING.md`](TEAM-MAPPING.md) (wave225 + wave227 DS 责任重大标注 + wave228 MCP 默认装)
- PM 派活 SOP: [`docs-coolie/HOW-TO-DELEGATE.md`](HOW-TO-DELEGATE.md) (wave225 + wave227 测试/运营 → DS)
- 工具使用规范: [`docs-coolie/TOOL-USAGE.md`](TOOL-USAGE.md) (wave228 新, 6 工具矩阵 + MCP 默认安装 + copilot 月度重置)
- 5 角色算法层: [`docs-coolie/ROLE-MAPPING.md`](ROLE-MAPPING.md) (wave222, 不动)
- 角色卡: [`docs-coolie/CMMI-ROLE-CARDS.md`](CMMI-ROLE-CARDS.md)
- 派活算法: `server/src/services/agent-assign.ts` (wave222, 不动)
- 派活算法 demo: `scripts/wave222/route-demo.mjs`
- 派活算法测试: `server/src/services/agent-assign.test.ts`
- QA 报告: [`docs-coolie/evidence/wave227/QA-REPORT.md`](evidence/wave227/QA-REPORT.md); [`docs-coolie/evidence/wave234/QA-REPORT.md`](evidence/wave234/QA-REPORT.md); [`docs-coolie/evidence/wave236/QA-REPORT.md`](evidence/wave236/QA-REPORT.md) (agy 恢复 + claude-ds 退出)

**本波 (wave227) 变更摘要**:
- 5 个 CMMI 任务主员工改百晓生 (`ds`): Phase 2.5 / Phase 3.5 / Phase 5.2 / Phase 5.3 / Phase 5.5
- 百晓生工具扩到多工具: claude-glm (主) + claude-mm + copilot (限) + claude-ds (按量)
- 算法层 `ROLE_MAPPING` 不动 (仍是 `pre-sre` / `fda` / `core-swe` 等) — 5 员工层和算法层
  各自管各自的派活路由
- 双轨加 DS 第三轨 (数据决策): 风险 + 监控 + 验收 + 复盘

**本波 (wave234) 变更摘要**:
- claude-glm 退出主力 (老板原话 "额度不够"). 铁匠主线切 cmd (`@commandcode/ai` CLI, wave229);
  百晓生主线切 claude-mm (按量); claude-glm 降为老板备用 (GLM 充裕时仍可用)
- §1 25 任务分工表: 所有铁匠行默认工具 claude-glm → cmd; 百晓生 5 个主任务 (2.5/3.5/5.2/5.3/5.5)
  默认工具 claude-glm → claude-mm
- §4 工具矩阵: 铁匠行 claude-glm → cmd; 百晓生行主线 claude-glm → claude-mm, 兜底列首项
  claude-mm → claude-glm (备用)
- §4.1 DS MCP 装载工具: claude-glm/claude-mm/claude-ds → claude-mm (主线) / claude-glm (备用) /
  claude-ds
- 算法层 `ROLE_MAPPING` 不动 (仍是 `pre-sre` / `fda` / `core-swe` 等) — 5 员工层和算法层
  各自管各自的派活路由, 工具切换不影响算法层

**本波 (wave228) 变更摘要**:
- §4 矩阵新增 MCP 列: 4 员工装 agent-device + agent-browser (7 个工具全部装), 百晓生额外装
   system-monitor + approval + company-ops (5 MCP, DS 工具链专属)
- §4.1 新增: 4 个 install 脚本 + copilot cron 行的速查表 + 安装命令
- §8 索引: 链 `TOOL-USAGE.md` (wave228 新)
- 算法层 / 员工层 / CMMI 任务分工 / wave227 全部不变; 本波仅 ADDS MCP 信息

**本波 (wave236) 变更摘要**:
- 老板原话 2 条 (2026-09-30): "agy 恢复了应该可以用" + "claude-ds 也不能用, 换 cmd, claude-mm"
- §1 25 任务分工表: Phase 1.1/1.2/1.3/1.4 墨斗 agy 行标 "(wave236 恢复)"; 兑底渊 4 个主任务
  (2.1 / 3.4 / 4.5 / 5.1) 默认工具 claude-ds → cmd (`@commandcode/ai`) + claude-mm 兜底
- §4 工具矩阵: 兑底渊行 claude-ds → cmd (主线) + claude-mm (兜底); 墨斗行加 "(wave236 恢复)"
  + cmd 紧急兜底
- §4.1 MCP 装载注释: claude-ds 仅 SRE 临时按量兜底 (不再是主线)
- 算法层 `ROLE_MAPPING` 不动 — 5 员工层和算法层各自管各自的派活路由, 工具切换不影响算法层
