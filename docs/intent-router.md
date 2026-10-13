# Coolie 交付工厂客户口语意图路由器 (Intent Router)

> **目的**: 建立“掌柜/老板口语 ➜ 触发词 ➜ 必读 Skill ➜ 必读代码 ➜ 必走 SOP”的确定性映射，让 200K 模型进场不猜需求、不乱改文件。  
> **机制**: 7 大类高频口语覆盖；未命中时触发 §Z 持续喂养回流。  
> **全量反查**: 检视全库 96 个技能的口语反查全景总表，直达 [docs/skills-spoken-index.md](skills-spoken-index.md)。

---

## §A 大盘、公司与服务运维类

| 客户原话 | 触发关键词 | 必读 Skill | 必读代码/接口 | 必走 SOP |
|---|---|---|---|---|
| 看下大盘 / 服务健康 / 查状态 | "看大盘 / 健康 / 状态 / 怎么样了" | `ceo-company-ops` | `curl http://localhost:3100/api/health` | 检查 PM2/systemd、数据库状态、版本指纹 |
| 开新公司 / 新客户交付体进厂 | "建公司 / 开新公司 / 招新客户" | `ceo-company-ops` + `company-creator` | `POST /api/companies` | 公司独立命名、绑定专属 Domain 物理隔离 |
| 临时停工 / 熔断 / 复工 | "停工 / 熔断 / 暂停服务 / 复工" | `ceo-company-ops` | `POST /api/companies/:id/pause` | 硬停所有 Agent，保留在场 Session，复工原子解锁 |

## §B 财务与预算守卫类

| 客户原话 | 触发关键词 | 必读 Skill | 必读代码/接口 | 必走 SOP |
|---|---|---|---|---|
| 钱花哪了 / 查预算 / 开销统计 | "钱花哪了 / 预算 / 开销 / 花了多少" | `finance-budget-guard` | `/api/companies/:id/budget` | 查总额度、已消耗 Token、各 Agent 花销占比 |
| Agent 怎么不动了 / 预算超了 | "怎么不动了 / 卡住了 / 停了" | `finance-budget-guard` | `server/src/services/budget.ts` | 检查是否命中硬熔断限额；如需继续走提额审批 |
| 提额 / 追加预算 / 恢复工作 | "提额 / 加预算 / 充值 / 继续干" | `finance-budget-guard` | `PATCH /api/companies/:id/budget` | 掌柜确认额度，原子写入，恢复 Agent 调度 |

## §C 发版、构建与生产部署类

| 客户原话 | 触发关键词 | 必读 Skill | 必读代码/接口 | 必走 SOP |
|---|---|---|---|---|
| 发版 / 部署生产 / 更新线上 | "发版 / 部署 / 上线 / 推生产" | `sre-release-and-deploy` | `scripts/deploy-tc-coolie-claw-server.sh` | 7 步部署铁律：Pre-commit ➜ Commit ➜ 远端构建 ➜ 拨测验证 |
| 手机 App 发版 / 打包 APK | "打APK / 烧包 / 原生发版 / 出包" | `app-release-pipeline` | `scripts/release-app.sh` | 7 处版本一致性检测 ➜ release-app ➜ 校验 version.json |
| OTA 更新 / 纯 JS 补丁 | "发OTA / 热更新 / 纯JS补丁" | `ota-cache-busting` | `publish-ota.sh` | 必须带 launchAsset.key 动态哈希，禁止 SPA 兜底 |

## §D 原生移动端与 6 寸屏防御类

| 客户原话 | 触发关键词 | 必读 Skill | 必读代码/接口 | 必走 SOP |
|---|---|---|---|---|
| 小屏撑爆 / 二维码弹窗撑大 | "撑爆 / 小屏 / 弹窗太大 / 溢出" | `yudao-expo-app` §4 | `clients/expo/` + Dialog 组件 | 宽 `calc(100vw-32px)` + `flex-1 min-h-0` 真居中平铺 |
| 顶部被刘海遮挡 / 关不掉 | "被刘海挡 / 状态栏挡 / 关不掉" | `yudao-expo-app` §4 | `useSafeAreaInsets` | 顶部 `paddingTop: max(insets.top, 16)`，禁写死固定 top |
| 移动端真机走查 / 截屏存证 | "真机走查 / 模拟器跑一次 / 截图" | `agent-device-browser-automation` | `host-exec "agent-device ..."` | 跑 332px/375px 多视口，断言横向无溢出且无物理遮挡 |

## §E 研发、工单与数字员工派活类

| 客户原话 | 触发关键词 | 必读 Skill | 必读代码/接口 | 必走 SOP |
|---|---|---|---|---|
| 派活给铁匠 / 修个 bug | "派活 / 提工单 / 修bug / 改代码" | `swe-delivery-flow` | `paperclipCreateIssue` | 提 Issue ➜ 单人原子签出 ➜ 复现 ➜ 最小修改 ➜ Commit |
| 架构设计 / 模块边界 / 隔离评审 | "架构 / 边界 / 隔离 / 谁负责" | `fda` + `core-swe` | `packages/db/src/schema/` | 4 条硬边界（租户隔离/领域边界/RBAC/事务守恒） |
| 拟真人测试 / UAT 业务验收 | "验收 / 能不能上 / 业务通不通" | `ds` + `qa-humanlike-e2e` | `e2e/` + 完整业务旅程 | 真实端到端走通，持有一票否决权，死穴按钮清零 |

## §F 治理、门禁与合规类

| 客户原话 | 触发关键词 | 必读 Skill | 必读代码/接口 | 必走 SOP |
|---|---|---|---|---|
| 查门禁 / 编译报错 / 类型检查 | "查门禁 / typecheck / 报错" | `core-swe` | `pnpm -r typecheck` | 0 报错拦截，模块单向依赖扫描，结构守卫固化 |
| 审计 / 变异测试打假 / 查空洞单测 | "打假 / 变异测试 / 假Mock / 审计" | `mutation-tester` | `packages/agent-automation/` | 变异注入，消灭无断言假测试，确保真实工程资产 |
| 事故复盘 / 根因分析 | "事故 / 复盘 / 5-Whys / 为什么挂" | `postmortem-analyzer` | `docs/08_sre/postmortem/` | 5-Whys 鱼骨图溯源，固化防退化断言用例 |

## §G 微信 / QQ 网关协同类

| 客户原话 | 触发关键词 | 必读 Skill | 必读代码/接口 | 必走 SOP |
|---|---|---|---|---|
| QQ 不执行 / 机器人只聊天 | "QQ不干活 / 光聊天 / 派活失败" | `coolie-mcp-orchestration` | `~/.coolie-dev/lib/hermes-plugins/` | 禁用拦截式桥接，改走原生 MCP / API 派活 |
| 微信发不出 / 微信频控 | "微信报错 / 限流 / session expired" | `coolie-mcp-orchestration` | `~/.hermes/config.yaml` | 降低定时播报频率，微信发送任意文字刷新 Session |

---

## §Z 命中率自检与整改回流机制

- **何时登记**: 客户原话命中本表某行走完 SOP 后，或客户原话**未命中本表**时；
- **回流规则**: 未命中时，立即在当日 `docs/sprint-prod/MM/DD.md` 记录原话，并在 sprint 末将新口语增补到本表对应分类中。
