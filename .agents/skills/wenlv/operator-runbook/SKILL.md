---
name: operator-runbook
description: 数字员工运营 Job Owner 雨蛙专用 playbook — 部署 operator.ts / 配置 cron-runner / 跑回归 (journey 41-57 + V0.5 operator.ts) / 写运营报告 / incident 响应. 触发场景: 用户说"跑运营脚本" / "运营上线" / "operator.ts 部署" / "配置 cron" / "写运营报告".
---

# 数字员工运营 Job Owner Runbook (雨蛙专用, sprint 2026-09-28)

## 1. 角色与边界

| 职责 | 蛙 |
|---|---|
| **运营 Job Owner** | **🐸 雨蛙** (你) |
| 写运营脚本本身 | 🐸 田蛙 |
| 审计脚本 | 🐸 牛蛙 |
| 调度 + 任务派发 | 🐸 蛙宝 |
| 决策 | 🐸 玻璃蛙 |
| 架构咨询 | 🐸 树蛙 |
| 设计素材 | 🐸 箭毒蛙 |

**核心边界**: 你不写代码 (田蛙写), 你不审代码 (牛蛙审), 你**部署 + 跑回归 + 上线监控 + incident 响应**。

## 2. 运营主入口

```
scripts/digital-employee/
├── OPERATIONS.md                      运营手册 (必读)
├── README.md                          27 + 2 脚本索引
├── cron-runner.ts                     cron 调度入口 (7 个 cron entry)
├── shared/                            共享 helper (loginMerchantOwner, loginAdmin, OperatorReport)
├── 28 个 operate-*.ts                 V0.4 按业务域
├── 2 个 recommend (operate-product-recommend + operate-recommend-submit + operate-recommend-audit)
├── 1 个 full-loop (operate-full-loop 6 步)
├── 1 个 video-loop (operate-video-loop)
├── v0.5/
│   ├── INDEX.ts                       总入口 (跑全部)
│   ├── operator.ts                    单一入口 6 场景 (governance/product/live/merchant/approval/incident)
│   ├── README.md
│   └── scenarios/
│       ├── live-broadcast-full.ts     merchant+admin 协作
│       ├── rbac-boundaries.ts         9 admin + 5 sub 跨域
│       ├── 3-terminal-business.ts     三端联动
│       └── incident-postmortem.ts      异常事件演练
└── schedules/
    └── default-cron.json              7 个 cron 配置
```

## 3. 标准流程 (Job Owner 必走 5 步)

### Step ① Dry-run 全部 (零风险验证)

```bash
APP_ENVIRONMENT=test \
E2E_BASE_URL=http://192.144.253.205:80 \
E2E_API_ENCRYPTION_KEY=85d088808292c656bfea87eb5ec1b031aa11b2a29efadd961efc7b436737d55b \
  npx tsx scripts/digital-employee/v0.5/operator.ts
```

期望: 20+ PASS / 0 FAIL. 如果有 FAIL:
- 检查测试机状态 (Docker 容器, PASSWORD_SALT, fixture)
- 不动代码, 报田蛙修

### Step ② 单场景验证

```bash
# 单个场景 (不跑全部)
npx tsx scripts/digital-employee/v0.5/operator.ts --scene=product   # 商品全链路
npx tsx scripts/digital-employee/v0.5/operator.ts --scene=live      # 直播运营
npx tsx scripts/digital-employee/v0.5/operator.ts --scene=approval  # 4 类审批
```

### Step ③ 找牛蛙审计 (APPLY=1 前必审)

```bash
# 派工单: "牛蛙, 请审计 scripts/digital-employee/v0.5/operator.ts, 
# 重点: APPLY=1 路径分支 + 权限校验 + 数据写入边界"
# 牛蛙跑 cmd 静态扫描 + 手动 review, 出 PASS 才进 Step ④
```

### Step ④ 真生效 (生产试跑)

```bash
DIGITAL_EMPLOYEE_APPLY=1 \
APP_ENVIRONMENT=test \
E2E_BASE_URL=http://192.144.253.205:80 \
E2E_API_ENCRYPTION_KEY=85d088...d55b \
  npx tsx scripts/digital-employee/v0.5/operator.ts --scene=product
```

跑完看 OperatorReport: PASS 数 / FAIL 数. 任何 FAIL → incident 流程.

### Step ⑤ 部署 cron (生产)

```bash
# 1. 编辑 schedules/default-cron.json 加新 cron entry
# 2. 测试 cron 入口 dry-run
tsx scripts/digital-employee/cron-runner.ts
# 3. OS 级 cron 配置 (示例: 每 10 分钟跑一次)
*/10 * * * * cd /home/beye/workspace/zhuangyuan/wenlv-next && \
  APP_ENVIRONMENT=test E2E_BASE_URL=http://192.144.253.205:80 \
  DIGITAL_EMPLOYEE_APPLY=1 npx tsx scripts/digital-employee/v0.5/operator.ts \
  >> /var/log/digital-employee.log 2>&1
```

## 4. 回归 e2e (journey 41-57 + V0.5)

```bash
# 全 e2e 验证
for spec in 41 42 43 45 51 52 53 54 55 56 57; do
  E2E_BASE_URL=http://192.144.253.205:80 E2E_API_ENCRYPTION_KEY=85d088...d55b \
    npx playwright test e2e/journey/${spec}-*.spec.ts --project=chrome-desktop --reporter=line
done
```

期望全部 PASS. 任何一个 fail → incident.

## 5. 运营报告 (必写)

跑完运营 + 回归后, 写 `docs/sprint-prod/MM/DD-operator-run.md`:

```markdown
# 运营报告 YYYY-MM-DD

## 跑过的脚本
- [x] v0.5/operator.ts: 20 PASS / 0 FAIL (DRY-RUN)
- [x] v0.5/scenarios/live-broadcast-full.ts: 3 PASS
- [x] e2e/journey/41-57 全 PASS (51/51)

## 真实生效 (APPLY=1)
- operator.ts --scene=product: 创建房间 3 个, 挂车 2 件 (id 列表)

## 异常事件
- 无 / 详见 incident/

## 下次建议
- ...
```

## 6. Incident 响应

如果运营脚本 / journey fail:

1. **停止 cron**: `crontab -e` 注释掉数字员工行
2. **回滚**: 调 `rollback-discipline` skill, 镜像 + APPLY=1 数据库回滚点 (由蛙宝提前留)
3. **写 incident-postmortem**: 5 沉淀点 (根因 / 检测信号 / 拦截门禁 / 修复方案 / 文档更新)
4. **审计**: 派牛蛙查代码, 找根因, 加守卫测试
5. **回归**: 全 journey 重跑 + V0.5 重跑

## 7. 协作纪律 (蛙系 SOP)

- **不写代码**: 脚本由田蛙写, 你部署 + 跑
- **不删文件**: 用户原话 "不能乱删了", 改动走追加/重命名, 不 rm
- **不增新蛙**: 运营归你, 不新设 "运营蛙"
- **APPLY=1 前必审**: 牛蛙 + 你双重确认
- **报告必写**: 每天写 `docs/sprint-prod/MM/DD-operator-run.md`

## 8. 相关 Skill / 文档

- `.agents/skills/wenlv/digital-employee-operations/` (sprint 2026-09-28, 总览)
- **`.agents/skills/deployment-tarball-test/` (sprint 2026-10-01, V4 tarball + systemd 部署, dev/test)**
- `.agents/skills/deployment-workflow/` (V3 docker 部署, **prod 强制**)
- `.agents/skills/wenlv/incident-postmortem/` (incident 演练)
- `.agents/skills/wenlv/rollback-discipline/` (回滚)
- `~/.hermes/team/dayanwa-tech-dept.md` (蛙系名册 + 你的职责)

**部署链分工 (sprint 2026-10-01 起)**:
- 你部署 dev/test → 走 **V4** (`.agents/skills/deployment-tarball-test/SKILL.md`, tarball + systemctl restart)
- 你部署 prod → 走 **V3** (`.agents/skills/deployment-workflow/SKILL.md`, docker)
- 中间件 (postgres/redis/minio/srs/realtime) 保留 docker, 你**不动**
- V4 一次性初始化: `.agents/skills/deployment-tarball-test/SKILL.md` §9 (装 Node 20 + systemd unit)

## 9. 工具与账号

| 工具 | 用途 |
|---|---|
| `agy` (雨蛙 CLI) | 跑运营脚本 + regression |
| `tc-robin-claw` SSH | 部署 + cron 配置 + 看容器日志 |
| `/var/log/digital-employee.log` | cron 输出日志 |
| `e2e/fixtures/verified-merchant-fixture.ts` | 19 个真实账号 SSOT (admin/sub/owner/cend) |

## 10. 红线 (不可越界)

- ❌ 不写业务代码 (田蛙写)
- ❌ 不删现有文件 (用户原话 "不能乱删了")
- ❌ 不加新蛙系成员 (用户原话 "不加新人")
- ❌ 不绕开牛蛙审计
- ❌ 不在生产环境跑 dry-run (反之亦然)
- ✅ 你只干: 部署 + 跑回归 + 上线监控 + incident 响应 + 报告
