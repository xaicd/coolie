# Wave128: 咱本地团队全角色 E2E 工作沉淀 — Skills + MCP 工程

日期: 2026-09-28 | 负责: 掌柜小黑(派单+验收) | 执行: 门神 cmd | 状态: 待派

## 老板原话（三次澄清后的最终版）
> 你要站在全局产品总监，运营总监，公司负责人，各角色员工角色把该系统涉及的所有工作都一步一步沉淀为e2e的数字员工工作脚本工具，沉淀为skills,核心接口提升为mcp
> 「我是说咱本地团队」
> **「重点是产品总监，运营总监要用这个工坊系统，到底能不能把客户需求完整的数字员工交付上线」**

## 最终理解（掌柜定调 v3）

**验收标准变了**：不是"沉淀文档好看"，而是——**产品总监和运营总监真的用 Coolie工坊系统（App/Web/工坊对话），把一个客户需求从进入 → 拆解 → 派发 → 开发 → 交付 → 上线完整走通**。playbook/skills/MCP 的沉淀是手段，打通"需求→交付上线"全链路才是目的。

**PM 刚盘点的链路现状（生产实查）**：
| 环节 | 现状 |
|---|---|
| 1. 需求进入（文档上传+识别建项目） | ✅ wave122 |
| 2. 需求→任务自动拆解 | ⚠️ board skill 有人工拆解指引（SKILL.md 429-441 行有总指挥拆解流水线），但**没有产品化的拆解流**（一键"按此文档生成任务流水线"） |
| 3. 任务派发（指派/改派/自动派发） | ✅ wave120 |
| 4. 开发执行（agent 工作区+心跳接活） | ✅ 上游 runtime（core-swe 等真在干活） |
| 5. 交付（产物上传+work product+预览） | ✅ wave124 + wave127(HTML预览待修) |
| 6. 验收→上线（版本发布+拨测） | ⚠️ G4 门禁有概念，缺"上线"动作的产品化 |

**本波 = 打通第 2、6 两个断点 + 沉淀三件套 + 真刀真枪演练一遍**。

**角色 = 咱团队的职能视角**（不是生产系统的内置 agent）：

| 团队角色 | 谁/对应技能 | 核心工作流（已被实战验证） |
|---|---|---|
| **公司负责人(老板)** | 陈伟 | 定需求、批资源、验收、产品判断 |
| **产品总监** | 小黑(兼) | 需求理解→brief 沉淀→派单→验收标准→产品走查(截图审查) |
| **运营总监** | 小黑(兼) | 匠人池管理(cmd/claude/agy 排班)、任务编排、进度追踪(2分钟汇报)、通知机制、断网猝死重派接力 |
| **研发员工(SWE)** | 门神cmd/铁匠claude/墨斗agy | 复现→定位→修→测→发版提交链 |
| **测试员工(QA)** | 匠人+模拟器 | 拟真人装机走查、API 回读验证、双模拟器(API28 Chromium66+Android14)、截图存证 |
| **SRE/发版** | 门神 | APK构建链(prebuild+kotlin pin+gradle)、COS上传、version.json/OTA、server安全部署(rsync excludes 铁律)、健康检查 |
| **排障** | 小黑+匠人 | 生产日志(journalctl)、DB真值核对、per-IP manifest特性、TUN代理脑裂伪阴性识别 |

## 交付物三件套

### A. E2E 工作脚本（docs-coolie/playbooks/）
每个职能一个 playbook，全部来自实战（素材=wave84-127 + docs-coolie/briefs/ + memory 教训）：
1. `pm-dispatch-accept.md` — 产品总监: 需求→brief→派单(全英文指令+中文简报)→2分钟进度→验收(真值回读)→汇报格式
2. `ops-orchestration.md` — 运营总监: 匠人池/排班/并发纪律(同仓单写者)/断网猝死接力重派/通知铁律
3. `swe-fix-flow.md` — 研发: 复现优先→根因(日志/DB)→最小修→测试→commit by explicit path→push(SSH ProxyCommand=none)
4. `qa-humanlike-verify.md` — 测试: 拟真人装机、API回读、双模拟器、TUN伪阴性识别、截图存证
5. `sre-release-chain.md` — 发版: 0.5.x bump→prebuild --clean→恢复local.properties+kotlinVersion 1.9.24→gradle→coscli→version.json scp→publish-ota→**每次rsync后验证version.json 200**(被抹4次的血泪)
6. `sre-server-deploy.md` — server部署: 安全rsync excludes(version.json/ota/data)→restart→/api/health→version.json复核
7. `prod-debugging.md` — 排障: journalctl抓真凶、DB真值 vs 投影层、per-IP manifest、模拟器网络脑裂
8. `boss-acceptance.md` — 负责人: 验收什么(截图/API真值)、何时熔断回滚

### B. Skills（.agents/skills/，只增不改）
对应 playbook 各一个 skill：`pm-dispatch-accept` / `ops-orchestration` / `swe-fix-flow` / `qa-humanlike-verify` / `sre-release-chain` / `sre-server-deploy` / `prod-debugging` / `boss-acceptance`。
每个 SKILL.md 中文、引用 playbook、给可执行步骤+已知坑（memory 里的教训全部编入对应 skill）。

### C. MCP（packages/mcp-server/）
先读 src/tools.ts 现状，把团队高频核心操作提升为 MCP tools：
- paperclip 生产接口: projects/issues/checkout/attachments/dashboard（给匠人 agent 用）
- 发版链工具化: version-bump / ota-publish / health-check / version-json-verify
- 每个 tool: 鉴权+测试+company隔离（如适用）；tools.test.ts 全绿

### D. 打通两个断点（本波新增核心）
- **D1 需求→任务流水线一键拆解**：项目文档（coolie-docs 里）→ 一键"生成交付流水线"：按文档章节/目标自动生成有序 issue 链（需求确认→原型→开发→测试→发布核验），带依赖顺序+建议指派（复用 board skill 已有的总指挥拆解逻辑，产品化为 server 端点 + Web/工坊对话入口）
- **D2 上线动作产品化**：项目"发布上线"流（版本化快照→拨测→标记上线，走已有 work product + G4 拨测概念），让"交付上线"成为系统里的一个按钮而不是口头概念

### E. 真刀真枪演练（最终验收）
产品总监（小黑派单，匠人扮演）用工坊系统跑一个**真实小需求**全链路：
上传需求文档 → 建项目 → 一键拆解流水线 → 派发 → core-swe/ds 执行 → 产物交付 → 上线标记。
全程留痕（issue 链 + 活动日志），成功才算本波验收通过。

## 验收标准
1. `docs-coolie/playbooks/` ≥ 8 个，每个含真实命令/curl/SSH 样例（从 briefs/git log 挖真值，不编造）
2. 8 个新 skills 落 `.agents/skills/`（只增不改，避开其他会话在编辑的文件）
3. mcp-server tools 增加 + tools.test.ts 全绿 + typecheck + fork-surface gate 过
4. 抽查: sre-release-chain 的 version.json 验证步骤真跑一遍；prod-debugging 的 journalctl 命令真抓一次日志

## 执行注意
- 三批独立 commit（A/B/C），断网猝死可从任意批续跑
- .agents/skills/ 其他会话在动 — 只新增
- 不动 APK
