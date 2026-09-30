# 本体 5 角色 × CMMI 工作完整映射 (wave222)

> **目的**: 把 Coolie 本体的 5 个工匠角色（`fda` / `core-swe` / `pre-sre` / `fdse` / `ds`），
> 完整映射到 CMMI 5 阶段 × 25 个标准工作上。
>
> **Why**: 之前 wave140 把 CMMI WBS 拆成 6 阶段 25 任务, 但任务派发算法 (wave142) 按 specialty metadata 路由,
> 不按 5 角色路由. 老板说"任务派出去不知道派给谁, 派活算法按 specialty 不按角色, 老板要看
> '哪个角色干哪个事'清单, 现在散落" — 本文档把映射集中, 把算法升级为"5 角色优先 + specialty 二次匹配".
>
> **5 角色职责回顾**: 5 角色出处见 `docs-coolie/CMMI-ROLE-CARDS.md` 与
> `packages/agents/role-templates/{fda,core-swe,pre-sre,fdse,ds}.ts`（不变, 本文档不重新定义角色）.

---

## 0. 文档约定

- **CMMI 阶段**: 老板版的 5 阶段 (立项 / 规划 / 设计 / 开发 / 部署), 与代码库 6 阶段
  (`CMMI_WBS_PHASES` = 需求确认 / 架构设计 / 详细设计 / 开发实现 / 测试验收 / 上线移交) 的关系见 §6.
- **5 角色 id** (`packages/shared/src/constants.ts::AGENT_ROLES`):
  - `fda` — Forward Deployed Architect (前线架构师)
  - `core-swe` — Platform Core Software Engineer (平台核心研发)
  - `pre-sre` — Product Reliability Engineer (产品可靠性工程师)
  - `fdse` — Forward Deployed Software Engineer (前线全栈交付)
  - `ds` — Deployment Strategist / Business Solution Specialist (部署战略 / 业务方案专家)
- **不增不删** — 5 角色与 `AGENT_ROLES` enum 完全一致, 仅做映射.

---

## 1. CMMI 5 阶段 × 25 任务 × 5 角色映射表

| CMMI Phase | 任务 | 主角色 | 副角色 | 说明 |
|---|---|---|---|---|
| **Phase 1: 立项** | 1.1 业务目标 | `fda` | - | 客户前线需求 |
| | 1.2 技术约束 | `fda` | `core-swe` | 架构选型 |
| | 1.3 License 合规 | `ds` | `fda` | 开源协议扫描 |
| | 1.4 选型研判 (DAR) | `fda` | `ds` | 竞品对标 |
| | 1.5 G0 选型门禁 | `core-swe` | `fda` | 立项前门禁 |
| **Phase 2: 规划** | 2.1 端口策略矩阵 | `pre-sre` | `core-swe` | 网络策略 |
| | 2.2 WBS 拆解 | `core-swe` | `fda` | 主线支线临时 |
| | 2.3 Spec 编写 | `core-swe` | - | 4 类 spec schema |
| | 2.4 工时估算 | `fdse` | `core-swe` | 评估工作量 |
| | 2.5 风险评估 | `fda` | `pre-sre` | 风险预案 |
| **Phase 3: 设计** | 3.1 系统设计 | `core-swe` | `fda` | 架构 + 数据模型 |
| | 3.2 API 契约 | `core-swe` | - | REST + GraphQL |
| | 3.3 DB Schema | `core-swe` | `ds` | 数据模型 |
| | 3.4 安全设计 | `pre-sre` | `core-swe` | 鉴权 + RBAC |
| | 3.5 部署架构 | `pre-sre` | `core-swe` | CI/CD + 网络策略 |
| **Phase 4: 开发** | 4.1 编码 | `core-swe` | `fdse` | 主代码 |
| | 4.2 单元测试 | `core-swe` | - | 自己写 |
| | 4.3 代码审查 | `fdse` | `core-swe` | 互审 |
| | 4.4 集成测试 | `core-swe` | `fdse` | 端到端 |
| | 4.5 性能优化 | `pre-sre` | `core-swe` | 性能瓶颈 |
| **Phase 5: 部署** | 5.1 部署执行 | `pre-sre` | - | systemd + OTA |
| | 5.2 监控告警 | `pre-sre` | `ds` | 日志 + 指标 |
| | 5.3 验收测试 | `core-swe` | `fdse` | 30 项 E2E |
| | 5.4 发布说明 | `core-swe` | `fda` | release notes |
| | 5.5 复盘 | `fda` | `ds` | 经验总结 |

合计: 25 任务, 主角色分布 — `fda` ×5, `core-swe` ×14, `pre-sre` ×6, `fdse` ×4, `ds` ×3
（一个 Phase 1.4 选型研判的主角色是 `fda` — 即 demo 跑的就是这条规则）.

---

## 2. 双轨 (Dev + Infra) 映射

| 轨道 | 工作 | 主角色 |
|---|---|---|
| **Dev Track** | Phase 3 设计 + Phase 4 开发 | `core-swe` + `fdse` |
| **Infra Track** | 端口策略 + 部署架构 + 部署执行 | `pre-sre` |

老板原意: Dev 轨与 Infra 轨并行, 由两个不同的角色各自负责, 避免单点. `core-swe` 是 Dev 轨的
主心骨, `pre-sre` 是 Infra 轨的当家人. 双轨交汇点是 Phase 5.3 验收测试 (`core-swe`) — 它必须
在 Infra 轨部署完成之后才能开跑.

---

## 3. 数字员工 × CMMI 映射

> 数字员工的 `specialty` 是波次 wave217 (QA) / wave220 (Ops) 加的"5 角色内再分细"标识.
> 派活算法看到 specialty 时, 在 5 角色已锁定的桶内再细化.

| 数字员工 | 角色 | specialty | 干 |
|---|---|---|---|
| Ops Lead | `pre-sre` | `ops-lead` | Phase 5 部署 + 监控 |
| Mobile Ops | `pre-sre` | `ops-mobile` | Phase 5 验收 (Android) |
| iOS Ops | `pre-sre` | `ops-ios` | Phase 5 验收 (iOS) |
| Web Ops | `pre-sre` | `ops-web` | Phase 5 验收 (Web) |
| Server Ops | `pre-sre` | `ops-server` | Phase 5 监控 |
| Build Ops | `pre-sre` | `ops-build` | Phase 5 自动 build |
| Release Ops | `pre-sre` | `ops-release` | Phase 5 自动 release |
| QA Lead | `core-swe` | `qa-lead` | Phase 5 验收测试 |
| Mobile Tester | `core-swe` | `qa-mobile` | Phase 5 撞机 |
| iOS Tester | `core-swe` | `qa-ios` | Phase 5 撞机 |
| Web Tester | `core-swe` | `qa-web` | Phase 5 撞机 |
| Performance Tester | `pre-sre` | `qa-perf` | Phase 5 性能 |
| Accessibility Tester | `fdse` | `qa-a11y` | Phase 5 a11y |

> 注: 5 角色模板 (`packages/agents/role-templates/`) 的 default 员工只有 `*-agent` 后缀
> (fda-agent / core-swe-agent / pre-sre-agent / fdse-agent / ds-agent). 上面这张表里的
> specialty 员工 (Ops Lead / Mobile Ops / …) 都是 wave220 之前已建的, 这里只是把它们各自
> 干的活跟 CMMI 阶段挂上钩, 不创建新员工.

---

## 4. 派活算法升级 (wave142 → wave222)

### 4.1 旧算法 (wave142, `scripts/wave142/route-wbs-assignees.mjs`)

```
按 (阶段正则 + 标题关键词) → 命中 8 条规则之一 → 返回 5 角色之一
```
问题: 阶段正则只到 S1..S6; 关键词规则只覆盖 6 个用例; 没有"5 角色优先"层, 全部逻辑平铺在 RULES 表里.

### 4.2 新算法 (wave222, `server/src/services/agent-assign.ts`)

```
inputs:  { phase: CMMI 5 阶段之一, taskType: 25 任务之一, specialtyHint?: string }
step 1:  primaryRole = ROLE_MAPPING[phase][taskType].primary        (5 角色之一)
step 2:  secondaryRole = ROLE_MAPPING[phase][taskType].secondary   (5 角色之一 或 null)
step 3:  if specialtyHint:
             filter 数字员工 by primaryRole + specialtyHint        (在桶内再细化)
step 4:  else:
             fallback 该角色槽内"通用"数字员工 (如 core-swe-agent / fda-agent)
return:  { primary, secondary, candidateAgentIds }
```

**关键变化**:

1. **5 角色优先** — 不再按关键词匹配角色, 而按 (阶段, 任务) 二维表直接查 5 角色.
2. **specialty 是二次细化** — 仅在 5 角色已锁定的桶内筛选数字员工.
3. **不 hardcode specialty** — 数字员工的 specialty metadata 不出现在算法里, 算法只接收
   `specialtyHint` 入参, 调谁由调用方决定.

### 4.3 调用方约定

- `agent-assign.ts` 是**纯函数 + DB 查询**, 不发任何外部 API.
- `wbs-adopt`（把文档拆出的 WBS 草案采纳为 issue 列表）会调它,
  在 create issue 的同时把 `assigneeAgentId` 一次性填好.
- `assignIssue` (用户手工改指派人) 不强制, 但回填默认时也走它.

---

## 5. 5 角色桶内"通用"数字员工

派活算法在第 4 步找不到 `specialtyHint` 时, 落到桶内通用员工:

| 角色 | 通用员工 id (公司内查找规则) |
|---|---|
| `fda` | role=fda 的任意 active 数字员工 (默认 `fda-agent`) |
| `core-swe` | role=core-swe 的任意 active 数字员工 (默认 `core-swe-agent`) |
| `pre-sre` | role=pre-sre 的任意 active 数字员工 (默认 `pre-sre-agent`) |
| `fdse` | role=fdse 的任意 active 数字员工 (默认 `fdse-agent`) |
| `ds` | role=ds 的任意 active 数字员工 (默认 `ds-agent`) |

> 实际 id 由 DB 查找返回, 不在算法里写死.

---

## 6. CMMI 老板版 5 阶段 ↔ 代码库 6 阶段

| 老板版 (本表) | 代码库 (`CMMI_WBS_PHASES`) | 备注 |
|---|---|---|
| Phase 1 立项 | 需求确认 + 架构/设计 (合并) | 老板把"定方向 + 选架构"看成一件事 |
| Phase 2 规划 | (新增, 不在 6 阶段里) | 老板加的 WBS 拆解 + Spec 编写 |
| Phase 3 设计 | 详细设计 | 与代码库同名, 但只对应"详细"那一层 |
| Phase 4 开发 | 开发实现 | 与代码库同名 |
| Phase 5 部署 | 测试验收 + 上线移交 (合并) | 老板把"测试 + 上线"看作一个阶段 |

> 本表 (CMMI 5 阶段 25 任务) 是**派活键**, 不替换 `CMMI_WBS_PHASES`. 两者并存, 6 阶段是
> `projects.wbs_draft` 的结构, 5 阶段是 `agent-assign.ts` 的派活键. 互相通过 §6 表对应.

---

## 7. 不做什么 (反向约束)

- **不增 5 角色** — `AGENT_ROLES` enum 仍是 `fda / core-swe / pre-sre / fdse / ds` 5 个,
  不加 `qa` / `devops` / `ops` 等新角色. 已有 `qa` / `devops` 等是上游 Paperclip 的角色,
  本表不引入新角色.
- **不增数字员工** — 本波不改 wave217 / wave220 已建的员工.
- **不替 wave142 路由** — `scripts/wave142/route-wbs-assignees.mjs` 是历史脚本,
  本波只是给上层 (`server/src/services/agent-assign.ts`) 提供同源映射.
- **不动 schema** — issue 表的 `wbsCode` / `wbsType` 字段不动; 5 阶段 25 任务元数据全部
  落在 `ROLE_MAPPING` 常量里, 不入库.
- **不动 UI / clients/expo** — 本波纯后端服务 + 文档.

---

## 8. 出处与索引

- 角色定义: `packages/agents/role-templates/{fda,core-swe,pre-sre,fdse,ds}.ts`
- 角色 enum: `packages/shared/src/constants.ts::AGENT_ROLES`
- CMMI 门禁定义: `packages/shared/src/constants.ts::CMMI_GATES` / `CMMI_WBS_PHASES`
- 6 阶段 WBS 拆解: `server/src/services/wbs-draft.ts`
- 老路由脚本: `scripts/wave142/route-wbs-assignees.mjs`
- 新派活算法: `server/src/services/agent-assign.ts` ← 本波新增
- demo 跑活: `scripts/wave222/route-demo.mjs` ← 本波新增
- QA 报告: `docs-coolie/evidence/wave222/QA-REPORT.md` ← 本波新增