# Coolie 工坊平台控制面投产上线发布走查清单 (Release Verification Checklist)

> **文档代号**: COOA-REL-CHK-v2.0  
> **系统代号**: `COOLIE-FOUNDRY-CORE` (Coolie AI-Native Foundry Control Plane)  
> **基线版本**: v2.0.0 (生产准入冻结版)  
> **制定日期**: 2026-10-17  
> **归属规范**: CMMI 07_release (TRANS / CM) / .agents/skills/app-release-pipeline / .agents/skills/cmmi-immutable-release  

---

## 1. 投产发版前置硬门禁核查 (Pre-Release Hard Gates)

在向生产环境 (`tc-coolie-claw`) 触发任何发版割接动作前，必须由 SRE 与门神 (FDSE) 完成以下 6 项不可绕过的机检门禁：

| 门禁项 | 检查内容与标准 | 验证命令与入口 | 预期结果 |
| :--- | :--- | :--- | :---: |
| **G1 版本一致性** | 7 处版本号源（app.json, package.json, build.gradle, version.json 等）严格一致 | `bash scripts/VERSION-CONSISTENCY-CHECK.sh` | 100% 对齐 |
| **G2 质量与安全门禁** | 25 道物理安全门禁（架构拓扑、本体反射、增量编译、i18n 1417键等） | `node scripts/pre-commit-check.mjs` | 25/25 PASS |
| **G3 工作树绝对纯净** | 工作树 0 dirty、0 untracked，严禁 git stash 掩埋假完工代码 | `git status --porcelain` | 输出为空 |
| **G4 单元与集成测试** | 486 个核心单元测试全部通过，真实 DB 事务与单人签出锁断言无死穴 | `pnpm test:run` | 100% 通过 |
| **G5 物理反向穿透审计** | RTM 需求矩阵 14 项需求对底层文件与路由实施 100% 物理寻址 | `pnpm cmmi:reverse-audit` | 100% 闭环 |
| **G6 移动真机快照存证** | Pixel 7 模拟器下 320dp 几何防撑爆与两字动词按钮走查截屏存盘 | `docs/05_verification/cooa-136-mobile/` | 40+ 快照就绪 |

---

## 2. 生产服务端部署核查 (Production Host Verification)

部署执行节点: `tc-coolie-claw` (`62.234.59.180`)，由 `systemd` 托管：

- [ ] **制品同步安全**: 使用带 exclude 的安全 rsync 脚本，严禁覆盖生产 `version.json` 与运行态目录；
- [ ] **工作区软链检查**: 执行软链接创建脚本，确认 `server/node_modules/@paperclipai/*` 指向最新包；
- [ ] **服务重启与探活**: `systemctl restart coolie` 后，调用健康检查接口 `curl -sSf http://127.0.0.1:3100/api/health` 返回 `{"status":"ok"}`；
- [ ] **Caddy 反代复核**: 执行 `systemctl reload caddy`，确认外网 HTTPS 与 WSS 正常连通。

---

## 3. 发版审批与签字决议 (Release Sign-off)

- **发版责任人 (PRE-SRE)**: 兑底渊 (`@duidiyuan`) · **状态**: ✅ 已核准
- **质量主审官 (FDSE)**: 门神 (`@menshen`) · **状态**: ✅ 已核准
- **掌柜终审 (CEO)**: 掌柜 (`@boss`) · **状态**: ✅ 准予投产发版
