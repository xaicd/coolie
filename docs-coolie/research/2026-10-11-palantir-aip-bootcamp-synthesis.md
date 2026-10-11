# 架构研析：Palantir AIP Bootcamp 启示与 Coolie 时间盒交付闭环

> **参考输入**: 汪小东《解剖Palantir FDE 10：AIP Bootcamp：Palantir如何把几个月的AI项目压缩到几天》  
> **归档日期**: 2026-10-11  
> **落地实体**: `server/src/routes/board-chat.ts` (直驱派单 + 时间盒熔断), `.agents/skills/requirements-capture/SKILL.md` (Step 0 竞品雷达)

---

## 一、 核心启示：从 Time to Demo 走向 Time to Truth

传统企业 AI 项目之所以耗时数月、反复烂尾，根源在于：
1. **死 Demo 欺骗**：几天就能做一个静态 Chatbot 或 PPT Demo（Time to Demo 极短），但真正进入生产，却撞上权限墙、脏数据、未成文的业务隐性规则与业务部门的抵触；
2. **缺乏硬性时间盒约束**：无休止的“再调研一下”、“再评审一下”，认知周期无限拉长。

**Palantir AIP Bootcamp 的破局法**：
- **硬性时间盒 (Time-Box)**：用 5 天的极短周期，直接将产品压到客户真实业务系统和脏数据面前；
- **杀灭伪用例 (Use Case Filter)**：跑得通真实 Action 的保留，跑不通的现场杀掉，不浪费时间；
- **经验性架构 (Empirical Architecture)**：现场摸着石头过河，就地重构，打通真实回写动作。

---

## 二、 Coolie 平台的反思与架构闭环

### 1. 动态全视角查漏
- **漏洞 1（需求分析跳步）**：虽然写了 G0 方案研判，但在日常工坊中接收到老板一句话需求时，流水线直接转成了 EARS 需求条目，跳过了行业竞品对标，容易闭门造车并遗漏行业隐性需求；
- **漏洞 2（缺乏直驱时间盒派单）**：工坊能支持改派和叫醒，但老板说“30分钟搞定”时，大模型口头答应，没有原子建单并锁定超时熔断策略。

### 2. 本次落地落盘
- **G0 竞品雷达强制前置**：在 `requirements-capture` 中正式加入 Step 0，所有需求输出前必须通过 `search_web` 扫描 2 个成熟商业标杆，反向发现隐性需求并规划 80% 开源借力方案；
- **工坊 Time-Box 直驱派单**：工坊拦截器现已支持 `让<员工>在<N>分钟内搞定<任务>`，自动在底层数据库建单，绑定 `executionPolicy.timeboxMinutes` 与 `monitorNextCheckAt`，超时自动熔断留存证据，并投递心跳即刻唤醒。
