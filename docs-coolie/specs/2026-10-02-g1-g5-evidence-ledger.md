# Spec: G1-G5 角色门禁证据账本

## 1. Requirement

本地团队要成为顶级交付团队，不能只定义 5 个员工名称。每个角色必须提交独立证据，且证据不可跨角色借用：Core SWE 的 typecheck 不能替代 DS 的业务旅程，FDSE 的 E2E 不能替代 PRE-SRE 的环境指纹。

验收条件：

- WHEN 一个本地任务完成 THEN it SHALL 至少能说明经过哪些 G1-G5 gate，以及每个 gate 的证据路径。
- WHEN 某 gate 不适用 THEN it SHALL 显式记录 `not_applicable` 和理由。
- WHEN DS 未给 go/no-go THEN 业务交付 SHALL 不得标为可交付。
- WHEN PRE-SRE 指纹或拨测失败 THEN 发版 SHALL 不得标为完成。

## 2. Design

### 2.1 本地证据账本

```text
.coolie-local/evidence-ledger/
  wave283.json
```

### 2.2 Ledger schema

```json
{
  "schemaVersion": 1,
  "wave": "wave283",
  "task": "复杂业务项目模板",
  "receiptId": "20261002T150000Z-wave283-forge-core-swe",
  "gates": {
    "G1_FDA": {
      "status": "passed",
      "owner": "墨斗",
      "evidence": ["docs-coolie/specs/..."],
      "summary": "领域边界和权限矩阵已写明"
    },
    "G2_CoreSWE": {
      "status": "passed",
      "owner": "铁匠",
      "evidence": ["pnpm typecheck output", "commit abc123"],
      "summary": "typecheck 0, 契约一致"
    },
    "G3_FDSE": {
      "status": "not_applicable",
      "owner": "门神",
      "evidence": [],
      "summary": "本任务为文档-only，无 UI 状态机"
    },
    "G4_DS": {
      "status": "blocked",
      "owner": "百晓生",
      "evidence": [],
      "summary": "尚未走中文老板业务旅程"
    },
    "G5_PRE": {
      "status": "not_applicable",
      "owner": "兑底渊",
      "evidence": [],
      "summary": "不涉及发版"
    }
  }
}
```

### 2.3 Gate 定义

| Gate | Owner | 必须证据 |
|---|---|---|
| G1 FDA | 墨斗 | 隔离点、领域边界、权限矩阵、守恒断言 |
| G2 Core SWE | 铁匠 | typecheck、契约映射、结构守卫、commit |
| G3 FDSE | 门神 | 状态机覆盖、E2E、截图/录屏、异常路径 |
| G4 DS | 百晓生 | 业务旅程、语义隔离、临界场景、go/no-go |
| G5 PRE-SRE | 兑底渊 | 版本指纹、制品不可变、拨测、回滚 |

## 3. Task

1. 新增 ledger helper
   - 白名单：`scripts/gate-evidence-ledger.sh`
   - 支持 `--init <wave>` / `--set <gate> <status>` / `--print <wave>`。
   - 写 `.coolie-local/evidence-ledger/<wave>.json`。

2. 接入 dispatch receipt
   - 白名单：`scripts/dispatch-local-employee.sh`
   - receipt 完成时可引用 ledger path。

3. 接入 status 输出
   - 白名单：`scripts/cron-team-status.sh`
   - 完成行可显示 `G1-G5: 3/5` 或 `G4 blocked`。

4. QA
   - 白名单：`docs-coolie/evidence/waveXXX/QA-REPORT.md`
   - 做一个文档-only task 示例：G1/G2 passed，G3/G5 not_applicable，G4 blocked 或 passed。

## 4. 不动项

- 不把本地 ledger 直接塞进产品数据库。
- 不允许“全绿”默认值；未填就是 `missing`。
- 不允许某角色证据替代另一角色证据。
- 不绕过 DS go/no-go 和 PRE-SRE 发版否决。

## 5. Gate

- G1: ledger 能明确区分本地施工队证据和 Coolie 产品运行时 work products。
- G2: JSON schema 稳定，脚本 `bash -n` 通过。
- G3: `--print` 输出中文可读 gate 摘要。
- G4: DS 缺证据时不能显示“可交付”。
- G5: PRE-SRE 缺发版证据时不能显示“已上线”。
