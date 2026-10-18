# 原型与交互规范: 全量架构治理门禁回归 Paperclip 官方 issue_documents 对齐改造

> **Spec-Kit UI/UX 文本线框原型与交互状态契约 (UI Prototypes & Interaction States)**
> 上游真源：`brief.json`。线框用纯文本表达，100% 具备机器可读性与 Agent 操作确定性。
> 状态：`PLAN_APPROVED` | 所属领域：`architecture` | 规格标识：`governance-official-issue-doc-alignment`

---

## 1. 主要页面线框视图 (Screen Wireframes)

### 架构治理大盘

```
命令行 CLI 与管局自动化体检看板
```

## 2. 交互要点与防误触守卫 (Interaction Guards)

* 命令行工具链即时阻断违规提交并给出明确修复建议

## 3. 状态与空态处理 (States & Degraded UI)

- 检查中：打印各 Gate 进度。
- 通过：输出绿色 PASS 标记。
- 阻断：输出红色 FAIL 标记并非零退出。
