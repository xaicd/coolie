# Spec 派活工作流（AI 原生软件工厂升级版）— 2026-10-08

PM 派活从「老板一句话」彻底升级为「老板一句话 + PM 结构化 Spec + 8 要素 Brief + 0-1 软件工程资产交付 + 自动化门禁检验闭环」。

## 1. 顶层生态位与端到端交付流水线

Coolie 不是简单的聊天看板，而是 **AI 原生商业软件交付工厂 (AI-Native Software Delivery Foundry)**。
系统本身由 AI Agent 自主建设，同时也驱动 AI Agent 为企业客户从 0 到 1 建造、交付并交付商业级软件工程资产包。

```
老板说话（微信 / 工坊输入）
   ↓
PM（Hermes）：docs-coolie/specs/YYYY-MM-DD-<slug>.md 编写 EARS 结构化 Spec
   ↓
PM：生成 8 要素 Brief 派单（brief 存档 docs-coolie/briefs/），明确交付资产形态
   ↓
工匠（数字员工）：按 Spec 施工 + tsc 0 报错 + 真实端侧验证 + 挂载物理 Work Product
   ↓
门禁拦截：G1-G5 自动化守卫校验（scripts/check-governance-audit.sh）+ No Artifact No Done 检验
   ↓
PM：G1-G5 门禁签字 + 生成不可变交付证据（Receipt / Work Product）
   ↓
老板 / 客户：真机端走查实测 + 验收闭环
   ↓
PM-DISPATCH-LOG 归档 + 后续迭代演进
```

## 2. 8 要素 Brief 与 Spec 模板标准

每个派发工单的 Spec 与 Brief 必须满足 **8 要素**，严禁缺项：

```markdown
# Spec: <一句话目标>

## 1. 任务目标
<一句话可测目标，含具体数值 / 路径 / 验收指标>

## 2. 为什么要做 (背景与根因)
<老板原话 + 关联 commit / 报错日志 / 业务场景价值>

## 3. 文件范围 (白名单)
- path/to/file1.tsx
- path/to/file2.ts

## 4. 绝对不动项
- <list of files / tables / routes NOT to touch>

## 5. 推荐匠人与工具池
- 责任员工: 铁匠 (core-swe) / 门神 (fdse) / 兑底渊 (pre-sre) / 墨斗 (fda) / 百晓生 (ds)
- 执行工具: cmd / claude / agy / copilot

## 6. 验收门禁 (G1-G5 对应项)
- [ ] tsc 0 errors (pnpm -r typecheck)
- [ ] 自动化测试全绿 (pnpm test)
- [ ] 真实真机/浏览器四态快照存证 (0 假死/0 遮挡)
- [ ] 治理门禁通过 (bash scripts/check-governance-audit.sh)

## 7. 冷却与单写者纪律
- 严格遵循工具冷却时间 (cmd: 180s, claude: 30s)
- 单一文件同时仅限一名工匠持有写锁

## 8. 交付资产形态 (物理 Work Product 五选一，No Artifact, No Done)
- [ ] 1. 源码库提交 (Git Commit SHA / Monorepo 0 报错代码)
- [ ] 2. 统一契约定义文件 (OpenAPI Swagger / Schema DDL / DTO / TypeSpec)
- [ ] 3. 真实真机录屏与全状态快照 (MP4 / WebM / PNG 4 态走查包)
- [ ] 4. 生产发版制品与部署 SOP (APK / OTA Bundle / Docker 镜像 / 回滚手册)
- [ ] 5. 架构决策与规格设计说明书 (EARS SRS / HLD / DAR 加权选型表)
```

## 3. CMMI 0-1 工程资产 vs 运行时业务数据 物理隔离铁律

**这是所有 AI Agent 必须刻在骨子里的铁律：**

| 类别 | 核心定义 | 典型产物示例（软件交付资产包） | 禁忌混淆点 |
| :--- | :--- | :--- | :--- |
| **CMMI 0-1 软件工程交付资产** | 从 0 到 1 建设、开发、测试、交付**该软件系统本身**的工程资产 | SRS 规格书、HLD 架构图、OpenAPI 契约、编译 0 报错源码 Repo、集成测试报告、部署回滚 SOP、终验会签单 | **严禁把系统上线后的业务内容数据当成工程交付物！** |
| **系统运行时业务数据** | 软件系统交付投产运行后，用户在系统内部产生的**业务内容数据** | 智能柜子设计图纸、板材利用率 76.42%、数控打孔 G 代码、企业微信客户名单、生产订单记录 | 运行时数据是客户的生产资产，不是交付软件系统本身的工程资产！ |

**反向审视红线**：
- 如果一个工单在描述“完成了 CMMI G1 需求交付”，却只塞了一堆“某板材厂今日开料 300 张”的运行时业务数据，这是**严重概念混淆与不及格交付**！必须输出《板材生产排产系统软件需求规格说明书 (SRS)》。

## 4. No Artifact, No Done 铁律

任何工单或阶段门禁结项，**必须挂载符合形态的 Work Product 物理产物**：
1. 严禁口头声明“已完成”、“逻辑已调通”、“测试通过”；
2. 必须执行 `skills/paperclip/scripts/paperclip-upload-artifact.sh` 上传 inspectable deliverable，并在工单中创建 `artifact` / `commit` / `pull_request` 类型的 Work Product；
3. 未挂载不可变工程产物，任何状态置为 `done` 的操作均视为无效并触发治理阻断。

## 5. Spec 与 PM-DISPATCH-QUICKCARD 的关系

| 关系 | 说明 |
|---|---|
| PM-DISPATCH-QUICKCARD.md | **派单模板与速查**（给匠人看的 8 要素 brief 怎么写）|
| docs-coolie/specs/*.md | **具体 Spec 文件**（一个特性/任务一个 Spec）|
| .agents/rules/CMMI-SPEC-FIRST-ARTIFACTS.md | **0-1 软件工程资产标准**（G1-G5 物理产物清单）|
| PM-RELEASE-CHECKLIST.md | **发版门禁**（24 项硬核质检）|

Spec 是“做什么与 0-1 资产标准”，Brief 是“怎么派与上下文注入”，Checklist 是“怎么自动化验收”。

## 6. 为什么必须 Spec-First，杜绝 AI 假大空废话

大模型天然倾向于生成长篇大论、套话连篇、缺乏事实锚点的空心 Markdown。
**Spec-First 的本质是用可执行、无歧义的逻辑约束取代口水话**：
1. **EARS 语法约束**：必须是 `WHEN... THEN... SHALL...`，消灭一切模糊形容词；
2. **文件白名单约束**：必须精准到物理文件路径与改动行；
3. **输入/输出断言**：API 契约必须有具体 JSON Schema，测试必须有真实状态码与截图；
4. **编译与自动化守卫**：机器脚本 100% 先行拦截，0 Token 试错。

## 7. 启用后的派单纪律

1. **老板/用户说话必留痕**（第一手输入不丢失，写入 Spec 第 1 节）；
2. **Spec 先行，8 要素齐备再派单**，绝不搞口头派工；
3. **匠人必须按 Spec 白名单施工**，严禁扩大修改面；
4. **结项前必须物理挂载 Work Product 产物**，落实 `No Artifact, No Done`；
5. **门禁脚本全绿放行**，退出码不为 0 严禁合并与投产。