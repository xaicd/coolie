<!--
==========================================================================
【组织标准过程资产模版 (OSSP Template)】
类型: 软件物料清单 SBOM 与依赖准入基线 (sbom)
归属: CMMI Phase 04 (04_implementation)
注意: 本文件为纯净空白母本，严禁直接填写项目业务数据！
      使用 node scripts/cmmi-asset-scaffold.cjs batch 派生到各项目 docs/ 中。
==========================================================================
-->

# 软件物料清单 (Software Bill of Materials - SBOM)

- **生成日期**: 2026-10-17
- **版本基线**: {{VERSION}}
- **包管理器**: PNPM workspaces (pnpm-lock.yaml)
- **归属规范**: CMMI 04_implementation (TS / CM)

---

## 1. 核心底座依赖清单与开源许可证核验
- Express / Node.js 22.x
- Drizzle ORM / PGlite / PostgreSQL
- React 19.x / Vite / React Native
- 许可协议合规审核：100% 商业友好许可证 (MIT / Apache-2.0 / BSD)
