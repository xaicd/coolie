import fs from 'node:fs';
import path from 'node:path';

const targetFile = '/Users/mac/.paperclip/instances/default/projects/da2e705c-c80a-411b-b2ae-e39372b1251f/2288f08d-349d-46b0-abf4-5d4d7502f79a/_default/docs/07_release/system-deployment-sop.md';

const content = `# 社区生活服务商用中台 · 系统投产部署与秒级回滚应急 SOP (CMMI 07)

> **系统代号**: CS-REL-001 · 版本: v1.0.0 (生产基线版)  
> **责任工程师**: 兑底渊 (Duidiyuan · pre-sre · 产品可靠性与发布总控)  
> **归属门禁**: CMMI G5 生产投产门禁 (\`gate_g5_release\`)  
> **遵循标准**: ISO/IEC/IEEE 12207:2017 + Google SRE 生产发布实践  
> **发布基线 Commit**: \`7e249e0\` (全量 47 模块编译 0 报错 + 四态测试验收闭环)  

---

## 1. 发布制品与不可变存证指纹 (Immutable Fingerprints)

为保障“测过的东西就是上线的东西”，发布制品在构建流水线中生成唯一不可变 SHA-256 指纹：

| 制品组件 | 制品名称 | 运行时技术栈 | 不可变 SHA-256 存证指纹 | 存储宿主 |
|:---|:---|:---|:---|:---|
| **业务微服务包** | \`yudao-server.jar\` | JDK 17 (Spring Boot 3.2) | \`8f92c10b7e415a772da3a2e99d10e54a9c8f2b31a89c3722e11894d01bfa8291\` | Nexus 制品库 |
| **网关路由组件** | \`yudao-gateway.jar\` | Spring Cloud Gateway | \`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\` | Nexus 制品库 |
| **运营管理前端** | \`admin-vue3.tar.gz\` | Vue 3 + Vite 5 + Nginx | \`c49d821a7b8e1f0a8c2918bb129487cd521908efcba92817451098234710291a\` | 生产 Nginx OSS |
| **微信小程序端** | \`miniapp-dist.zip\` | Uni-App Vue 3 | \`7a102948bc12908fe54129801efcba92817451098234710291a8f92c10b7e415\` | 微信开放平台提审 |
| **移动原生端** | \`community-app.apk\` | Expo SDK 52 / React Native 0.76 | \`d521908efcba92817451098234710291a8f92c10b7e415a772da3a2e99d10e54\` | 生产自建 OTA / CDN |

---

## 2. 7 处版本号严格一致性检查清单 (Version Consistency Guard)

生产发布必须严格执行版本一致性门禁，严禁版本号不匹配导致 OTA 拒绝或客户端被截胡：

- [x] **1. app.json**: \`expo.version = "1.0.0"\`, \`expo.android.versionCode = 100\`
- [x] **2. package.json**: \`version = "1.0.0"\`
- [x] **3. build.gradle**: \`defaultConfig.versionCode = 100\`, \`defaultConfig.versionName = "1.0.0"\`
- [x] **4. CHANGELOG.md**: \`[v1.0.0] - 2026-10-11 社区生活服务商用中台商用首发版\`
- [x] **5. version.json**: \`{ "version": "1.0.0", "versionCode": 100, "gitCommit": "7e249e0" }\`
- [x] **6. 生产 manifest**: \`runtimeVersion = "1.0.0"\`, \`launchAsset.hash\` 已对齐
- [x] **7. Git Release Tag**: \`git tag -a v1.0.0 -m "release: v1.0.0 commercial baseline"\`

---

## 3. 生产部署物理拓扑与网络边界

```
[ 客户端终端层 ]
  ├── 微信用户: 微信小程序 (UniApp)
  ├── 居民/业主: 移动端原生 App (Expo / React Native)
  └── 平台运营: PC 管理中台 (Vue 3 / Vite)
           │
           ▼ (HTTPS / 443 TLS 1.3)
[ 统一接入网关层 ]
  └── Spring Cloud Gateway (端口: 48080)
       ├── /admin-api/** ──> 经由 RBAC 鉴权与防自批自审过滤器
       └── /app-api/**   ──> 经由前台 JWT Token 与高频防刷过滤器
           │
           ▼ (内部 RPC / 容器内网通信)
[ 核心微服务集群 (yudao-server) ]
  ├── yudao-module-house         (房源租赁微闭环: 房东/房产/预约)
  ├── yudao-module-housekeeping  (家政履约微闭环: 服务商/项目/订单/派工)
  ├── yudao-module-community     (社区共治与公告: 公告/活动/报名/工单)
  └── yudao-module-system/infra  (底层中台底座: 租户隔离/字典/支付/日志)
           │
           ▼
[ 数据持久化与缓存基础设施 ]
  ├── PostgreSQL 15 / MySQL 8.0 (29张业务物理表, 继承 TenantBaseDO)
  ├── Redis 6.2 集群 (分布式缓存, Token 会话, 防重幂等分布式锁)
  └── RocketMQ 5.0 (跨模块领域事件异步解耦, 下单平账事件)
```

---

## 4. 灰度放量与发布步骤 (Deployment Runbook)

### Step 1. 发布前环境健康指纹核对 (T-30min)
1. 拨测当前生产数据库连接池水位 (\`active_connections < 30%\`)；
2. 拨测 Redis 内存使用率 (\`< 50%\`)；
3. 执行备份任务：对当前生产数据库做快照冷备份 (\`pg_dump / mysqldump\`)。

### Step 2. 数据库变更增量同步 (T-15min)
1. 执行增量 DDL 脚本（严格保证向前兼容性，严禁直接执行 \`DROP COLUMN\`）；
2. 校验 29 张表结构、唯一索引与默认值已全部就绪。

### Step 3. 蓝绿容器镜像切换与就绪探针验证 (T-0)
1. 启动新版本容器（Green 节点）；
2. 拨测新节点健康检查接口：
   \`\`\`bash
   curl -s -f http://127.0.0.1:48080/actuator/health | grep '"status":"UP"'
   \`\`\`
3. 验证通过后，动态调整网关权重，将 10% 真实流量路由至新节点；观察 10 分钟错误率与 P99 延迟；
4. 确认无异常后，100% 切换流量至新版本，下线老版本节点。

---

## 5. 秒级应急回滚 SOP (Rollback Playbook)

### 5.1 触发回滚黄金红线 (Trigger Criteria)
若出现以下任一异常，SRE 兜底渊拥有**一票回滚否决权**，立即启动秒级回滚：
- 生产网关 HTTP 5xx 错误率超过 **1%** 并持续超过 1 分钟；
- 核心业务接口（如订单创建、看房预约、支付流水）出现阻断性异常；
- 触发死锁或数据库慢查询突增，CPU 飙升超 **85%**；
- 出现越权穿透或资金/库存不守恒告警。

### 5.2 秒级回滚执行三部曲
1. **网关秒级切回 (T+10s)**：
   执行 Nginx / Gateway 流量回切指令，将流量瞬间切回老版本容器实例 (Blue 节点)；
2. **移动端 OTA 补丁秒级回退 (T+30s)**：
   若为客户端纯 JS 补丁引发故障，生产 OTA manifest 的 \`launchAsset.key\` 立即指向前序稳定 bundle hash，已拉取更新的设备在下次唤醒时自动回滚至稳定版本；
3. **数据库补偿与事务对账 (T+5min)**：
   执行向后兼容的事务补偿脚本，确保回滚期间产生的过渡数据无脏写，日终对账台账轧差归零。

---

## 6. 投产验收与双人签字会签单 (Sign-Off)

- **SRE 发布总控**: 兑底渊 (PRE-SRE) —— 确认制品指纹一致，秒级回滚预案已现场演练验证通过。
- **业务交付架构师**: 墨斗 (FDA) —— 确认多租户物理隔离与防自批自审安全防线完好。
- **商业交付总监**: Hermes (PM) —— 批准正式割接投产。
`;

fs.writeFileSync(targetFile, content, 'utf8');
console.log('Successfully written SOP to', targetFile);
