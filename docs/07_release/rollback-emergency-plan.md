# 社区生活服务商用中台 · 生产秒级回滚应急操作手册 (Rollback Emergency Plan)

> **系统代码**: `COMMUNITY-LIFE-SERVICE`（社区生活服务商用中台）
> **CMMI 阶段**: `07_release`（TRANS / RSKM）· 资产类型 `rollback-runbook`
> **归属门禁**: G5 生产不可变投产门禁 (`gate_g5_release`)
> **责任数字员工**: 兜底渊（PRE-SRE · 投产守卫）；业务主审：百晓生（DS）
> **驱动 Skills**: `cmmi-immutable-release` · `sre-release-and-deploy`
> **上游契约**: `docs/07_release/system-deployment-sop.md`（不可变制品指纹与割接 SOP）
> **恢复目标**: **RTO < 60 秒**（应用回切）· **RPO = 0**（迁移仅前向增量，不丢已提交数据）
> **最高原则**: 先止血、再定位、后复盘 · 回滚命令必须经预发演练 · 留痕可追溯

---

## 一、 触发条件与判定阈值

生产发布后在**观测窗口（5 分钟）**内命中任一条件，即判定为发布失败，立即回滚：

| 编号 | 触发条件 | 判定阈值 | 数据来源 |
|---|---|---|---|
| **RB-1** | 核心接口延迟暴涨 | P95 延迟 > 发布前基线的 **300%** | 网关/Sentinel 指标 |
| **RB-2** | 错误率超限 | 服务端 5xx 错误率 > **0.5%** | 网关访问日志 |
| **RB-3** | 健康探针失败 | `/actuator/health` ≠ `UP` 或连续 3 次超时 | 健康拨测 |
| **RB-4** | 租户隔离越权 | 出现跨租户数据可见/可写的越权告警 | 隔离断言 / 审计日志 |
| **RB-5** | 资金守恒破坏 | 结算/退款借贷平衡断言失败（`Σ借方 ≠ Σ贷方`） | 业务守恒断言 |
| **RB-6** | 业务功能不可用 | 核心主线（登录 / 房源 / 家政下单）大面积失败 | 业务拨测 |

> 任一命中：**暂停流量切换、冻结后续发布动作、执行第二章回滚**。禁止“边修边观察”。

---

## 二、 60 秒一键回滚 SOP (RTO < 60s)

### 2.1 应用层回切（容器镜像 digest 回切，< 30s）
```bash
# 1) 回切到上一不可变版本（使用已归档的镜像 tag/digest，禁止重构建）
export ROLLBACK_TAG=vX.Y.(Z-1)
docker compose stop gateway business-server
docker compose up -d --no-deps gateway business-server   # manifest 已钉住 ROLLBACK_TAG

# 2) 触达健康探针拨测（< 5s）
curl -fsS http://127.0.0.1:48080/actuator/health | grep '"status":"UP"'
```

### 2.2 软链接回切（Jar 直装模式，< 10s）
```bash
# 秒级回切上一不可变版本目录，再平滑重载
ln -sfn /opt/releases/vX.Y.(Z-1) /opt/current-release
systemctl restart community-life-service
curl -sSf http://127.0.0.1:48080/actuator/health | grep '"status":"UP"'
```

### 2.3 回切后必做核验（< 15s）
```bash
redis-cli ping                                        # 期望 PONG
mysqladmin -h 127.0.0.1 ping                          # 期望 mysqld is alive
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:48080/api/health   # 期望 200
# 上一版本制品 SHA-256 与基线清单比对一致
sha256sum -c dist/manifest.sha256
```

---

## 三、 数据库回滚与数据守恒预案

1. **前向迁移不倒退**：因迁移仅为向后兼容的增量变更（`ADD COLUMN` / `CREATE INDEX` / 新表），应用回切**无需回退数据库结构**，旧版本代码可安全运行于新结构之上；
2. **破坏性变更的例外窗口**：若发布携带破坏性 DDL（须经独立变更评审），回滚前先停止写入，再用 §四 快照恢复：
   ```bash
   mysql -h 127.0.0.1 -u root -p community_life < /backup/pre-release-snapshot.sql
   ```
3. **数据守恒断言**：回切完成后立即重跑租户隔离与资金平衡断言，确认 `Σ借方 ≡ Σ贷方`、无跨租户越权；
4. **RPO 说明**：应用回切路径 **RPO = 0**（无数据丢失）；仅破坏性 DDL 快照恢复路径存在分钟级 RPO，须在变更评审中显式告知。

---

## 四、 流量止血与业务侧预案

| 层级 | 止血动作 | 目标 |
|---|---|---|
| 网关层 | 对异常接口开启 Sentinel 熔断/限流；必要时切维护页 | 阻断故障扩散，保护核心链路 |
| 入口层 | 管理中台公告发布计划内维护通知 | 降低用户误操作 |
| 数据层 | 冻结结算/提现通道（若涉及资金异常） | 防止错误资金流出 |

---

## 五、 通知与复盘闭环

1. **通报**：回滚发起后 1 分钟内同步 SRE、业务负责人与掌柜（顶栏 🔔 待办卡片 + 即时消息）；
2. **留痕**：回滚时间线、触发条件、回切版本、验证结果落盘为事件证据；
3. **复盘**：若构成生产事故，按 `postmortem-analyzer` 执行 1-5-10 应急与 5-Whys 根因分析，并将防退化用例固化为自动化测试（CAR）。

---

## 六、 演练与验证要求 (Definition of Done)

- [ ] 回滚命令已在**预发环境真实演练**，实测 RTO < 60 秒；
- [ ] 应用回切、软链接回切两类路径均验证可用；
- [ ] 回切后健康拨测与隔离/守恒断言全部通过；
- [ ] 演练记录（命令、耗时、结果）落盘归档，作为 G5 放行证据；
- [ ] 本预案与 `docs/07_release/system-deployment-sop.md` 保持同版本绑定。

---

## 七、 权威标准参考

- Google SRE 应急响应与错误预算实践（1-5-10 应急指标）；
- IEEE 828-2012 配置管理（基线回退与不可变制品）；
- 技能规范：`.agents/skills/cmmi-immutable-release/SKILL.md`、`.agents/skills/sre-release-and-deploy/SKILL.md`。
