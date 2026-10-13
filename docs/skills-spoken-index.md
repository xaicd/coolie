# Coolie 交付工厂全量 96 技能口语索引全景大纲 (Skills Spoken Index)

> **目的**: 任何 IDE (Cursor / VSCode / AGY / Claude / Codex) 与轻量模型 (200K / 32K) 进场，1 秒内完成全量 96 个技能的口语反查与精准定位，彻底消除“找不到技能”的盲搜痛点。  
> **规格**: 黄金三段式严格对齐（能力说明 + 口语触发词 + 场景边界）。  
> **上级索引**: [MEMORY.md](../MEMORY.md) (首屏中枢) · [docs/intent-router.md](intent-router.md) (意图路由)  

---

## 一、商业软件全生命周期 8 环节核心技能 (CMMI 5 & Palantir 体系)

| 技能标识 (ID) | 🗣️ 核心口语触发词 | 🛠️ 1 行核心能力说明 |
|---|---|---|
| [`cmmi-req-spec`](../.agents/skills/cmmi-req-spec/SKILL.md) | 梳理需求规格 / 写SRS需求文档 / 双向需求跟踪矩阵RTM / 消除需求歧义 / 产品需求进厂 | CMMI 3 需求工程与 EARS 严谨需求规格收敛 (RD/REQM)。 |
| [`requirements-capture`](../.agents/skills/requirements-capture/SKILL.md) | 老板说"做个 X" / 工坊 chat 收到 build 触发 / 客服提需求 / 写新功能前。产物 requirements | 用 Kiro Feature Spec 模式收需求(boss-utterance → EARS 标注的 requirements.md)。md 给下游 system-design-spec 接。 |
| [`ears-spec-writer`](../.agents/skills/ears-spec-writer/SKILL.md) | 需求分析 / 需求规格说明 / SRS / 业务边界定义 / 验收准则 / 消除需求二义性 | 编写 IEEE 29148 / EARS 严谨需求规格说明。 |
| [`product-project-intake`](../.agents/skills/product-project-intake/SKILL.md) | 客户丢来一份需求文档 / 把需求变成系统里的项目 / 把大活拆成一串工单 / 写验收标准 | 产品总监视角的需求进厂 skill：把客户需求文档识别、立项、落档，并拆成有依赖顺序的工单流水线， 把验收标准写进工单文档。适用于「客户丢来一份需求文档」「把需求变成系统里的项目」 「把大活拆成一串工单」「写验收标准」等场景。 完整可执行脚本见 docs-coolie/playbooks/product-project-intake.md。 |
| [`solution-scouting-and-dar`](../.agents/skills/solution-scouting-and-dar/SKILL.md) | 接新项目 / 客户提标书/方案 / 调研同类竞品 / 老板问"有没有成熟开源方案可以拿来用" / 立项选型前。 | 新项目启动前或收到客户需求/标书/方案时，进行行业竞品调研、标杆产品功能对标、GitHub/Gitee 开源底座搜寻与安全审查，输出 CMMI DAR 加权决策矩阵与极速立项推荐参数。 |
| [`cmmi-tech-solution`](../.agents/skills/cmmi-tech-solution/SKILL.md) | 做技术方案 / 写HLD概要设计 / 架构选型DAR / 租户物理隔离设计 | CMMI 3 技术解决方案与架构概要设计 (TS/DAR/RSKM)。 |
| [`fda`](../.agents/skills/fda/SKILL.md) | 这块谁负责 / 先定隔离方案 / 权限矩阵怎么画 / 资金/库存守恒怎么断言 / 评审 PR 的架构视角 | FDA（Forward Deployed Architect 前线架构师）角色细化 skill：在写第一行代码之前， 把组织/租户数据隔离、领域模型边界、RBAC 权限边界、不可篡改事务守恒四条边界画死， 并指出每条边界在哪个文件、哪一层被强制。适用于「这块谁负责」「先定隔离方案」 「权限矩阵怎么画」「资金/库存守恒怎么断言」「评审 PR 的架构视角」等场景。 本 skill 是 palantir-role-engineering §2.5 的细化，配套 references/fda-checklist.md。 |
| [`dar-decision-matrix`](../.agents/skills/dar-decision-matrix/SKILL.md) | 架构选型 / 方案选型 / 竞品横评 / 技术路线决策 / 选型论证 / 决策打分 | 结构化决策分析与权衡评估（CMMI DAR 规范）。 |
| [`adr-architect`](../.agents/skills/adr-architect/SKILL.md) | 架构设计 / 架构决策记录 / ADR / 模块拆分 / 破坏性变更评估 / 引入跨域契约 | 编写与追踪架构决策记录（Michael Nygard / MADR 规范）。 |
| [`archify`](../.agents/skills/archify/SKILL.md) | 画架构图 / 拓扑图 / 时序图 / 流程图 / 数据流图 / 状态机图 / 可视化架构 | 生成可交互、可机器验证的架构与流程图（对标 tt-a1i/archify 标准）。 |
| [`system-design-spec`](../.agents/skills/system-design-spec/SKILL.md) | 在哪个文件加什么接口、改哪个 schema、风险在哪 | 把结构化需求(spec)→技术方案(architecture/data-flow/api/risks)。 |
| [`cmmi-detailed-contracts`](../.agents/skills/cmmi-detailed-contracts/SKILL.md) | 编译报错 / 契约防漂移 / 统一API接口规范 / 写详细设计说明书 / 接口防死穴 | CMMI 3 详细设计与静态契约守卫 (LLD/TS/VER)。强制 0 编译报错。 |
| [`core-swe`](../.agents/skills/core-swe/SKILL.md) | 改完怎么证明没破 / 依赖能不能这么引 / 契约怎么防漂移 / 把某类历史 bug 固化成断言 | Core SWE（平台核心研发工程师）角色细化 skill：用编译器与静态守卫把错误挡在提交之前， 不靠人肉 code review 记规则。覆盖增量 typecheck 0 报错拦截、模块边界方向扫描、 统一 API 契约保护、结构守卫用例固化。适用于「改完怎么证明没破」「依赖能不能这么引」 「契约怎么防漂移」「把某类历史 bug 固化成断言」等场景。 本 skill 是 palantir-role-engineering §2.3 的细化，配套 references/core-swe-checklist.md。 |
| [`yudao-contract-sync`](../.agents/skills/yudao-contract-sync/SKILL.md) | 同步前后端接口 / Java生成前端TS类型 / 多端契约防漂移 / 更新OpenAPI强类型SDK | Yudao 跨端契约自动转译与 TypeScript 类型防漂移技能。 |
| [`cmmi-wbs-milestone`](../.agents/skills/cmmi-wbs-milestone/SKILL.md) | 拆 WBS / 排里程碑 / 看项目处在哪个 阶段 / 哪些后续任务被上游门禁卡住 | >- CMMI 项目工作分解结构 (WBS) 与里程碑主线管理。在项目初始化 / 立项、需求文档 上传后，把项目拆成 CMMI 阶段 → 工作包 → 收口里程碑的层级任务树，让里程碑作为 主线贯穿 G1-G5 门禁。当掌柜/项目负责人要「拆 WBS」「排里程碑」「看项目处在哪个 阶段」「哪些后续任务被上游门禁卡住」时使用；也用于解释/调整平台自动生成的 WBS 草案。与 cmmi-req-spec / cmmi-tech-solution / cmmi-detailed-contracts / cmmi-ver-val / cmmi-immutable-release / cmmi-car-spc-metrics 衔接，为它们各自的 门禁交付物提供任务骨架。 |
| [`swe-delivery-flow`](../.agents/skills/swe-delivery-flow/SKILL.md) | 接一条工单改代码 / 怎么定位根因 / 改完怎么证明没破 / 怎么提交 | 研发员工（SWE）视角的交付 skill：复现优先 → 日志/DB 根因 → 最小修 → typecheck/test → 按显式路径 commit → SSH 直推。适用于「接一条工单改代码」「怎么定位根因」 「改完怎么证明没破」「怎么提交」等场景。 完整脚本见 docs-coolie/playbooks/swe-delivery-flow.md。 |
| [`spec-driven-dev`](../.agents/skills/spec-driven-dev/SKILL.md) | 领到一条开发任务、写新功能前、修 bug 前、要把一句话变成可派单的改动点。产物落在 issue 的 spec 字段，可查询/可派单。 | 员工每次代码改动的 3 步 spec 流程（requirement/bugfix → design → task）。 |
| [`speckit-workflow`](../.agents/skills/speckit-workflow/SKILL.md) | SDD规格开发 / 1Task=1Commit / 特性骨架拆解 / 从Spec生成任务 / 代码核销 | Coolie Spec-Kit 规格驱动开发 (SDD) 全生命周期执行法典。 |
| [`bug-fix-flow`](../.agents/skills/bug-fix-flow/SKILL.md) | 老板说"X 有 bug" / "工坊 chat 断了" / "语音派发失败" / 任何 regression 报告。 | 用 Kiro 的 Bugfix Spec 模式修 Coolie bug。三段式：当前行为 / 期望行为 / 不变行为。 |
| [`yudao-expo-app`](../.agents/skills/yudao-expo-app/SKILL.md) | 开发手机App / 修复6寸屏撑爆 / 刘海屏遮挡 / 自建OTA发版 / 原生端极简UI | Yudao-Quad-Terminal 原生移动端 (Expo SDK 52/React Native) 研发与 6 寸屏防御法典。 |
| [`minimalist-ui-and-cmmi-governance`](../.agents/skills/minimalist-ui-and-cmmi-governance/SKILL.md) | 业务场景泛匹配 | Coolie 平台极简主义两字 UI 交互规范、移动端经典对称底栏布局、CMMI 六大截断规范产物目录与项目工作区/工坊会话双轨映射治理。当设计或审查界面文案、重构导航入口、整理/归档 CMMI 产物、或者梳理项目代码目录与工坊会话关系时使用。 |
| [`mobile-navigation-and-stack-audit`](../.agents/skills/mobile-navigation-and-stack-audit/SKILL.md) | 修复返回键乱跳 / 导航栈错乱 / 子Tab丢失状态 / 跨Tab跳页排查 / 移动端路由混乱 | 移动端无感就地导航、LIFO 调用栈与防乱跳审计。 |
| [`yudao-admin-vue3`](../.agents/skills/yudao-admin-vue3/SKILL.md) | 改Vue管理端 / 加后台页面 / CRUD表格表单开发 / 字典与权限配置 / 后台两字UI适配 | Yudao-UI-Admin-Vue3 前端管理中台研发指南 (Vue3+Vite+Element Plus)。 |
| [`yudao-miniapp-dev`](../.agents/skills/yudao-miniapp-dev/SKILL.md) | 开发微信小程序 / 微信授权与支付 / 分包优化规避2MB / 底部安全区适配 | Yudao-Mall-UniApp 微信小程序与移动端深度研发法典 (Vue 3/Uni-App)。 |
| [`yudao-backend-dev`](../.agents/skills/yudao-backend-dev/SKILL.md) | 写Java后端接口 / 改MyBatis查询 / 多租户行级隔离 / 加防重幂等注解 / Knife4j契约开发 | Yudao-Cloud 芋道后端微服务与单体开发法典 (Spring Boot 3/JDK 17)。 |
| [`yudao-cloud-bootstrap`](../.agents/skills/yudao-cloud-bootstrap/SKILL.md) | 新建微服务工程 / 裁剪无用业务模块 / 搭建全新Java基座 / 环境初始化 | Yudao-Cloud 芋道底座自动化选型、模块裁剪与脚手架极速派生指南。 |
| [`yudao-local-stack`](../.agents/skills/yudao-local-stack/SKILL.md) | 起本地数据库 / 一键拉起Redis / 初始化本地开发环境 / 本地中间件排障 | Yudao 轻量化本地开发容器一键自闭环 (Docker MySQL/Redis 秒级拉起)。 |
| [`cmmi-ver-val`](../.agents/skills/cmmi-ver-val/SKILL.md) | 验收测试 / 四态UI走查 / 出测试总结报告 / 组织UAT终验 / 防抖防御走查 | CMMI 3 验证与确认全栈验收守卫 (VER/VAL)。 |
| [`agent-device-browser-automation`](../.agents/skills/agent-device-browser-automation/SKILL.md) | 真机走查 / 跑UI自动化 / 移动端截图 / 检查页面白屏 / 测试多视口适配 | 驱动移动真机/模拟器 (agent-device) 与 Web 浏览器 (agent-browser) 执行 E2E 自动化走查与四态截图存证。 |
| [`mutation-tester`](../.agents/skills/mutation-tester/SKILL.md) | 变异测试 / 杀灭假 Mock / 验证测试充分性 / 检查空洞测试 / 测试质量打假 | 变异测试与反假 Mock 验证（对标 Stryker / PIT / SpaceX 级航天测试标准）。 |
| [`comprehensive-testing-workflow`](../.agents/skills/comprehensive-testing-workflow/SKILL.md) | 执行测试 / 编写单测/集成测试 / 本地脱机测试 / E2E回归 / 排查UI遮挡与白屏 | 用于系统测试、单元测试、本地脱机沙箱测试、E2E 浏览器旅程、移动端真机快照测试与物理遮挡审查。沉淀了 PGlite WASM 嵌入式测试、A11y 交互点嗅探、DOM 物理遮挡几何计算、多模态屏幕快照视觉验证与反造数断言的全套实战经验。适用于“执行测试”“编写单测/集成测试”“本地脱机测试”“E2E回归”“排查UI遮挡与白屏”等场景。 |
| [`qa-humanlike-e2e`](../.agents/skills/qa-humanlike-e2e/SKILL.md) | 证明这个特性真能用 / 发版前后装机走查 / UI 功能怎么算验证过 / 模拟器异常是不是产品缺陷 | 测试员工（QA）视角的拟真人走查 skill：双模拟器装机、真产物校验、Playwright 真驱动、 API 真值回读、截图存证、本机 TUN 代理伪阴性识别。适用于「证明这个特性真能用」 「发版前后装机走查」「UI 功能怎么算验证过」「模拟器异常是不是产品缺陷」等场景。 完整脚本见 docs-coolie/playbooks/qa-humanlike-e2e.md。 |
| [`ds`](../.agents/skills/ds/SKILL.md) | 这次能不能上 / 业务旅程走得通吗 / 界面上的名词都属于当前场景吗 / 给我 go/no-go | DS（Deployment Strategist 部署战略专家 / 业务方案专家）角色细化 skill：用户视角主审官， 不读代码只当用户，把业务旅程从头走到底，专门捕获技术测试全都会放过的缺陷 —— 死交互/假 按钮、业务语义隔离违规、技术通但业务不通。持有投产一票否决。适用于「这次能不能上」 「业务旅程走得通吗」「界面上的名词都属于当前场景吗」「给我 go/no-go」等场景。 本 skill 是 palantir-role-engineering §2.2 的细化，配套 references/ds-checklist.md。 |
| [`fdse`](../.agents/skills/fdse/SKILL.md) | 这个界面几个状态都验了吗 / 按钮点了 有没有反应 / await 失败了去哪 / 谁来写测试 | FDSE（Forward Deployed Software Engineer 前线部署全栈工程师）角色细化 skill：交付第一 责任人，全栈功能开发 + 防御性 UI + 状态机全覆盖，亲自写单测与 E2E。覆盖状态机穷举、 零死穴按钮、异常防御、自己写测试四项。适用于「这个界面几个状态都验了吗」「按钮点了 有没有反应」「await 失败了去哪」「谁来写测试」等场景。 本 skill 是 palantir-role-engineering §2.1 的细化，配套 references/fdse-checklist.md。 |
| [`cmmi-immutable-release`](../.agents/skills/cmmi-immutable-release/SKILL.md) | 投产上线 / 生产割接 / 制定秒级回滚预案 / 发版前配置复核 / 不可变制品校验 | CMMI 3 配置管理与不可变生产投产 (CM/RSKM/PMC)。 |
| [`sre-release-and-deploy`](../.agents/skills/sre-release-and-deploy/SKILL.md) | 要发版/上线 / 部署 server / 线上出故障 / version.json 404 了 | SRE / 发版 skill：App 发版 9 步链（release-app.sh）、version.json 被 rsync --delete 抹掉的 血泪补偿、安全 rsync excludes 铁律、server 部署与初始化、OTA 纯 JS 补丁、journalctl 排障。 适用于「要发版/上线」「部署 server」「线上出故障」「version.json 404 了」等场景。 完整脚本见 docs-coolie/playbooks/sre-release-and-deploy.md。 |
| [`app-release-pipeline`](../.agents/skills/app-release-pipeline/SKILL.md) | 发版 / 发布新版本 / 打包 APK / 发布 OTA / 推 tag / 触发更新 | Coolie 平台全栈版本发布统一操作指南（打包、发布、Git Tag Push、OTA 增量触发与 7 处版本一致性守卫）。当用户或系统要求“发版”、“发布新版本”、“打包 APK”、“发布 OTA”、“推 tag”、“触发更新”时使用。 |
| [`release-flow`](../.agents/skills/release-flow/SKILL.md) | 派活发版、改 db schema、改 server code、改 h5、改 expo app、或老板问"怎么发布 X"。让新匠人按本 skill 知道改完后要走哪条发布链路。 | 记录 Coolie fork 四类资产的发布方式（SQL schema / API server / H5 web / APP client）。 |
| [`release-version-sync`](../.agents/skills/release-version-sync/SKILL.md) | APK 内嵌 versionCode 或线上 version | 发版必须同步四处版本号：app.json / expo/package.json / android/app/build.gradle 由 release-app.sh 自动改，仓库 version.json 需单独 chore commit。json 与仓库不一致 → OTA 拒绝 / 版本号落后。 |
| [`ota-cache-busting`](../.agents/skills/ota-cache-busting/SKILL.md) | 老板装新版 APK 后仍看到老界面 / release-app | Expo OTA bundle hash 必须随每次发版改变，否则老用户拿不到新版本。sh 自动 bump 后老用户没拉到新 bundle。 |
| [`ota-launchasset-hash`](../.agents/skills/ota-launchasset-hash/SKILL.md) | 老板装新版后仍看到老界面 / publish-ota | 自建 OTA manifest 必须带 launchAsset.hash/assets[].hash，且 launchAsset.key 必须随 bundle 内容变化，否则老设备永远拿不到新 bundle。sh 生成的 manifest 缺 hash / 排查 expo-updates 复用旧 bundle。 |
| [`ota-caddy-fallback-trap`](../.agents/skills/ota-caddy-fallback-trap/SKILL.md) | 已启用 | Expo OTA 的 manifest/bundle 走生产 Caddy 时，会被 SPA 兜底路由成 HTML，expo-updates 静默失效。 |
| [`ota-runtime-version-consistency`](../.agents/skills/ota-runtime-version-consistency/SKILL.md) | 下了不装 / 更新就绪 | OTA 的 runtimeVersion 必须三处一致（app.json / APK 原生 / 生产 manifest），否则 expo-updates 只下载不加载（「下了不装」）。sh 或 publish-ota.sh / 排查 expo-updates runtime mismatch。 |
| [`release`](../.agents/skills/release/SKILL.md) | 发版 / 发布正式版本 / 切Tag发版本 / 执行全流程发版 | 统筹 Paperclip 全栈工程发版 (验证/npm/GitHub/冒烟测试/发布公告)。 |
| [`release-changelog`](../.agents/skills/release-changelog/SKILL.md) | 生成更新日志 / 写CHANGELOG / 统计本次发版内容 | 通过比对提交记录与 PR 上下文自动生成标准发版更新日志 CHANGELOG。 |
| [`release-changelog-discord-message`](../.agents/skills/release-changelog-discord-message/SKILL.md) | 写版本通告 / 发布更新广播 / 同步社群版本日志 | 根据版本更新日志自动起草对外发布通报与社区通知。 |
| [`ceo-company-ops`](../.agents/skills/ceo-company-ops/SKILL.md) | 现在这家公司怎么样了 / 要开个新公司/新客户交付体 / 要不要临时停工 / 这个算不算交付上线 | 公司负责人（老板/CEO）视角的 Company 运营 skill：看服务健康、读公司大盘、建公司、 熔断停工与复工、验收"上线"。适用于「现在这家公司怎么样了」「要开个新公司/新客户交付体」 「要不要临时停工」「这个算不算交付上线」等场景。 完整可执行脚本见 docs-coolie/playbooks/ceo-company-ops.md。 |
| [`finance-budget-guard`](../.agents/skills/finance-budget-guard/SKILL.md) | 这个 agent 怎么不动了 / 预算超了怎么办 / 新公司/新 agent 怎么定额 / 钱花哪了 | 财务视角的预算守卫 skill：读公司/agent 花销与预算、理解硬停自动暂停语义、提额恢复、 开工前定额。适用于「这个 agent 怎么不动了」「预算超了怎么办」「新公司/新 agent 怎么定额」 「钱花哪了」等场景。 完整脚本见 docs-coolie/playbooks/finance-budget-guard.md。 |
| [`financial-reconciliation-agent`](../.agents/skills/financial-reconciliation-agent/SKILL.md) | 财务对账 / 订单平账 / 渠道结算 / 差异单处理 / 资金轧差 / 运营日结 / 账实核对 | 财务业务对账与资金轧差平账（复式记账与全链路对账规范）。 |
| [`postmortem-analyzer`](../.agents/skills/postmortem-analyzer/SKILL.md) | 故障复盘 / 事故分析 / 5-Whys 根本原因 / 制定改进措施 CAPA / 线上问题总结 | 事故免责复盘与根因分析（Google SRE Blameless Postmortem 规范）。 |
| [`cmmi-car-spc-metrics`](../.agents/skills/cmmi-car-spc-metrics/SKILL.md) | 做事故复盘 / 分析缺陷根因 / SPC控制图度量 / 5Whys溯源 / 防退化固化 | CMMI 5 高成熟度统计过程控制与缺陷根本原因分析 (QPM/CAR)。 |
| [`sre-slo-manager`](../.agents/skills/sre-slo-manager/SKILL.md) | SRE 稳定性保障 / 制定 SLO / SLI / 错误预算燃烧率 / 告警阈值 / 压测容量护栏 | 制定与治理服务等级目标与错误预算（Google SRE SLI/SLO 规范）。 |
| [`pre-sre`](../.agents/skills/pre-sre/SKILL.md) | 测过的东西 / 要上的东西 / 这次验的是哪个版本 / 制品怎么保证没被就地改 / 上线后谁来确认在服务 / 测完端口/进程清理了吗 | PRE / SRE（产品可靠性工程师）角色细化 skill：确保「测过的东西」就是「要上的东西」。 覆盖环境版本指纹握手、不可变制品、发布后健康拨测、资源回收四项，并持有发布一票否决权。 适用于「这次验的是哪个版本」「制品怎么保证没被就地改」「上线后谁来确认在服务」 「测完端口/进程清理了吗」等场景。 本 skill 是 palantir-role-engineering §2.4 的细化，配套 references/pre-sre-checklist.md。 |
| [`yudao-cmmi-gatekeeper`](../.agents/skills/yudao-cmmi-gatekeeper/SKILL.md) | 跑CMMI门禁 / G1-G5流水线检查 / 变异测试打假 / 验证交付物完整性 | Yudao 四位一体 CMMI 01~09 全生命周期质量门禁与变异测试打假守卫。 |

## 二、Paperclip 控制面中枢、工具池与数字员工运营技能

| 技能标识 (ID) | 🗣️ 核心口语触发词 | 🛠️ 1 行核心能力说明 |
|---|---|---|
| [`company-creator`](../.agents/skills/company-creator/SKILL.md) | 建新公司 / 开新公司 / 初始化数字员工团队 / 招募Agent | 按 agentcompanies/v1 规范创建数字员工公司包与脚手架团队。 |
| [`create-agent-adapter`](../.agents/skills/create-agent-adapter/SKILL.md) | 对接新Agent / 写Agent适配器 / 接入新CLI模型 | 创建或改造 Paperclip Agent 适配器 (Claude, Codex, Cursor, 自定义CLI)。 |
| [`create-issue-interaction-ui`](../.agents/skills/create-issue-interaction-ui/SKILL.md) | 新增工单交互卡片 / 增加确认弹窗 / 扩展工单交互组件 | 端到端添加 Paperclip 工单交互卡片 UI (二次确认/多选框/向用户提问/任务建议)。 |
| [`create-paperclip-bundled-skill`](../.agents/skills/create-paperclip-bundled-skill/SKILL.md) | 发布内置技能 / 做个官方Skill / 制作技能包并上架目录 | 将功能点或想法打包发布为 Paperclip 官方技能目录内置技能。 |
| [`paperclip-create-plugin`](../.agents/skills/paperclip-create-plugin/SKILL.md) | 开发Paperclip插件 / 写外部扩展包 / 安装本地插件 / 插件脚手架 | 使用 CLI 脚手架创建与开发 Paperclip 外部插件。 |
| [`paperclip-dev-workspace-run-verify-fix`](../.agents/skills/paperclip-dev-workspace-run-verify-fix/SKILL.md) | 启动工作区服务 / 修复开发环境 / 重置测试数据 / 工作区无法访问 | 运行、验证、数据重置与修复 Paperclip 隔离开发工作区服务 (端口/登录态/数据克隆)。 |
| [`paperclip-evals`](../.agents/skills/paperclip-evals/SKILL.md) | 跑评测 / 执行评估流水线 / 检查评测报告 / 评测失败分类 | 执行、检查与汇报 Paperclip Runner 协议或全栈产品级 E2E 评测。 |
| [`paperclip-page`](../.agents/skills/paperclip-page/SKILL.md) | 发布静态预览页 / 部署在线报告 / 生成对外分享链接 / 发布原型页面 | 发布静态 HTML 页面、原型预览或报告到持久化托管页面。 |
| [`diagnose-why-work-stopped`](../.agents/skills/diagnose-why-work-stopped/SKILL.md) | 为什么停工了 / 工单死循环了 / 任务怎么卡住了 / 树形任务失控 | 诊断工单停滞、死循环或异常递归恢复根因并给出产品治理方案。 |
| [`garden-inbox`](../.agents/skills/garden-inbox/SKILL.md) | 整理收件箱 / 清理收件箱 / 归档过期工单通知 / 清理通知红点 | 扫描并整理用户的 Paperclip 收件箱 (Mine)，批量归档过期提醒。 |
| [`internal-comms`](../.agents/skills/internal-comms/SKILL.md) | 写全员公告 / 起草内部通知 / 写版本发布通报 / 发布项目周报 | 起草公司内部公告、全员通报与项目进展简报。 |
| [`hr-agent-onboarding`](../.agents/skills/hr-agent-onboarding/SKILL.md) | 要新增一个数字员工 / 公司缺某个角色 / 招人要审批吗 / 给 agent 配技能 | HR / 招聘 skill：把数字员工招进公司、定角色（含 Coolie 5 角色）、配技能与预算、走 hire 审批、 停职复职。适用于「要新增一个数字员工」「公司缺某个角色」「招人要审批吗」「给 agent 配技能」 等场景。 完整脚本见 docs-coolie/playbooks/hr-agent-onboarding.md。 |
| [`ops-task-orchestration`](../.agents/skills/ops-task-orchestration/SKILL.md) | 把这活派给谁 / 现在谁在干活/哪条卡住了 / 匠人断了怎么接 / 怎么保证两个匠人不互相踩 | 运营总监视角的任务编排 skill：匠人池排班、7 要素派单简报、单写者/冷却纪律、进度追踪、 断网猝死接力重派。适用于「把这活派给谁」「现在谁在干活/哪条卡住了」「匠人断了怎么接」 「怎么保证两个匠人不互相踩」等场景。 完整脚本见 docs-coolie/playbooks/ops-task-orchestration.md。 |
| [`coolie-boss-decision-log`](../.agents/skills/coolie-boss-decision-log/SKILL.md) | PM 拍板 / 老板说"你定" / 跨班次交付时需要对齐决策历史。给下一班 PM 接手时无缝用。 | 记录老板今天拍板的决策点。 |
| [`coolie-mcp-orchestration`](../.agents/skills/coolie-mcp-orchestration/SKILL.md) | 配置/调用 MCP 工具 / 验证数字员工工具链 / 排查 MCP 路由与审批 / 挂载外部自研/第三方 MCP 节点 | Coolie 平台全栈 MCP (Model Context Protocol) 编排与调用全景规范。覆盖控制面 72 核心工具池、 Palantir 活体本体 MCP、第三方工具网关 (Tool Gateway HTTP JSON-RPC)、数字员工 Local Stdio 桥接、 以及 Web 控制台与原生移动 APP 双端验证与治理闭环。适用于「配置/调用 MCP 工具」「验证数字员工工具链」 「排查 MCP 路由与审批」「挂载外部自研/第三方 MCP 节点」等场景。 |
| [`mcp-builder`](../.agents/skills/mcp-builder/SKILL.md) | 开发MCP服务 / 对接新工具API / 增加MCP工具 / 写MCP扩展 | 高质量 MCP (Model Context Protocol) 服务端研发指南 (Node/TS SDK 或 Python FastMCP)。 |
| [`local-team-toolchain`](../.agents/skills/local-team-toolchain/SKILL.md) | 派单给匠人 / host-exec穿透调用 / 调度工具池 / 排查容器与宿主机通信 | 本地施工队 (Hermes/铁匠/墨斗/门神/兜底渊) 跨 Docker/Mac 调度 7 工具池权威指南。 |
| [`model-catalog-check`](../.agents/skills/model-catalog-check/SKILL.md) | 派活给 claude / cmd / agy 时，先确认 model 在该 CLI 的枚举里。Coolie fork 默认用 cmd（MiniMax-M3 在 claude code catalog 之外）。 | 派工前检查 CLI 工具的 model catalog 支持。 |
| [`agy-gemini-cli`](../.agents/skills/agy-gemini-cli/SKILL.md) | 用 agy-gemini3 | 8 (Antigravity CLI 1.2.14 + Gemini 3.8) 跑原型/调研/审计/中文报告. 本机无 agy binary — Antigravity 跑在 docker 容器 `agy-ubuntu-container`, 必须 docker exec + LANG=C.UTF-8 + base64 包装绕过 bash argv UTF-8 替换坑. 7 工具池里的"墨斗 (FDA)"默认工具 (per docs-coolie/TOOLS.md wave272 + wave280). |
| [`fork-sync`](../.agents/skills/fork-sync/SKILL.md) | asked to 同步官方/上游, update from upstream, merge master into main, handle fork conflicts, or when a sync produces conflicts in files upstream also owns | Sync this Paperclip fork with the upstream branch and resolve the merge conflicts safely. |
| [`deploy-workspace-symlinks`](../.agents/skills/deploy-workspace-symlinks/SKILL.md) | rsync server + packages 后跑 systemctl restart → 必须先 link 否则 server 启动失败。 | server 部署时必须建所有 @paperclipai/* workspace package symlinks 到 server/node_modules/。 |

## 三、评估测评、红队安全与 PR/CI 门禁守卫技能

| 技能标识 (ID) | 🗣️ 核心口语触发词 | 🛠️ 1 行核心能力说明 |
|---|---|---|
| [`add-product-e2e-eval`](../.agents/skills/add-product-e2e-eval/SKILL.md) | E2E评测 / 增加端到端测试用例 / 全链路回归评测 / Daytona评测夹具 | 扩展或添加 Paperclip 全栈端到端 E2E 评测流与凭据上报。 |
| [`add-runner-eval`](../.agents/skills/add-runner-eval/SKILL.md) | 增加协议评测 / Runner断言 / 评测定义修改 / 模型基准测试 | 添加或扩展 Paperclip Runner 协议评测定义、花名册与断言夹具。 |
| [`check-pr`](../.agents/skills/check-pr/SKILL.md) | 查PR / 检查PR状态 / 修复CI报错 / 审查合并请求 / 提交前自查 | 审查 GitHub/GitLab PR 状态、评审意见与失败检查。 |
| [`pr-gardening`](../.agents/skills/pr-gardening/SKILL.md) | 巡检PR列表 / 修复未通过的PR / 推进PR合并就绪 | 巡检当前实例打开的所有 PR，评估合并就绪度并自动推进变绿。 |
| [`pr-report`](../.agents/skills/pr-report/SKILL.md) | 深度评审PR / 生成PR审查报告 / 评估架构方案差异 | 生成维护者级别的 PR 深度审查报告与系统架构对比报告。 |
| [`prcheckloop`](../.agents/skills/prcheckloop/SKILL.md) | 把CI跑通 / 解决PR检查失败 / 修复Github Actions报错 | 循环修复并驱动 GitHub PR 最新提交的所有 CI/门禁检查全部变绿。 |
| [`prepare-paperclip-pr`](../.agents/skills/prepare-paperclip-pr/SKILL.md) | 准备提PR / 按模板规范创建PR / 整理提交清单准备提单 | 按 Paperclip 规范准备 PR 分支、模板内容与本地检查。 |
| [`terminal-bench-loop`](../.agents/skills/terminal-bench-loop/SKILL.md) | 跑终端评测 / Terminal-Bench验证 / 终端基准测试修复 | 执行 Terminal-Bench 终端基准评测并进行自动冒烟与修复循环。 |
| [`doc-maintenance`](../.agents/skills/doc-maintenance/SKILL.md) | 核对文档 / 更新README / 修复文档与代码不一致 / 文档维护 | 对照近期 Git 提交历史审计 README、SPEC 与架构文档防漂移。 |
| [`deal-with-security-advisory`](../.agents/skills/deal-with-security-advisory/SKILL.md) | 修复安全漏洞 / 处理CVE漏洞 / 紧急安全发版 | 处理 Paperclip 紧急安全漏洞与 GitHub 安全通告响应 (CVE/热修复/私有分支补丁)。 |
| [`strix-penetration-testing`](../.agents/skills/strix-penetration-testing/SKILL.md) | 红队渗透 / 安全渗透演练 / 自动化渗透测试 / 验证安全 PoC / strix 扫描 | 运行多智能体自主红队渗透测试与漏洞修补（对标 60k 星 usestrix/strix 标准）。 |

## 四、格式转换、富媒体与办公交付资产生成技能

| 技能标识 (ID) | 🗣️ 核心口语触发词 | 🛠️ 1 行核心能力说明 |
|---|---|---|
| [`docx`](../.agents/skills/docx/SKILL.md) | 生成Word / 编辑docx / 解析合同文档 / 导出Word报告 | 创建、读取、编辑与转换 Word 文档 (.docx)。 |
| [`pdf`](../.agents/skills/pdf/SKILL.md) | 解析PDF / 生成PDF验收单 / 合并PDF报告 / 提取PDF文字 | 读取、提取文本、生成、拆分、合并与处理 PDF 文件。 |
| [`pptx`](../.agents/skills/pptx/SKILL.md) | 生成汇报PPT / 制作演示胶片 / 修改PPT页面 / 导出述职文档 | 创建与编辑 PPT 演示文稿 (.pptx/.potx) 幻灯片与版式。 |
| [`xlsx`](../.agents/skills/xlsx/SKILL.md) | 导出Excel / 解析Excel表格 / 处理对账单Excel / 生成统计报表 | 创建、读取、编辑与分析 Excel 电子表格工作簿 (.xlsx)。 |
| [`frontend-design`](../.agents/skills/frontend-design/SKILL.md) | 优化前端UI审美 / 重构界面设计 / 提升页面质感 / 设计新页面风格 | 前端高品质视觉设计与审美指导 (排版、色彩、微交互、拒绝模板感)。 |
| [`web-artifacts-builder`](../.agents/skills/web-artifacts-builder/SKILL.md) | 做高保真交互原型 / 构建富交互Web工件 / 复杂组件DEMO | 基于现代前端栈 (React, Tailwind CSS, shadcn/ui) 构建高复杂度多组件交互式 Web 工件。 |
| [`skill-creator`](../.agents/skills/skill-creator/SKILL.md) | 新建技能 / 开发新Skill / 修改技能配置 / 优化技能命中率 | 创建新技能、调优已有技能并评估技能触发性能。 |
| [`cmmi-asset-authoring`](../.agents/skills/cmmi-asset-authoring/SKILL.md) | 创建标准资产 / 沉淀过程文档 / CMMI 资产创建 / 架构决策记录编写 / 编写 SOP / 治理交付物 | 标准化创建、演进与审计 CMMI 01~09 全生命周期工程过程资产（立项策划、架构设计、测试验证、合规审计、发布割接、SRE稳定性与持续运营）。 |
| [`palantir-role-engineering`](../.agents/skills/palantir-role-engineering/SKILL.md) | 按角色分工做这个需求 / 交付前过一遍审查门禁 / 谁该为这部分负责 / 做一次 上线前风险评估 / 评审这个 PR 的角色视角 | 按 Palantir Foundry 体系五大角色（FDA 前线架构师 / Core SWE 平台核心研发 / PRE-SRE 产品可靠性 / FDSE 前线部署全栈 / DS 部署战略）分工完成工程交付与质量审查。 定义了每个角色负责的文件面、审查门禁、必须提交的交付证据，以及角色间的交接条件。 适用于“按角色分工做这个需求”“交付前过一遍审查门禁”“谁该为这部分负责”“做一次 上线前风险评估”“评审这个 PR 的角色视角”等场景。 |

## 五、其他平台辅助与扩展技能

| 技能标识 (ID) | 🗣️ 核心口语触发词 | 🛠️ 1 行核心能力说明 |
|---|---|---|
| [`apk-installation-cache`](../.agents/skills/apk-installation-cache/SKILL.md) | boss 安装新版本后看到"老界面"或"开发调试环境 OTA 未启用"。Fix: 无痕浏览器 + URL 后加 ?v=timestamp 强制 fresh fetch。 | APK 装机避免 WeChat / 浏览器缓存装错版本。 |

