# 原型与交互规范: Spec-Kit 活体本体建模全生命周期深度接管

> **Spec-Kit UI/UX 文本线框原型与交互状态契约 (UI Prototypes & Interaction States)**
> 上游真源：`brief.json`。线框用纯文本表达，100% 具备机器可读性与 Agent 操作确定性。
> 状态：`PLAN_APPROVED` | 所属领域：`architecture` | 规格标识：`speckit-ontology-deep-integration`

---

## 1. 主要页面线框视图 (Screen Wireframes)

### CLI 帮助屏幕与本体工作台

```
+--------------------------------------------------------+
| speckit ontology [inspect|callchain|init|lint|mermaid] |
+--------------------------------------------------------+
```

## 2. 交互要点与防误触守卫 (Interaction Guards)

* speckit new --name <slug> --ontology 自动生成骨架
* speckit build 自动注入 Mermaid 架构图

## 3. 状态与空态处理 (States & Degraded UI)

- 加载中：扫描 specs 与 models 拓扑
- 空数据：提示运行 speckit ontology init
- 出错：明确打印 DEAD_UI_BUTTON 与位置
- 成功：全时序因果链可验证通过
