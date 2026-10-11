# 阶段交付百科：05_verification 变异测试打假与全栈验收 (Anti-Fake Mock)

> **所属生命周期**：CMMI 截断阶段 05 | **主责数字员工**：门神 (FDSE) / 百晓生 (DS)  
> **核心专属 Skills**：`cmmi-asset-authoring`, `cmmi-ver-val`, `mutation-tester`, `comprehensive-testing-workflow`, `qa-humanlike-e2e`

---

## 一、 交付目标与职责定义
全栈真实驱动走查，杜绝前端虚假 Mock，真实真机快照存证，持有一票否决权。

---

## 二、 阶段核心产物清单 (Physical Artifacts)
- **工程产物归宿**：`docs/05_verification/ (test-plan.md, test-summary-report.md, mutation-report.md, uat-acceptance-certificate.md)`
- **控制面映射**：统一通过 `issue_work_products` 与 `documents` 挂载至 Paperclip 控制面工件总线。

---

## 三、 门禁准入与阻断条件 (Quality Gates)
- **达标准绳**：CMMI G4 全栈验收门禁、变异杀灭率 MSI >= 85%
- **阻断铁律**：**假 Mock、空断言、绿牌作弊严禁通过 G4 验收门禁** (*No Artifact, No Done*)

---

## 四、 关键实战指引与推荐工具
- 优先加载 `cmmi-asset-authoring` 展开具体施工；
- 遵循 CMMI 规范要求，过程证据实时沉淀，杜绝先编码后补文档。
