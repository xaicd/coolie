# Tasks: 产融商业保理与供应链金融智能体系统 初始工程地基与规范基线

上游：`design.md`。执行纪律：**1 Task = 1 Commit**，提交标识携带 `[T#]`，每任务必须附带真实验证。

## 1. 任务依赖波次图 (Task Dependency Graph - Kiro Waves)

```json
{
  "waves": [
    { "id": "wave-1", "title": "隔离地基与数据模型", "tasks": ["T1"], "dependsOn": [] },
    { "id": "wave-2", "title": "统一契约与模块边界", "tasks": ["T2", "T3"], "dependsOn": ["wave-1"] },
    { "id": "wave-3", "title": "运行时门禁与审计链", "tasks": ["T4"], "dependsOn": ["wave-2"] },
    { "id": "wave-4", "title": "规范基线与门禁验收", "tasks": ["T5"], "dependsOn": ["wave-3"] }
  ]
}
```

## 2. 交互式任务清单 (Interactive Execution Tasks)

- [ ] **T1**: 初始化数据库结构与多企业隔离审计底座列
  - 归属: `main`　波次: wave-1
  - 文件白名单: `packages/db/**`、`docs/03_design/database-design-erd.md`
  - 验收: 8 审计底座列齐全；`company_id` 索引就位；越权读取返回 403（REQ-BASE-001/002/011）

- [ ] **T2**: 建立统一 API 契约与 DTO 封装
  - 归属: `T1`　波次: wave-2
  - 文件白名单: `packages/shared/**`、`docs/specs/core/init-baseline/design.md`
  - 验收: `ApiResponse<T>` 与八类错误码落地；`npx tsc --noEmit` 0 报错（REQ-BASE-003/004）

- [ ] **T3**: 固化管理面 / 编排面模块边界与适配层
  - 归属: `T1`　波次: wave-2
  - 文件白名单: `server/src/**`、`docs/03_design/architecture-design-hld.md`
  - 验收: 单向依赖成立；外部系统经防腐层接入；边界无反向依赖（REQ-BASE-006/012）

- [ ] **T4**: 落地运行时门禁与不可篡改审计链
  - 归属: `T2,T3`　波次: wave-3
  - 文件白名单: `server/src/services/**`
  - 验收: 离线 License 校验 fail-fast；状态变更写哈希链且与业务同事务（REQ-BASE-005/008）

- [x] **T5**: 执行门禁校验与首期规范基线冻结
  - 归属: `main`　波次: wave-4
  - 文件白名单: `docs/**`、`scripts/**`
  - 验收: G1~G5 门禁退出码 0；CMMI 01~09 拓扑完整；未发生事实留空（REQ-BASE-009/010）
  - 交付: 门禁校验 G1~G5 全绿（exit 0）；补齐 `docs/04_implementation/` 恢复 01~09 拓扑；冻结 `v1.0.0-BASELINE`
    （发布说明 `docs/07_release/release-notes.md`、配置审计 `docs/06_quality_assurance/configuration-audit.md`、
    机器证据 `docs/artifacts/baseline-gate-evidence.json`）

## 3. CMMI 双向追溯与 Git 提交核实矩阵 (RTM & Git Trace)

| ID | 归属 | 任务 | 文件白名单 | 需求 | 状态 |
|---|---|---|---|---|---|
| T1 | main | 数据库结构与隔离审计列 | `packages/db/**` | REQ-BASE-001/002/011 | 未开始 |
| T2 | T1 | 统一 API 契约与 DTO | `packages/shared/**` | REQ-BASE-003/004 | 未开始 |
| T3 | T1 | 模块边界与适配层 | `server/src/**` | REQ-BASE-006/012 | 未开始 |
| T4 | T2,T3 | 运行时门禁与审计链 | `server/src/services/**` | REQ-BASE-005/008 | 未开始 |
| T5 | main | 门禁校验与基线冻结 | `docs/**`, `scripts/**` | REQ-BASE-009/010 | 已完成 |

## 4. 依赖说明

T1 → (T2 ∥ T3) → T4 → T5

## 5. 阶段状态

* 规划：`PLAN_APPROVED`（由 brief 展开）
* 规范基线：`v1.0.0-BASELINE` 已冻结（`2026-10-11`，G1~G5 门禁全绿，见 `evidence.json`）
* 开发（T1~T4 源码落地）：待开始（归后续 P2/P3 阶段）
* 独立测试：待开始
