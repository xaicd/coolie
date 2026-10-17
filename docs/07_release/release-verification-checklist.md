# Coolie AI 原生商业软件交付工厂控制面平台 · 投产上线发布走查清单 (Release Verification Checklist)

> **文档代号**: COOA-CHECKLIST-v2.0.0  
> **基线版本**: v2.0.0  
> **制定日期**: 2026-10-17  
> **归属规范**: CMMI 07_release (TRANS) / .agents/skills/cmmi-immutable-release  

---

## 1. 投产前硬门禁走查项 (Pre-Flight Gates)

投产前必须全部逐项机检核验通过：
- [x] **0 代码脏污**: Git working tree 保证 0 dirty, 0 untracked；
- [x] **7 处版本源一致**: `bash scripts/VERSION-CONSISTENCY-CHECK.sh` 结果 100% 一致为 `v2.0.0`；
- [x] **增量编译 0 报错**: `pnpm -r typecheck` 全部通过；
- [x] **Pre-Commit 门禁全绿**: `node scripts/pre-commit-check.mjs` 25/25 PASS；
- [x] **活体本体形式化证明**: `scripts/harness-ontology-audit.mjs` 4 门禁 + 5 不变量全部 PASS；
- [x] **CMMI 资产反向穿透对账**: `pnpm cmmi:reverse-audit` 33 处物理路径 100% 存在且可达。

---

## 2. 生产发布与割接复核 (Deployment Verification)
- [x] **制品同步完成**: Rsync 排除运行态数据，服务端软链接建立完毕；
- [x] **服务状态存活**: `systemctl status coolie.service` 处于 `active (running)`；
- [x] **API 健康探测**: `https://api.coolie.ai/api/health` 正常返回 HTTP 200；
- [x] **移动端 OTA 版本核实**: 生产 manifest 指向正确 bundle hash 与 runtimeVersion。
