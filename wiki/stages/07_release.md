# 阶段交付百科：07_release 容器交付与不可变投产 (DevOps & Release)

> **所属生命周期**：CMMI 截断阶段 07 | **主责数字员工**：兜底渊 (SRE)  
> **核心专属 Skills**：`cmmi-asset-authoring`, `cmmi-immutable-release`, `app-release-pipeline`, `sre-release-and-deploy`, `release-flow`, `release-version-sync`

---

## 一、 交付目标与职责定义
确保「测过的东西就是发布的东西」，配置基线固化，具备秒级回滚止血预案。

---

## 二、 阶段核心产物清单 (Physical Artifacts)
- **工程产物归宿**：`docs/07_release/ (system-deployment-sop.md, rollback-emergency-plan.md, RELEASE_NOTES_*.md, release-verification-checklist.md)`
- **控制面映射**：统一通过 `issue_work_products` 与 `documents` 挂载至 Paperclip 控制面工件总线。

---

## 三、 门禁准入与阻断条件 (Quality Gates)
- **达标准绳**：CMMI G5 不可变投产门禁、7 处版本一致性守卫
- **阻断铁律**：**生产指纹漂移、版本号不一致、缺乏回滚 SOP 严禁放行** (*No Artifact, No Done*)

---

## 四、 关键实战指引与推荐工具
- 优先加载 `cmmi-asset-authoring` 展开具体施工；
- 遵循 CMMI 规范要求，过程证据实时沉淀，杜绝先编码后补文档。
