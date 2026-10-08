# wave358 验证证据 — 多环境 Hermes 动态命名与角色标识 (铁匠 forge-core-swe)

date: 2026-10-08
base: e0d2af64f (wave358 身份共享层已由 be46e572f 落盘)
券: [wave358] 多环境 Hermes 动态命名与角色标识支持 (Palantir Echo/Delta/Dev 矩阵)

## 任务

wave358 身份体系的三面透出收口。共享层 (`scripts/lib/env-identity.sh` +
`server/src/services/env-identity.ts` + 工坊会话注入 `board-chat.ts`) 已于
be46e572f 落盘; 本次补齐剩余两面, 并补 bash 侧单测:

1. **派单 Header**: `scripts/dispatch-local-employee.sh` 调度令与 receipt
   自适应透出本机作战身份;
2. **微信汇报**: `scripts/cron-team-status.sh` 微信标题 / 全景视图 / JSON
   自适应透出本机作战身份;
3. **Dev 守卫**: `scripts/lib/env-identity.test.mjs` 单测固化真值表。

概念铁律 (宪法级): Echo (业务战略与价值中枢) / Delta (前线全栈工程攻坚) /
Dev (平台底座抽象演进) 是**作战力量原型**, 与正交物理部署宿主
(deployEnv: prod/staging/local) 彻底解耦, 严禁互相矮化混淆。

## 1. 三面透出实测 (默认身份 = 仓库默认 Hermes 掌柜 Echo / local)

### 1.1 派单 Header (`--print` 真跑)

```
$ bash scripts/dispatch-local-employee.sh --agent forge-core-swe --task "[wave358] 冒烟" --wave wave358 --print
【Hermes·Echo 扁平化数字员工调度令 · Role System Prompt 注入】

你是当前执行任务的直属员工：【铁匠】（角色代码: forge-core-swe）
你直接受命于项目总指挥 Hermes·Echo（【Hermes·Echo·业务战略】），以最高专业度独立完成本项任务。
...
调度节点身份：【Hermes·Echo·业务战略·PM掌柜】 · Palantir Echo (业务战略与价值中枢) · 宿主: local · 项目: Coolie 本地施工总社
身份Header：echo|Echo|业务战略|Hermes·Echo|local
```

### 1.2 派单 receipt (真记录后读回, 测试件已清理)

```
$ bash scripts/dispatch-local-employee.sh --agent baixiaosheng-ds --task "[wave358] 冒烟: receipt 身份字段验证" --wave wave358
{ "pm": "Hermes·Echo", "pmIdentity": "echo|Echo|业务战略|Hermes·Echo|local",
  "employee": "百晓生", "status": "queued" }
```

### 1.3 微信汇报 (`--compact` / `--who` / `--json`)

```
$ bash scripts/cron-team-status.sh --compact
【wave进展·15:49·Hermes·Echo·业务战略·宿主local】
跑: 铁匠 (claude-glm) · [wave358] 多环境 Hermes 动态命名与角色标识支持 ... [12m, wave358]

$ bash scripts/cron-team-status.sh --who
【谁在用什么工具干什么 · Hermes·Echo 实时全景 (15:49)】
调度节点: 【Hermes·Echo·业务战略·PM掌柜】 · 宿主: local

$ bash scripts/cron-team-status.sh --json
  "pm": "Hermes·Echo", "archetype": "echo", "deployEnv": "local",
  "pmIdentity": "echo|Echo|业务战略|Hermes·Echo|local",
```

### 1.4 工坊会话 (be46e572f 已落盘, 本次未改动)

`server/src/routes/board-chat.ts` SYSTEM 块注入 `envIdentityLine` +
节点显示名/徽记/体系全称/宿主真值, 并强制「严禁将 Echo/Delta/Dev 混淆为
物理网络环境」。`server/src/services/env-identity.test.ts` 167 行单测随行。

## 2. 多环境全矩阵冒烟 (换机不改脚本: 只换身份文件)

以 `$COOLIE_ENV_IDENTITY` 模拟另外两类宿主节点 (真值 = 各机器放一份
`.coolie-local/env-identity.json` 即可, 零脚本改动):

| 节点人设 | 派单 Header | 微信标题 |
|---|---|---|
| Echo/local (默认) | `【Hermes·Echo 扁平化数字员工调度令` + `echo\|Echo\|业务战略\|Hermes·Echo\|local` | `【wave进展·15:49·Hermes·Echo·业务战略·宿主local】` |
| Delta/prod | `【Palantir·Delta 扁平化数字员工调度令` + `【Palantir·Delta·前线工程·FDSE现场攻坚】 · 宿主: prod` | `pmIdentity: delta\|Delta\|前线工程\|Palantir·Delta\|prod` |
| Dev/staging | (dev/底座抽象 分支同构) | `【wave进展·15:49·Hermes·Dev·底座抽象·宿主staging】` |

## 3. Dev 自动化守卫 (单测真值表)

```
$ node --test scripts/lib/env-identity.test.mjs
ℹ tests 15   ℹ pass 15   ℹ fail 0
```

覆盖: 默认身份 / COOLIE_ENV_IDENTITY 全矩阵覆盖 (delta·prod, dev·staging) /
COOLIE_LOCAL_DIR 运行态覆盖 / 三层优先级 (1>2>3) / 不存在路径静默落回 /
非法值兜底 (archetype→echo, deployEnv→local) / 老字段 environment 双语义
兼容 / 坏 JSON 兜底 / 动态命名公式 (显示名·徽记·全徽记·Header 值) / 直跑
identity report。临时目录 after() 全清, 无残留。

## 4. 门禁

| 门禁 | 命令 | 结果 |
|---|---|---|
| 语法 | `bash -n` 两脚本 | **PASS** |
| 单测 | `node --test scripts/lib/env-identity.test.mjs` | **PASS** (15/15) |
| 管局审计 | `node scripts/check-governance-audit.mjs` | **PASS** (exit 0 全绿) |
| fork-surface | `node scripts/check-fork-surface.mjs --cumulative` | 本次触及 5 文件全 ok (仓库存量 10 文件超预算为前序 projects/issues 波遗留, 与本波无关) |

## 5. Echo / Delta / Dev 三维交付标注

- **Echo (业务价值)**: 老板在任意一台机器装好系统后, 仅放一份身份文件,
  微信汇报、派单令、工坊会话即自适应透出「这台机器是哪种作战力量、干什
  么活、部署在何种宿主」, 一眼识别, 零培训零改脚本。
- **Delta (真实环境验证)**: 三类节点人设 (Echo/local、Delta/prod、
  Dev/staging) 均真跑 `--print` / `--compact` / `--json` / `--who` /
  receipt 记录读回, 非静态断言。
- **Dev (自动化守卫沉淀)**: 15 例单测固化身份解析真值表; fork-surface
  登记 5 条目防漂移; 治理审计全绿。

## 6. 交付物清单

| 交付物 | 路径 |
|---|---|
| 派单 Header + receipt 身份注入 | `scripts/dispatch-local-employee.sh` |
| 微信汇报 / 全景 / JSON 身份透出 | `scripts/cron-team-status.sh` |
| 身份解析单测 (15 例) | `scripts/lib/env-identity.test.mjs` |
| fork-surface 登记 (3 新条目 + 2 reason 更新) | `scripts/fork-surface.json` |
| 身份共享层 (前序 be46e572f) | `scripts/lib/env-identity.sh` + `default-env-identity.json` + `server/src/services/env-identity.ts` |
| 工坊会话身份注入 (前序 be46e572f) | `server/src/routes/board-chat.ts` |
