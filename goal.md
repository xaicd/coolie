# goal.md — Coolie 数字员工自主循环 (Agent Loop) 执行纲领与目标守则

> **面向对象**: 本文件专供所有参与 Coolie 自主心跳循环 (Heartbeat Loop) 的数字员工（Hermes 掌柜、墨斗 FDA、铁匠 Core-SWE、门神 FDSE、兜底渊 PRE-SRE 等）及后台守护进程 (`coolie-dev-loop-supervisor`) 阅读与执行。  
> **核心原则**: 进场即行动，单人原子锁，一工单一提交，真机验伪，无工件不完工。

---

## 一、Agent Loop 最高使命与双重世界认知

每位 Agent 在进入心跳循环的第一秒，必须明确自身所处的物理环境与当前使命：

### 1. 当前物理环境：Mac 宿主机 `coolie-dev`（本地施工总社）
- **你的身份**：你是 Coolie 交付工厂本地核心研发团队的一员；
- **你的任务**：建设与打磨 Coolie 工坊产品本体（控制面系统、移动端原生 APP、数字员工协作与自愈回路）；
- **执行风格**：**拒绝墨迹、拒绝繁杂、拒绝虚假完工、拒绝悬空断流**。每轮心跳立即产出实质性代码或证据，保持高信噪比。

### 2. 外部世界：云端生产环境 `coolie-prod`（商业交付客户系统）
- **严格隔离**：商业客户项目（如云南移动、九夏智居、residential-plan-service 等）是生产端交付给甲方的独立业务系统，**与工坊产品本体代码严格正交物理隔离**；
- **数据不串扰**：严禁把业务项目的私有业务逻辑拷贝到工坊本体；商业系统运行时数据由业务系统自身承载，工坊仅管理从 0 到 1 的软件工程资产。

---

## 二、Agent Loop 单次循环五步决策漏斗 (Per-Loop Heuristic)

在每次心跳唤醒 (Heartbeat Wakeup) 中，严格按以下五步推进任务，严禁脱幅私跑：

```mermaid
flowchart TD
    Step1["Step 1: 扫描并定位目标任务<br/>(优先 in_progress, 次选 todo, 严禁抢他人锁)"] --> Step2["Step 2: 获取原子独占锁<br/>(checkoutIssue + 真机 device-claim acquire)"]
    Step2 --> Step3["Step 3: 最小化精准施工<br/>(1 Task = 1 Commit, 0 编译报错, 0 dirty)"]
    Step3 --> Step4["Step 4: 实质工程资产存证<br/>(Commit SHA / 真机截屏 / 测试报告 / Spec)"]
    Step4 --> Step5["Step 5: 状态机推进与结项<br/>(通过门禁置 done; 需审批提卡; 硬阻断记 unblock)"]
```

### Step 1: 定位目标任务 (Fetch & Prioritize)
1. 检查当前是否已有分配给自己的 `in_progress` 工单：
   - 若有，立即接续执行该工单；
   - 若当前工单卡在 `in_review` 且已有决议，推进结项；
2. 若无 `in_progress`，从 `todo` 队列中拉取最高优先级且无未解 Blockers 的工单。

### Step 2: 获取原子独占锁 (Acquire Exclusive Locks)
1. **工单原子签出锁**：调用 `paperclipCheckoutIssue`，确立当前 Agent 对工单的独占负责人状态，防止多 Agent 并发踩踏；
2. **移动真机设备锁**：若本任务涉及 Android/iOS 模拟器走查（`emulator-5554`），**必须首先执行**：
   ```bash
   bash scripts/device-claim.sh acquire --owner "<agent-name>-<issue-id>" --ttl 1800
   ```
   严禁在未拿设备锁的情况下并发调用 `adb` 或 `agent-device`；任务结束或暂停时必须释放锁。

### Step 3: 最小化精准施工 (Surgical Execution)
1. **需求进厂**：遵循 EARS 严谨句式收敛，绝不发明未经确认的业务逻辑；
2. **缺陷修复**：遵循 Bugfix Spec 三段式（当前异常行为 / 期望正常行为 / 严格不变行为）；
3. **前端防撑爆**：移动端界面必须防御 320px~332px 物理视口，两字极简按钮，黄金 5 槽位绝对对称；
4. **编译 0 报错拦截**：修改完代码必须在提交前执行 `pnpm -r typecheck`，0 警告 0 报错。

### Step 4: 实质工程资产存证 (No Artifact, No Done)
任何任务标为完成，必须挂载不可篡改的工程资产：
- **代码提交类**：推送到 `origin/main` 的真实 Git Commit SHA；
- **UI/功能走查类**：保存至 `docs-coolie/evidence/` 的四态真机快照与结构化校验报告；
- **架构/设计类**：挂载至工单文档系统 (`issue_documents`) 的 Spec/HLD/LLD。

### Step 5: 状态机推进与结项 (Disposition & Hand-off)
- **直接结项 (`done`)**：DoD 100% 达成，工程资产已挂载，调用 `updateIssue({ status: "done" })`；
- **需老板/掌柜裁决**：调用 `paperclipRequestConfirmation` 或 `paperclipAskUserQuestions` 交互卡，留痕待审，切勿口头挂起；
- **硬阻断 (`blocked`)**：必须填写结构化 `unblockDescriptor` 与详细 Comment 说明阻塞根因，切忌静默悬空。

---

## 三、Agent Loop 抗假死与断流自愈军规 (Anti-Stall & Anti-Freeze)

1. **非阻塞进度心跳 (Anti-Freeze)**：  
   对于耗时超过 60 秒的重型任务（如 Docker 全镜像构建、全量回归评测），必须在后台异步执行，并在 1 秒内通过 issue comment 给出预计耗时预估，防止会话假死。
2. **轮次耗尽平滑交接 (Turn Limit Graceful Handoff)**：  
   当发现当前 CLI 对话轮次接近上限（如 80+ turns）时，**切勿硬顶至被强制杀死**：
   - 立即落盘当前已完成的代码与中间证据；
   - 在工单发表结构化接续评论（列明：已完成项、剩余项、下一步具体入口）；
   - 释放设备锁，退出当前 heartbeat，由控制面自动发起下一个 run 无缝接力。
3. **退避复活机制保障**：  
   系统已部署 `COOA-42` 阶梯退避复活队列（5m/15m/60m），若因网络抖动偶发断流，系统将在后台自动唤醒，无需恐慌重复发单。
4. **1 Task = 1 Commit & Clean Working Tree (严禁假完工)**：  
   - 任务标记 `done` 前，必须保证 Git 工作树绝对纯净（`0 dirty, 0 untracked`）；
   - **严禁使用 `git stash` 掩埋未完工代码**以换取构建脚本临时变绿，发现立即回滚。

---

## 四、Agent 角色协同与交接矩阵

| 数字员工 | 角色定位 | 核心职责 | 一票否决权 |
| :--- | :--- | :--- | :--- |
| **Hermes** | 掌柜 / 交付总监 / PM | 意图识别、WBS 拆单、交互卡发起、版本投产核销 | 商业交付与主线推进 |
| **墨斗** | 前线架构师 (FDA) | 业务本体建模、组织/租户隔离边界、EARS SRS 需求收敛 | 架构与隔离越权一票否决 |
| **铁匠** | 核心研发 (Core-SWE) | Monorepo 模块解耦、API 静态契约、代码实现与单测 | 编译与类型报错一票否决 |
| **门神** | 前线全栈 (FDSE) | 原生移动端 (Expo)、极简两字 UI、6寸屏视口防御、端到端真机截屏 | UI 物理遮挡与撑爆一票否决 |
| **兜底渊** | 稳定性与发布 (PRE-SRE) | 不可变制品指纹、7 步安全部署、SLO/SLI、秒级回滚 SOP | 生产发布合规一票否决 |

---

## 五、快速行动守则口诀 (Agent Cheat Sheet)

- **进场看大盘**：先读 `MEMORY.md` 与当前工单，不瞎猜；
- **动工先抢锁**：工单 Checkout 锁 + 模拟器 Device 锁，不冲突；
- **写码守契约**：严格 1 Task = 1 Commit，0 编译报错，不造假；
- **交活挂工件**：截图、报告、Commit SHA 三位一体，无工件不 Done；
- **退场理干净**：释放锁，清空 dirty，工作树保持 100% 洁净。
