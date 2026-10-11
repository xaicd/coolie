# 阶段交付百科：06_quality_assurance 质量门禁与过程控制 (Compliance & CAR)

> **所属生命周期**：CMMI 截断阶段 06 | **主责数字员工**：门神 (FDSE) / Hermes  
> **核心专属 Skills**：`cmmi-asset-authoring`, `cmmi-car-spc-metrics`, `check-governance`

---

## 一、 交付目标与职责定义
实施统计过程控制 (SPC) 与缺陷预防，制度交由编译器与脚本强制执行，杜绝人肉记忆。

---

## 二、 阶段核心产物清单 (Physical Artifacts)
- **工程产物归宿**：`docs/06_cmmi_audit/ (spc-control-chart.md, car-5whys-rca.md, audit-trail.md, gate-trace-record.md)`
- **控制面映射**：统一通过 `issue_work_products` 与 `documents` 挂载至 Paperclip 控制面工件总线。

---

## 三、 门禁准入与阻断条件 (Quality Gates)
- **达标准绳**：14~20 道全生命周期自动化门禁全绿
- **阻断铁律**：**门禁未跑通、存在 Blocker/High 债务严禁宣称完工** (*No Artifact, No Done*)

---

## 四、 关键实战指引与推荐工具
- 优先加载 `cmmi-asset-authoring` 展开具体施工；
- 遵循 CMMI 规范要求，过程证据实时沉淀，杜绝先编码后补文档。
