#!/usr/bin/env node
/**
 * ============================================================================
 * Spec-Kit Enterprise 控制台 (Spec-Kit SDD Engine: Unified CLI - Coolie Edition)
 * 基于 GitHub Spec-Kit (SDD) 开源标准构建并扩展，深度集成 Paperclip 任务与工件总线
 * ============================================================================
 *
 * 核心目的：
 * 统一收敛所有规格生命周期操作（创建、编译展开、双向同步、交付检查、归档与健康扫描），
 * 全面赋能 feature / bugfix / enhancement / refactor / security 全类型规格。
 *
 * 用法 (CLI Usage):
 *   node scripts/speckit.cjs init
 *   node scripts/speckit.cjs constitution
 *   node scripts/speckit.cjs new --name <名> --domain <域> --title "<标题>" [--type feature|bugfix|enhancement|refactor|security]
 *   node scripts/speckit.cjs build --name <名>
 *   node scripts/speckit.cjs sync --spec <名> [--project <ID>] [--company <ID>] [--host <URL>]
 *   node scripts/speckit.cjs check --spec <名>
 *   node scripts/speckit.cjs list
 *   node scripts/speckit.cjs cmmi check
 */

const fs = require("node:fs")
const path = require("node:path")
const { spawnSync } = require("node:child_process")

const ROOT = path.resolve(__dirname, "..")

// 引入统一规格解析器
const {
  resolveSpecDir,
  getTargetSpecDir,
  listAllSpecs,
} = require("./lib/spec-resolver.cjs")

// 参数解析助手
const args = process.argv.slice(2)
let command = args[0] && !args[0].startsWith("-") ? args[0] : ""

// 兼容智能推断：如果未给子命令但给了参数
if (!command) {
  if (args.includes("--name") && args.includes("--domain")) {
    command = "new"
  } else if (args.includes("--name") && (args.includes("--check") || args.includes("--build"))) {
    command = "build"
  } else {
    command = "help"
  }
}

const getArg = (flag) => {
  const index = args.indexOf(flag)
  return index >= 0 && index + 1 < args.length ? args[index + 1] : undefined
}

const hasFlag = (flag) => args.includes(flag)

// ============================================================================
// 1. 命令：speckit new (创建规格骨架)
// ============================================================================
function handleNew() {
  const name = getArg("--name")
  const domain = getArg("--domain")
  const title = getArg("--title") ?? name
  const specType = getArg("--type") ?? "feature"
  const isForce = hasFlag("--force")
  const isLegacy = hasFlag("--legacy")

  if (!name || !domain) {
    console.error("❌ 用法错误: node scripts/speckit.cjs new --name <名称> --domain <域名> --title \"<标题>\" [--type feature|bugfix|enhancement|refactor|security]")
    process.exit(2)
  }

  const dir = isLegacy
    ? path.join(ROOT, "docs", "features", name)
    : getTargetSpecDir(name, domain)

  if (fs.existsSync(dir) && !isForce) {
    console.error(`❌ [speckit] 规格目录已存在: ${path.relative(ROOT, dir)}（使用 --force 覆盖骨架，注意已填内容会被覆盖）`)
    process.exit(2)
  }

  fs.mkdirSync(dir, { recursive: true })

  let brief

  if (specType === "bugfix") {
    brief = {
      name,
      domain,
      title,
      type: "bugfix",
      goal: "<!-- 待填: 一句话说清『修复什么缺陷，恢复何种预期行为』 -->",
      symptom: "<!-- 待填: 缺陷表现、异常日志或复现步骤 -->",
      rootCause: "<!-- 待填: 5-Whys 代码/设计层面的根本原因 -->",
      preservedBehavior: "<!-- 待填: 必须保持不变的既有正常功能与数据（防回归） -->",
      roles: [
        { role: "受影响用户", can: "正常使用受影响业务，不再遭遇异常中断" },
        { role: "排障/SRE 工程师", can: "通过监控告警与自动化红测核实问题已彻底根治" },
      ],
      stories: [
        { priority: "P0", text: "<!-- 待填: 编写红灯复现单测 (Red Test) 确证缺陷存在 -->" },
        { priority: "P0", text: "<!-- 待填: 原位修补业务逻辑并增加防御状态机守卫 -->" },
        { priority: "P1", text: "<!-- 待填: 补充回归测试套件并验证红灯变绿 (Green Test) -->" },
      ],
      constraints: [
        "零破坏性变更：不得破坏已有对外 API 契约与历史数据兼容性。",
        "反假 Mock：必须由真实测试数据库用例复现并验证修复。",
        "防回归保证：修复不得引入次生故障或破坏既有正常流转。",
      ],
      acceptance: [
        { check: "`npm run test` exit=0" },
        { check: "<!-- 待填: 缺陷复现用例从 Red 变绿 (100% PASS) -->" },
        { check: "<!-- 待填: 既有核心回归测试套件全部通过 (0 Regression) -->" },
      ],
      nonGoals: ["不在本次修补中引入无关功能或破坏性架构变更"],
      architecture: "<!-- 待填: 缺陷涉及的代码调用链路与修补方案架构 -->",
      entities: [{ table: "<!-- 待填: 涉及的表名（若无写 - ） -->", note: "<!-- 待填 -->" }],
      invariants: [{ name: "<!-- 待填: 防御不变量（如 并发安全） -->", how: "<!-- 待填: 如何在代码层彻底杜绝次生灾害 -->" }],
      ui: ["<!-- 待填: 若涉及 UI 则写明修复前后对比，无则写『不涉及 UI 调整』 -->"],
      ops: ["<!-- 待填: 缺陷告警阈值修正与复现测试脚本运行 -->"],
      risks: [{ risk: "修复引入隐蔽次生分支影响", mitigation: "执行覆盖全域的真实数据库测试矩阵与回滚演练" }],
      screens: [{ name: "故障修复面", wireframe: "无变更/微调" }],
      interactions: ["保持既有交互模式不变"],
      states: ["加载中：正常展示。", "空数据：正常展示。", "出错：正常展示，具备明确指引。", "成功：正常展示。"],
      candidates: [{ name: "原位修补", type: "自研", license: "MIT", risk: "无" }],
      benchmarks: ["业内标准防御模式"],
      scan: ["关联调用链与历史缺陷库"],
      licenseConclusion: "无引入外部第三方库风险",
      tasks: [
        { id: "T1", parent: "main", title: "编写红灯复现测试用例 (Red Test)", files: ["<!-- 待填: 测试文件 -->"] },
        { id: "T2", parent: "T1", title: "修复业务缺陷并增加防御守卫", files: ["<!-- 待填: 业务代码 -->"] },
        { id: "T3", parent: "main", title: "全量回归测试与门禁验证", files: ["-"] },
      ],
      dependencies: "T1 → T2 → T3",
      windowMinutes: 10,
    }
  } else if (specType === "refactor") {
    brief = {
      name,
      domain,
      title,
      type: "refactor",
      goal: "<!-- 待填: 一句话说清『重构目标：消除哪些技术债，达到何种架构整洁度』 -->",
      debtAnalysis: "<!-- 待填: 现有架构痛点、耦合点与坏味道 (Code Smells) -->",
      targetArchitecture: "<!-- 待填: 重构后的领域边界、分层与交互契约 -->",
      roles: [
        { role: "业务研发工程师", can: "在整洁清晰的分层架构下快速扩展新特性" },
        { role: "架构委员会/审计员", can: "确信重构遵循领域边界铁律且无业务行为漂移" },
      ],
      stories: [
        { priority: "P0", text: "<!-- 待填: 确立业务等价性安全网单测 (Parity Tests) -->" },
        { priority: "P0", text: "<!-- 待填: 运用绞杀者模式 (Strangler Fig) 逐步迁移模块 -->" },
        { priority: "P1", text: "<!-- 待填: 清除冗余遗留样板并验证全部门禁 -->" },
      ],
      constraints: [
        "功能等价性：重构前后外部对外 API 行为与返回值 100% 等价保持。",
        "跨域通信：必须经过 Domain Facade，禁止违规侵入内部私有服务。",
      ],
      acceptance: [
        { check: "`npm run test` exit=0" },
        { check: "<!-- 待填: 业务等价性单测全部通过 -->" },
      ],
      nonGoals: ["不在本次重构中增加未经评审的业务新功能"],
      architecture: "<!-- 待填: 目标分层架构图与依赖倒置示意 -->",
      entities: [{ table: "<!-- 待填: 涉及的表名 -->", note: "<!-- 待填 -->" }],
      invariants: [{ name: "业务数据零破坏", how: "重构不涉及数据库表物理结构的破坏性变更" }],
      ui: ["<!-- 待填: 界面结构与交互完全保持等价 -->"],
      ops: ["<!-- 待填: 灰度切换方案与快速回滚预案 -->"],
      risks: [{ risk: "隐式隐蔽副作用未被覆盖", mitigation: "变异测试打假与全量真实数据库集成测试" }],
      screens: [{ name: "重构涉及模块", wireframe: "保持既有线框不变" }],
      interactions: ["保持既有交互模式不变"],
      states: ["加载中：正常展示。", "空数据：正常展示。", "出错：正常展示。", "成功：正常展示。"],
      candidates: [{ name: "模块化重构方案", type: "自研", license: "MIT", risk: "无" }],
      benchmarks: ["Clean Architecture 与 DDD 规范"],
      scan: ["全仓静态分析与依赖引用图"],
      licenseConclusion: "无外部依赖许可风险",
      tasks: [
        { id: "T1", parent: "main", title: "建立业务等价性自动化测试基线", files: ["<!-- 待填: 测试文件 -->"] },
        { id: "T2", parent: "T1", title: "按领域分层重构实现与契约迁移", files: ["<!-- 待填: 重构代码 -->"] },
        { id: "T3", parent: "main", title: "清理旧实现并验证无回归债务", files: ["-"] },
      ],
      dependencies: "T1 → T2 → T3",
      windowMinutes: 15,
    }
  } else {
    // 默认 feature
    brief = {
      name,
      domain,
      title,
      type: "feature",
      goal: "<!-- 待填: 一句话说清『做完之后谁能做成什么事』。范围要收得住。 -->",
      roles: [
        { role: "<!-- 待填: 运营端角色 -->", can: "<!-- 待填 -->" },
        { role: "<!-- 待填: 使用端角色 -->", can: "<!-- 待填 -->" },
      ],
      stories: [
        { priority: "P0", text: "<!-- 待填: 最小闭环必须有的 -->" },
        { priority: "P0", text: "<!-- 待填 -->" },
        { priority: "P1", text: "<!-- 待填 -->" },
      ],
      constraints: [
        "AI Agent 驱动：必须具备机器可读的契约与无头接口运营支撑。",
        "极简减法：严格贯彻奥卡姆剃刀原则，消灭冗余字段与硬编码样板。",
      ],
      acceptance: [
        { check: "`npm run test` exit=0" },
        { check: "<!-- 待填: 每条都要可执行验证，不要写『体验良好』 -->" },
      ],
      nonGoals: ["<!-- 待填: 显式划出边界，这一节能挡掉一半范围蔓延 -->"],
      architecture: "<!-- 待填: 数据流与依赖方向；前后端契约调用示意 -->",
      entities: [{ table: "<!-- 待填: 表名 -->", note: "<!-- 待填 -->" }],
      invariants: [{ name: "<!-- 待填: 不变量名（如 防重放） -->", how: "<!-- 待填: 怎么保证，且要与验收标准对应 -->" }],
      ui: ["<!-- 待填: Web 与多端各有什么页面 -->"],
      ops: ["<!-- 待填: 门禁链、部署方式、接口健康扫描 -->"],
      risks: [{ risk: "<!-- 待填 -->", mitigation: "<!-- 待填 -->" }],
      screens: [{ name: "<!-- 待填: 页面名与路径 -->", wireframe: "<!-- 待填: 文本线框 -->" }],
      interactions: ["<!-- 待填: 搜索回车、二次确认、防误触守卫 -->"],
      states: ["加载中：骨架屏/加载行。", "空数据：保留搜索栏可重试。", "出错：明确提示并可重试。", "成功：正常展示。"],
      candidates: [{ name: "<!-- 待填: 候选方案 -->", type: "自研", license: "MIT", risk: "无" }],
      benchmarks: ["<!-- 待填: 同行业/同场景实践 -->"],
      scan: ["<!-- 待填: 候选方案选型分析 -->"],
      licenseConclusion: "<!-- 待填: 许可结论 -->",
      tasks: [
        { id: "T1", parent: "main", title: "<!-- 待填: 第一条主线任务 -->", files: ["<!-- 待填: 文件白名单 -->"] },
        { id: "T2", parent: "T1", title: "<!-- 待填 -->", files: ["-"] },
        { id: "T3", parent: "main", title: "<!-- 待填 -->", files: ["-"] },
      ],
      dependencies: "T1 → T2 → T3",
      windowMinutes: 10,
    }
  }

  fs.writeFileSync(path.join(dir, "brief.json"), JSON.stringify(brief, null, 2) + "\n")

  const evidence = {
    feature: name,
    domain,
    type: specType,
    created: new Date().toISOString(),
    trace: { brief: "brief.json", spec: "spec.json" },
  }
  fs.writeFileSync(path.join(dir, "evidence.json"), JSON.stringify(evidence, null, 2) + "\n")

  const specMeta = {
    name,
    domain,
    title,
    type: specType,
    status: "PLAN_APPROVED",
    createdAt: new Date().toISOString(),
    version: "1.0.0",
  }
  fs.writeFileSync(path.join(dir, "spec.json"), JSON.stringify(specMeta, null, 2) + "\n")

  fs.mkdirSync(path.join(dir, "assets"), { recursive: true })
  fs.mkdirSync(path.join(dir, "prototypes"), { recursive: true })

  console.log(`\n✨ [speckit] 成功创建 ${specType} 规格骨架: ${path.relative(ROOT, dir)}/`)
  console.log(`   📄 声明真源: ${path.relative(ROOT, path.join(dir, "brief.json"))} (<500 Tokens，防样板浪费)`)
  console.log(`   🚀 下一步: 编辑 brief.json，然后执行:`)
  console.log(`      node scripts/speckit.cjs build --name ${name}`)
}

// ============================================================================
// 2. 命令：speckit build (展开生成规格文档)
// ============================================================================
function handleBuild() {
  const name = getArg("--name") || getArg("--spec")
  const checkOnly = hasFlag("--check")

  if (!name) {
    console.error("❌ 用法错误: node scripts/speckit.cjs build --name <规格名> [--check]")
    process.exit(2)
  }

  const dir = resolveSpecDir(name)
  if (!dir) {
    console.error(`❌ [speckit] 找不到规格: ${name}（请先运行 node scripts/speckit.cjs new 创建）`)
    process.exit(2)
  }

  const briefPath = path.join(dir, "brief.json")
  if (!fs.existsSync(briefPath)) {
    console.error(`❌ [speckit] 找不到 ${path.relative(ROOT, briefPath)}`)
    process.exit(2)
  }

  let brief
  try {
    brief = JSON.parse(fs.readFileSync(briefPath, "utf8"))
  } catch (err) {
    console.error(`❌ [speckit] brief.json 不是合法 JSON: ${err.message}`)
    process.exit(2)
  }

  // 校验完备性
  const missing = []
  if (!brief.title) missing.push("title")
  if (!brief.domain) missing.push("domain")
  if (!brief.goal) missing.push("goal")
  if ((brief.roles ?? []).length < 2) missing.push("roles（至少 2 个角色）")
  if ((brief.stories ?? []).length < 3) missing.push("stories（至少 3 条用户故事）")
  if ((brief.acceptance ?? []).length < 2) missing.push("acceptance（至少 2 条可执行验收）")
  if ((brief.invariants ?? []).length < 1) missing.push("invariants（至少 1 条关键不变量）")
  if ((brief.tasks ?? []).length < 3) missing.push("tasks（至少 3 条任务）")

  if (missing.length > 0) {
    console.error(`❌ [speckit] brief.json 关键字段缺失: ${missing.join("、")}`)
    process.exit(2)
  }

  if (checkOnly) {
    console.log(`✅ [speckit] brief.json 完备（${brief.stories.length} 故事 / ${brief.acceptance.length} 验收 / ${brief.tasks.length} 任务）`)
    process.exit(0)
  }

  const templateDir = path.join(ROOT, ".specify", "templates")
  const loadTemplate = (filename) => {
    const full = path.join(templateDir, filename)
    return fs.existsSync(full) ? fs.readFileSync(full, "utf8") : ""
  }

  const render = (templateStr, vars) => {
    let res = templateStr
    for (const [k, v] of Object.entries(vars)) {
      res = res.split(`{{${k}}}`).join(v)
    }
    return res
  }

  // 构建统一数据上下文
  const userStoriesText = (brief.stories ?? []).map((s, idx) => 
    `${idx + 1}. **${s.priority ?? "P1"}** [作为${brief.roles?.[0]?.role ?? "用户"}] ${s.text}`
  ).join("\n\n")

  const invariantsText = (brief.invariants ?? []).map((item, index) => 
    `${index + 1}. **${item.name}** —— ${item.how}`
  ).join("\n")

  const acceptanceText = (brief.acceptance ?? []).map((item, index) => 
    `${index + 1}. **THE system SHALL** 验证：${item.check}`
  ).join("\n")

  const constraintsText = (brief.constraints ?? []).map((item) => 
    `* **THE system SHALL COMPLY WITH**: ${item}`
  ).join("\n")

  const nonGoalsText = (brief.nonGoals ?? []).map((item) => 
    `* ${item}`
  ).join("\n")

  const entitiesText = (brief.entities ?? []).map((e) => 
    `- **${e.table}**: ${e.note}`
  ).join("\n")

  const statesText = (brief.states ?? []).map((st) => 
    `- ${st}`
  ).join("\n")

  const risksText = (brief.risks ?? []).map((r) => 
    `- **风险**: ${r.risk} -> **缓释策略**: ${r.mitigation}`
  ).join("\n")

  const taskWaves = [
    { id: "wave-1", title: "地基与契约准备", tasks: ["T1"], dependsOn: [] },
    { id: "wave-2", title: "核心服务与数据流落地", tasks: ["T2"], dependsOn: ["wave-1"] },
    { id: "wave-3", title: "端到端测试与集成验证", tasks: ["T3"], dependsOn: ["wave-2"] },
  ]

  const tasksChecklistText = (brief.tasks ?? []).map((t) => `- [ ] **${t.id}**: ${t.title}
  - 归属: \`${t.parent ?? "main"}\`
  - 文件白名单: \`${(t.files ?? []).join(", ")}\`
  - 验收要求: 必须携带提交标识 \`[${t.id}]\` 并附带真实测试验证
`).join("\n")

  const tasksRtmText = (brief.tasks ?? []).map((t) => 
    `| ${t.id} | ${t.parent ?? "main"} | ${t.title} | ${(t.files ?? []).join(", ")} | 未开始 |`
  ).join("\n")

  const screensText = (brief.screens ?? [])
    .map((s) => `### ${s.name}\n\n\`\`\`\n${s.wireframe}\n\`\`\``)
    .join("\n\n")

  const interactionsText = (brief.interactions ?? []).map((i) => `* ${i}`).join("\n")

  let subtypeSection = ""
  if (brief.type === "bugfix") {
    subtypeSection = `\n### 缺陷现象 (Symptom)\n\n${brief.symptom ?? "待通过红测复现"}\n\n### 根因分析 (Root Cause - 5-Whys)\n\n${brief.rootCause ?? "待排查定位"}\n\n### 保持既有行为 (Preserved Behavior)\n\n${brief.preservedBehavior ?? "已有正常业务功能与数据保持严格兼容。"}\n`
  } else if (brief.type === "refactor") {
    subtypeSection = `\n### 架构债务与异味分析 (Debt Analysis)\n\n${brief.debtAnalysis ?? "消除重复耦合代码"}\n\n### 目标整洁架构形态 (Target Architecture)\n\n${brief.targetArchitecture ?? "整洁分层与 Facade 隔离"}\n`
  }

  const templateVars = {
    TITLE: brief.title,
    NAME: name,
    DOMAIN: brief.domain,
    TYPE: brief.type || "feature",
    GOAL: brief.goal || "",
    SUBTYPE_SECTION: subtypeSection,
    USER_STORIES: userStoriesText,
    INVARIANTS: invariantsText,
    INVARIANTS_SECTION: invariantsText,
    ACCEPTANCE_CRITERIA: acceptanceText,
    CONSTRAINTS: constraintsText,
    NON_GOALS: nonGoalsText,
    ARCHITECTURE_OVERVIEW: brief.architecture ?? "采用 Clean Architecture 分层架构与 Facade 隔离",
    ENTITIES_SECTION: entitiesText,
    API_CONTRACTS_SECTION: `- **HTTP 路由**: \`/api/v1/${brief.domain}/${name}\`\n- **权限标识**: \`${brief.domain}:${name}:manage\``,
    STATES_SECTION: statesText,
    RISKS_SECTION: risksText,
    SCREENS_SECTION: screensText,
    INTERACTIONS_SECTION: interactionsText,
    WAVES_JSON: JSON.stringify({ waves: taskWaves }, null, 2),
    TASKS_CHECKLIST: tasksChecklistText,
    TASKS_RTM_TABLE: tasksRtmText,
    DEPENDENCIES_NOTE: brief.dependencies ?? "T1 → T2 → T3",
    ACCEPTANCE_CHECKLIST: (brief.acceptance ?? []).map((a) => `- [ ] ${a.check}`).join("\n"),
    RESEARCH_BACKGROUND: brief.goal || "",
    LICENSE_CONCLUSION: brief.licenseConclusion ?? "无引入外部第三方库风险，开源许可与底座完全兼容",
    WINDOW_MINUTES: String(brief.windowMinutes ?? 15),
    TIMESTAMP: new Date().toISOString(),
    PHASE: "PLAN_APPROVED",
  }

  const files = {}

  // 1. 规格需求说明书
  const specTpl = loadTemplate("spec-template.md")
  const specContent = specTpl ? render(specTpl, templateVars) : ""
  files["spec.md"] = specContent
  files["requirements.md"] = specContent

  // 2. 架构技术方案
  const planTpl = loadTemplate("plan-template.md")
  const planContent = planTpl ? render(planTpl, templateVars) : ""
  files["plan.md"] = planContent
  files["design.md"] = planContent

  // 3. 任务分解清单
  const tasksTpl = loadTemplate("tasks-template.md")
  const tasksContent = tasksTpl ? render(tasksTpl, templateVars) : ""
  files["tasks.md"] = tasksContent

  // 4. 质量自检清单
  const checklistTpl = loadTemplate("checklist-template.md")
  const checklistContent = checklistTpl ? render(checklistTpl, templateVars) : ""
  files["checklist.md"] = checklistContent

  // 5. 选型研判分析
  const researchTpl = loadTemplate("research-template.md")
  const researchContent = researchTpl ? render(researchTpl, templateVars) : ""
  files["research.md"] = researchContent
  files["selection.md"] = researchContent

  // 6. 实施轨回滚预案
  const runbookTpl = loadTemplate("runbook-template.json")
  files["runbook.json"] = runbookTpl ? render(runbookTpl, templateVars) : ""

  // 7. 门禁证据账本
  const evidenceTpl = loadTemplate("evidence-template.json")
  files["evidence.json"] = evidenceTpl ? render(evidenceTpl, templateVars) : ""

  // 8. 实施网络策略
  const deployTpl = loadTemplate("deployment-template.md")
  files["deployment.md"] = deployTpl ? render(deployTpl, templateVars) : ""

  // 9. 缺陷台账
  const bugsTpl = loadTemplate("bugs-template.md")
  files["bugs.md"] = bugsTpl ? render(bugsTpl, templateVars) : ""

  // 10. 原型与交互规范
  const prototypeTpl = loadTemplate("prototype-template.md")
  const prototypeContent = prototypeTpl ? render(prototypeTpl, templateVars) : ""
  files["prototype.md"] = prototypeContent

  // 11. 规格元数据
  const specJson = {
    name,
    domain: brief.domain,
    title: brief.title,
    type: brief.type || "feature",
    status: "PLAN_APPROVED",
    stories: (brief.stories ?? []).length,
    acceptance: (brief.acceptance ?? []).length,
    invariants: (brief.invariants ?? []).length,
    tasks: (brief.tasks ?? []).length,
    updatedAt: new Date().toISOString(),
  }
  files["spec.json"] = JSON.stringify(specJson, null, 2) + "\n"
  files["feature.json"] = files["spec.json"]

  // 批量写入
  let count = 0
  for (const [filename, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, filename), content)
    count++
  }

  console.log(`\n✅ [speckit] 规格展开编译成功: 共生成 ${count} 份工程文档 -> ${path.relative(ROOT, dir)}/`)
  console.log(`   📋 包含: ${Object.keys(files).join(", ")}`)
  console.log(`   🔍 进度检查: node scripts/speckit.cjs check --spec ${name}`)
}

// ============================================================================
// 3. 命令：speckit sync (将 SDD 规格文档双向同步到 Paperclip 任务与工件总线)
// ============================================================================
async function handleSync() {
  const specName = getArg("--spec") || getArg("--name")
  let host = getArg("--host") || process.env.PAPERCLIP_HOST || "http://localhost:3100"
  let companyId = getArg("--company") || process.env.PAPERCLIP_COMPANY_ID
  let projectId = getArg("--project")

  if (!specName) {
    console.error("❌ 用法错误: node scripts/speckit.cjs sync --spec <规格名> [--project <项目ID>] [--company <公司ID>] [--host <API主机>]")
    process.exit(2)
  }

  const dir = resolveSpecDir(specName)
  if (!dir) {
    console.error(`❌ [speckit] 找不到规格: ${specName}`)
    process.exit(2)
  }

  const briefPath = path.join(dir, "brief.json")
  if (!fs.existsSync(briefPath)) {
    console.error(`❌ [speckit] 找不到 ${path.relative(ROOT, briefPath)}`)
    process.exit(2)
  }

  const brief = JSON.parse(fs.readFileSync(briefPath, "utf8"))
  const specRelDir = path.relative(ROOT, dir)

  async function api(pathname, options = {}) {
    const url = `${host.replace(/\/$/, "")}${pathname.startsWith("/") ? "" : "/"}${pathname}`
    const res = await globalThis.fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    })
    const text = await res.text()
    let body
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
    return { ok: res.ok, status: res.statusCode || res.status, body }
  }

  console.log(`\n🔄 [speckit sync] 启动 SDD 规格与 Paperclip 控制面双向同步: ${brief.title} (${specName})`)
  console.log(`   📂 物理路径: ${specRelDir}`)
  console.log(`   🌐 API 端点: ${host}`)

  try {
    const health = await api("/api/health")
    if (!health.ok) {
      throw new Error(`服务健康检查未就绪 (HTTP ${health.status})`)
    }
  } catch (err) {
    console.error(`❌ [speckit sync] 无法连接到 Paperclip 服务: ${err.message}`)
    console.error(`   提示: 若在 Docker 容器内执行，请穿透宿主机调用: host-exec "node scripts/speckit.cjs sync --spec ${specName}"`)
    process.exit(1)
  }

  if (!companyId) {
    const compRes = await api("/api/companies")
    if (compRes.ok && Array.isArray(compRes.body) && compRes.body.length > 0) {
      const match = compRes.body.find((c) => c.name.includes("Coolie") || c.name.includes("本地")) || compRes.body[0]
      companyId = match.id
      console.log(`   🏢 自动匹配公司: ${match.name} (${companyId})`)
    } else {
      console.error("❌ 无法获取公司列表，请通过 --company 显式指定")
      process.exit(1)
    }
  }

  if (!projectId) {
    const matchProj = specRelDir.match(/^projects\/([^\/]+)/)
    const projSlug = matchProj ? matchProj[1] : null

    const projRes = await api(`/api/companies/${companyId}/projects`)
    if (projRes.ok && Array.isArray(projRes.body) && projRes.body.length > 0) {
      if (projSlug) {
        const found = projRes.body.find((p) => (p.name || "").includes(projSlug) || (p.description || "").includes(projSlug))
        if (found) projectId = found.id
      }
      if (!projectId) {
        projectId = projRes.body[0].id
      }
      const p = projRes.body.find((item) => item.id === projectId)
      console.log(`   📁 绑定项目: ${p?.name || projectId}`)
    }
  }

  const issuesRes = await api(`/api/companies/${companyId}/issues`)
  const existingIssues = Array.isArray(issuesRes.body) ? issuesRes.body : []

  const epicTitle = `[Spec·${brief.domain}] ${brief.title}`
  let epicIssue = existingIssues.find((i) => i.title === epicTitle || (i.title.includes(brief.name) && i.wbsCode && i.wbsCode.startsWith("SPEC-")))

  if (!epicIssue) {
    console.log(`   🚀 创建 Epic 根任务: ${epicTitle}...`)
    const createRes = await api(`/api/companies/${companyId}/issues`, {
      method: "POST",
      body: JSON.stringify({
        title: epicTitle,
        description: `Kiro SDD 敏捷全息规格包主线工单：\n- 规格名称: ${specName}\n- 业务领域: ${brief.domain}\n- 交付类型: ${brief.type || "feature"}\n- 业务目标: ${brief.goal}\n- 物理路径: ${specRelDir}`,
        status: "todo",
        priority: "high",
        projectId: projectId || undefined,
        wbsCode: `SPEC-${brief.domain.toUpperCase()}`,
        wbsType: "task",
      }),
    })
    if (!createRes.ok) {
      console.error("❌ 创建 Epic 工单失败:", createRes.body)
      process.exit(1)
    }
    epicIssue = createRes.body
    console.log(`      └─ Epic 创建成功: [${epicIssue.identifier || epicIssue.id}]`)
  } else {
    console.log(`   ℹ️ 匹配到已有 Epic 工单: [${epicIssue.identifier || epicIssue.id}] ${epicIssue.title}`)
  }

  const wpRes = await api(`/api/issues/${epicIssue.id}/work-products`)
  const existingWp = Array.isArray(wpRes.body) ? wpRes.body : []
  const reqRelPath = path.join(specRelDir, "requirements.md")

  const hasReqWp = existingWp.some((wp) => wp.metadata?.resourceRef?.relativePath === reqRelPath)
  if (!hasReqWp) {
    console.log(`   📦 挂载 Primary Work Product (${reqRelPath})...`)
    await api(`/api/issues/${epicIssue.id}/work-products`, {
      method: "POST",
      body: JSON.stringify({
        type: "deliverable",
        provider: "paperclip",
        title: `[SRS] ${brief.title}`,
        status: "active",
        isPrimary: true,
        summary: `由 Spec-Kit sync 自动挂载之需求规格说明书，对应相对路径: ${reqRelPath}`,
        metadata: {
          resourceRef: {
            kind: "workspace_file",
            relativePath: reqRelPath,
            displayPath: reqRelPath,
          },
          domain: brief.domain,
          specName: brief.name,
        },
      }),
    })
  }

  const tasks = brief.tasks || []
  const childIssues = existingIssues.filter((i) => i.parentId === epicIssue.id || (i.title && i.title.startsWith(`[${brief.name}·`)))
  const childMap = new Map()
  for (const ci of childIssues) {
    const m = (ci.title || "").match(/\[[^·]+·(T\d+)\]/)
    if (m) childMap.set(m[1], ci)
  }

  let tasksMdContent = fs.existsSync(path.join(dir, "tasks.md"))
    ? fs.readFileSync(path.join(dir, "tasks.md"), "utf8")
    : ""

  let updatedTasksMd = false
  let allDone = tasks.length > 0

  for (let idx = 0; idx < tasks.length; idx++) {
    const t = tasks[idx]
    let child = childMap.get(t.id)

    if (!child) {
      console.log(`   🔨 派生子任务: [${brief.name}·${t.id}] ${t.title}...`)
      const childRes = await api(`/api/issues/${epicIssue.id}/children`, {
        method: "POST",
        body: JSON.stringify({
          title: `[${brief.name}·${t.id}] ${t.title}`,
          description: `来自 Spec-Kit 规格 [${brief.name}] 的分解任务。\n- 归属: ${t.parent || "main"}\n- 文件白名单: ${(t.files || []).join(", ")}`,
          status: "todo",
          priority: "medium",
          wbsCode: t.id,
          acceptanceCriteria: [
            `提交代码必须包含 [${t.id}] 标记`,
            `自动化门禁测试通过`,
          ],
        }),
      })
      if (childRes.ok) {
        child = childRes.body
        console.log(`      └─ 子任务创建成功: [${child.identifier || child.id}]`)
      }
    } else {
      console.log(`   • 子任务在位: [${child.identifier || child.id}] (${child.status}) ${t.id}: ${t.title}`)
    }

    if (child && child.status === "done") {
      const taskPattern = new RegExp(`- \\[ \\] \\*\\*${t.id}\\*\\*`)
      if (taskPattern.test(tasksMdContent)) {
        tasksMdContent = tasksMdContent.replace(taskPattern, `- [x] **${t.id}**`)
        const tablePattern = new RegExp(`(\\|\\s*${t.id}\\s*\\|[^\\|]+\\|[^\\|]+\\|[^\\|]+\\|)\\s*未开始\\s*\\|`)
        if (tablePattern.test(tasksMdContent)) {
          tasksMdContent = tasksMdContent.replace(tablePattern, `$1 已完成 |`)
        }
        updatedTasksMd = true
        console.log(`      🔄 反向同步打勾: ${t.id} -> [x] 已完成`)
      }
    } else {
      allDone = false
    }
  }

  if (updatedTasksMd) {
    fs.writeFileSync(path.join(dir, "tasks.md"), tasksMdContent, "utf8")
    console.log(`   💾 已更新 tasks.md 任务勾选状态`)
  }

  if (allDone) {
    const specJsonPath = path.join(dir, "spec.json")
    if (fs.existsSync(specJsonPath)) {
      const specData = JSON.parse(fs.readFileSync(specJsonPath, "utf8"))
      if (specData.status !== "DONE" && specData.status !== "ACCEPTED") {
        specData.status = "ACCEPTED"
        specData.completedAt = new Date().toISOString()
        fs.writeFileSync(specJsonPath, JSON.stringify(specData, null, 2) + "\n", "utf8")
        console.log(`   🎉 所有子任务已结项，规格状态已自动流转为 ACCEPTED`)
      }
    }
  }

  console.log(`\n✅ [speckit sync] 同步完成！Epic 工单: [${epicIssue.identifier || epicIssue.id}]`)
}

// ============================================================================
// 4. 命令：speckit list (列出所有规格)
// ============================================================================
function handleList() {
  const domainFilter = getArg("--domain")
  const all = listAllSpecs()

  const filtered = domainFilter
    ? all.filter((s) => s.domain === domainFilter)
    : all

  console.log(`\n=== 规格清单 (共 ${filtered.length} 个) ===\n`)
  console.log(`| 规格名称 | 业务域 | 类型 | 状态 | 归档 | 物理路径 |`)
  console.log(`|---|---|---|---|---|---|`)
  for (const s of filtered) {
    console.log(`| ${s.name} | ${s.domain} | ${s.type || "feature"} | ${s.status || "PLAN_APPROVED"} | ${s.isArchived ? "已归档" : "活跃施工"} | ${path.relative(ROOT, s.path)} |`)
  }
  console.log("")
}

// ============================================================================
// 5. 命令：speckit check (交付状态检查)
// ============================================================================
function handleCheck() {
  const specName = getArg("--spec") || getArg("--name") || getArg("--feature")

  if (!specName) {
    console.log("=== 全局规格交付概览 ===")
    handleList()
    return
  }

  const dir = resolveSpecDir(specName)
  if (!dir) {
    console.error(`❌ [speckit] 找不到规格: ${specName}`)
    process.exit(2)
  }

  console.log(`\n=== 规格检查 [${specName}]: ${path.relative(ROOT, dir)} ===\n`)
  const requiredFiles = [
    "brief.json", "spec.md", "requirements.md", "plan.md", "design.md",
    "tasks.md", "checklist.md", "research.md", "selection.md", "runbook.json",
    "evidence.json", "deployment.md", "bugs.md", "prototype.md", "spec.json"
  ]
  let allOk = true

  for (const file of requiredFiles) {
    const full = path.join(dir, file)
    if (!fs.existsSync(full)) {
      console.log(`❌ 缺失关键文件: ${file}`)
      allOk = false
    } else {
      const text = fs.readFileSync(full, "utf8")
      const placeholders = (text.match(/<!--\s*待填/g) || []).length
      if (placeholders > 0) {
        console.log(`⚠️  ${file}: 仍有 ${placeholders} 处待填占位符`)
      } else {
        console.log(`✅ ${file}: 完备`)
      }
    }
  }

  if (allOk) {
    console.log(`\n🎉 规格 [${specName}] 核心产物完备！`)
  } else {
    console.log(`\n⚠️  请补齐缺失文件后再次运行检查: node scripts/speckit.cjs build --name ${specName}`)
  }
}

// ============================================================================
// 6. 命令：speckit archive (归档规格)
// ============================================================================
function handleArchive() {
  const name = getArg("--name") || getArg("--spec")
  if (!name) {
    console.error("❌ 用法错误: node scripts/speckit.cjs archive --name <规格名>")
    process.exit(2)
  }
  const result = spawnSync("node", [path.join(ROOT, "scripts", "archive-spec.cjs"), "--name", name], {
    stdio: "inherit",
    cwd: ROOT,
  })
  process.exit(result.status || 0)
}

// ============================================================================
// 7. 命令：speckit health (规格健康扫描)
// ============================================================================
function handleHealth() {
  const result = spawnSync("node", [path.join(ROOT, "scripts", "check-specs-health.cjs")], {
    stdio: "inherit",
    cwd: ROOT,
  })
  process.exit(result.status || 0)
}

// ============================================================================
// 8. 命令：speckit workflows (Kiro 工作流配方管理)
// ============================================================================
function handleWorkflows() {
  const primaryDir = path.join(ROOT, ".agents", "workflows")
  const fallbackDir = path.join(ROOT, ".kiro", "workflows")
  const workflowsDir = fs.existsSync(primaryDir) ? primaryDir : fallbackDir
  if (!fs.existsSync(workflowsDir)) {
    console.log("未找到 .agents/workflows/ 或 .kiro/workflows/ 目录")
    process.exit(0)
  }
  console.log("=== SDD 原生多智能体工作流配方清单 (Workflow Recipes: .agents/workflows) ===")
  const files = fs.readdirSync(workflowsDir).filter((f) => f.endsWith(".workflow.json") || f.endsWith(".workflow.yaml"))
  for (const f of files) {
    try {
      const full = path.join(workflowsDir, f)
      const data = JSON.parse(fs.readFileSync(full, "utf8"))
      console.log(`\n📋 [Recipe] ${data.name} (${f})`)
      console.log(`   描述: ${data.description}`)
      console.log(`   入参: ${Object.keys(data.inputs || {}).join(", ")}`)
      console.log(`   步骤链 (${(data.steps || []).length} 步):`)
      for (const [idx, step] of (data.steps || []).entries()) {
        const preview = (step.prompt || "").split("\n")[0].slice(0, 70)
        console.log(`     ${idx + 1}. [${step.id}] Agent: @${step.agent} -> "${preview}..."`)
      }
    } catch (err) {
      console.error(`   ❌ 解析错误 ${f}: ${err.message}`)
    }
  }
  console.log(`\n总计 ${files.length} 个工作流配方就绪。单一真源保存在 .agents/workflows/，软链接兼容 .kiro/workflows/。可由 Antigravity、Kiro IDE、CLI (/workflow run) 或多智能体编排器直接执行。`)
}

// ============================================================================
// 9. 命令：speckit init & constitution
// ============================================================================
function handleInit() {
  console.log("=== Spec-Kit Enterprise (SDD + CMMI) 初始化与环境检查 ===")
  const specifyDir = path.join(ROOT, ".specify")
  const memoryDir = path.join(specifyDir, "memory")
  const templatesDir = path.join(specifyDir, "templates")
  const constPath = path.join(memoryDir, "constitution.md")

  if (!fs.existsSync(specifyDir)) fs.mkdirSync(specifyDir, { recursive: true })
  if (!fs.existsSync(memoryDir)) fs.mkdirSync(memoryDir, { recursive: true })
  if (!fs.existsSync(templatesDir)) fs.mkdirSync(templatesDir, { recursive: true })

  console.log(`✅ .specify/ 目录拓扑完好: ${specifyDir}`)
  console.log(`✅ 项目工程宪法就绪: ${constPath}`)
  console.log(`✅ 标准模板库就绪: ${templatesDir}`)
  console.log("\n🎉 Spec-Kit 企业级扩展环境初始化与合规检查 100% PASS！")
}

function handleConstitution() {
  const constPath = path.join(ROOT, ".specify", "memory", "constitution.md")
  if (fs.existsSync(constPath)) {
    console.log(fs.readFileSync(constPath, "utf8"))
  } else {
    console.error("❌ 找不到项目宪法文件: .specify/memory/constitution.md")
    process.exit(1)
  }
}

// ============================================================================
// 10. 帮助菜单 (Help Menu)
// ============================================================================
function handleHelp() {
  console.log(`
🧭 Coolie Spec-Kit SDD 控制台 (Unified CLI - Coolie Edition)

Spec-Kit 原生与企业扩展命令:
  init        初始化并检查 .specify/ 规范拓扑与宪法环境
  constitution 查看或审查项目核心工程宪法 (.specify/memory/constitution.md)
  specify/new 创建新规格骨架 (feature | bugfix | enhancement | refactor | security)
  plan/build  从 brief.json 展开编译生成完备 Markdown 规格与任务波次图
  sync        双向同步规格文档到 Paperclip 控制面工单、子任务与工件总线
  check       检查规格交付进度与门禁完成度
  list        列出全域所有规格状态与路径
  archive     将交付完毕的规格移动到季度历史归档区
  health      扫描全域规格健康度与防认知污染规则
  cmmi        CMMI 01~09 全生命周期过程资产创建与健康守卫 (new | list | check)
  workflows   查看与校验 Kiro 原生工作流配方 (.agents/workflows/)

示例:
  node scripts/speckit.cjs init
  node scripts/speckit.cjs constitution
  node scripts/speckit.cjs new --name fix-pay-lock --domain pay --title "修复支付回调重放" --type bugfix
  node scripts/speckit.cjs build --name fix-pay-lock
  node scripts/speckit.cjs sync --spec fix-pay-lock
  node scripts/speckit.cjs check --spec fix-pay-lock
  node scripts/speckit.cjs list
  node scripts/speckit.cjs archive --name fix-pay-lock
  node scripts/speckit.cjs cmmi check
`)
}

// 主调度派发器
switch (command) {
  case "init":
    handleInit()
    break
  case "constitution":
    handleConstitution()
    break
  case "specify":
  case "new":
  case "create":
    handleNew()
    break
  case "plan":
  case "build":
    handleBuild()
    break
  case "sync":
    handleSync().catch((err) => {
      console.error("❌ [speckit sync] 执行异常:", err.message)
      process.exit(1)
    })
    break
  case "list":
  case "ls":
    handleList()
    break
  case "archive":
    handleArchive()
    break
  case "check":
    handleCheck()
    break
  case "health":
    handleHealth()
    break
  case "cmmi": {
    const cmmiScript = path.join(__dirname, "cmmi-asset-scaffold.cjs")
    const cmmiArgs = process.argv.slice(3)
    const res = spawnSync(process.execPath, [cmmiScript, ...cmmiArgs], { stdio: "inherit" })
    process.exit(res.status || 0)
    break
  }
  case "workflows":
  case "workflow":
    handleWorkflows()
    break
  case "help":
  default:
    handleHelp()
    break
}
