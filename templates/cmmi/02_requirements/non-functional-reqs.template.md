<!--
==========================================================================
【组织标准过程资产模版 (OSSP Template)】
类型: 非功能性需求规范 (NFR)
归属: CMMI Phase 02 (02_requirements)
注意: 本文件为纯净空白母本，严禁直接填写项目业务数据！
      使用 node scripts/cmmi-asset-scaffold.cjs batch 或 generate 派生到各项目 docs/ 中。
==========================================================================
-->

# {{PROJECT_TITLE}} · 非功能性需求与性能指标规范 (Non-Functional Requirements - NFR)

> **文档代号**: {{SYSTEM_CODE}}-NFR-{{VERSION}}  
> **基线版本**: {{VERSION}}  
> **制定日期**: {{DATE}}  
> **归属规范**: CMMI 02_requirements (RDM) / ISO/IEC 25010 / .agents/skills/cmmi-req-spec  

---

## 1. 性能与容量约束 (Performance & Scalability)
- **吞吐量容量护栏**: 单节点 API 网关吞吐量 $\ge 2,000$ RPS；
- **API 延迟**: P95 响应延迟 $\le 50$ms，P99 响应延迟 $\le 100$ms；
- **错误预算与可用性**: 核心控制面 99.95% 可用性（滚动 30 天允许不可用时间 $\le 21.6$ 分钟）；
- **内存与资源占用**: 守护常驻进程内存占用 $\le 256$MB。

---

## 2. 安全合规与多租户隔离 (Security & Multitenancy)
- **多租户隔离**: 严格按企业租户 (Company) 边界实施逻辑与物理数据隔离，杜绝跨租户越权；
- **高熵凭据守卫**: 严禁硬编码弱口令 (如 admin123, 123456)，智能体密钥统一采用高熵随机哈希存储；
- **单人写者纪律**: 同一任务同一时间仅允许唯一持有者修改，防止写踩踏；
- **代码物理交付**: 1 Task = 1 Commit，0 dirty，0 untracked，严禁 `git stash` 掩埋未完成代码。

---

## 3. 可观测性与稳定性 (Observability & Reliability)
- **主线巡检心跳丢失率**: $< 0.1\%$；
- **预算硬停熔断延迟**: $\le 1$ 秒；
- **崩溃自动重启**: 后台守护进程由 systemd 托管，异常退出 5 秒内自动重启拉起。
