# 社区生活服务商用中台 · 投产上线发布走查清单 (Release Verification Checklist)

> **系统代码**: `COMMUNITY-LIFE-SERVICE`（社区生活服务商用中台）
> **CMMI 阶段**: `07_release`（TRANS）· 资产类型 `checklist`
> **归属门禁**: G5 生产不可变投产门禁 (`gate_g5_release`)
> **责任数字员工**: 兜底渊（PRE-SRE · 投产守卫）· 百晓生（DS · 业务主审）
> **驱动 Skills**: `cmmi-immutable-release` · `sre-release-and-deploy`
> **上游契约**: `docs/07_release/system-deployment-sop.md` · `docs/07_release/rollback-emergency-plan.md`
> **会签纪律**: 逐项实测勾选；任一项 ⛔ 一律**不发版**；双人复核（SRE + 业务负责人）后方可放行

---

## 一、 发布前（Pre-Release）

### A. 前置门禁（4 项）
- [ ] **A1** G1 需求门禁 `PASSED`
- [ ] **A2** G2 架构门禁 `PASSED`
- [ ] **A3** G3 契约/编译门禁 `PASSED`（0 编译报错）
- [ ] **A4** G4 全栈验收门禁 `PASSED`

### B. 代码与分支（3 项）
- [ ] **B1** `git status --porcelain` 工作树干净（无未提交改动）
- [ ] **B2** 当前分支为 `main` / `release/x.y`，且目标 commit 已推送
- [ ] **B3** 发版 commit hash 已记录为基线锚点

### C. 版本一致性（1 项 / 7 处）
- [ ] **C1** §4.7 所列 7 处版本号源完全一致（`VERSION` / 根 `pom.xml` / 子模块 `pom.xml` / 服务镜像 tag / 网关镜像 tag / 编排 manifest / `CHANGELOG` + Git tag）

### D. 安全（3 项）
- [ ] **D1** 数据库口令、国密 SM4 主密钥、RocketMQ 凭据均为密钥库注入，**未明文落仓库**
- [ ] **D2** TLS 证书剩余有效期 ≥ 30 天
- [ ] **D3** 无敏感文件/大文件误入暂存区

---

## 二、 发布中（Release）

### E. 不可变制品与指纹（3 项）
- [ ] **E1** `business-server` / `gateway` 镜像已构建并打基线 tag，记录 image digest
- [ ] **E2** 逐制品 SHA-256 与**基线清单指纹**已生成并登记入 SOP §2.2
- [ ] **E3** 制品已归档至**只读桶**，路径含版本号与 commit SHA

### F. 环境与迁移（3 项）
- [ ] **F1** 端口 `48080 / 3306 / 6379 / 9876` 无残留占用
- [ ] **F2** 依赖中间件（MySQL / Redis / RocketMQ / MinIO / ES）存活
- [ ] **F3** 迁移为前向增量且幂等；发布前生产库**逻辑快照留底**完成

### G. 割接执行（2 项）
- [ ] **G1** 已执行前向迁移：`docker compose run --rm migrate`
- [ ] **G2** 已平滑滚动割接：`docker compose up -d --no-deps gateway business-server`

---

## 三、 发布后（Post-Release）

### H. 健康与护栏（4 项）
- [ ] **H1** `/actuator/health` = `UP`
- [ ] **H2** `/api/health` HTTP 200
- [ ] **H3** `redis-cli ping` = `PONG`；`mysqladmin ping` = alive
- [ ] **H4** 核心业务主线（登录 / 房源 / 家政下单）拨测通过

### I. 隔离与守恒（2 项）
- [ ] **I1** 租户隔离断言通过，无跨租户越权
- [ ] **I2** 资金守恒断言通过（`Σ借方 ≡ Σ贷方`）

### J. 观测与回滚就绪（2 项）
- [ ] **J1** 观测窗口（5 分钟）内 P95 延迟与错误率无异常
- [ ] **J2** 回滚预案 `rollback-emergency-plan.md` 已就绪且经预发演练（RTO < 60s）

### K. 归档与挂载（2 项）
- [ ] **K1** 发布单、指纹清单、拨测原始输出已落盘归档为发布证据
- [ ] **K2** 发布指纹清单与 SOP 已作为物理 Work Product 挂载至工单（No Artifact, No Done）

---

## 四、 双人复核会签单 (Dual Sign-Off)

| 角色 | 姓名 / 工号 | 职责 | 结论 | 时间 |
|---|---|---|---|---|
| 投产守卫 (PRE-SRE) | 兜底渊 (`emp_sre`) | 指纹校验 / 割接 / 回滚就绪 | ☐ 通过 ☐ 驳回 | — |
| 业务主审 (DS) | 百晓生 (`baixiaosheng-ds`) | 业务旅程 / 隔离守恒 / 放行 | ☐ 通过 ☐ 驳回 | — |

> 两位签署人**不得同人**；任一驳回即回退至整改，严禁放行。

---

## 五、 走查执行命令速查

```bash
# A / B：前置门禁与代码状态
node scripts/check-release-baseline.mjs
git status --porcelain && git rev-parse --abbrev-ref HEAD

# E：指纹生成与校验
sha256sum dist/*.tar.gz dist/*.image > dist/manifest.sha256
sha256sum -c dist/manifest.sha256

# F / G：环境、迁移与割接
ss -ltnp | grep -E ':(48080|3306|6379|9876)'
docker compose run --rm migrate
docker compose up -d --no-deps gateway business-server

# H / I：护栏与守恒断言
curl -fsS http://127.0.0.1:48080/actuator/health
redis-cli ping && mysqladmin -h 127.0.0.1 ping
```

---

## 六、 权威标准参考

- IEEE 828-2012 配置管理（发布走查与双人会签）；
- 技能规范：`.agents/skills/cmmi-immutable-release/SKILL.md`、`.agents/skills/sre-release-and-deploy/SKILL.md`。
