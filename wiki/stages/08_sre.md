# 阶段交付百科：08_sre 可靠性保障与事故复盘 (SRE, SLO & Incident)

> **所属生命周期**：CMMI 截断阶段 08 | **主责数字员工**：兜底渊 (SRE)  
> **核心专属 Skills**：`cmmi-asset-authoring`, `sre-slo-manager`, `postmortem-analyzer`, `strix-penetration-testing`, `pre-sre`

---

## 一、 交付目标与职责定义
落地多窗口错误预算燃烧率告警、红队 PoC 漏洞确证与免责 5-Whys 复盘改进闭环。

---

## 二、 阶段核心产物清单 (Physical Artifacts)
- **工程产物归宿**：`docs/08_sre/ (01_slo_sli_metrics/SLO-SLI-ERROR-BUDGET-MATRIX.md, disaster-recovery-plan.md, 02_postmortem/POSTMORTEM-*.md, strix-penetration-report.md)`
- **控制面映射**：统一通过 `issue_work_products` 与 `documents` 挂载至 Paperclip 控制面工件总线。

---

## 三、 门禁准入与阻断条件 (Quality Gates)
- **达标准绳**：SLO 可用率 >= 99.95%、12 项安全渗透扫描 0 漏洞
- **阻断铁律**：**线上盲目裸跑发版、事故未闭环 CAPA 严禁关闭工单** (*No Artifact, No Done*)

---

## 四、 关键实战指引与推荐工具
- 优先加载 `cmmi-asset-authoring` 展开具体施工；
- 遵循 CMMI 规范要求，过程证据实时沉淀，杜绝先编码后补文档。
