# 原型与交互规范: Hermes网关与APP原生派活全流程接入Spec-Kit

> **Spec-Kit UI/UX 文本线框原型与交互状态契约 (UI Prototypes & Interaction States)**
> 上游真源：`brief.json`。线框用纯文本表达，100% 具备机器可读性与 Agent 操作确定性。
> 状态：`PLAN_APPROVED` | 所属领域：`governance` | 规格标识：`hermes-and-native-app-speckit-dispatch`

---

## 1. 主要页面线框视图 (Screen Wireframes)

### CreateTaskModal (APP原生)

```
[标题输入框] -> [项目预选] -> [Spec-Kit类型: 需求/缺陷/重构/安全] -> [指派员工] -> [创建任务]
```

## 2. 交互要点与防误触守卫 (Interaction Guards)

* 一键切换 Spec 类型，实时联动预填 EARS 规格模板
* 微信/QQ 意图解析秒级回传 Spec 规格卡片链接

## 3. 状态与空态处理 (States & Degraded UI)

- 加载中：建单加载指示器。
- 空数据：默认无 Spec 模式可秒级提交。
- 出错：Toast 明确提示并降级落单。
- 成功：弹出回执并跳转工单详情。
