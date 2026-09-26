# IEEE 828 & CMMI 配置管理 (CM) 与不可变生产发版标准规约

> **权威标准参考**: IEEE 828-2012 (Standard for Configuration Management in Systems and Software Engineering) 与 CMMI V2.0 配置管理 (CM) / 风险管理 (RSKM) / 过程监控与控制 (PMC) 过程域。

---

## 1. 软件配置管理 (SCM) 与发布手册标准结构

根据 IEEE 828 标准，不可变生产发版与配置管理手册必须涵盖以下核心结构：

```
1. 配置管理计划与基线说明 (CM Baseline & Scope)
   1.1 语义化版本定义 (SemVer) 与 Git Tag 映射
   1.2 配置项标识 (Configuration Items: Code, Config, Schema, Artifacts)
2. 不可变构建制品清单 (Immutable Artifact Inventory)
   2.1 制品文件名称与存储绝对定位符 (Storage URI)
   2.2 SHA-256 防篡改校验和与指纹签名 (Checksums)
3. 生产部署拓扑与资源配置 (Deployment Topology & CMDB Binding)
   3.1 部署宿主节点与端口绑定
   3.2 依赖数据库迁移脚本与外部网关证书
4. 生产发版步骤与双人会签单 (Release Workflow & Dual-Sign Certificate)
5. 应急回滚与灾难恢复预案 (Rollback SOP: RTO < 60s)
```

---

## 2. 不可变交付物与防篡改指纹标准 (Immutable Principle)

在现代数字化工坊中，“测过的东西就是上的东西”，严格禁止就地修改生产代码：

1. **统一版本打标 (Release Tagging)**:
   - 严格遵循语义化版本规范：`v{Major}.{Minor}.{Patch}`（如 `v1.2.0`）。
   - 每一个 Release 版本必须与唯一的 Git Commit SHA-1 强绑定。
2. **SHA-256 指纹校验 (Integrity Verification)**:
   - 所有交付制品（Docker Image、APK、OTA Manifest、Zip 包）在构建完成时，必须立即计算 SHA-256 校验和：
     ```bash
     sha256sum dist/release-package.zip > dist/release-package.zip.sha256
     ```
   - 部署脚本在应用启动前，必须重新计算本地制品哈希并与基线清单比对，一致方可放行。
3. **多存储安全归档**:
   - 生产发布制品必须归档入安全存储（Git Release 归档或 OSS 对象存储只读桶）。

---

## 3. 秒级回滚 SOP 设计规范 (Rollback Time Objective < 60s)

任何合规的发布 SOP 必须提供经过预发演练验证的极速回滚操作：

```bash
# 步骤 1: 软链接秒级回切上一不可变版本 (耗时 < 3s)
ln -sfn /opt/releases/v1.1.9 /opt/current-release

# 步骤 2: 重启或平滑重载服务 (耗时 < 10s)
systemctl restart coolie-worker

# 步骤 3: 触发生产健康探针拨测 (耗时 < 5s)
curl -sSf http://127.0.0.1:3100/api/health | grep '"status":"ok"'
```

---

## 4. G5 生产不可变发布门禁自检清单 (Peer Review Checklist)

- [ ] **前置门禁全绿**: G1（需求）、G2（架构）、G3（静态编译）、G4（全栈验收）是否全部处于 PASSED 状态？
- [ ] **不可变指纹**: 构建制品是否具备唯一的 SHA-256 校验和？
- [ ] **分支与推送纪律**: 是否严禁在未授权分支上直接 push，遵循发布评审流程？
- [ ] **回滚预案完备**: 回滚步骤是否经过沙箱实际演练，能否在 60 秒内恢复服务？
- [ ] **双人会签**: 关键版本是否有 SRE 与业务负责人的双人确认记录？
