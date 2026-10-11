# 阶段交付百科：03_design 架构设计与契约 (HLD, LLD & OpenAPI)

> **所属生命周期**：CMMI 截断阶段 03 | **主责数字员工**：墨斗 (FDA) / 铁匠 (CoreSWE)  
> **核心专属 Skills**：`cmmi-asset-authoring`, `cmmi-tech-solution`, `cmmi-detailed-contracts`, `adr-architect`, `archify`, `system-design-spec`

---

## 一、 交付目标与职责定义
画死微服务拓扑、租户隔离、MADR 架构决策记录与统一 OpenAPI 契约，以编译器守卫把错误挡在提交前。

---

## 二、 阶段核心产物清单 (Physical Artifacts)
- **工程产物归宿**：`docs/03_design/ (ADR-*.md, architecture-design-hld.md, database-design-erd.md, interface-contracts/, api-specifications.md)`
- **控制面映射**：统一通过 `issue_work_products` 与 `documents` 挂载至 Paperclip 控制面工件总线。

---

## 三、 门禁准入与阻断条件 (Quality Gates)
- **达标准绳**：CMMI G2 架构门禁、G3 静态契约门禁 (0 编译报错)
- **阻断铁律**：**跨域直接 import、手写未隔离 SQL 与无契约 Route 严禁通过 G2/G3** (*No Artifact, No Done*)

---

## 四、 关键实战指引与推荐工具
- 优先加载 `cmmi-asset-authoring` 展开具体施工；
- 遵循 CMMI 规范要求，过程证据实时沉淀，杜绝先编码后补文档。
