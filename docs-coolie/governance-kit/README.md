# 本地团队治理套件 (team-governance kit) — wave285

> 来源: coolie-mac 六人组 (Hermes PM + 墨斗/铁匠/铁匠贰号/门神/兑底渊/百晓生) 的实战沉淀。
> 原则: **只搬管理方式, 不搬人名**。每台机器的团队名册自己填, 脚本零改动。

## 0. 一分钟接入

```sh
# 1) 解压套件到任意目录 (推荐 ~/team-governance)
# 2) 把样例名册拷成本机名册, 填自己的员工
cp team-roster.example.json .coolie-local/team-roster.json
vi .coolie-local/team-roster.json
# 3) 冒烟: 应该看到你自己的员工
bash scripts/cron-team-status.sh --who
# 4) (可选) 给每个员工写 sub-agent 模板
cp docs/AGENT-TEMPLATE.md .agents/agents/<agentId>.md
```

名册覆盖顺序: `$TEAM_ROSTER` > `.coolie-local/team-roster.json` > `scripts/lib/default-roster.json`。
换团队 = 换一个 JSON 文件, 所有脚本 (派单/看板/门禁) 自动跟着走。

## 1. 这套管理方式解决什么

| 病 | 药 (本套件) |
|---|---|
| 不知道谁在干什么, 问了也答不准 | `cron-team-status.sh --who` — **【谁·用什么工具·干什么】** 三元组全景, 老板心智反射 |
| 派活靠口头传话, 交接丢上下文 | `dispatch-local-employee.sh` 结构化派单收据 (状态机) + `context-bus.sh` 上下文接力 |
| 干没干完说不清, 质量门禁靠感觉 | `gate-evidence-ledger.sh` G0-G7 证据账本, 每门独立归属+证据+一票否决 |
| 工具坏了/额度尽了才发现 | `tool-health-monitor.sh` 真跑探测 (对方真回复 ok 才算健康) + `daily-tool-probe.sh` 晨检 |
| 推送刷屏, 全是废话 | `event-trigger.sh` 事件驱动 + 真静默 (状态无变化不推) + 3 段 5 行浓缩格式 |
| 定时活没人记得跑 | `register-employees-cron.sh` 固定 cron 矩阵 (每人每角色一个固定时刻) |
| 容器/宿主机工具分布乱 | `host-exec.sh` 透明穿透桥 (容器内可调宿主机 CLI) |

## 2. 核心纪律 (搬的是这些, 不是名字)

1. **三元组心智**: 任何人问「谁在干活/谁在用 X」, 第一句必须答【谁·用什么工具·干什么】, 禁止只报 wave 编号、git hash、PID。
2. **5 字段汇报**: 员工名 / 正在进行的任务 / 多长时间 / 使用工具 / 状态。
3. **4h 卡死线**: 进程超 4 小时 = 卡 = 必须通知, 附行动建议 (检查/换手/兜底工具)。
4. **单写者**: 同一仓库同一时刻只有一个员工写; 并行 = 冲突源。
5. **派单七要素**: 背景/目标/分支/文件白名单/步骤/验收/规则, 缺一拒接。
6. **收据状态机**: `queued → running → done | blocked | failed`; 完成必须回写 commit hash + 验证命令 + 证据路径, 禁止占位回写。
7. **门禁证据隔离**: G1 架构 / G2 设计 / G3 构建 / G4 验证 / G5 发版 (扩展 G0 需求/G6 运营/G7 业务), 每门独立归属人, 严禁跨门借用证据。
8. **上下文接力不口头**: 跨员工交接写 context-bus JSON, 上游 commit/改动/嘱托自动注入下游。
9. **真跑探测**: 工具健康 = 真调用且对方真回复 ok, 不是 binary 存在就算。
10. **真静默**: 没有状态变化就不推送; 推送永远是浓缩格式 (跑/卡/完 ≤ 3 行)。

## 3. 名册规范 (team-roster.json)

见 `team-roster.example.json`。字段:
- `employees[]`: `agentId` (sub-agent 文件名, 英文-kebab) / `name` (本机员工名, 中文最佳) / `role` / `defaultTool` / `fallbackTools[]` / `env` (跑在哪台环境/容器)
- `gateOwners`: G1_Arch…G7_Biz 各门归属 (缺省回退内置默认)
- `tools[]`: 本机工具池清单 (供探测)

**工具与角色不硬绑定**: defaultTool 只是推荐强项, 派单时按任务类型 + 工具健康/额度现选。

## 4. 常用命令

```sh
bash scripts/cron-team-status.sh --who      # 谁在用什么工具干什么 (全景)
bash scripts/cron-team-status.sh --print    # 5 字段进展 (3 段 5 行浓缩)
bash scripts/dispatch-local-employee.sh --agent <agentId> --task "<任务>"   # 派单+收据
bash scripts/dispatch-local-employee.sh --list                              # 收据列表
bash scripts/dispatch-local-employee.sh --update <id> --status done --commit <hash> --verification "<cmd>"
bash scripts/gate-evidence-ledger.sh --init <wave> --task "<任务>"           # 开账本
bash scripts/gate-evidence-ledger.sh <wave>                                 # 看账本
bash scripts/tool-health-monitor.sh --check                                 # 工具真跑探测
bash scripts/register-employees-cron.sh --dry-run                           # 预览固定 cron
```

## 5. 本机适配点 (接入时逐条过)

| 项 | 说明 |
|---|---|
| `.agents/agents/<agentId>.md` | 每员工一份 sub-agent 模板 (套件附 `AGENT-TEMPLATE.md`) |
| `cron-team-status.sh` 的 `infer_employee` | 按本机进程命令行推断员工名; 不适配则显示 `?` (--who 不受影响) |
| `tool-health-monitor.sh` 工具探测表 | 按本机工具池增删 |
| `event-trigger.sh` 的 `NOTIFY_CMD` | 通知通道 (默认落本地日志; 有 IM 通道则接) |
| `host-exec.sh` | 仅容器/宿主机双环境需要; 单机可忽略 |

## 6. 出处

- 母本仓库: coolie fork (`docs-coolie/EMPLOYEE-OBJECTS.md` / `TOOLS.md` / `PM-WECHAT-NOTIFY.md` / `PM-DISPATCH-QUICKCARD.md`)
- 波次: wave272 (工具池) → wave276 (5字段) → wave277/279 (真跑探测) → wave280 (事件驱动) → wave282 (sub-agent + 固定 cron) → wave284 (context-bus + host-exec + 门禁加固) → wave285 (名册驱动可搬层)
