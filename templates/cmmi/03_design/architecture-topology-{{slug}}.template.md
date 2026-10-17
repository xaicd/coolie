<!--
==========================================================================
【组织标准过程资产模版 (OSSP Template)】
类型: Archify 架构可视化与拓扑图 (archify)
归属: CMMI Phase 03 (03_design)
注意: 本文件为纯净空白母本，严禁直接填写项目业务数据！
      使用 node scripts/cmmi-asset-scaffold.cjs batch 派生到各项目 docs/ 中。
==========================================================================
-->

# Archify 架构拓扑模型: {{PROJECT_TITLE}}

- **更新日期**: 2026-10-17
- **归属规范**: CMMI 03_design (TS) / .agents/skills/archify

---

## 1. 架构拓扑图 (Mermaid C4 / Graph)
```mermaid
flowchart TD
  subgraph Client["多端接入层"]
    Admin["Web 控制台"]
    Mobile["Expo 极简移动端"]
  end
  subgraph ControlPlane["指挥决策中枢 (Paperclip Backbone)"]
    Router["REST API 网关"]
    Guard["RBAC 鉴权与单人签出锁"]
  end
  subgraph Engine["软件制造流水线 (Foundry Fleet)"]
    Agents["Hermes / 墨斗 / 铁匠 / 门神"]
  end
  subgraph Storage["数据底座 (PG / SQLite)"]
    DB[("不可变履约台账与工件总线")]
  end
  Client --> ControlPlane --> Engine --> Storage
```
