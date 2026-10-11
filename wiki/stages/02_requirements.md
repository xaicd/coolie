# 阶段交付百科：02_requirements 需求工程与规格 (EARS & Spec-First)

> **所属生命周期**：CMMI 截断阶段 02 | **主责数字员工**：百晓生 (DS) / Hermes  
> **核心专属 Skills**：`cmmi-asset-authoring`, `ears-spec-writer`, `cmmi-req-spec`, `requirements-capture`, `spec-driven-dev`

---

## 一、 交付目标与职责定义
项目级工程需求落地于 docs/02_requirements/，敏捷特性包以独立全息包落盘于 docs/specs/<domain>/<feature-slug>/，建立双向全链路跟踪矩阵 (RTM)。

---

## 二、 阶段核心产物清单 (Physical Artifacts)
- **工程产物归宿**：`docs/02_requirements/ (software-requirements.md, requirements-traceability-matrix.md, non-functional-reqs.md, user-requirements.md) 与 docs/specs/<domain>/<feature-slug>/`
- **控制面映射**：统一通过 `issue_work_products` 与 `documents` 挂载至 Paperclip 控制面工件总线。

---

## 三、 门禁准入与阻断条件 (Quality Gates)
- **达标准绳**：CMMI G1 需求门禁 (EARS 5态语法收敛)
- **阻断铁律**：**口语化伪需求、缺少 EARS 验收标准严禁编码** (*No Artifact, No Done*)

---

## 四、 关键实战指引与推荐工具
- 优先加载 `cmmi-asset-authoring` 展开具体施工；
- 遵循 CMMI 规范要求，过程证据实时沉淀，杜绝先编码后补文档。
