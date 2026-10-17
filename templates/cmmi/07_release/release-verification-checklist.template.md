<!--
==========================================================================
【组织标准过程资产模版 (OSSP Template)】
类型: 投产上线发布走查清单 (Checklist)
归属: CMMI Phase 07 (07_release)
注意: 本文件为纯净空白母本，严禁直接填写项目业务数据！
      使用 node scripts/cmmi-asset-scaffold.cjs batch 或 generate 派生到各项目 docs/ 中。
==========================================================================
-->

# {{PROJECT_TITLE}} · 投产上线发布走查清单 (Release Verification Checklist)

> **文档代号**: {{SYSTEM_CODE}}-CHECKLIST-{{VERSION}}  
> **基线版本**: {{VERSION}}  
> **制定日期**: {{DATE}}  
> **归属规范**: CMMI 07_release (TRANS) / .agents/skills/cmmi-immutable-release  

---

## 1. 投产前硬门禁走查项 (Pre-Flight Gates)

投产前必须全部逐项机检核验通过：
- [x] **0 代码脏污**: Git working tree 保证 0 dirty, 0 untracked；
- [x] **7 处版本源一致**: `bash scripts/VERSION-CONSISTENCY-CHECK.sh` 结果 100% 一致为 `{{VERSION}}`；
- [x] **增量编译 0 报错**: `pnpm -r typecheck` 全部通过；
- [x] **Pre-Commit 门禁全绿**: `node scripts/pre-commit-check.mjs` {{GATES_COUNT}}/{{GATES_COUNT}} PASS；
- [x] **活体本体形式化证明**: `scripts/harness-ontology-audit.mjs` 4 门禁 + 5 不变量全部 PASS；
- [x] **CMMI 资产反向穿透对账**: `pnpm cmmi:reverse-audit` 33 处物理路径 100% 存在且可达。

---

## 2. 生产发布与割接复核 (Deployment Verification)
- [x] **制品同步完成**: Rsync 排除运行态数据，服务端软链接建立完毕；
- [x] **服务状态存活**: `systemctl status {{SERVICE_NAME}}` 处于 `active (running)`；
- [x] **API 健康探测**: `https://api.coolie.ai/api/health` 正常返回 HTTP 200；
- [x] **移动端 OTA 版本核实**: 生产 manifest 指向正确 bundle hash 与 runtimeVersion。
