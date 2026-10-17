# Coolie AI 原生商业软件交付工厂控制面平台 · 生产秒级回滚应急操作手册 (Rollback Emergency Plan)

> **文档代号**: COOA-ROLLBACK (rev.2)  
> **适用基线**: v0.6.61 (versionCode 661) / 回滚目标 = 上一个已通过 7 源一致性校验的 tag  
> **制定日期**: 2026-10-17 (rev.2 复核 2026-10-18)  
> **归属规范**: CMMI 07_release (TRANS / RSKM) / .agents/skills/cmmi-immutable-release  

---

## 1. 回滚触发条件与决策红线 (Rollback Triggers & SLA)

任何生产发布完成后，在 15 分钟观测期内满足以下任一条件时，SRE 持有一票否决权立即启动回滚：
1. **API 错误率激增**: 核心控制面 5xx 错误率超过 0.5% 持续超过 2 分钟；
2. **P95 延迟暴涨**: 接口 P95 响应耗时超过 200ms；
3. **单人签出锁或预算硬停失灵**: 发现并发多写或费用穿透；
4. **数据库数据损坏或不可逆锁表**。

**回滚时效承诺 (RTO)**: $\le 5$ 分钟完成秒级回滚与止血。

---

## 2. 60 秒一键自动化回滚操作步骤 (Rollback Execution Steps)

### 2.1 服务端历史安全版本回切 (Server Rollback)
```bash
# 1. 登录生产服务器切换至上一稳定版本软链接
ssh tc-coolie-claw 'cd /root/workspace/coolie && bash scripts/rollback-to-previous.sh'

# 2. 立即重启系统守护进程
ssh tc-coolie-claw 'sudo systemctl restart coolie.service'
```

### 2.2 移动端 Expo OTA 纯 JS 补丁秒级回滚 (Mobile OTA Rollback)
若移动端发布存在 UI 崩溃或白屏缺陷，通过自建 OTA 立即发布上一个稳定 bundle：
```bash
# 在 Mac 宿主机或发布节点执行 OTA 紧急回滚
bash scripts/publish-ota.sh --rollback-to-last-stable
```

### 2.3 数据库向下兼容与回滚 (Database Rollback)
所有 Schema 变更严格执行“向前兼容三步走（加列 ➔ 迁移 ➔ 删旧列）”，回滚阶段无需下线物理列，确保服务无缝切回。

---

## 3. 回滚后止血验证与通知通报 (Post-Rollback Verification)
1. **健康检查验证**: `curl -f -s https://xrobinai.cn/api/health | jq '{status,commit}'` 恢复 `status=="ok"` 且 `commit` == 回滚目标 commit（**唯一生产域名 `xrobinai.cn`；`api.coolie.ai` 不存在**）；
2. **事故免责复盘登记**: 在 24 小时内依据 Google SRE 规范沉淀 `docs/08_sre/02_postmortem/` 事故复盘文档并固化防退化测试用例。
