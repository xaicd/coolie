# Spec: Coolie 双轨建设 — 本地施工队 + 产品内置公司体系

## 1. 背景

Coolie 工坊是从 Paperclip 开源产品 fork 定制开发的中文复杂业务项目交付产品。Paperclip 提供 AI-agent 公司控制平面基座：company、agent、org tree、task、comment、heartbeat、budget、approval、work product、adapter。Coolie 在此之上叠加 Palantir 本体能力插件、CMMI 交付流程、中文 5 角色心智、移动 App 和 Hermes/微信管理入口。

老板明确要求分清两条线：

1. **本地施工队**：Hermes + 墨斗 / 铁匠 / 铁匠贰号 / 门神 / 兑底渊 / 百晓生，用来建设 Coolie 工坊产品本身。
2. **Coolie 产品内置公司体系**：产品运行时的 company / team / agent / task / budget / approval / run-log / work-product 管理体系，面向中文用户完成传统复杂业务项目交付。

本 spec 只定义建设路线与验收标准，不直接替代具体实现 task。每个实现任务应另开 task spec，且一条 task 对应一次提交。

## 2. 目标

Coolie 工坊最终 SHALL 成为：

> 面向中文复杂业务项目交付的 AI-agent 公司控制平面：基于 Paperclip 的公司 / agent / task / budget / approval / run-log 标准，叠加 Palantir 本体建模与 CMMI 交付门禁，让 AI 团队能从业务需求到上线运营完成可审计、可验收、可复盘的项目交付。

验收条件：

- WHEN 未来 AI CLI / 新电脑读取根 `AGENTS.md` THEN it SHALL 分清本地施工队与 Coolie 产品内置公司体系。
- WHEN 用户可见页面、技能、员工描述或派单文案展示 5 角色 THEN it SHALL 中文简称优先，并只在必要处显示英文 enum / 角色括注。
- WHEN Hermes 给本地施工队派活 THEN it SHALL 产生可追踪 receipt，而不是只依赖聊天上下文或 `ps` 推断。
- WHEN Coolie 产品创建复杂业务项目 THEN it SHALL 能沿“本体建模 → CMMI/WBS → 5 角色派活 → 证据/审批 → 上线/复盘”主链路推进。
- WHEN Paperclip 基座能力已存在 THEN Coolie SHALL 复用 company / agent / task / approval / budget / heartbeat / work product，不另造平行控制平面。

## 3. 文件范围（白名单）

后续实现可按 task 拆分。当前主线涉及的候选文件范围：

- `AGENTS.md`
- `docs-coolie/EMPLOYEE-OBJECTS.md`
- `docs-coolie/PM-DISPATCH-QUICKCARD.md`
- `docs-coolie/TOOLS.md`
- `docs-coolie/ROLE-MAPPING.md`
- `docs-coolie/CMMI-EMPLOYEE-MAPPING.md`
- `docs-coolie/specs/`
- `.agents/agents/*.md`
- `scripts/dispatch-local-employee.sh`
- `scripts/register-employees-cron.sh`
- `scripts/cron-team-status.sh`
- `scripts/tool-health-monitor.sh`（待建）
- `server/src/services/agent-assign.ts`
- `server/src/services/agent-assign.test.ts`
- `packages/shared/src/constants.ts`
- `packages/agents/role-templates/*.ts`
- `packages/ontology-core/src/**`
- `packages/plugins/plugin-ontology/src/**`
- `server/src/routes/build.ts`
- `server/src/routes/ontology-graph.ts`
- `server/src/services/ontology-spec*.ts`
- `server/src/services/ontology-provisioner.ts`
- `clients/expo/src/**`
- `ui/src/**`

## 4. 不动项

- 不把本地施工队的 CLI / 套餐 / 微信规则硬编码进 Coolie 产品运行时。
- 不把 `kiro-cli` 重新映射成 Hermes 的工具；Hermes 是 PM，也是自己的本地工具。
- 不把英文 enum 作为中文用户主心智；英文 id 只服务实现层。
- 不绕过 Paperclip company-scoped 隔离、审批、预算、heartbeat、work product 等既有控制平面。
- 不用 mock 业务数据替代真实 seed / fixture / evidence。
- 不在实现任务中顺手修改发版版本号，除非该 task 明确是发版。

## 5. 方案

### 5.1 本地施工队线

本地施工队是建设 Coolie 产品的施工队，不是产品内置 company/team runtime。

核心对象：

| 对象 | 说明 |
|---|---|
| Hermes | PM / 掌柜 / 本地调度入口 |
| 墨斗 | FDA，原型、选型、本体边界、业务访谈 |
| 铁匠 | Core SWE，代码、契约、架构落地 |
| 铁匠贰号 | Core SWE 兜底，不是新增员工 |
| 门神 | FDSE，命令、E2E、撞机、金标验收 |
| 兑底渊 | PRE-SRE，部署、OTA、监控、应急 |
| 百晓生 | DS，风险、业务验收、go/no-go、复盘 |

工具不是员工身份绑定。工具是有套餐 / 额度 / 可用性的“手”。Hermes 派活时应按任务类型、工具强项、工具健康、员工 skill 需求选择最佳可用工具。

本地施工队 P0：

1. `dispatch-local-employee.sh` 写结构化 receipt。
2. `cron-team-status.sh` 优先读 receipt，再读 active process。
3. 新建轻量 `tool-health-monitor.sh`，每 2 小时真跑工具并写 `.coolie-local/tool-health/latest.json`。
4. 事件驱动推送新派单、卡死、完成、失败。
5. 完工时 receipt 补 commit、测试、QA report、artifact。

### 5.2 Coolie 产品线

Coolie 产品内置体系面向用户管理 AI-agent 公司，不能混成本地施工队。

产品核心链路：

```text
中文项目入口
→ 业务本体建模
→ CMMI/WBS 拆解
→ 5 角色派活
→ agent 执行
→ 证据/产物
→ 审批/验收
→ 上线/复盘
```

应复用 Paperclip 基座：

| Paperclip 基座 | Coolie 产品语义 |
|---|---|
| company | 项目公司 / 交付组织 |
| agents | 中文 5 角色员工 / 其它公司员工 |
| issues | CMMI/WBS 任务树 |
| comments/documents | spec / brief / 验收意见 |
| work products | 交付证据中心 |
| approvals | G1-G5 gate / 老板审批 / DS go-no-go |
| heartbeat/run log | agent 执行记录 / 卡死恢复 |
| adapters | 运行时 / 工具 / 模型能力 |

### 5.3 Palantir 本体层

本体插件应作为复杂业务项目入口，不是附加玩具。

最小本体对象：

- Object Type
- Relation Type
- Action
- Permission
- Workflow
- Metric
- Evidence

新项目启动时，Coolie 应先问：

- 这个业务有哪些对象？
- 对象之间什么关系？
- 哪些角色能做哪些动作？
- 哪些动作需要审批？
- 哪些指标代表成功？
- 哪些规则不能被破坏？
- 哪些证据能证明完成？

## 6. 分阶段任务

### Phase A — 心智与代码对齐

- [x] 根 `AGENTS.md` 写清两套团队边界。
- [x] 根 `AGENTS.md` 写清工具非员工硬绑定。
- [x] 根 `AGENTS.md` 写清中文用户优先。
- [x] `AGENT_ROLE_LABELS` 改为中文短名优先。
- [x] 5 个 role template 改为中文主名 + 英文括注。
- [x] CMMI 关键任务路由调整：风险、部署架构、监控、验收、复盘由 DS / 百晓生主责。

### Phase B — 本地施工队运行闭环

- [ ] `dispatch-local-employee.sh` 写 receipt JSON。
- [ ] `cron-team-status.sh` 读取 receipt，并输出 3 行微信格式。
- [ ] `tool-health-monitor.sh` 写 latest JSON。
- [ ] `event-trigger.sh` 监听新派单 / 卡死 / 完成 / 失败。
- [ ] 完工证据自动追加到 receipt。

### Phase C — 本体建域链路验真

- [ ] 验证 `build` route 能从“建域 xxx”生成 ontology spec。
- [ ] 验证 spec approval 后能 provision ontology domain。
- [ ] 验证 ontology spec 能 decompose build issues。
- [ ] 验证 App/Web 能看到 domain、object types、relation types、build tasks。
- [ ] 验证所有 ontology 读写 company-scoped。

### Phase D — 复杂项目模板

- [ ] 新项目可选“复杂业务交付模板”。
- [ ] 自动生成 G1-G5/G6 主线。
- [ ] 每阶段有角色、任务、交付物、验收证据。
- [ ] 支持本体建模任务作为 G1/G2 前置。

### Phase E — 交付证据中心

- [ ] 项目页展示按阶段聚合的 work products。
- [ ] 每个证据有负责人、来源任务、验证方式、状态。
- [ ] 支持截图、测试输出、文档、链接、版本、审批记录。

## 7. 验收 Gate

### G1 — FDA 设计门禁

- 租户 / company 隔离强制点能指到服务端文件行。
- 领域边界：本地施工队对象、产品运行时对象、本体对象不混用。
- 权限矩阵覆盖读 / 写 / 批。
- 资金 / 库存 / 配额类变更有事务或守恒说明。

### G2 — Core SWE 实现门禁

- 相关包 typecheck 通过。
- CMMI role mapping 测试通过。
- 中文 label 和 role template 测试 / 快照同步。
- API / schema / UI 类型同步。

### G3 — FDSE 验证门禁

- App/Web 中文角色展示可见。
- 本体 workbench 空态 / 加载 / 成功 / 错误态可验。
- dispatch receipt / status 输出可真实运行。

### G4 — DS 业务门禁

- 中文老板视角可理解“谁在干什么、卡在哪、证据在哪”。
- 复杂业务项目至少能用一个样例走通本体 → WBS → 验收主链路。
- DS 给出 go / no-go。

### G5 — PRE-SRE 上线门禁

- 发版时版本号 / tag / manifest 一致。
- 生产健康检查通过。
- 回滚路径明确。

## 8. 已知缺口

1. `cron-team-status.sh` 仍主要依赖进程推断，缺 receipt 真值。
2. `tool-health-monitor.sh` 尚未落地。
3. `event-trigger.sh` 尚未落地。
4. 本体建域链路需要端到端验真，而不是只看代码存在。
5. 复杂业务项目模板尚未成为产品默认入口。
6. 中文角色展示仍需全面扫 UI / App / skill / docs。
7. `clients/expo` 当前 typecheck 存在既有 `showInfoToast` 导出缺失问题，后续任务需修。

## 9. 派工建议

| 员工 | 任务 | 产物 |
|---|---|---|
| 墨斗 | 复杂业务项目模板 + 本体入口原型 | spec / prototype |
| 铁匠 | receipt / role routing / ontology build chain 修实现 | code + tests |
| 门神 | App/Web 中文角色 + 本体链路 E2E | screenshots + QA |
| 兑底渊 | runtime/tool health + release gate | monitor script + SOP |
| 百晓生 | 中文老板业务旅程 go/no-go | risk report + decision |

## 10. 关联文档

- `AGENTS.md`
- `doc/GOAL.md`
- `doc/PRODUCT.md`
- `doc/SPEC-implementation.md`
- `docs-coolie/EMPLOYEE-OBJECTS.md`
- `docs-coolie/PM-DISPATCH-QUICKCARD.md`
- `docs-coolie/TOOLS.md`
- `docs-coolie/ROLE-MAPPING.md`
- `docs-coolie/CMMI-EMPLOYEE-MAPPING.md`
- `docs-coolie/PM-WECHAT-NOTIFY.md`
- `docs-coolie/specs/ENTERPRISE-COMPLEX-PROJECT-CMMI-AUDIT.md`
- `docs-coolie/research/architecture-7-primitives.md`
