# QA 验收报告: 本地施工队派单 Receipt 闭环 (wave283)

## 1. 对应 Spec
- [`docs-coolie/specs/2026-10-02-local-dispatch-receipt.md`](file:///host-workspace/xaicd/coolie/docs-coolie/specs/2026-10-02-local-dispatch-receipt.md)

## 2. 验收目标
1. Hermes 通过本地派单脚本派单给任一本地员工时，系统在 `.coolie-local/dispatch/` 写入结构化 JSON receipt 与 prompt 文件。
2. 派单支持动态流转状态：`queued` → `running` → `blocked` / `failed` → `done`。
3. 任务完成时，支持向 receipt 回写 commit、验证命令、QA 报告、artifact/evidence 路径以及 G1-G5 证据账本（ledger）。
4. `cron-team-status.sh` 在读取状态时，优先从 receipt 提取状态并以精炼的 3 行格式输出（跑 / 卡 / 完），无调试噪音。

## 3. 测试与验证记录

### 3.1 派单生成 Receipt 测试
- **命令**:
  ```bash
  bash scripts/dispatch-local-employee.sh --agent forge-core-swe --task "修登录页面遮挡 bug" --wave wave283
  ```
- **结果**:
  - 生成 `20261003T001805Z-wave283-forge-core-swe.json` 和对应的 `.md` prompt；
  - 初始状态为 `queued`。

### 3.2 运行态与时长计算验证
- **命令**:
  ```bash
  bash scripts/dispatch-local-employee.sh --update 20261003T001805Z-wave283-forge-core-swe --status running
  bash scripts/cron-team-status.sh --compact
  ```
- **输出**:
  ```text
  【wave进展·08:18】
  跑: 铁匠 wave283 (1m, claude-glm + forge-core-swe)
  ```

### 3.3 阻塞与原因排查验证
- **命令**:
  ```bash
  bash scripts/dispatch-local-employee.sh --update 20261003T001805Z-wave283-forge-core-swe --status blocked --blocked-reason "等待后端接口契约"
  bash scripts/cron-team-status.sh --compact
  ```
- **输出**:
  ```text
  【wave进展·08:18】
  跑: 无 (全员等派活)
  卡: 铁匠 wave283 (1m, claude-glm · 等待后端接口契约)
  ```

### 3.4 门禁账本（G1-G5）联动与完成落盘
- **命令**:
  ```bash
  bash scripts/gate-evidence-ledger.sh --init wave283 --task "修登录页面遮挡 bug" --receipt "20261003T001805Z-wave283-forge-core-swe"
  bash scripts/gate-evidence-ledger.sh --set G1_FDA --status passed --summary "隔离与权限确认"
  bash scripts/gate-evidence-ledger.sh --set G2_CoreSWE --status passed --summary "typecheck 0 通过"
  bash scripts/gate-evidence-ledger.sh --set G3_FDSE --status passed --summary "真机防遮挡走查通过"
  bash scripts/gate-evidence-ledger.sh --set G4_DS --status passed --summary "业务旅程走通"
  bash scripts/gate-evidence-ledger.sh --set G5_PRE --status not_applicable --summary "无需发版"
  bash scripts/dispatch-local-employee.sh --update 20261003T001805Z-wave283-forge-core-swe --status done --commit "e06a144ea" --evidence "docs-coolie/evidence/wave283/QA-REPORT.md" --ledger ".coolie-local/evidence-ledger/wave283.json"
  bash scripts/cron-team-status.sh --compact
  ```
- **输出**:
  ```text
  【wave进展·08:18】
  跑: 无 (全员等派活)
  完: wave283 落仓 e06a144ea | G1-G5: 5/5
  ```

## 4. 门禁检查结果 (Gates)
- **G2 (Core SWE)**: `bash -n scripts/dispatch-local-employee.sh` 与 `bash -n scripts/cron-team-status.sh` 全部通过，退出码 0。
- **G3 (FDSE)**: 完整状态机链路（创建/运行/阻塞/完成/G1-G5账本关联）验证通过。
- **G4 (DS)**: 老板微信汇报视角 3 行以内输出，无任何调试噪音。
- **G5 (PRE-SRE)**: 纯本地开发工具增强，不改动产品运行时，无需发版。
