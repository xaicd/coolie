# CMMI 5 阶段 × 25 任务 × 5 员工分工 (wave278 全清版 + wave280 修正, 2026-10-02)

> **wave280 修正** (2026-10-02 老板原话 "Hermes 肯定用 Hermes 自己啊"):
> - **§10.2 Hermes 列** tools 列: "agy / claude-glm" → "Hermes 自己 (wave280, 不配 kiro-cli)"
> - **删** 所有 "Hermes → kiro-cli" 误配, 跟 TOOLS.md §1/§2/§3 同步
>
> **不动**: §1-§9 全部 (CMMI 5 阶段 × 25 任务分工 + 算法层差异 + Palantir 7 primitives);
> §10.1 30 个中文 2 字 skill; §10.3-§10.6 不动 (派活精准 + 删 13 + schema + 出处)
>
> **目的**: 把老板的"5 员工 + 1 主 agent"规范落到 CMMI 5 阶段 × 25 任务维度. 老板对 PM
> 说一句话, PM 查本表 → 知道派哪个员工.
>
> **wave278 变更** (本档瘦身, 砍 ~14 KB):
> - **保留**: §0 + §1 25 任务 × 5 员工分工主表 (派活路由核心)
> - **精简**: §2-§7 (附录) 头部加 wave278 标, 正文瘦身 (重复段并入 PM-DISPATCH-QUICKCARD §3 + §7)
> - **保留不动**: §9 七原语 (Palantir wave245) + §10 中文 2 字 skill (wave258) — 是 5 员工层扩展
>
> **Why 保留 §9 + §10**: 7 Primitives 是 wave245 老板拍板的本体地基分层, 30 个中文 2 字 skill 是 wave258
> 老板拍板的派活精准维度, 都是与 5 员工分工正交的扩展维度, 不合并到 QUICKCARD。
>
> **不动**: `ROLE_MAPPING` (wave222 算法层); `AGENT_ROLES` enum; `server/src/services/agent-assign.ts`.
>
> **相关档跳转**:
> - 派活路由速查: [PM-DISPATCH-QUICKCARD.md §2-3](PM-DISPATCH-QUICKCARD.md)
> - 7 员工 object: [EMPLOYEE-OBJECTS.md](EMPLOYEE-OBJECTS.md)
> - 6 老板团队档案: [TEAM-MAPPING.md](TEAM-MAPPING.md)
> - 索引: [INDEX.md](INDEX.md)

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

---

## 9. Palantir 7 Primitives 维度 (wave245 新, 老板拍板)

老板原话 (2026-10-01):
> "分层是不是不太对, 本体的几大基础没体现" → "a 吧" = Palantir 7 primitives

### 9.1 7 Primitives 完整分层

之前 PM 提的 4 要素 (Object / Type / Property / Link) = Palantir 7 primitives 的前 4 项,
**不是本体地基全貌**. 真正地基是 7 primitives:

| # | Primitive | 真值 | Coolie 当前 | 主员工 | 备注 |
|---|---|---|---|---|---|
| 1 | **Object** | 实例 / 个体 | 80% (业务表行) | 铁匠 (`core-swe`) | 缺 global RID 物化视图 |
| 2 | **Type** | 类 / 概念 | 60% (`ENTITY_TYPES` 硬编码) | 铁匠 (`core-swe`) | 缺动态可配置 Type |
| 3 | **Property** | 字段 / 槽 | 70% (`ontology_properties` JSONB) | 铁匠 (`core-swe`) | 缺 Value Types 强校验 |
| 4 | **Link** | 关系 / 边 | 85% (`entity_relations`) | 铁匠 (`core-swe`) | 缺 cardinality 基数校验 |
| 5 | **Action** | 操作 / 突变 | 65% (REST Controller 散) | 铁匠 (`core-swe`) + 墨斗 (`fda`) | 缺 ActionRegistry 抽象 |
| 6 | **Function** | 计算 / 派生 | 75% (MCP tools 5 个) | 百晓生 (`ds`) + 铁匠 (`core-swe`) | 缺本体图算子 SDK |
| 7 | **Branch** | 分支 / 隔离 | ❌ **0% (大缺口)** | 铁匠 (`core-swe`) 主 + 百晓生 (`ds`) 验证 | **最大缺口** |

### 9.2 主员工 × 7 Primitives 派活规则

| Primitive | 主员工 | 副员工 | 派活规则 |
|---|---|---|---|
| **Object** | 铁匠 (`core-swe`) | 门神 (`fdse`) | wave250+ 实施 global RID 物化视图 |
| **Type** | 铁匠 (`core-swe`) | - | ontology_types 配置表 + 动态扩展 (公司级) |
| **Property** | 铁匠 (`core-swe`) | 百晓生 (`ds`) | ontology_properties 加 value_type 强约束 + JSON Schema 校验 |
| **Link** | 铁匠 (`core-swe`) | - | entity_relations 加 cardinality 字段 + DB CHECK |
| **Action** | 铁匠 (`core-swe`) | 墨斗 (`fda`) | **wave247** ActionRegistry: 抽 ontology_actions 表 + 5 个核心 controller 注册 |
| **Function** | **百晓生 (`ds`)** | 铁匠 (`core-swe`) | **wave249** OntologyFunction SDK + MCP server 暴露, 百晓生跑图谱计算 |
| **Branch** | 铁匠 (`core-swe`) | 百晓生 (`ds`) + 兑底渊 (`pre-sre`) | **wave246** Scenario (数据沙箱, P0) + **wave248** Proposal (Schema 分支, P1) |

### 9.3 wave246+ 实施路线图 (老板拍板)

```
wave246 — OntologyScenario (P0, Branch 数据沙箱)
  └─ 1 wave: ontology_scenarios + scenario_writes + X-Scenario-Id 路由 + 5 个 controller 跑通沙箱
  └─ 主员工: 铁匠 (编码) + 门神 (测试) + 百晓生 (验证场景)

wave247 — ActionRegistry (P1, Action 一等公民)
  └─ 1 wave: ontology_actions 表 + 5 个核心 controller 注册 + Action audit log
  └─ 主员工: 铁匠 + 墨斗 (流程梳理)

wave248 — OntologyProposal (P1, Branch Schema 分支)
  └─ 1 wave: ontology_proposals + schema_version + 合并审批 API
  └─ 主员工: 铁匠 + 兑底渊 (审批流)

wave249 — OntologyFunction (P2, Function SDK)
  └─ 1 wave: ontology-functions.ts + 暴露成 MCP + 5 个 demo functions
  └─ 主员工: 百晓生 + 铁匠 (MCP server)

wave250 — Object GlobalRID (P3, Object 统一)
  └─ 0.5 wave: 物化视图 + RID 索引 (可选, 等前 6 个 primitives 都位再做)
  └─ 主员工: 铁匠
```

### 9.4 不动 / 反向约束

- ❌ 不动 `entity_relations` schema (4 primitive Link 已稳)
- ❌ 不动 `ENTITY_TYPES` union (2 primitive Type 已 90% 覆盖)
- ❌ 不动 `ontology_properties` JSONB 结构 (3 primitive Property 已 70%)
- ❌ 不动 `ENTITY_RELATION_KINDS` 8 项
- ❌ 不动 MCP tools 5 个 (6 primitive Function 已 75%)
- ❌ 不动 `ROLE_MAPPING` (算法层, 7 primitive 与派活无关)
- ❌ 不动 wave234 / wave236 工具切换
- ❌ 不动 wave244 图谱 UX (前置依赖, 不在 7 primitive 维度)
- ❌ 不重写现有代码 (只在边上补新表/新服务)

### 9.5 出处

- agy 调研报告: [`docs-coolie/research/PALANTIR-ONTOLOGY-PRIMITIVES.md`](research/PALANTIR-ONTOLOGY-PRIMITIVES.md) (wave245 A)
- 架构建议: [`docs-coolie/research/architecture-7-primitives.md`](research/architecture-7-primitives.md) (wave245 B)
- QA 报告: [`docs-coolie/evidence/wave245/QA-REPORT.md`](evidence/wave245/QA-REPORT.md) (wave245)

**本波 (wave245) 变更摘要**:
- §9 整章新增 (7 Primitives 维度), 不改前面 §1-§8
- 7 primitives × Coolie 现状评估表 (5 个 60-85% 完整, Branch 0%)
- 主员工 × 7 primitives 派活表 (新增 4 个 wave 派活入口)
- wave246+ 5 步路线图 (老板拍板)
- 8 条不动反向约束 (保证 fork-surface gate 不增加)
- 算法层 / 工具切换 / 图谱 UX 全部不动 — 本波只 ADDS 7 primitives 维度

---

## 10. 中文 2 字 skill × 英文 cli tool 区分 (wave258 新, 老板拍板)

老板原话 (2026-10-01):
> "中文二字技能, 把 cmmi 任务中所有包含的技能都列全了, 方便后续派活精准"
> "技能不是 cli 工具, 是 skills, 得区分了"
> "不要 13 员工"

### 10.1 30 个中文 2 字 skill 全集

按 §1 25 任务的派活路径反讲 + 全阶段覆盖:

| # | 中文 2 字 | 含义 | 覆盖阶段 |
|---|---|---|---|
| 1 | 调研 | research / investigation | 立项 + 规划 |
| 2 | 画图 | sketch / wireframe | 立项 (FDA 必备) |
| 3 | 选型 | selection / architecture | 立项 (FDA 必备) |
| 4 | 研判 | decision making | 立项 (FDA 必备) |
| 5 | 文档 | documentation | 全阶段 |
| 6 | 评审 | review | 全阶段 |
| 7 | 立项 | project initiation | Phase 1 |
| 8 | 规划 | planning | Phase 2 |
| 9 | 设计 | design | Phase 3 |
| 10 | 编码 | coding | Phase 4 |
| 11 | 重构 | refactor | Phase 4 |
| 12 | 测试 | testing | 全阶段 |
| 13 | 修复 | bug fixing | Phase 4 |
| 14 | 联调 | integration | Phase 4 |
| 15 | 部署 | deployment | Phase 5 |
| 16 | 运维 | operations | Phase 5 |
| 17 | 监控 | monitoring | Phase 5 |
| 18 | 应急 | incident response | Phase 5 |
| 19 | 命令 | command line | FDSE |
| 20 | 脚本 | scripting | FDSE |
| 21 | 自动化 | automation | FDSE |
| 22 | 数据 | data analysis | DS |
| 23 | 分析 | analytics | DS |
| 24 | 报告 | reporting | DS + PM |
| 25 | 派活 | dispatch | PM |
| 26 | 验收 | acceptance | PM |
| 27 | 调度 | orchestration | PM |
| 28 | 复盘 | retrospective | 全阶段 |
| 29 | 预算 | estimation | Phase 1+2 |
| 30 | 风控 | risk management | 全阶段 |

### 10.2 6 老板团队 skill × tools 矩阵

| 员工 | 真名 | role | 中文 skills (8 个) | 英文 tools (2-3 个) |
|---|---|---|---|---|
| 1 | Hermes | PM | 派活 / 验收 / 报告 / 调度 / 评审 / 复盘 / 立项 / 文档 | **Hermes 自己** (wave280 修正, 不配 kiro-cli) |
| 2 | 墨斗 | FDA | 调研 / 画图 / 选型 / 研判 / 文档 / 设计 / 立项 / 规划 | agy / claude-glm |
| 3 | 铁匠 | Core SWE | 编码 / 重构 / 测试 / 修复 / 联调 / 文档 / 设计 / 评审 | cmd / claude-mm |
| 4 | 兑底渊 | PRE-SRE | 部署 / 运维 / 监控 / 应急 / 自动化 / 脚本 / 命令 / 风控 | cmd / claude-mm |
| 5 | 门神 | FDSE | 命令 / 脚本 / 自动化 / 部署 / 联调 / 测试 / 调研 / 文档 | cmd / claude-mm |
| 6 | 百晓生 | DS | 数据 / 分析 / 报告 / 测试 / 验收 / 复盘 / 风控 / 评审 | claude-mm / claude-glm |

### 10.3 派活精准 (老板原话 "方便后续派活精准")

新服务 `server/src/services/dispatch-skill-matcher.ts`:
- 输入: 中文 2 字 skill (单个或多个, 用 `/` 分隔)
- 输出: 公司内 6 老板团队 × 评分 (matchedCount / inputSkills.length * 100, 降序, 平局按名字升序)
- App 端 `SkillMatcherSheet` (派活精准浮层, OrgAssetsScreen 顶部 "🎯 派活精准" 入口触发):
  - 输入框 + 6 员工列表 (role 徽章 + matched skills 绿色 chip + 评分)
  - 点员工 → 复制到 clipboard + Toast 提示
- **不动** Hermes 工坊 chat 派活输入逻辑 (这次只做 UI, 端到端派活流程留给下一波)

### 10.4 删 13 数字员工 (老板 "不要 13 员工")

13 数字员工 = 6 QA (wave217, QA-Test-Workshop) + 7 Ops (wave220, Coolie-Ops-Control-Room), 散在 2 个独立公司名下。

修法: 新迁移 `9023_delete_13_digital_employees.sql` 直接 `DELETE FROM agents WHERE name IN ('QA Lead', ..., 'Release Ops')` — 按 name 删, 跨公司.

**Why:** 派活精度从 5 角色降到 13 数字员工反而是噪声, 老板只看 6 老板团队.

**不动:**
- ❌ qa-bootstrap-team.mjs / qa-bootstrap-ops.mjs (老板原话 "不动 13 数字员工相关 scripts", 改了下次 bootstrap 会重建)
- ❌ .agents/skills/qa-* / .agents/skills/ops-* (qa/ops 员工的 skills 目录)
- ❌ migration 删的是 agents 行, 2 个测试公司 (QA-Test-Workshop / Coolie-Ops-Control-Room) 本身保留

### 10.5 schema 改动 (fork-only 增强)

| 表 | 列 | 类型 | 含义 |
|---|---|---|---|
| agents | `tools` | text[] | 英文 CLI / tool 列表 (wave258 新). 跟 `skills` 拆开. |

不改:
- ❌ AGENT_ROLES enum (5 角色不变)
- ❌ `role_label` / `responsibilities` / `skills` 三列 (wave256 已就位, skills 列内容语义升级为中文 2 字)
- ❌ ROLE_MAPPING (算法层 25 任务主/副角色不变)

### 10.6 出处

- 老板原话: brief wave258 (2026-10-01, 4 条)
- 算法层: `server/src/services/agent-assign.ts` (wave222, 不动)
- 数字员工卡基线: `clients/expo/src/components/AssetsAgentCard.tsx` (wave256)
- 派活精准: `server/src/services/dispatch-skill-matcher.ts` (wave258 新)
- 删 13: `packages/db/src/migrations/9023_delete_13_digital_employees.sql` (wave258 新)
- 加 tools 列: `packages/db/src/migrations/9022_add_agent_tools.sql` (wave258 新)

**本波 (wave258) 变更摘要**:
- §10 整章新增 (中文 2 字 skill × 英文 cli tool 维度 + 派活精准 + 删 13), 不改前面 §1-§9
- 30 个中文 2 字 skill 全集 + 6 老板团队 × skill × tool 矩阵
- 派活精准算法 (`dispatch-skill-matcher.ts`) + App 端 `SkillMatcherSheet` 浮层
- 删 13 数字员工 (6 QA + 7 Ops), migration 兜底, 不动 bootstrap 脚本
- agents 表加 `tools` 列 (text[], 中文 cli / 英文 cli), 不动 wave256 加的 3 列
- 算法层 / 5 角色 / wave256 数字员工卡 / wave222 派活算法 / wave244 图谱 / wave251 chip 去重 全部不动 — 本波只 ADDS 派活精准维度
