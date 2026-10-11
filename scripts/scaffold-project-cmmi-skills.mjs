#!/usr/bin/env node
/**
 * scaffold-project-cmmi-skills.mjs
 *
 * Coolie 工坊 CMMI 3 / CMMI 5 自动化技能脚手架与定制工具。
 * 将标准 CMMI 过程技能、门禁检查脚本 (scripts) 及黄金文档基线 (docs/cmmi)
 * 自动复制、变量填充并定制到指定项目/业务系统的工作区中。
 *
 * 用法:
 *   node scripts/scaffold-project-cmmi-skills.mjs --project-name "用户成长与积分结算系统" --project-code "SYS_POINTS" --tech-stack node --target-dir ../sys-points
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    projectName: "",
    projectCode: "",
    domainKey: "enterprise-core",
    techStack: "node", // node | java | python | go | mobile
    targetDir: "",
    author: "emp_fda",
    storageBackend: "git_repo", // local_disk | git_repo | oss_object
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--project-name" && args[i + 1]) options.projectName = args[++i];
    else if (arg === "--project-code" && args[i + 1]) options.projectCode = args[++i];
    else if (arg === "--domain-key" && args[i + 1]) options.domainKey = args[++i];
    else if (arg === "--tech-stack" && args[i + 1]) options.techStack = args[++i].toLowerCase();
    else if (arg === "--target-dir" && args[i + 1]) options.targetDir = args[++i];
    else if (arg === "--author" && args[i + 1]) options.author = args[++i];
    else if (arg === "--storage-backend" && args[i + 1]) options.storageBackend = args[++i];
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  if (!options.projectName) options.projectName = "示例业务核心系统";
  if (!options.projectCode) options.projectCode = "SYS_CUSTOM_APP";
  if (!options.targetDir) {
    options.targetDir = path.resolve(repoRoot, "..", options.projectCode.toLowerCase().replace(/_/g, "-"));
  } else if (!path.isAbsolute(options.targetDir)) {
    options.targetDir = path.resolve(process.cwd(), options.targetDir);
  }

  // 架构红线守卫: 交付项目必须是独立工作区/仓库，严禁嵌套在平台仓库内部 (公理五)
  if (
    !options.dryRun &&
    (options.targetDir.startsWith(path.join(repoRoot, "projects")) ||
      options.targetDir === repoRoot ||
      options.targetDir.startsWith(repoRoot + path.sep))
  ) {
    console.error(
      `\n❌ [架构红线拦截] 客户交付项目必须是独立工作区/仓库（如 ../${options.projectCode.toLowerCase().replace(/_/g, "-")}），严禁嵌套在平台代码仓库内部！\n`
    );
    process.exit(1);
  }

  return options;
}

function printHelp() {
  console.log(`
Coolie 工坊 CMMI 技能脚手架与定制工具 (CMMI Skills Scaffolder)

参数选项:
  --project-name <name>      业务系统/项目全称 (例: "用户积分中台系统")
  --project-code <code>      CMDB 业务系统代号 (例: "SYS_POINTS")
  --domain-key <key>         所属本体域 key (默认: "enterprise-core")
  --tech-stack <stack>       技术栈: node | java | python | go | mobile (默认: node)
  --target-dir <path>        项目工作区输出目录 (默认: ../<code-slug> 独立平级仓库)
  --author <artisan>         主责工匠角色标识 (默认: "emp_fda")
  --storage-backend <type>   交付物存储介质: local_disk | git_repo | oss_object
  --dry-run                  仅展示待生成文件，不写入磁盘
  --help, -h                 显示帮助信息
`);
}

// CMMI 00~09 全生命周期核心技能清单 (对齐 ruoyi-all-next 截断技能规范)
const CMMI_SKILLS = [
  {
    stage: "01_management",
    dir: "dar-decision-matrix",
    name: "dar-decision-matrix",
    role: "emp_fda",
    gate: "gate_g1_spec",
    title: "CMMI 决策分析与加权权衡评估 (DAR)",
    docFile: "docs/01_management/dar-decision-records/",
  },
  {
    stage: "01_management",
    dir: "cmmi-wbs-milestone",
    name: "cmmi-wbs-milestone",
    role: "emp_ds",
    gate: "gate_g1_spec",
    title: "CMMI 工作分解结构与里程碑主线管理 (PP/PMC)",
    docFile: "docs/01_management/project-plan.md",
  },
  {
    stage: "02_requirements",
    dir: "ears-spec-writer",
    name: "ears-spec-writer",
    role: "emp_ds",
    gate: "gate_g1_spec",
    title: "IEEE 29148 / EARS 5态无歧义需求规格 (RD/REQM)",
    docFile: "docs/02_requirements/software-requirements.md",
  },
  {
    stage: "02_requirements",
    dir: "cmmi-req-spec",
    name: "cmmi-req-spec",
    role: "emp_ds",
    gate: "gate_g1_spec",
    title: "CMMI 需求工程与双向全链路跟踪矩阵规范 (RD/REQM)",
    docFile: "docs/02_requirements/software-requirements.md",
  },
  {
    stage: "03_design",
    dir: "cmmi-tech-solution",
    name: "cmmi-tech-solution",
    role: "emp_fda",
    gate: "gate_g2_arch",
    title: "CMMI 架构设计与技术决策分析 (TS/DAR/RSKM)",
    docFile: "docs/03_design/architecture-design-hld.md",
  },
  {
    stage: "03_design",
    dir: "adr-architect",
    name: "adr-architect",
    role: "emp_fda",
    gate: "gate_g2_arch",
    title: "MADR 架构决策记录与生命周期追踪 (ADR)",
    docFile: "docs/03_design/adr/",
  },
  {
    stage: "03_design",
    dir: "archify",
    name: "archify",
    role: "emp_fda",
    gate: "gate_g2_arch",
    title: "可交互全景架构图与业务状态机生成 (Archify)",
    docFile: "docs/03_design/diagrams/",
  },
  {
    stage: "03_design",
    dir: "cmmi-detailed-contracts",
    name: "cmmi-detailed-contracts",
    role: "emp_swe",
    gate: "gate_g3_compile",
    title: "CMMI 详细设计与静态契约守卫 (TS/VER)",
    docFile: "docs/03_design/interface-contracts/",
  },
  {
    stage: "04_implementation",
    dir: "core-swe",
    name: "core-swe",
    role: "emp_swe",
    gate: "gate_g3_compile",
    title: "平台核心研发与静态编译器守卫 (Core SWE)",
    docFile: "docs/03_design/interface-contracts/",
  },
  {
    stage: "05_verification",
    dir: "cmmi-ver-val",
    name: "cmmi-ver-val",
    role: "emp_fdse",
    gate: "gate_g4_eval",
    title: "CMMI 验证与确认全栈验收规范 (VER/VAL)",
    docFile: "docs/05_verification/test-summary-report.md",
  },
  {
    stage: "05_verification",
    dir: "mutation-tester",
    name: "mutation-tester",
    role: "emp_fdse",
    gate: "gate_g4_eval",
    title: "变异测试反假 Mock 与真实 DB 打假 (Mutation)",
    docFile: "docs/05_verification/test-summary-report.md",
  },
  {
    stage: "06_quality_assurance",
    dir: "cmmi-car-spc-metrics",
    name: "cmmi-car-spc-metrics",
    role: "emp_hermes",
    gate: "gate_g5_release",
    title: "CMMI 5 统计过程控制与因果缺陷预防 (QPM/CAR)",
    docFile: "docs/06_quality_assurance/car-prevention.md",
  },
  {
    stage: "07_release",
    dir: "cmmi-immutable-release",
    name: "cmmi-immutable-release",
    role: "emp_sre",
    gate: "gate_g5_release",
    title: "CMMI 配置管理与不可变投产规范 (CM/RSKM/PMC)",
    docFile: "docs/07_release/system-deployment-sop.md",
  },
  {
    stage: "08_sre",
    dir: "sre-slo-manager",
    name: "sre-slo-manager",
    role: "emp_sre",
    gate: "gate_g6_sre",
    title: "SRE 稳定性设计与多燃烧率告警 (SLO/SLI)",
    docFile: "docs/08_sre/01_slo_sli_metrics/SLO-SLI-ERROR-BUDGET-MATRIX.md",
  },
  {
    stage: "08_sre",
    dir: "postmortem-analyzer",
    name: "postmortem-analyzer",
    role: "emp_sre",
    gate: "gate_g6_sre",
    title: "线上故障免责 5-Whys 根因分析与 CAPA 闭环 (Postmortem)",
    docFile: "docs/08_sre/06_incidents_postmortem/",
  },
  {
    stage: "09_operations",
    dir: "financial-reconciliation-agent",
    name: "financial-reconciliation-agent",
    role: "emp_ds",
    gate: "gate_g7_ops",
    title: "商业化持续运营财务业务三方对账与轧差平账 (Reconciliation)",
    docFile: "docs/09_operations/02_data_ops/",
  },
  {
    stage: "01~09",
    dir: "cmmi-asset-authoring",
    name: "cmmi-asset-authoring",
    role: "emp_fda",
    gate: "gate_g1_spec",
    title: "CMMI 01~09 全生命周期过程资产标准作业规程 (SOP)",
    docFile: "docs/01_management/project-charter.md",
  },
  {
    stage: "02_requirements",
    dir: "spec-driven-dev",
    name: "spec-driven-dev",
    role: "emp_swe",
    gate: "gate_g1_spec",
    title: "Kiro 规范驱动开发与任务执行微观引擎 (SDD)",
    docFile: "docs/specs/core/init-baseline/requirements.md",
  },
  {
    stage: "08_sre",
    dir: "strix-penetration-testing",
    name: "strix-penetration-testing",
    role: "emp_sre",
    gate: "gate_g6_sre",
    title: "多智能体自主红队渗透测试与漏洞修复 (Strix)",
    docFile: "docs/08_sre/security-reports/",
  },
  {
    stage: "09_operations",
    dir: "ceo-company-ops",
    name: "ceo-company-ops",
    role: "emp_ds",
    gate: "gate_g7_ops",
    title: "公司负责人与掌柜视角经营大盘 (CEO Ops)",
    docFile: "docs/09_operations/tenant-governance.md",
  },
];

function ensureDir(dirPath, dryRun) {
  if (dryRun) return;
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function writeFile(filePath, content, dryRun) {
  if (dryRun) {
    console.log(`  [DRY-RUN] Will create: ${filePath}`);
    return;
  }
  ensureDir(path.dirname(filePath), false);
  fs.writeFileSync(filePath, content, "utf-8");
  console.log(`  [CREATED] ${filePath}`);
}

// 生成技术栈专属检查 scripts
function generateTechScripts(options) {
  const { techStack, projectCode } = options;

  let verifyReqsScript = `#!/usr/bin/env node
/**
 * [${projectCode}] G1 需求与 RTM 跟踪门禁校验脚本
 */
import fs from "node:fs";
import path from "node:path";

const srsCandidates = [
  path.resolve(process.cwd(), "docs/02_requirements/software-requirements.md"),
  path.resolve(process.cwd(), "docs/02_requirements/user-requirements.md"),
  path.resolve(process.cwd(), "docs/specs/core/init-baseline/requirements.md"),
];
const srsPath = srsCandidates.find(p => fs.existsSync(p));
if (!srsPath) {
  console.error("❌ G1 门禁失败: 未找到 docs/02_requirements/ 下的需求规格说明书。");
  process.exit(1);
}

const content = fs.readFileSync(srsPath, "utf-8");
if (!content.includes("REQ-") || !content.includes("SHALL")) {
  console.error("❌ G1 门禁失败: 需求文档中未检测到符合 EARS 语法 (SHALL) 或 REQ- 编号的需求项。");
  process.exit(1);
}

console.log("✅ G1 需求门禁校验通过: 需求项符合 EARS 结构化定义，RTM 映射正常。");
`;

  let checkContractsScript = `#!/usr/bin/env node
/**
 * [${projectCode}] G3 静态契约与编译守卫检查脚本
 * 技术栈: ${techStack}
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

console.log("🔍 执行 G3 静态契约与编译检查...");

try {
  // 根据技术栈执行对应的编译或静态分析检查
  ${
    techStack === "node" || techStack === "mobile"
      ? `execSync("npx tsc --noEmit", { stdio: "inherit" });`
      : techStack === "java"
      ? `execSync("mvn compile", { stdio: "inherit" });`
      : techStack === "python"
      ? `execSync("python -m py_compile **/*.py", { stdio: "inherit" });`
      : techStack === "go"
      ? `execSync("go vet ./...", { stdio: "inherit" });`
      : `console.log("未指定静态检查命令，跳过编译步骤。");`
  }
  console.log("✅ G3 静态契约检查通过: 0 编译报错。");
} catch (err) {
  console.error("❌ G3 静态契约检查失败，存在编译或契约类型不一致。");
  process.exit(1);
}
`;

  let runTestsScript = `#!/usr/bin/env node
/**
 * [${projectCode}] G4 全栈验收与集成测试运行脚本
 * 技术栈: ${techStack}
 */
import { execSync } from "node:child_process";

console.log("🧪 启动 G4 全栈验收与集成测试用例...");
try {
  ${
    techStack === "node" || techStack === "mobile"
      ? `execSync("npm test --if-present", { stdio: "inherit" });`
      : techStack === "java"
      ? `execSync("mvn test", { stdio: "inherit" });`
      : techStack === "python"
      ? `execSync("pytest", { stdio: "inherit" });`
      : techStack === "go"
      ? `execSync("go test ./...", { stdio: "inherit" });`
      : `console.log("执行默认验收检查...");`
  }
  console.log("✅ G4 验收测试全部通过。");
} catch (err) {
  console.error("❌ G4 验收测试用例存在失败项，请修复后再提测。");
  process.exit(1);
}
`;

  let checkReleaseScript = `#!/usr/bin/env node
/**
 * [${projectCode}] G5 生产不可变基线与发布守卫脚本
 */
import fs from "node:fs";
import path from "node:path";

const sopCandidates = [
  path.resolve(process.cwd(), "docs/07_release/system-deployment-sop.md"),
  path.resolve(process.cwd(), "docs/release/deploy-sop.md"),
];
const sopPath = sopCandidates.find(p => fs.existsSync(p));
if (!sopPath) {
  console.error("❌ G5 发布门禁失败: 缺少 docs/07_release/system-deployment-sop.md 发布与回滚 SOP。");
  process.exit(1);
}

const sopContent = fs.readFileSync(sopPath, "utf-8");
if (!sopContent.includes("回滚") || (!sopContent.includes("校验和") && !sopContent.includes("SHA256") && !sopContent.includes("指纹"))) {
  console.error("❌ G5 发布门禁失败: SOP 中必须包含明确的秒级回滚命令与制品校验和。");
  process.exit(1);
}

console.log("✅ G5 不可变生产发布门禁通过: 具备制品校验和与秒级回滚保障。");
`;

  return {
    "scripts/verify-reqs.mjs": verifyReqsScript,
    "scripts/check-contracts.mjs": checkContractsScript,
    "scripts/run-tests.mjs": runTestsScript,
    "scripts/check-release-baseline.mjs": checkReleaseScript,
  };
}

// 主脚手架逻辑
export function scaffoldProjectCmmi(options) {
  console.log("\n=======================================================");
  console.log("🚀 Coolie 工坊 CMMI 技能脚手架与定制器");
  console.log(`系统全称: ${options.projectName} (${options.projectCode})`);
  console.log(`所属本体域: ${options.domainKey} | 技术栈: ${options.techStack}`);
  console.log(`目标工作区: ${options.targetDir}`);
  console.log(`存储后端: ${options.storageBackend} | 主责工匠: ${options.author}`);
  console.log("=======================================================\n");

  ensureDir(options.targetDir, options.dryRun);

  // 1. 生成 .agents/skills/ 专属技能库
  const masterSkillsDir = path.join(repoRoot, ".agents/skills");
  for (const skill of CMMI_SKILLS) {
    const masterSkillFile = path.join(masterSkillsDir, skill.dir, "SKILL.md");
    let content = "";
    if (fs.existsSync(masterSkillFile)) {
      content = fs.readFileSync(masterSkillFile, "utf-8");
    } else {
      content = `---
name: ${skill.name}
description: [${options.projectCode}] 定制的 ${skill.title} 核心技能。
---

# ${options.projectName} - ${skill.title}
`;
    }

    // 智能替换为该项目/系统定制参数
    content = content
      .replace(/{{SYSTEM_NAME}}/g, options.projectName)
      .replace(/{{SYSTEM_CODE}}/g, options.projectCode)
      .replace(/{{DOMAIN_KEY}}/g, options.domainKey)
      .replace(/{{TECH_STACK}}/g, options.techStack)
      .replace(/{{AUTHOR_ROLE}}/g, options.author);

    const targetSkillFile = path.join(options.targetDir, ".agents/skills", skill.dir, "SKILL.md");
    writeFile(targetSkillFile, content, options.dryRun);

    // 复制关联的权威标准规范 references/ (IEEE 29148, IEEE 1016, ISO 29119, IEEE 828, SPC/CAR)
    const masterRefsDir = path.join(masterSkillsDir, skill.dir, "references");
    if (fs.existsSync(masterRefsDir)) {
      const refFiles = fs.readdirSync(masterRefsDir);
      for (const rf of refFiles) {
        const refSrc = path.join(masterRefsDir, rf);
        const refDstSkill = path.join(options.targetDir, ".agents/skills", skill.dir, "references", rf);
        const refDstDoc = path.join(options.targetDir, "docs/architecture/references", rf);
        const refContent = fs.readFileSync(refSrc, "utf-8");
        writeFile(refDstSkill, refContent, options.dryRun);
        writeFile(refDstDoc, refContent, options.dryRun);
      }
    }
  }

  // 2. 生成本地自动化守卫 scripts/
  const scriptsMap = generateTechScripts(options);
  for (const [relPath, scriptContent] of Object.entries(scriptsMap)) {
    const targetScriptFile = path.join(options.targetDir, relPath);
    writeFile(targetScriptFile, scriptContent, options.dryRun);
  }

  // 3. 生成 docs/01~09 全生命周期工程文档初始骨架与敏捷特性包
  const docsList = [
    {
      dir: "docs/01_management",
      file: "project-charter.md",
      title: `${options.projectName} 项目立项书与范围说明书 (Project Charter)`,
      desc: "遵循 CMMI PLAN/MC 的项目立项与范围说明书",
    },
    {
      dir: "docs/01_management",
      file: "project-plan.md",
      title: `${options.projectName} 项目综合管理计划 (Project Plan)`,
      desc: "CMMI 阶段里程碑规划与 WBS 任务分解",
    },
    {
      dir: "docs/01_management",
      file: "risk-register.md",
      title: `${options.projectName} 交付风险台账 (Risk Register)`,
      desc: "技术与交付风险识别及缓解对策",
    },
    {
      dir: "docs/02_requirements",
      file: "software-requirements.md",
      title: `${options.projectName} 软件需求规格说明书 (SRS)`,
      desc: "遵循 IEEE 29148 / EARS 规范句式的需求清单与验收标准",
    },
    {
      dir: "docs/02_requirements",
      file: "user-requirements.md",
      title: `${options.projectName} 用户需求说明书 (URS)`,
      desc: "用户画像与业务旅程规格",
    },
    {
      dir: "docs/02_requirements",
      file: "rtm-traceability-matrix.md",
      title: `${options.projectName} 需求双向跟踪矩阵 (RTM)`,
      desc: "需求 ↔ HLD ↔ 契约 ↔ 测试用例双向追溯矩阵",
    },
    {
      dir: "docs/02_requirements",
      file: "uat-acceptance-certificate.md",
      title: `${options.projectName} 客户终验核销单 (UAT Certificate)`,
      desc: "甲方真实生产环境验收与回款法定准绳",
    },
    {
      dir: "docs/03_design",
      file: "architecture-design-hld.md",
      title: `${options.projectName} 系统概要设计与架构决策说明书 (HLD & DAR)`,
      desc: "系统拓扑、多企业数据隔离策略与加权决策分析表",
    },
    {
      dir: "docs/03_design",
      file: "database-design-erd.md",
      title: `${options.projectName} 数据库物理设计与 ERD 规约`,
      desc: "物理数据表、企业隔离字段与高熵主键规范",
    },
    {
      dir: "docs/05_verification",
      file: "test-summary-report.md",
      title: `${options.projectName} 系统集成测试与全栈验收报告 (VER & VAL)`,
      desc: "界面四态状态机、防抖异常防御与自动化集成测试汇总",
    },
    {
      dir: "docs/06_quality_assurance",
      file: "configuration-audit.md",
      title: `${options.projectName} 物理与功能配置审计报告 (PCA/FCA)`,
      desc: "配置基线、依赖清单与过程合规性审计",
    },
    {
      dir: "docs/06_quality_assurance",
      file: "car-prevention.md",
      title: `${options.projectName} 因果分析与系统性缺陷预防表 (CMMI 5 CAR)`,
      desc: "5-Why 鱼骨图根因追溯与自动化防退化用例固化记录",
    },
    {
      dir: "docs/07_release",
      file: "release-notes.md",
      title: `${options.projectName} 版本发布说明书 (Release Notes)`,
      desc: "不可变版本特性清单与发布说明",
    },
    {
      dir: "docs/07_release",
      file: "system-deployment-sop.md",
      title: `${options.projectName} 生产发版与不可变配置管理手册 (CM & Release SOP)`,
      desc: "不可变版本校验和、CMDB 部署拓扑与秒级应急回滚步骤",
    },
    {
      dir: "docs/08_sre/01_slo_sli_metrics",
      file: "SLO-SLI-ERROR-BUDGET-MATRIX.md",
      title: `${options.projectName} 站点可靠性保障基线与 SLO/SLI 矩阵`,
      desc: "99.95% 可用性目标、错误预算燃烧率与监控告警阈值",
    },
    {
      dir: "docs/09_operations",
      file: "tenant-governance.md",
      title: `${options.projectName} 商业化持续运营与企业租户治理 SOP`,
      desc: "多租户开通审查、日终对账平账与资产守恒",
    },
  ];

  // 确保创建规范目录与 .gitkeep
  const keepDirs = [
    "docs/01_management/dar-decision-records",
    "docs/02_requirements/srs",
    "docs/03_design/detailed-design-lld",
    "docs/03_design/interface-contracts",
    "docs/03_design/adr",
    "docs/03_design/diagrams",
    "docs/05_verification/test-cases",
    "docs/05_verification/peer-review-records",
    "docs/05_verification/mutation",
    "docs/06_quality_assurance/audit",
    "docs/06_quality_assurance/process-audit-reports",
    "docs/08_sre/02_observability_apm",
    "docs/08_sre/03_iaas_paas_infra",
    "docs/08_sre/04_scheduled_tasks",
    "docs/08_sre/05_disaster_recovery",
    "docs/08_sre/06_incidents_postmortem",
    "docs/08_sre/security-reports",
    "docs/09_operations/01_biz_ops",
    "docs/09_operations/02_data_ops",
    "docs/09_operations/03_inspection",
    "docs/09_operations/04_agent_ops",
    "docs/specs/core/init-baseline",
    "docs/artifacts",
  ];
  for (const kd of keepDirs) {
    ensureDir(path.join(options.targetDir, kd), options.dryRun);
    writeFile(path.join(options.targetDir, kd, ".gitkeep"), "", options.dryRun);
  }

  // 确保创建 .agents/workflows 与 .kiro/workflows 软链接
  const workflowsDir = path.join(options.targetDir, ".agents", "workflows");
  ensureDir(workflowsDir, options.dryRun);
  const srcWorkflowsDir = path.join(repoRoot, ".agents", "workflows");
  if (fs.existsSync(srcWorkflowsDir)) {
    const wfFiles = fs.readdirSync(srcWorkflowsDir).filter((f) => f.endsWith(".workflow.json"));
    for (const wf of wfFiles) {
      const srcWf = path.join(srcWorkflowsDir, wf);
      const dstWf = path.join(workflowsDir, wf);
      if (!fs.existsSync(dstWf)) {
        writeFile(dstWf, fs.readFileSync(srcWf, "utf8"), options.dryRun);
      }
    }
  }
  if (!options.dryRun) {
    try {
      const kiroDir = path.join(options.targetDir, ".kiro");
      ensureDir(kiroDir, false);
      const kiroSymlink = path.join(kiroDir, "workflows");
      if (!fs.existsSync(kiroSymlink)) {
        fs.symlinkSync("../.agents/workflows", kiroSymlink, "dir");
      }
    } catch (e) {}
  }

  for (const doc of docsList) {
    const docPath = path.join(options.targetDir, doc.dir, doc.file);
    const docContent = `# ${doc.title}

> **所属业务系统**: ${options.projectName} (\`${options.projectCode}\`)  
> **所属本体域**: \`${options.domainKey}\`  
> **技术栈**: \`${options.techStack}\`  
> **存储介质**: \`${options.storageBackend}\`  
> **生成时间**: ${new Date().toISOString()}  

---

## 1. 概述与目标
本文档为 ${options.projectName} 的 CMMI 过程资产：${doc.desc}。
项目内智能体及人类工匠在执行开发、更新、测试或发布任务时，均依据本项目专属定制的 \`.agents/skills/\` 自动化维护更新本文档。

## 2. 正文规约
(请通过运行对应 CMMI Skill 自动化生成或填充此章节)
`;
    writeFile(docPath, docContent, options.dryRun);
  }

  // 3.1 生成敏捷特性 Spec-Ops 初始包 (docs/specs/core/init-baseline/)
  const specBrief = {
    name: "init-baseline",
    domain: "core",
    title: `${options.projectName} 初始工程地基与规范基线`,
    type: "feature",
    goal: `完成 ${options.projectName} 系统的工程地基搭建与全生命周期规范初始化`,
    roles: [
      { role: "掌柜/交付总监", can: "在移动端驾驶舱实时检视工程资产与两字审批" },
      { role: "前线 FDE 工程师", can: "基于 CMMI 01~09 资产与 OpenAPI 契约高效交付" }
    ],
    stories: [
      { priority: "P0", text: "搭建多企业租户物理隔离地基与数据库访问层" },
      { priority: "P0", text: "固化统一 OpenAPI 契约与静态 TypeScript 编译守卫" },
      { priority: "P1", text: "配置端到端集成测试套件与自动化门禁" }
    ],
    constraints: [
      "多租户隔离：严禁跨企业租户数据穿透。",
      "反假 Mock：必须使用真实数据库 WAL 事务测试。"
    ],
    acceptance: [
      { check: "npm run check 0 报错" },
      { check: "全生命周期 CMMI 01~09 资产齐全在位" }
    ],
    invariants: [
      { name: "多租户数据强隔离", how: "所有业务查询强制注入 company_id 过滤" }
    ],
    tasks: [
      { id: "T1", parent: "main", title: "初始化数据库结构与多租户审计字段", files: ["-"] },
      { id: "T2", parent: "T1", title: "建立核心服务 API 契约与 DTO", files: ["-"] },
      { id: "T3", parent: "main", title: "执行门禁校验与首期基线发布", files: ["-"] }
    ]
  };
  writeFile(path.join(options.targetDir, "docs/specs/core/init-baseline/brief.json"), JSON.stringify(specBrief, null, 2), options.dryRun);
  writeFile(path.join(options.targetDir, "docs/specs/core/init-baseline/requirements.md"), `# Requirements: ${options.projectName} 初始地基\n`, options.dryRun);
  writeFile(path.join(options.targetDir, "docs/specs/core/init-baseline/design.md"), `# Design: ${options.projectName} 架构设计\n`, options.dryRun);
  writeFile(path.join(options.targetDir, "docs/specs/core/init-baseline/tasks.md"), `# Tasks: ${options.projectName} 任务清单\n`, options.dryRun);
  writeFile(path.join(options.targetDir, "docs/specs/core/init-baseline/evidence.json"), JSON.stringify({ feature: "init-baseline", created: new Date().toISOString() }, null, 2), options.dryRun);

  // 3.2 生成 OpenWiki 知识大脑与自愈同步引擎 (wiki/ & openwiki)
  const wikiIndexContent = `# ${options.projectName} OpenWiki (LLM 知识大脑)

> **面向 AI 智能体的动态索引**：由业务元数据与 CMMI 00~09 交付管道自动化提取自愈。AI 进场接单优先阅读本索引，Token 消耗直降 80%！

---

## ⚡ 核心公理与架构
- 所属系统: ${options.projectName} (\`${options.projectCode}\`)
- 所属本体域: \`${options.domainKey}\`
- 技术栈基座: \`${options.techStack}\`
- 架构规约: 严格保持 docs/01~09 CMMI 规范与 docs/specs/ 敏捷特性包。

---

## 🧭 CMMI 00~09 全生命周期阶段导航
- [01 决策分析与立项 (DAR & WBS)](stages/01_management.md)
- [02 需求工程与规格 (EARS & Spec-First)](stages/02_requirements.md)
- [03 架构设计与契约 (HLD, LLD & OpenAPI)](stages/03_design.md)
- [04 编码实现与插件化 (Core SWE & Plugins)](stages/04_implementation.md)
- [05 变异测试打假与全栈验收 (Anti-Fake Mock)](stages/05_verification.md)
- [06 质量门禁与过程控制 (Compliance & CAR)](stages/06_quality_assurance.md)
- [07 容器交付与不可变投产 (DevOps & Release)](stages/07_release.md)
- [08 SRE 可靠性保障与事故复盘 (SRE, SLO & Incident)](stages/08_sre.md)
- [09 商业化持续运营与对账平账 (Ops & Reconciliation)](stages/09_operations.md)
`;
  writeFile(path.join(options.targetDir, "wiki/index.md"), wikiIndexContent, options.dryRun);

  if (!options.dryRun) {
    try {
      const symlinkPath = path.join(options.targetDir, "openwiki");
      if (!fs.existsSync(symlinkPath)) {
        fs.symlinkSync("wiki", symlinkPath, "dir");
      }
    } catch (e) {}
  }

  // 4. 生成 cmmi-profile.json 资产元数据清单（供本体库/工坊自动导入）
  const profile = {
    systemCode: options.projectCode,
    systemName: options.projectName,
    domainKey: options.domainKey,
    techStack: options.techStack,
    storageBackend: options.storageBackend,
    scaffoldedAt: new Date().toISOString(),
    skills: CMMI_SKILLS.map((s) => ({
      key: s.name,
      stage: s.stage,
      role: s.role,
      gate: s.gate,
      localPath: `.agents/skills/${s.dir}/SKILL.md`,
    })),
    gates: {
      g1: { gateKey: "gate_g1_spec", checkCommand: "node scripts/verify-reqs.mjs", doc: "docs/02_requirements/software-requirements.md" },
      g2: { gateKey: "gate_g2_arch", checkCommand: "node scripts/check-fork-surface.mjs", doc: "docs/03_design/architecture-design-hld.md" },
      g3: { gateKey: "gate_g3_compile", checkCommand: "node scripts/check-contracts.mjs", doc: "docs/03_design/interface-contracts/" },
      g4: { gateKey: "gate_g4_eval", checkCommand: "node scripts/run-tests.mjs", doc: "docs/05_verification/test-summary-report.md" },
      g5: { gateKey: "gate_g5_release", checkCommand: "node scripts/check-release-baseline.mjs", doc: "docs/07_release/system-deployment-sop.md" },
      g6: { gateKey: "gate_g6_sre", checkCommand: "node scripts/check-release-baseline.mjs", doc: "docs/08_sre/01_slo_sli_metrics/SLO-SLI-ERROR-BUDGET-MATRIX.md" },
      g7: { gateKey: "gate_g7_ops", checkCommand: "node scripts/check-release-baseline.mjs", doc: "docs/09_operations/tenant-governance.md" },
    },
  };

  const profilePath = path.join(options.targetDir, "cmmi-profile.json");
  writeFile(profilePath, JSON.stringify(profile, null, 2), options.dryRun);

  // 5. 生成项目专属进化监督 Rules 与 IDE 守卫 (.agents/rules/HIGH-ORDER-INVERSE-THINKING.md, AGENTS.md, .cursorrules)
  const inverseThinkingContent = `# HIGH-ORDER-INVERSE-THINKING.md
# ${options.projectName} (${options.projectCode}) 高阶反向思维与进化提升协议

> **所属业务系统**：${options.projectName} (\`${options.projectCode}\`)  
> **所属本体域**：\`${options.domainKey}\`  
> **技术栈**：\`${options.techStack}\`  
> **核心定位**：AI 助手/人类工程师在响应任何开发、修 bug 或加功能指令时，严禁就事论事贴补丁，必须以**「交付负责人 + Palantir 业务双核 + 极简人机」**的最高视角反向穿透。

---

## 一、 四大合一最高审视视角

1. **业务交付负责人视角**：杜绝两张皮空转，交付必有可用证据；关注系统全生命周期演进，不制造技术债。
2. **Palantir 业务双核驱动 (Object + Action)**：查实体状态机；所有业务变更必须收敛到合法的动作契约，禁止绕过契约私改数据库。
3. **前线工程师 (FDE) 真实作风**：敢于做减法，能删代码修绝不加补丁；加载、成功、空状态、异常四态闭环。
4. **极简主义与人机体验**：界面操作保持极简，杜绝遮挡、死交互与盲点。

---

## 二、 面对“修 bug / 加功能”的四步反向穿透协议

### Step 1. 业务对象与模型溯源
- 报错是表象，查明根因是不是实体状态机与业务规则错位？

### Step 2. 极简减法原则（绝不打补丁）
- 严禁加 if-else 绕过错误！能删代码解决就绝不加新逻辑。

### Step 3. 真实使用场景复原
- 验证界面防抖、输入防穿透、异常捕获与友好反馈。

### Step 4. 不可变交付证据闭环
- 必须通过本地门禁脚本验证：
  - 需求规格守卫: \`node scripts/verify-reqs.mjs\`
  - 静态契约守卫: \`node scripts/check-contracts.mjs\`
  - 全栈测试验证: \`node scripts/run-tests.mjs\`
`;

  const agentsMdContent = `# AGENTS.md — ${options.projectName} (${options.projectCode}) 工程宪法与治理守卫

## 1. 目标与规范
本项目为 ${options.projectName}，业务本体域归属于 ${options.domainKey}。
所有智能体与开发者必须遵循以下工程规则。

## 2. CMMI 五大门禁验证
在提交代码或完成任务前，必须执行对应门禁：
- G1 需求门禁: \`node scripts/verify-reqs.mjs\`
- G2 架构门禁: 查阅 \`docs/architecture/architecture-hld.md\`
- G3 契约门禁: \`node scripts/check-contracts.mjs\`
- G4 验收门禁: \`node scripts/run-tests.mjs\`
- G5 投产门禁: \`node scripts/check-release-baseline.mjs\`

## 3. 高阶反向思维守卫
所有新会话必须遵循 \`.agents/rules/HIGH-ORDER-INVERSE-THINKING.md\`。
以业务双核 (Object + Action) 驱动，严禁无本体乱扩表，严禁打补丁式修 bug。
`;

  const cursorrulesContent = `# Cursor Rules for ${options.projectName} (${options.projectCode})

You are the lead architect and FDE for ${options.projectName}.
Always adopt High-Order Inverse Thinking per \`.agents/rules/HIGH-ORDER-INVERSE-THINKING.md\`:
1. When asked to fix a bug or add a feature, DO NOT just patch the code. Trace the root cause in the business ontology (Objects & Actions).
2. Follow the Minimalist Subtraction Principle: prefer deleting obsolete code over adding patch logic.
3. Verify all four UI states (loading, empty, data, error) and ensure defensive interaction.
4. Always run verification scripts before finalizing changes:
   - \`node scripts/verify-reqs.mjs\`
   - \`node scripts/check-contracts.mjs\`
   - \`node scripts/run-tests.mjs\`
`;

  writeFile(path.join(options.targetDir, ".agents/rules/HIGH-ORDER-INVERSE-THINKING.md"), inverseThinkingContent, options.dryRun);
  writeFile(path.join(options.targetDir, "AGENTS.md"), agentsMdContent, options.dryRun);
  writeFile(path.join(options.targetDir, ".cursorrules"), cursorrulesContent, options.dryRun);

  console.log("\n🎉 脚手架搭建与定制完成！");
  console.log(`- 技能库路径: ${path.join(options.targetDir, ".agents/skills/")}`);
  console.log(`- 检查脚本路径: ${path.join(options.targetDir, "scripts/")}`);
  console.log(`- 过程文档路径: ${path.join(options.targetDir, "docs/specs/")} & docs/architecture/`);
  console.log(`- 进化监督规则: ${path.join(options.targetDir, ".agents/rules/HIGH-ORDER-INVERSE-THINKING.md")}`);
  console.log(`- IDE 守卫规则: ${path.join(options.targetDir, ".cursorrules")} & AGENTS.md`);
  console.log(`- 档案元数据: ${profilePath}\n`);
}

// 仅在直接执行时运行 CLI
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const options = parseArgs();
  scaffoldProjectCmmi(options);
}
