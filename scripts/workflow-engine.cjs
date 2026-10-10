#!/usr/bin/env node
/**
 * scripts/workflow-engine.cjs
 *
 * SDD & Kiro 原生多智能体工作流执行引擎 (CommonJS 兼容版本，支持容器原生零依赖执行)
 * 适配 Coolie 控制面与数字员工舰队 (Hermes / 墨斗 / 铁匠 / 门神 / 兜底渊 / 百晓生)
 */

const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const PRIMARY_WORKFLOWS_DIR = path.join(ROOT, ".agents", "workflows");
const FALLBACK_WORKFLOWS_DIR = path.join(ROOT, ".kiro", "workflows");

function getWorkflowsDir(projectCode) {
  if (projectCode) {
    const projectDir = path.join(ROOT, "projects", projectCode, ".agents", "workflows");
    if (fs.existsSync(projectDir)) return projectDir;
    const projectKiro = path.join(ROOT, "projects", projectCode, ".kiro", "workflows");
    if (fs.existsSync(projectKiro)) return projectKiro;
  }
  if (fs.existsSync(PRIMARY_WORKFLOWS_DIR)) return PRIMARY_WORKFLOWS_DIR;
  if (fs.existsSync(FALLBACK_WORKFLOWS_DIR)) return FALLBACK_WORKFLOWS_DIR;
  return PRIMARY_WORKFLOWS_DIR;
}

function loadRecipe(recipeName, projectCode) {
  const dir = getWorkflowsDir(projectCode);
  const cleanName = recipeName.replace(/\.workflow\.(json|yaml)$/, "");
  const jsonPath = path.join(dir, `${cleanName}.workflow.json`);
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`找不到工作流配方: ${jsonPath}`);
  }
  const raw = fs.readFileSync(jsonPath, "utf8");
  return { recipe: JSON.parse(raw), filePath: jsonPath };
}

function parseCliArgs() {
  const args = process.argv.slice(2);
  const command = args[0] || "help";
  const flags = {};
  const positional = [];

  let i = 1;
  while (i < args.length) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i += 2;
      } else {
        flags[key] = "true";
        i += 1;
      }
    } else {
      positional.push(arg);
      i += 1;
    }
  }

  return { command, flags, positional };
}

function interpolate(text, vars) {
  let result = text;
  for (const [k, v] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{inputs\\.${k}\\}\\}`, "g"), v);
  }
  return result;
}

function resolveFleetRole(agent) {
  const clean = (agent || "").replace(/^@/, "");
  switch (clean) {
    case "wf-planner":
      return "Hermes / 百晓生 (规划与需求)";
    case "wf-architect":
      return "墨斗 (前线架构师 FDA)";
    case "wf-coder":
      return "铁匠 (平台研发 Core SWE)";
    case "wf-tester":
      return "门神 (真机验收 FDSE)";
    case "wf-reviewer":
    case "wf-security":
      return "兜底渊 (投产守卫 PRE-SRE)";
    default:
      return agent;
  }
}

function handleList(flags) {
  const dir = getWorkflowsDir(flags.project);
  if (!fs.existsSync(dir)) {
    console.log(`❌ 目录不存在: ${dir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".workflow.json") || f.endsWith(".workflow.yaml"));
  console.log(`\n📋 SDD & Coolie 多智能体工作流配方清单 (${dir})`);
  console.log("=".repeat(78));

  for (const file of files) {
    try {
      const full = path.join(dir, file);
      const data = JSON.parse(fs.readFileSync(full, "utf8"));
      console.log(`\n⚡ 配方名称: \x1b[36m${data.name}\x1b[0m (${file})`);
      console.log(`   说明: ${data.description}`);
      const inputKeys = Object.keys(data.inputs || {});
      console.log(`   必需入参: ${inputKeys.length > 0 ? inputKeys.join(", ") : "(无)"}`);
      console.log(`   步骤链:`);
      for (const [idx, step] of (data.steps || []).entries()) {
        const depStr = step.dependsOn && step.dependsOn.length > 0 ? ` [依赖: ${step.dependsOn.join(", ")}]` : "";
        const fleetRole = resolveFleetRole(step.agent);
        console.log(`     ${idx + 1}. [${step.id}] \x1b[33m@${step.agent}\x1b[0m (${fleetRole})${depStr}`);
      }
    } catch (e) {
      console.error(`   ❌ 解析失败 ${file}: ${e.message}`);
    }
  }
  console.log("\n" + "=".repeat(78));
  console.log(`运行 \x1b[32mnpm run workflow:dry-run -- --recipe <name> [args...]\x1b[0m 预览执行拓扑。`);
}

function handleCheck(flags) {
  const dir = getWorkflowsDir(flags.project);
  if (!fs.existsSync(dir)) {
    console.error(`❌ 未找到工作流目录: ${dir}`);
    return false;
  }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".workflow.json") || f.endsWith(".workflow.yaml"));
  console.log(`\n🔍 开始工作流配方静态与依赖门禁扫描 (${files.length} 个配方)...`);

  let hasError = false;

  for (const file of files) {
    const fullPath = path.join(dir, file);
    let recipe;
    try {
      recipe = JSON.parse(fs.readFileSync(fullPath, "utf8"));
    } catch (e) {
      console.error(`❌ [${file}] JSON 语法错误: ${e.message}`);
      hasError = true;
      continue;
    }

    const errors = [];
    if (!recipe.name) errors.push("缺少 name 字段");
    if (!recipe.description) errors.push("缺少 description 字段");
    if (!recipe.inputs || typeof recipe.inputs !== "object") errors.push("缺少合法的 inputs 字段");
    if (!Array.isArray(recipe.steps) || recipe.steps.length === 0) errors.push("缺少 steps 步骤列表或列表为空");

    const stepIdSet = new Set();
    const adj = new Map();

    for (const step of recipe.steps || []) {
      if (!step.id) errors.push("存在未声明 id 的步骤");
      else if (stepIdSet.has(step.id)) errors.push(`步骤 ID 重复: ${step.id}`);
      else stepIdSet.add(step.id);

      if (!step.agent) errors.push(`步骤 ${step.id} 未声明 agent 角色`);
      if (!step.prompt) errors.push(`步骤 ${step.id} 未提供 prompt 指令`);

      adj.set(step.id, step.dependsOn || []);
    }

    for (const step of recipe.steps || []) {
      for (const dep of step.dependsOn || []) {
        if (!stepIdSet.has(dep)) {
          errors.push(`步骤 ${step.id} 依赖了不存在的步骤: ${dep}`);
        }
      }
    }

    const visited = new Map();
    function dfs(u) {
      visited.set(u, 1);
      for (const v of adj.get(u) || []) {
        if (visited.get(v) === 1) {
          errors.push(`检测到循环依赖: ${u} <-> ${v}`);
        } else if (!visited.get(v)) {
          dfs(v);
        }
      }
      visited.set(u, 2);
    }

    for (const id of stepIdSet) {
      if (!visited.get(id)) dfs(id);
    }

    if (errors.length > 0) {
      console.error(`❌ [${file}] 校验不通过:`);
      errors.forEach((e) => console.error(`     - ${e}`));
      hasError = true;
    } else {
      console.log(`✅ [${file}] 校验通过 (Step: ${recipe.steps.length}, Inputs: ${Object.keys(recipe.inputs).length})`);
    }
  }

  if (hasError) {
    console.error(`\n❌ 工作流配方门禁检查失败！请修复上述错误。\n`);
    return false;
  } else {
    console.log(`\n🎉 全部工作流配方静态与 DAG 依赖校验 100% 通过！\n`);
    return true;
  }
}

function handleDryRun(flags, positional) {
  const recipeName = flags.recipe || positional[0];
  if (!recipeName) {
    console.error("❌ 请提供配方名称: npm run workflow:dry-run -- --recipe <name>");
    process.exit(1);
  }

  const { recipe } = loadRecipe(recipeName, flags.project);

  const vars = {
    name: flags.name || "example-spec",
    domain: flags.domain || "system",
    title: flags.title || "示例业务规格",
    type: flags.type || (recipeName === "bugfix" ? "bugfix" : recipeName === "architecture-refactor" ? "refactor" : recipeName === "security-patch" ? "security" : "feature"),
    ...flags,
  };

  console.log(`\n🚀 工作流模拟执行计划: \x1b[36m${recipe.name}\x1b[0m`);
  console.log(`📝 描述: ${recipe.description}`);
  console.log(`🔑 模拟代换变量:`, vars);
  console.log("=".repeat(78));

  console.log("\n📊 [Mermaid DAG 编排图]:\n");
  console.log("```mermaid");
  console.log("flowchart TD");
  for (const step of recipe.steps) {
    const fleetRole = resolveFleetRole(step.agent);
    const nodeLabel = `${step.id}["${step.id}<br/>(@${step.agent}: ${fleetRole})"]`;
    if (!step.dependsOn || step.dependsOn.length === 0) {
      console.log(`    Start((开始)) --> ${nodeLabel}`);
    } else {
      for (const dep of step.dependsOn) {
        console.log(`    ${dep} --> ${nodeLabel}`);
      }
    }
  }
  console.log("```\n");

  console.log("=".repeat(78));
  console.log("📋 步骤展开详情 (Step Execution Details):");
  for (const [idx, step] of recipe.steps.entries()) {
    const depStr = step.dependsOn && step.dependsOn.length > 0 ? ` (前置依赖: ${step.dependsOn.join(", ")})` : " (根起始节点)";
    const promptSub = interpolate(step.prompt, vars);
    const fleetRole = resolveFleetRole(step.agent);
    console.log(`\n--- 步骤 ${idx + 1}: \x1b[32m[${step.id}]\x1b[0m -> 智能体: \x1b[33m@${step.agent}\x1b[0m (${fleetRole})${depStr} ---`);
    console.log(`【Agent 任务指令】:\n${promptSub.trim()}`);
    if (step.gate) {
      console.log(`【卡点门禁】: ${step.gate}`);
    }
  }
  console.log("\n" + "=".repeat(78));
}

function handleRun(flags, positional) {
  const recipeName = flags.recipe || positional[0];
  if (!recipeName) {
    console.error("❌ 请提供配方名称: npm run workflow:run -- --recipe <name> --name <spec> --domain <domain> --title <title>");
    process.exit(1);
  }

  const { recipe } = loadRecipe(recipeName, flags.project);

  const vars = {
    name: flags.name || "",
    domain: flags.domain || "",
    title: flags.title || "",
    type: flags.type || (recipeName === "bugfix" ? "bugfix" : recipeName === "architecture-refactor" ? "refactor" : recipeName === "security-patch" ? "security" : "feature"),
    ...flags,
  };

  for (const [inputKey, def] of Object.entries(recipe.inputs)) {
    const isRequired = typeof def === "object" ? def.required !== false : true;
    if (isRequired && !vars[inputKey]) {
      console.error(`❌ 缺少必需参数: --${inputKey}`);
      process.exit(1);
    }
  }

  const runId = `wf-run-${Date.now()}`;
  console.log(`\n▶️ 开始执行工作流: \x1b[36m${recipe.name}\x1b[0m (Run ID: ${runId})`);
  console.log(`🎯 目标规格: ${vars.domain}/${vars.name} (${vars.title})`);

  const artifactsDir = path.join(ROOT, "docs", "artifacts", "workflow-runs");
  if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir, { recursive: true });
  }

  const runRecord = {
    runId,
    recipe: recipe.name,
    inputs: vars,
    startedAt: new Date().toISOString(),
    status: "running",
    steps: recipe.steps.map((s) => ({
      id: s.id,
      agent: s.agent,
      status: "pending",
    })),
  };

  const firstStep = recipe.steps[0];
  if (firstStep && (firstStep.id === "scaffold" || firstStep.prompt.includes("spec:new") || firstStep.prompt.includes("speckit"))) {
    console.log(`\n⚡ [自动执行第 1 步: 脚手架生成] -> @${firstStep.agent} (${resolveFleetRole(firstStep.agent)})`);
    const cmd = `node scripts/speckit.cjs new --name ${vars.name} --domain ${vars.domain} --title "${vars.title}" --type ${vars.type}`;
    console.log(`$ ${cmd}`);
    try {
      execSync(cmd, { cwd: ROOT, stdio: "inherit" });
      runRecord.steps[0].status = "completed";
      runRecord.steps[0].completedAt = new Date().toISOString();
      console.log(`✅ 步骤 [${firstStep.id}] 自动化执行成功！`);
    } catch (e) {
      runRecord.steps[0].status = "failed";
      runRecord.steps[0].error = e.message;
      runRecord.status = "failed";
      console.error(`❌ 步骤 [${firstStep.id}] 执行失败: ${e.message}`);
    }
  }

  const runFile = path.join(artifactsDir, `${recipe.name}-${runId}.json`);
  fs.writeFileSync(runFile, JSON.stringify(runRecord, null, 2) + "\n", "utf8");
  console.log(`\n📁 工作流运行状态已落盘: ${path.relative(ROOT, runFile)}`);

  console.log(`\n🤖 【后续步骤已装载至多智能体调度总线】`);
  console.log(`   请由对应角色数字员工接棒执行：`);
  for (let i = 1; i < recipe.steps.length; i++) {
    const s = recipe.steps[i];
    const fleetRole = resolveFleetRole(s.agent);
    console.log(`   - 步骤 ${i + 1} [${s.id}]: 由 \x1b[33m@${s.agent}\x1b[0m (${fleetRole}) 驱动`);
  }
  console.log(`\n可运行 \x1b[32mnode scripts/speckit.cjs check --spec ${vars.name}\x1b[0m 实时监控规格完成度。\n`);
}

function handleNew(flags, positional) {
  const name = flags.name || positional[0];
  if (!name) {
    console.error("❌ 请指定新工作流名称: npm run workflow:new -- --name <name> --description <desc>");
    process.exit(1);
  }

  const cleanName = name.replace(/\.workflow\.(json|yaml)$/, "");
  const targetDir = getWorkflowsDir(flags.project);
  const targetFile = path.join(targetDir, `${cleanName}.workflow.json`);

  if (fs.existsSync(targetFile)) {
    console.error(`❌ 工作流配方已存在: ${targetFile}`);
    process.exit(1);
  }

  const template = {
    name: cleanName,
    description: flags.description || `${cleanName} multi-agent workflow recipe`,
    inputs: {
      name: {
        description: "Target specification or task name",
        type: "string",
        required: true,
      },
      domain: {
        description: "Target domain name",
        type: "string",
        required: true,
      },
      title: {
        description: "Human-readable title",
        type: "string",
        required: true,
      },
    },
    steps: [
      {
        id: "plan",
        agent: "wf-planner",
        prompt: "Analyze the task requirement for '{{inputs.name}}' in domain '{{inputs.domain}}'.",
      },
      {
        id: "design",
        agent: "wf-architect",
        dependsOn: ["plan"],
        prompt: "Formulate architectural design and technical specifications.",
      },
      {
        id: "implement",
        agent: "wf-coder",
        dependsOn: ["design"],
        prompt: "Implement code changes with unit test coverage.",
      },
      {
        id: "verify",
        agent: "wf-tester",
        dependsOn: ["implement"],
        prompt: "Verify implementation against quality gates: `npm run check`.",
      },
    ],
  };

  fs.writeFileSync(targetFile, JSON.stringify(template, null, 2) + "\n", "utf8");
  console.log(`✅ 成功生成工作流配方: \x1b[32m${path.relative(ROOT, targetFile)}\x1b[0m`);
  console.log(`运行 \x1b[36mnpm run workflow:check\x1b[0m 校验语法。`);
}

// ----------------------------------------------------------------------------
// 命令：advance / step (基于门禁因果推进流程，同步项目本地文档并联动 Coolie 任务)
// ----------------------------------------------------------------------------
async function handleAdvance(flags, positional) {
  const recipeName = flags.recipe || "cmmi-full-lifecycle";
  const { recipe } = loadRecipe(recipeName, flags.project);

  const completedGate = flags.gate;
  const requestedStep = flags.step || positional[0];

  let targetStep = null;
  let prevStep = null;

  if (completedGate) {
    const completedIdx = recipe.steps.findIndex((s) => s.gate === completedGate);
    if (completedIdx !== -1) {
      prevStep = recipe.steps[completedIdx];
      targetStep = recipe.steps[completedIdx + 1] || null;
    }
  } else if (requestedStep) {
    const idx = recipe.steps.findIndex((s) => s.id === requestedStep);
    if (idx !== -1) {
      targetStep = recipe.steps[idx];
      prevStep = idx > 0 ? recipe.steps[idx - 1] : null;
    }
  } else {
    targetStep = recipe.steps[0];
  }

  if (!targetStep) {
    console.log(`\n🎉 工作流 [${recipe.name}] 所有步骤已全部完成，无需推进！`);
    return;
  }

  console.log(`\n🚀 【工作流阶段因果推进】-> 目标步骤: \x1b[36m[${targetStep.id}]\x1b[0m (所属配方: ${recipe.name})`);

  // 1. 同步项目本地工程目录文档 (Doc as Code / Spec-First)
  let docRelPath = targetStep.doc;
  if (docRelPath) {
    const projectDir = flags.projectCode ? path.join(ROOT, "projects", flags.projectCode) : ROOT;
    const absDocPath = path.join(projectDir, docRelPath);
    if (!fs.existsSync(absDocPath)) {
      fs.mkdirSync(path.dirname(absDocPath), { recursive: true });
      const initialContent = `# ${targetStep.prompt.split("。")[0] || targetStep.id}\n\n- **阶段**: ${targetStep.id}\n- **门禁**: ${targetStep.gate || "N/A"}\n- **创建日期**: ${new Date().toISOString().split("T")[0]}\n\n## 1. 阶段目标\n<!-- 由负责工匠补充 -->\n`;
      fs.writeFileSync(absDocPath, initialContent, "utf8");
      console.log(`📄 [项目文档同步] 本地模板已就绪: \x1b[32m${path.relative(ROOT, absDocPath)}\x1b[0m`);
    } else {
      console.log(`📄 [项目文档校验] 本地工件已存在: \x1b[32m${path.relative(ROOT, absDocPath)}\x1b[0m`);
    }
  }

  // 2. 联动 Coolie 控制面因果创建任务 (Just-in-Time Control Plane Issue)
  let coolieSyncInfo = null;
  if (flags.company && flags.project && completedGate) {
    try {
      const apiUrl = `http://localhost:3100/api/companies/${flags.company}/projects/${flags.project}/stage/advance`;
      const resp = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completedGate }),
      });
      if (resp.ok) {
        coolieSyncInfo = await resp.json();
        console.log(`🎯 [控制面同步] 已自动激活 Coolie 任务 (Count: ${coolieSyncInfo.count}, Status: ${coolieSyncInfo.status})`);
      } else {
        const errText = await resp.text();
        console.warn(`⚠️ [控制面同步提示] 接口返回 ${resp.status}: ${errText}`);
      }
    } catch (e) {
      console.warn(`⚠️ [控制面同步跳过] 无法连接本地控制面 (http://localhost:3100): ${e.message}`);
    }
  }

  // 3. 输出 8 要素派单简报 (让数字员工进场即知下一步)
  const fleetRole = resolveFleetRole(targetStep.agent);
  console.log("\n" + "═".repeat(78));
  console.log(`🎯 【Coolie 工坊 CMMI 阶段推进简报 (8 要素标准派单卡)】`);
  console.log("═".repeat(78));
  console.log(`1. [当前阶段]: ${targetStep.id} (${targetStep.gate ? "门禁: " + targetStep.gate : "无门禁限制"})`);
  console.log(`2. [主责工匠]: \x1b[33m@${targetStep.agent}\x1b[0m -> ${fleetRole}`);
  console.log(`3. [前置依赖]: ${targetStep.dependsOn ? targetStep.dependsOn.join(", ") : "无 (起始节点)"}`);
  console.log(`4. [前序工件]: ${prevStep && prevStep.doc ? prevStep.doc + " (可读)" : "立项章程 / 原始需求"}`);
  console.log(`5. [本次工件]: \x1b[32m${docRelPath || "见控制面工作产物"}\x1b[0m`);
  console.log(`6. [控制面状态]: ${coolieSyncInfo ? `已激活 (生成任务 ${coolieSyncInfo.count} 项)` : "本地脱机/未指定 project"}`);
  console.log(`7. [作业指令]:\n   ${targetStep.prompt}`);
  console.log(`8. [结项准则]: No Artifact, No Done! 严格按 CMMI 规范提交物理资产与机器证据。`);
  console.log("═".repeat(78) + "\n");
}

function handleHelp() {
  console.log(`
⚡ SDD 多智能体工作流执行引擎 (Workflow Engine CLI)

命令列表:
  list       列出全量可用工作流配方清单
  check      静态语法、必填项与 DAG 依赖无环性门禁扫描
  dry-run    参数模拟展开、渲染 Mermaid 编排图与 Agent 执行指令
  run        真实驱动工作流执行（自动脚手架 + 步骤分发 + 记录落盘）
  advance    因果推进工作流步骤（自动同步项目本地文档 + 联动 Coolie 创建任务 + 打印 8 要素简报）
  new        创建新的工作流配方模板 (.agents/workflows/)

示例用法:
  npm run workflow:list
  npm run workflow:check
  npm run workflow:dry-run -- --recipe cmmi-full-lifecycle --name mall --domain mall --title "商城主线"
  npm run workflow:advance -- --recipe cmmi-full-lifecycle --gate gate_g1_spec --company <id> --project <id>
  npm run workflow:run -- --recipe bugfix --name fix-pay-lock --domain pay --title "修复支付回调死锁"
  npm run workflow:new -- --name db-migration --description "数据库平滑迁移编排"
`);
}

async function main() {
  const { command, flags, positional } = parseCliArgs();

  switch (command) {
    case "list":
    case "ls":
      handleList(flags);
      break;
    case "check":
    case "lint":
    case "validate": {
      const ok = handleCheck(flags);
      process.exit(ok ? 0 : 1);
      break;
    }
    case "dry-run":
    case "plan":
      handleDryRun(flags, positional);
      break;
    case "run":
    case "exec":
      handleRun(flags, positional);
      break;
    case "advance":
    case "step":
      await handleAdvance(flags, positional);
      break;
    case "new":
    case "create":
      handleNew(flags, positional);
      break;
    case "help":
    default:
      handleHelp();
      break;
  }
}

main();
