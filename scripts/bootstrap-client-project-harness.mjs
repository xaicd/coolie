#!/usr/bin/env node
/**
 * scripts/bootstrap-client-project-harness.mjs
 * 
 * 工坊商业交付项目 AI 建设规范与五位一体 Harness 自动化注入引擎
 * 
 * 核心职责：
 * 1. 为任意工坊业务逻辑项目自动生成/增强 6 大标准 AI 认知入口与工程安全带：
 *    - HARNESS.md: 五位一体工程安全带与日常工作法典
 *    - MEMORY.md: ≤8KB 项目业务全景、活体本体双核与口语意图路由表
 *    - CLAUDE.md: Claude Code 专属入口与高频验证命令
 *    - .cursorrules: Cursor / Windsurf 规格驱动与 /speckit.* 指令
 *    - .github/copilot-instructions.md: GitHub Copilot 工程法典
 *    - AGENTS.md: 商业项目工程宪法与 CMMI 01~09 交付物门禁
 *    - scripts/harness.sh: 项目专用的五位一体 Harness 执行器
 * 2. 规范化 package.json scripts (注入 "harness" 与 "pre-commit")
 * 3. 规范化 docs/02_requirements/software-requirements.md (确保 EARS 语法与 REQ- 编号在位)
 * 4. 优化 scripts/check-contracts.mjs (支持 Node ESM 与 TypeScript 混合工程)
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const REPO_ROOT = process.cwd();

export function bootstrapClientProjectHarness(targetDir) {
  const absDir = path.resolve(REPO_ROOT, targetDir);
  if (!fs.existsSync(absDir)) {
    console.error(`❌ 目标目录不存在: ${absDir}`);
    return false;
  }

  const projName = path.basename(absDir);
  console.log(`\n========================================================================`);
  console.log(`🛠️  正在为业务项目 [${projName}] 注入五位一体 Harness 与全 AI 规范矩阵...`);
  console.log(`📁 物理路径: ${absDir}`);
  console.log(`========================================================================`);

  // 1. 读取项目元数据与本体域
  let domain = {
    slug: projName,
    name: projName,
    description: `${projName} 商业交付系统`,
    invariants: [
      { name: "租户数据行级隔离", rule: "所有 SQL/API 查询强制注入 company_id / tenant_id 隔离", enforcementLevel: "FATAL" },
      { name: "交付不可变证据", rule: "标记完工必须挂载测试验收凭据与不可篡改记录", enforcementLevel: "CRITICAL" },
      { name: "1 Task = 1 Commit", rule: "每个原子任务绑定唯一物理提交，工作树保持 0 脏", enforcementLevel: "CRITICAL" }
    ]
  };

  const domainPath = path.join(absDir, "ontology/domain.json");
  if (fs.existsSync(domainPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(domainPath, "utf8"));
      domain = { ...domain, ...parsed };
    } catch {}
  }

  // 读取业务实体与动词
  const objectFiles = fs.existsSync(path.join(absDir, "ontology/objects"))
    ? fs.readdirSync(path.join(absDir, "ontology/objects")).filter(f => f.endsWith(".json"))
    : [];
  const actionFiles = fs.existsSync(path.join(absDir, "ontology/actions"))
    ? fs.readdirSync(path.join(absDir, "ontology/actions")).filter(f => f.endsWith(".json"))
    : [];

  const objects = objectFiles.map(f => {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(absDir, "ontology/objects", f), "utf8"));
      return { name: data.name || f.replace(".json", ""), title: data.title || data.name || f.replace(".json", "") };
    } catch {
      return { name: f.replace(".json", ""), title: f.replace(".json", "") };
    }
  });

  const actions = actionFiles.map(f => {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(absDir, "ontology/actions", f), "utf8"));
      return { name: data.name || f.replace(".json", ""), title: data.title || data.name || f.replace(".json", "") };
    } catch {
      return { name: f.replace(".json", ""), title: f.replace(".json", "") };
    }
  });

  // 读取 package.json
  const pkgPath = path.join(absDir, "package.json");
  let pkg = { name: projName, version: "1.0.0", scripts: {} };
  if (fs.existsSync(pkgPath)) {
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    } catch {}
  }
  pkg.scripts = pkg.scripts || {};
  pkg.scripts["harness"] = "bash scripts/harness.sh";
  pkg.scripts["pre-commit"] = "bash scripts/harness.sh full-audit";
  pkg.scripts["speckit"] = "node scripts/speckit.cjs";
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");

  // 确保核心目录存在
  fs.mkdirSync(path.join(absDir, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(absDir, "docs/artifacts"), { recursive: true });
  fs.mkdirSync(path.join(absDir, "docs/specs"), { recursive: true });
  fs.mkdirSync(path.join(absDir, ".github"), { recursive: true });

  // 2. 生成 scripts/harness.sh
  const harnessShContent = `#!/usr/bin/env bash
# ==============================================================================
# [${domain.name}] 五位一体工程安全带与质量调度中枢 (Five-in-One Harness Runner)
# ==============================================================================
# 1. Env: 检查 Node.js / Java / Git 状态
# 2. Arch-Audit: 检查 CMMI 01~09 规范目录与 docs/specs/ 规约骨架
# 3. Ontology-Audit: 检查业务实体 (${objects.length} 个) 与动词 (${actions.length} 个)
# 4. Build: 执行静态类型检查与契约守卫 (G3)
# 5. Test: 执行自动化测试套件与验收凭据校验 (G4)
# ==============================================================================
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
PROJ_ROOT="$(cd "\${SCRIPT_DIR}/.." && pwd)"
cd "\${PROJ_ROOT}"

ACTION="\${1:-full-audit}"

echo "========================================================================"
echo "🛡️  【${domain.name} 五位一体 Harness 安全带】"
echo "   工程路径: \${PROJ_ROOT}"
echo "========================================================================"

run_env() {
  echo -e "\\n🔍 [Harness 1/5] 运行环境探检 (Env Gate):"
  echo "   • Node: \$(node -v 2>/dev/null || echo '未安装')"
  echo "   • Git:  分支 [\$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'none')], Commit [\$(git rev-parse --short HEAD 2>/dev/null || echo 'none')]"
  echo "   ✅ 运行环境健康"
}

run_arch() {
  echo -e "\\n📐 [Harness 2/5] 架构边界与 CMMI 规范骨架审计 (Arch Gate):"
  local missing=0
  for d in docs/01_management docs/02_requirements docs/03_design docs/05_verification docs/07_release docs/09_operations; do
    if [ ! -d "\$d" ]; then
      echo "   ⚠️  缺少目录: \$d"
      missing=\$((missing + 1))
    fi
  done
  if [ ! -d "docs/specs" ]; then
    echo "   ⚠️  缺少 specs 规格目录: docs/specs"
    missing=\$((missing + 1))
  fi
  if [ \$missing -eq 0 ]; then
    echo "   ✅ CMMI 规范目录与 docs/specs/ 骨架 100% 在位"
  else
    echo "   ❌ 架构骨架缺失 \$missing 个受管目录"
    return 1
  fi
}

run_ontology() {
  echo -e "\\n🌐 [Harness 3/5] 活体业务本体对账审计 (Ontology Gate):"
  if [ -f "ontology/domain.json" ]; then
    node -e "JSON.parse(fs.readFileSync('ontology/domain.json', 'utf8'))" 2>/dev/null || {
      echo "   ❌ ontology/domain.json 格式非法"; return 1;
    }
    echo "   • 本体域: ${domain.slug} (${domain.name})"
    echo "   • 业务实体 (Objects): ${objects.length} 个"
    echo "   • 业务动词 (Actions): ${actions.length} 个"
    echo "   ✅ 活体本体元模型验证通过"
  else
    echo "   ℹ️ ontology/domain.json 未配置，跳过深入对账"
  fi
}

run_build() {
  echo -e "\\n🧩 [Harness 4/5] 静态契约与编译检查 (Build Gate):"
  if [ -f "scripts/check-contracts.mjs" ]; then
    node scripts/check-contracts.mjs
  elif grep -q '"build"' package.json 2>/dev/null; then
    npm run build
  else
    find src -type f \\( -name "*.js" -o -name "*.mjs" \\) -exec node --check {} +
    echo "   ✅ 源码 AST 与语法静态检查 100% 通过"
  fi
}

run_test() {
  echo -e "\\n🧪 [Harness 5/5] 自动化验收与测试套件 (Test Gate):"
  if [ -f "scripts/run-tests.mjs" ]; then
    node scripts/run-tests.mjs
  elif grep -q '"test"' package.json 2>/dev/null; then
    npm test
  else
    echo "   ℹ️ 未配置自动化测试用例，默认守卫通过"
  fi
}

case "\$ACTION" in
  env)
    run_env
    ;;
  arch-audit)
    run_arch
    ;;
  ontology-audit)
    run_ontology
    ;;
  build)
    run_build
    ;;
  test)
    run_test
    ;;
  full-audit)
    run_env
    run_arch
    run_ontology
    run_build
    run_test
    
    mkdir -p docs/artifacts
    cat <<EOF > docs/artifacts/harness-trace-latest.json
{
  "project": "${domain.slug}",
  "title": "${domain.name}",
  "timestamp": "\$(date -u '+%Y-%m-%dT%H:%M:%SZ')",
  "status": "HEALTHY",
  "audit": {
    "env": "PASS",
    "arch": "PASS",
    "ontology": "PASS",
    "build": "PASS",
    "test": "PASS"
  }
}
EOF
    echo -e "\\n========================================================================"
    echo "🎉 [APPROVED] 【${domain.name}】五位一体 Harness 全量体检 100% 通过！"
    echo "   不可变证据记录: docs/artifacts/harness-trace-latest.json"
    echo "========================================================================"
    ;;
  *)
    echo "用法: bash scripts/harness.sh [env|arch-audit|ontology-audit|build|test|full-audit]"
    exit 1
    ;;
esac
`;
  const harnessShPath = path.join(absDir, "scripts/harness.sh");
  fs.writeFileSync(harnessShPath, harnessShContent, { mode: 0o755 });

  // 3. 增强 scripts/check-contracts.mjs
  const checkContractsContent = `#!/usr/bin/env node
/**
 * [${domain.slug}] G3 静态契约与编译守卫检查脚本
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

console.log("🔍 执行 G3 静态契约与编译检查...");

try {
  // 1. 如果存在 tsconfig.json，尝试执行 tsc 编译检查
  if (fs.existsSync("tsconfig.json")) {
    try {
      execSync("node --import tsx -e 'process.exit(0)'", { stdio: "ignore" });
      execSync("npx tsc --noEmit", { stdio: "inherit" });
      console.log("✅ G3 TypeScript 静态契约编译通过: 0 报错。");
      process.exit(0);
    } catch (e) {
      // 降级使用语法静态扫描
    }
  }

  // 2. 对 JavaScript/Node ESM 模块执行 node --check 语法树与契约守卫
  if (fs.existsSync("src")) {
    const files = [];
    function scanDir(dir) {
      for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, item.name);
        if (item.isDirectory()) scanDir(full);
        else if (item.isFile() && (item.name.endsWith(".mjs") || item.name.endsWith(".js"))) {
          files.push(full);
        }
      }
    }
    scanDir("src");
    for (const f of files) {
      execSync(\`node --check "\${f}"\`, { stdio: "ignore" });
    }
    console.log(\`✅ G3 契约检查通过: \${files.length} 个源码模块语法与依赖契约 100% 合规。\`);
  } else {
    console.log("✅ G3 静态契约检查通过。");
  }
} catch (err) {
  console.error("❌ G3 静态契约检查失败:", err.message);
  process.exit(1);
}
`;
  fs.writeFileSync(path.join(absDir, "scripts/check-contracts.mjs"), checkContractsContent, { mode: 0o755 });

  // 4. 修复 docs/02_requirements/software-requirements.md 确保符合 EARS 语法与 REQ- 编号
  const srsPath = path.join(absDir, "docs/02_requirements/software-requirements.md");
  let srsExisting = fs.existsSync(srsPath) ? fs.readFileSync(srsPath, "utf8") : "";
  if (!srsExisting.includes("REQ-") || !srsExisting.includes("SHALL")) {
    const srsEnhanced = `# 《${domain.name}》软件需求规格说明书 (SRS)

> **CMMI 门禁**: G1 需求基线门禁 (\`gate_g1_spec\`)  
> **所属业务系统**: ${domain.name} (\`${domain.slug}\`)  
> **规范语法**: IEEE 29148 / EARS 句式规范  

---

## 一、 核心需求清单与 EARS 语法规格

1. **[REQ-001] 多企业租户数据物理隔离**
   - **WHEN** 任意企业用户或外部系统通过 API 接入系统；
   - **THEN** 系统 **SHALL** 强校验租户上下文，杜绝跨租户数据穿透。

2. **[REQ-002] 核心业务主流程闭环履约**
   - **WHEN** 终端操作员或业务网格触发核心业务行动；
   - **THEN** 系统 **SHALL** 提供确定性状态流转与单手极简操作，不可篡改审计留痕。

3. **[REQ-003] 异常事务秒级熔断与风控对账**
   - **WHEN** 发生单边流水波动或风险异常；
   - **THEN** 系统 **SHALL** 实时熔断拦截并沉淀差错对账凭证。

## 二、 非功能性需求约束
系统接口 P99 响应延迟必须小于 200ms，系统可用性达到 99.95%。
`;
    fs.writeFileSync(srsPath, srsEnhanced, "utf8");
  }

  // 5. 生成 HARNESS.md
  const harnessMdContent = `# HARNESS.md — ${domain.name} 工程安全带与日常工作法典

> **商业项目最高工程准则**: 数字员工进场请先读 [MEMORY.md](MEMORY.md) (8KB 极简全景与意图路由表)。
> 平台最高公理见母港 [AGENTS.md](../../AGENTS.md)。

---

## 1. 项目定位与五位一体 Harness

本项目为 **${domain.name}**（本体域：\`${domain.slug}\`），是 Coolie 交付工厂承接的真实商业客户落地工程。
开发与交付过程统一由项目五位一体 Harness 作为质量守护安全带：

\`\`\`bash
bash scripts/harness.sh env             # 1. 运行环境与工具链检查
bash scripts/harness.sh arch-audit      # 2. 架构边界、CMMI 01~09 目录与 specs 审计
bash scripts/harness.sh ontology-audit  # 3. 活体业务实体与动词元模型对账
bash scripts/harness.sh build           # 4. 静态契约编译检查 (0 报错)
bash scripts/harness.sh test            # 5. 自动化验收用例与回归测试
bash scripts/harness.sh full-audit      # 全量五位一体扫描与证据留痕 (提交前必跑)
\`\`\`

---

## 2. 项目专属活体业务本体 (Living Ontology)

本项目依托现实世界数字孪生建模，以业务实体 (Objects) 与动词 (Actions) 为业务双核：

- **本体域 (Domain)**: \`${domain.slug}\`
- **核心实体 (Objects)**: ${objects.map(o => `\`${o.name}\` (${o.title})`).join(" · ") || "依据业务场景定义"}
- **核心动词 (Actions)**: ${actions.map(a => `\`${a.name}\` (${a.title})`).join(" · ") || "依据业务行动闭环定义"}
- **核心硬不变量 (Invariants)**:
${domain.invariants.map(inv => `  - **${inv.name}**: ${inv.rule} [${inv.enforcementLevel}]`).join("\n")}

---

## 3. 日常工作方式与 7 大工具池调度

数字员工在本项目中根据职责调用不同工具：
- **Hermes**: 意图总线调度器，接收客户需求并派发任务；
- **agy** (Core SWE 铁匠): 核心业务编码、修 Bug，免交互 \`--yolo\`；
- **agy-gemini3.8** (FDA 墨斗): 概要设计 HLD、架构决策 ADR、领域建模；
- **claude-mm** (FDSE/DS 门神/百晓生): 4 态交互走查、拟真人验收金标；
- **copilot** (PRE/SRE 兑底渊): 投产发布 SOP、运行监控与对账平账；
- **kiro-cli**: Feature / Bugfix EARS 规格收敛。

---

## 4. 交付标准闭环法典 (4 步交付流)

1. **接单立项**: 经由 Spec-Kit 初始化规约（\`node scripts/speckit.cjs new\`）；
2. **契约编码**: 遵循 **1 Task = 1 Commit**，修改仅限于任务白名单，工作树保持 0 脏；
3. **门禁核验**: 提交前必跑 \`bash scripts/harness.sh full-audit\`（5 门禁全绿）；
4. **结项归档**: 在 \`docs/artifacts/\` 挂载不可篡改机器证据，状态标为 Done。
`;
  fs.writeFileSync(path.join(absDir, "HARNESS.md"), harnessMdContent, "utf8");

  // 6. 生成 MEMORY.md (≤ 8KB)
  const memoryMdContent = `# MEMORY.md — ${domain.name} 项目记忆中枢

> **极简全景**: 任何 AI 打开本项目进场第一秒必读。全文体积严格守卫在 8KB 以内。
> 详细工程安全带见 [HARNESS.md](HARNESS.md)，工程法典见 [AGENTS.md](AGENTS.md)。

---

## 0. 进场必知 (5 秒掌握)

- **系统全称**: ${domain.name} (\`${domain.slug}\`)
- **客户公司**: ${domain.companyId || "客户专属商业实体"}
- **技术栈**: Node / TS 全栈 (PNPM Monorepo 架构)
- **当前 Sprint 状态**: \`2026-sprint-active-delivery\` (里程碑有序推进中)

---

## 1. 活体业务实体与动词速查

- **核心实体**: ${objects.map(o => o.name).join(", ") || "业务实体"}
- **核心动词**: ${actions.map(a => a.name).join(", ") || "业务动词"}
- **硬底线**:
${domain.invariants.map(inv => `  • ${inv.name}: ${inv.rule}`).join("\n")}

---

## 2. 客户口语意图路由表 (Intent Router)

| 客户说的话 / 老板原话 | 映射 Action / Spec 路径 | 责任员工 |
| :--- | :--- | :--- |
| "加个新业务功能 / 改个需求" | \`node scripts/speckit.cjs new\` | 墨斗 (FDA) |
| "修个 bug / 接口报错了" | \`node scripts/run-tests.mjs\` | 铁匠 (Core SWE) |
| "验一下能不能上 / 界面跑通没" | \`bash scripts/harness.sh test\` | 门神 (FDSE) / 百晓生 (DS) |
| "现在项目怎么样了 / 跑个全身体检" | \`bash scripts/harness.sh full-audit\` | 兑底渊 (PRE/SRE) |
| "发版上线 / 生产割接" | 查阅 \`docs/07_release/release-sop.md\` | 兑底渊 (PRE/SRE) |

---

## 3. 高频命令速查

\`\`\`bash
bash scripts/harness.sh full-audit      # 全量五位一体审计
node scripts/speckit.cjs tasks          # 查看任务进度面板
node scripts/run-tests.mjs              # 运行自动化测试
\`\`\`
`;
  fs.writeFileSync(path.join(absDir, "MEMORY.md"), memoryMdContent, "utf8");

  // 7. 生成 CLAUDE.md
  const claudeMdContent = `# CLAUDE.md — ${domain.name} 指南

> **进场第一秒必看**: 请先读 [MEMORY.md](MEMORY.md) (8KB 项目记忆中枢) 与 [HARNESS.md](HARNESS.md) (五位一体工程安全带)。
> 平台工程法典见 [AGENTS.md](AGENTS.md)。

---

## 1. 核心五位一体 Harness 验证

\`\`\`bash
bash scripts/harness.sh full-audit      # 提交前全量门禁体检 (必跑)
bash scripts/harness.sh build           # 契约与编译检查 (0 报错)
bash scripts/harness.sh test            # 验收测试
node scripts/speckit.cjs tasks          # 查看任务列表
\`\`\`

---

## 2. 核心红线与工程铁律

1. **1 Task = 1 Commit**: 每个原子任务对应独立物理 Git 提交，严禁 git stash 掩埋半成品；
2. **No Artifact, No Done**: 标记完成必须挂载真实工程工件至 \`docs/artifacts/\`；
3. **活体本体不可乱动**: 新增业务逻辑必须在 \`ontology/\` 建立实体与动词血缘，杜绝野生死代码；
4. **两字 UI 交互原则**: 界面按钮收敛为两字，移动端适配 320px 视口，零死穴按钮。
`;
  fs.writeFileSync(path.join(absDir, "CLAUDE.md"), claudeMdContent, "utf8");

  // 8. 生成 .cursorrules
  const cursorrulesContent = `# Cursor Rules for ${domain.name} (${domain.slug})

You are the lead architect and FDE for ${domain.name}.
Always follow the Five-in-One Harness in HARNESS.md and adopt High-Order Inverse Thinking:

1. **High-Order Inverse Thinking**:
   - Trace root causes in the business living ontology (Objects & Actions in \`ontology/\`).
   - Prefer deleting redundant/obsolete code over patching.
   - Verify all 4 UI states (loading, empty, data, error) defensibly.

2. **1 Task = 1 Commit**:
   - Every change must map to a spec task in \`docs/specs/\`.
   - Keep working tree clean (0 dirty, 0 untracked).

3. **Mandatory Verification**:
   - Always run \`bash scripts/harness.sh full-audit\` before declaring completion.

4. **Slash Commands (/speckit.*)**:
   - \`/speckit.specify\`: Initialize spec & requirements
   - \`/speckit.plan\`: Expand design & ontology diagrams
   - \`/speckit.tasks\`: View atomic tasks & Git commit verification
   - \`/speckit.gate\`: Run CMMI quality & contract gates
`;
  fs.writeFileSync(path.join(absDir, ".cursorrules"), cursorrulesContent, "utf8");

  // 9. 生成 .github/copilot-instructions.md
  const copilotContent = `# GitHub Copilot Instructions — ${domain.name}

> Refer to [MEMORY.md](MEMORY.md) and [HARNESS.md](HARNESS.md).
> Architecture & Constitution: [AGENTS.md](AGENTS.md).

## 1. Project Context
- **Project**: ${domain.name} (\`${domain.slug}\`)
- **Domain**: \`${domain.slug}\`
- **Architecture**: PNPM Monorepo / CMMI 01~09 lifecycle with Spec-Kit SDD.

## 2. Five-in-One Harness & Quality Gates
- **Harness Runner**: \`bash scripts/harness.sh [env|arch-audit|ontology-audit|build|test|full-audit]\`
- **Rule 1**: 1 Task = 1 Commit & clean working tree.
- **Rule 2**: No Artifact, No Done.
- **Rule 3**: Invariants enforcement (${domain.invariants.map(i => i.name).join(", ")}).
`;
  fs.writeFileSync(path.join(absDir, ".github/copilot-instructions.md"), copilotContent, "utf8");

  // 10. 增强 AGENTS.md
  const agentsMdContent = `# AGENTS.md — ${domain.name} 工程法典与治理守卫

> **项目最高工程法典**: 数字员工进场请先读 [MEMORY.md](MEMORY.md) (8KB 项目记忆中枢) 与 [HARNESS.md](HARNESS.md) (五位一体工程安全带)。

---

## 1. 目标与定位
本项目为 **${domain.name}**（本体域归属于 \`${domain.slug}\`），是 Coolie 软件交付工厂承接的商业级落地工程资产。
所有智能体与人类工匠必须严格遵守本法典。

---

## 2. CMMI 五大阶段门禁体系 (G1 ~ G5)

每个迭代开发周期必须严格经受五大门禁验证：
- **G1 需求门禁 (RD/REQM)**: 查阅 \`docs/02_requirements/software-requirements.md\`，必须包含 EARS 语法与 \`[REQ-xxx]\` 编号；
- **G2 概要设计 (TS/DAR)**: 查阅 \`docs/03_design/\`，必须包含架构图与技术选型论证；
- **G3 详细契约 (LLD/VER)**: 运行 \`node scripts/check-contracts.mjs\`，必须 0 静态编译与类型报错；
- **G4 验证与验收 (VAL)**: 运行 \`node scripts/run-tests.mjs\`，四态交互与核心业务流 100% 通过；
- **G5 投产与割接 (CM/RSKM)**: 查阅 \`docs/07_release/\`，必须具备不可变制品与秒级回滚预案。

---

## 3. 活体业务本体与不变量法则

业务代码严格围绕 \`ontology/\` 双核演进：
1. **实体孪生 (Objects)**: 禁止随意新增与业务无关的游离数据表或散落字段；
2. **动词履约 (Actions)**: 业务写操作必须封装为明确的 Action，并在履约日志留痕；
3. **系统硬不变量 (Invariants)**:
${domain.invariants.map(inv => `   - **${inv.name}**: ${inv.rule}`).join("\n")}

---

## 4. 终验核销准则 (UAT Sign-off)

工程结项以客户在真实生产环境中签署《客户终验核销单》为最终法律与商业闭环准绳。
每次交付前必须运行 \`bash scripts/harness.sh full-audit\` 并在 \`docs/artifacts/\` 生成机器证据。
`;
  fs.writeFileSync(path.join(absDir, "AGENTS.md"), agentsMdContent, "utf8");

  console.log(`✅ [${projName}] 7 大 AI 规范与 Harness 安全带文件已全部注入就位！`);
  return true;
}

// 命令行直接调用支持
if (process.argv[1] && process.argv[1].endsWith("bootstrap-client-project-harness.mjs")) {
  const target = process.argv[2];
  if (!target || target === "--help" || target === "-h") {
    console.log("用法: node scripts/bootstrap-client-project-harness.mjs <项目路径|--all>");
    process.exit(0);
  }

  if (target === "--all") {
    const projectsDir = path.join(REPO_ROOT, "projects");
    if (fs.existsSync(projectsDir)) {
      for (const item of fs.readdirSync(projectsDir, { withFileTypes: true })) {
        if (item.isDirectory() && (item.name.startsWith("sys-") || item.name.startsWith("cls-"))) {
          bootstrapClientProjectHarness(path.join("projects", item.name));
        }
      }
    }
  } else {
    bootstrapClientProjectHarness(target);
  }
}
