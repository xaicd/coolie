# Coolie 工坊平台控制面生产秒级回滚与应急预案 (Rollback Emergency Plan)

> **文档代号**: COOA-REL-ROL-v2.0  
> **系统代号**: `COOLIE-FOUNDRY-CORE` (Coolie AI-Native Foundry Control Plane)  
> **基线版本**: v2.0.0 (生产准入版)  
> **制定日期**: 2026-10-17  
> **归属规范**: CMMI 07_release (TRANS / RSKM) / .agents/skills/sre-release-and-deploy  

---

## 1. 触发回滚的黄金判据 (Rollback Triggers)

生产环境割接上线后 15 分钟内，若触碰以下任一阈值红线，一律触发**秒级无条件回滚**：
1. **健康检查死穴**: `curl http://127.0.0.1:3100/api/health` 连续 3 次探测失败或超时（> 2000ms）；
2. **核心业务状态机死锁**: 工单签出锁 (`/api/issues/:id/checkout`) 失败率超过 1%；
3. **数据库连接池枯竭**: PostgreSQL 连接池耗尽或 Drizzle ORM 查询异常率 > 0.05%；
4. **移动端 Crash 激增**: Expo 客户端冷启动崩溃率超过 0.1%。

---

## 2. 生产服务端秒级回滚 SOP (Server Rollback SOP)

生产节点: `tc-coolie-claw` (`62.234.59.180`)

### 2.1 软链接秒切与代码回滚 (Symlink Rollback)
生产环境发布目录预留 `current` 软链接与 `previous` 备份目录：
```bash
# 登录生产宿主机
ssh tc-coolie-claw

# 1. 秒级切换至上一版本物理目录
cd /root/workspace/coolie
ln -sfn releases/previous current

# 2. 重启控制面托管服务
systemctl restart coolie

# 3. 探活验证
curl -sSf http://127.0.0.1:3100/api/health
```

### 2.2 数据库迁移逆向回滚规程 (Database Migration Rollback)
若本次上线包含破坏性 Drizzle Schema 变更，执行向前兼容或回滚补丁：
- 数据表字段只增不减（向前兼容原则）；
- 若必须回滚，在受控事务中执行对应回滚 SQL 脚本，严禁直接 DROP 产生物理数据丢失。

---

## 3. 移动端 Expo OTA 增量补丁回退 SOP (Client OTA Rollback)

若移动端存在严重 UI 遮挡或白屏异常，由 PRE-SRE 触发纯 JS 增量回滚：
1. **指定上一个稳定 release manifest hash**；
2. 执行 OTA 回退指令：
   ```bash
   bash scripts/publish-ota.sh --rollback-to <PREVIOUS_COMMIT_SHA>
   ```
3. 客户端在下一次心跳轮询中将自动下载并加载稳定版 Bundle，无需重新走各大应用商店审核。
