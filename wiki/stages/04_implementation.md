# 阶段交付百科：04_implementation 编码实现与防假 (Core SWE & Plugins)

> **所属生命周期**：CMMI 截断阶段 04 | **主责数字员工**：铁匠 (CoreSWE)  
> **核心专属 Skills**：`cmmi-asset-authoring`, `core-swe`, `swe-delivery-flow`, `mutation-tester`, `bug-fix-flow`, `mcp-builder`

---

## 一、 交付目标与职责定义
以领域驱动与状态机为核心，坚持第一方插件规范与防假 Mock 守卫，严禁在 src/ 随意平铺代码。

---

## 二、 阶段核心产物清单 (Physical Artifacts)
- **工程产物归宿**：`docs/04_implementation/ (coding-standards.md, mutation-testing-guide.md, plugin-blueprint.md, software-bill-of-materials.md)`
- **控制面映射**：统一通过 `issue_work_products` 与 `documents` 挂载至 Paperclip 控制面工件总线。

---

## 三、 门禁准入与阻断条件 (Quality Gates)
- **达标准绳**：单向模块依赖扫描、TypeScript 0 编译报错、8 大防假红线
- **阻断铁律**：**跳过 Validator 直调、缺乏类型守卫严禁合入主干** (*No Artifact, No Done*)

---

## 四、 关键实战指引与推荐工具
- 优先加载 `cmmi-asset-authoring` 展开具体施工；
- 遵循 CMMI 规范要求，过程证据实时沉淀，杜绝先编码后补文档。
