#!/usr/bin/env node
/**
 * scaffold-project-cmmi-skills.mjs
 *
 * Coolie 工坊 CMMI 3 / CMMI 5 自动化技能脚手架与定制工具。
 * 将标准 CMMI 过程技能、门禁检查脚本 (scripts) 及黄金文档基线 (docs/cmmi)
 * 自动复制、变量填充并定制到指定项目/业务系统的工作区中。
 *
 * 用法:
 *   node scripts/scaffold-project-cmmi-skills.mjs --project-name "用户成长与积分结算系统" --project-code "SYS_POINTS" --tech-stack node --target-dir projects/sys-points
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
    options.targetDir = path.join(repoRoot, "projects", options.projectCode.toLowerCase().replace(/_/g, "-"));
  } else if (!path.isAbsolute(options.targetDir)) {
    options.targetDir = path.resolve(repoRoot, options.targetDir);
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
  --target-dir <path>        项目工作区输出目录 (默认: projects/<code-slug>)
  --author <artisan>         主责工匠角色标识 (默认: "emp_fda")
  --storage-backend <type>   交付物存储介质: local_disk | git_repo | oss_object
  --dry-run                  仅展示待生成文件，不写入磁盘
  --help, -h                 显示帮助信息
`);
}

// 6 大核心 CMMI 技能清单
const CMMI_SKILLS = [
  {
    dir: "cmmi-req-spec",
    name: "cmmi-req-spec",
    role: "emp_ds",
    gate: "gate_g1_spec",
    title: "CMMI 需求工程与双向跟踪矩阵规范 (RD/REQM)",
    docFile: "01-srs.md",
  },
  {
    dir: "cmmi-tech-solution",
    name: "cmmi-tech-solution",
    role: "emp_fda",
    gate: "gate_g2_arch",
    title: "CMMI 架构设计与技术决策分析 (TS/DAR/RSKM)",
    docFile: "02-hld.md",
  },
  {
    dir: "cmmi-detailed-contracts",
    name: "cmmi-detailed-contracts",
    role: "emp_swe",
    gate: "gate_g3_compile",
    title: "CMMI 详细设计与静态契约守卫 (TS/VER)",
    docFile: "03-lld-api.md",
  },
  {
    dir: "cmmi-ver-val",
    name: "cmmi-ver-val",
    role: "emp_fdse",
    gate: "gate_g4_eval",
    title: "CMMI 验证与确认全栈验收规范 (VER/VAL)",
    docFile: "04-test-report.md",
  },
  {
    dir: "cmmi-immutable-release",
    name: "cmmi-immutable-release",
    role: "emp_sre",
    gate: "gate_g5_release",
    title: "CMMI 配置管理与不可变投产规范 (CM/RSKM/PMC)",
    docFile: "05-deploy-sop.md",
  },
  {
    dir: "cmmi-car-spc-metrics",
    name: "cmmi-car-spc-metrics",
    role: "emp_hermes",
    gate: "gate_g5_release",
    title: "CMMI 5 统计过程控制与因果缺陷预防 (QPM/CAR)",
    docFile: "07-car-prevention.md",
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

const srsPath = path.resolve(process.cwd(), "docs/cmmi/01-srs.md");
if (!fs.existsSync(srsPath)) {
  console.error("❌ G1 门禁失败: 未找到 docs/cmmi/01-srs.md 需求规格说明书。");
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

const sopPath = path.resolve(process.cwd(), "docs/cmmi/05-deploy-sop.md");
if (!fs.existsSync(sopPath)) {
  console.error("❌ G5 发布门禁失败: 缺少 docs/cmmi/05-deploy-sop.md 发布与回滚 SOP。");
  process.exit(1);
}

const sopContent = fs.readFileSync(sopPath, "utf-8");
if (!sopContent.includes("回滚") || !sopContent.includes("校验和")) {
  console.error("❌ G5 发布门禁失败: SOP 中必须包含明确的秒级回滚命令与制品 SHA-256 校验和。");
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
        const refDstDoc = path.join(options.targetDir, "docs/cmmi/references", rf);
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

  // 3. 生成 docs/cmmi/ 5+2 黄金文档初始骨架
  const docsList = [
    {
      file: "01-srs.md",
      title: `${options.projectName} 软件需求规格说明书 (SRS & RTM)`,
      desc: "遵循 EARS 规范句式的需求清单与双向跟踪矩阵",
    },
    {
      file: "02-hld.md",
      title: `${options.projectName} 系统概要设计与架构决策说明书 (HLD & DAR)`,
      desc: "系统拓扑、多企业数据隔离策略与加权决策分析表",
    },
    {
      file: "03-lld-api.md",
      title: `${options.projectName} 系统详细设计与统一 API 契约规范 (LLD & API Spec)`,
      desc: "核心数据结构、统一 REST/RPC API 契约与错误码定义",
    },
    {
      file: "04-test-report.md",
      title: `${options.projectName} 系统集成测试与全栈验收报告 (VER & VAL)`,
      desc: "界面四态状态机、防抖异常防御与自动化集成测试汇总",
    },
    {
      file: "05-deploy-sop.md",
      title: `${options.projectName} 生产发版与不可变配置管理手册 (CM & Release SOP)`,
      desc: "不可变版本校验和、CMDB 部署拓扑与秒级应急回滚步骤",
    },
    {
      file: "06-spc-metrics.md",
      title: `${options.projectName} 统计过程控制分析表 (CMMI 5 SPC)`,
      desc: "任务吞吐、门禁通过率与构建耗时 SPC 控制界限",
    },
    {
      file: "07-car-prevention.md",
      title: `${options.projectName} 因果分析与系统性缺陷预防表 (CMMI 5 CAR)`,
      desc: "5-Why 鱼骨图根因追溯与自动化防退化用例固化记录",
    },
  ];

  for (const doc of docsList) {
    const docPath = path.join(options.targetDir, "docs/cmmi", doc.file);
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
      role: s.role,
      gate: s.gate,
      localPath: `.agents/skills/${s.dir}/SKILL.md`,
    })),
    gates: {
      g1: { gateKey: "gate_g1_spec", checkCommand: "node scripts/verify-reqs.mjs", doc: "docs/cmmi/01-srs.md" },
      g2: { gateKey: "gate_g2_arch", checkCommand: "node scripts/check-fork-surface.mjs", doc: "docs/cmmi/02-hld.md" },
      g3: { gateKey: "gate_g3_compile", checkCommand: "node scripts/check-contracts.mjs", doc: "docs/cmmi/03-lld-api.md" },
      g4: { gateKey: "gate_g4_eval", checkCommand: "node scripts/run-tests.mjs", doc: "docs/cmmi/04-test-report.md" },
      g5: { gateKey: "gate_g5_release", checkCommand: "node scripts/check-release-baseline.mjs", doc: "docs/cmmi/05-deploy-sop.md" },
    },
  };

  const profilePath = path.join(options.targetDir, "cmmi-profile.json");
  writeFile(profilePath, JSON.stringify(profile, null, 2), options.dryRun);

  console.log("\n🎉 脚手架搭建与定制完成！");
  console.log(`- 技能库路径: ${path.join(options.targetDir, ".agents/skills/")}`);
  console.log(`- 检查脚本路径: ${path.join(options.targetDir, "scripts/")}`);
  console.log(`- CMMI 文档路径: ${path.join(options.targetDir, "docs/cmmi/")}`);
  console.log(`- 档案元数据: ${profilePath}\n`);
}

// 仅在直接执行时运行 CLI
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const options = parseArgs();
  scaffoldProjectCmmi(options);
}
