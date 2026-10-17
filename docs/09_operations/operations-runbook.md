# Coolie AI 原生商业软件交付工厂控制面平台 · 生产日常运维与健康巡检 Runbook (Operations Runbook)

> **文档代号**: COOA-OPS-RUNBOOK-v2.0.0  
> **基线版本**: v2.0.0  
> **制定日期**: 2026-10-17  
> **归属规范**: CMMI 09_operations (CMMI-SVC) / .agents/skills/ceo-company-ops  

---

## 1. 日常巡检清单与执行指令 (Daily Inspection Checklist)

每日早上 09:00 与晚上 21:00 由 SRE 执行例行健康巡检：
1. **服务存活状态**:
   ```bash
   ssh tc-coolie-claw 'systemctl status coolie.service --no-pager'
   ```
2. **端口监听与 HTTP 连通性**:
   ```bash
   curl -I https://api.coolie.ai/api/health
   ```
3. **数据库连接池与慢查询**:
   ```bash
   ssh tc-coolie-claw 'tail -n 100 /var/log/postgresql/postgresql-17-main.log | grep -i "slow query"'
   ```
4. **交付主线后台守护进程状态**:
   ```bash
   ps aux | grep coolie-dev-loop-supervisor
   ```

---

## 2. 常见故障应急处置路径 (Incident Emergency Protocols)

### 2.1 内存溢出 (OOM) 或高 CPU
- 执行 `ssh tc-coolie-claw 'sudo systemctl restart coolie.service'`；
- 抓取堆栈分析内存泄露源。

### 2.2 数据库连接池耗尽
- 检查是否有长事务挂死未提交；
- 执行 `SELECT pid, state, query, age(clock_timestamp(), query_start) FROM pg_stat_activity WHERE state != 'idle' ORDER BY age DESC;` 终止僵尸连接。
