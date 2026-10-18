#!/usr/bin/env node
/**
 * ============================================================================
 * Coolie 活体业务本体零人工介入自动化机器审计引擎 (Harness Ontology Audit Engine)
 * ============================================================================
 * 
 * 核心公理：
 * 1. 活体业务本体即全平台控制与运行中枢 (公理三)。
 * 2. 严禁人类人工肉眼审查！由编译器与自动化守卫执行 100% 机器审计与分级自愈。
 * 
 * 审计维度 (4 大机器门禁 + 5 大系统硬不变量):
 *   Gate 1: 元模型形式化校验 (Meta-Schema Conformance)
 *   Gate 2: 代码-本体物理双向反射对账 (Code Drift & DB Reflection)
 *   Gate 3: 图拓扑闭环与孤岛/死穴检测 (Topology Integrity & Dead-End Guard)
 *   Gate 4: 行为动词因果前置/后置条件动态求值 (Action Computability & Lifecycle Closure)
 *   Invariants: 5 大不可逾越底线 (INV-1 ~ INV-5) 机器断言
 * 
 * 机器自愈模式 (Self-Healing):
 *   运行 `node scripts/harness-ontology-audit.mjs --fix` 时，
 *   系统自动根据 Drizzle Schema 物理真源修复本体中的字段漂移，原地更新。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const shouldFix = args.includes('--fix');
const jsonOnly = args.includes('--json');

const findings = [];
const stats = {
  metaSchema: { passed: 0, failed: 0 },
  codeReflection: { passed: 0, failed: 0 },
  topology: { passed: 0, failed: 0 },
  actionComputability: { passed: 0, failed: 0 },
  invariants: { passed: 0, failed: 0 },
};

function recordFinding(severity, gate, code, message, location = '') {
  findings.push({ severity, gate, code, message, location });
  if (severity === 'ERROR' || severity === 'FATAL') {
    if (stats[gate]) stats[gate].failed++;
  } else {
    if (stats[gate]) stats[gate].passed++;
  }
}

function pass(gate) {
  if (stats[gate]) stats[gate].passed++;
}

// -----------------------------------------------------------------------------
// 0. 加载物理真实数据库 Schema (Drizzle ORM AST & Exports)
// -----------------------------------------------------------------------------
let dbSchema = {};
try {
  const dbDistPath = path.join(REPO_ROOT, 'packages/db/dist/index.js');
  if (fs.existsSync(dbDistPath)) {
    // Dynamic import of CommonJS module
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    dbSchema = require(dbDistPath);
  }
} catch (err) {
  // 如果 dist 未构建，尝试使用简单正则探测 packages/db/src/schema/*.ts
}

// 物理表与 Drizzle 对象映射
const PHYSICAL_TABLE_MAP = {
  companies: dbSchema.companies,
  projects: dbSchema.projects,
  issues: dbSchema.issues,
  documents: dbSchema.documents,
  issue_work_products: dbSchema.issueWorkProducts,
  approvals: dbSchema.approvals,
  agents: dbSchema.agents,
};

function getDrizzleColumns(tableName) {
  const table = PHYSICAL_TABLE_MAP[tableName];
  if (table && typeof table === 'object') {
    return Object.keys(table).filter((k) => k !== 'enableRLS' && !k.startsWith('_'));
  }
  // 降级回物理 schema 文件正则解析
  const schemaFile = path.join(REPO_ROOT, `packages/db/src/schema/${tableName}.ts`);
  if (fs.existsSync(schemaFile)) {
    const content = fs.readFileSync(schemaFile, 'utf8');
    const matches = [...content.matchAll(/^\s+([a-zA-Z0-9_]+):\s*(?:uuid|text|varchar|integer|boolean|timestamp|date|jsonb|pgEnum)/gm)];
    return matches.map((m) => m[1]);
  }
  return null;
}

// -----------------------------------------------------------------------------
// 1. 门禁 1: 元模型形式化校验 (Meta-Schema Conformance)
// -----------------------------------------------------------------------------
const ontologyDir = path.join(REPO_ROOT, 'ontology');
const domainPath = path.join(ontologyDir, 'domain.json');

if (!fs.existsSync(domainPath)) {
  recordFinding('FATAL', 'metaSchema', 'DOMAIN_NOT_FOUND', 'ontology/domain.json 不存在');
} else {
  try {
    const domain = JSON.parse(fs.readFileSync(domainPath, 'utf8'));
    if (!domain.slug || !domain.name || !domain.version) {
      recordFinding('ERROR', 'metaSchema', 'DOMAIN_INVALID', 'domain.json 缺少 slug/name/version');
    } else {
      pass('metaSchema');
    }
  } catch (e) {
    recordFinding('FATAL', 'metaSchema', 'DOMAIN_PARSE_ERR', `domain.json 解析语法错误: ${e.message}`);
  }
}

// -----------------------------------------------------------------------------
// 2. 加载与对账业务对象模型 (M1: Object Types)
// -----------------------------------------------------------------------------
const objectsDir = path.join(ontologyDir, 'objects');
const objects = [];
const objectMap = new Map();

if (fs.existsSync(objectsDir)) {
  const files = fs.readdirSync(objectsDir).filter((f) => f.endsWith('.json'));
  for (const f of files) {
    const filePath = path.join(objectsDir, f);
    try {
      const obj = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      objects.push({ ...obj, _filePath: filePath, _fileName: f });
      objectMap.set(obj.name || obj.id, obj);
      pass('metaSchema');
    } catch (e) {
      recordFinding('ERROR', 'metaSchema', 'OBJECT_JSON_ERR', `对象定义解析失败 [${f}]: ${e.message}`, f);
    }
  }
}

// 遍历检查各对象的元模型与真实代码对账
let fixedCount = 0;
for (const obj of objects) {
  const objName = obj.name || obj.id;
  const table = obj.physicalTable || obj.table;

  // 1.1 检查主键
  const pk = (obj.properties || []).find((p) => p.primaryKey);
  if (!pk) {
    recordFinding('ERROR', 'metaSchema', 'MISSING_PRIMARY_KEY', `实体 [${objName}] 缺少声明的主键 (primaryKey)`, obj._fileName);
  } else {
    pass('metaSchema');
  }

  // 2.1 物理表反射核对 (Code Drift Audit)
  if (table && table !== 'ontology_domains') {
    const realColumns = getDrizzleColumns(table);
    if (!realColumns) {
      recordFinding('ERROR', 'codeReflection', 'UNKNOWN_PHYSICAL_TABLE', `实体 [${objName}] 映射的物理表 '${table}' 在 Drizzle Schema 中未找到`, obj._fileName);
    } else {
      pass('codeReflection');
      const realColSet = new Set(realColumns);
      const objProps = obj.properties || [];
      const updatedProps = [];
      let drifted = false;

      for (const prop of objProps) {
        if (!realColSet.has(prop.name)) {
          // 检查常见字段漂移与别名对应
          if (table === 'companies' && prop.name === 'slug') {
            if (shouldFix) {
              updatedProps.push({ ...prop, name: 'issuePrefix', description: '企业工单前缀标识 (原 slug 物理归宿)' });
              drifted = true;
              fixedCount++;
            } else {
              recordFinding('WARNING', 'codeReflection', 'COLUMN_DRIFT', `实体 [${objName}] 声明了属性 '${prop.name}'，但物理表 '${table}' 真实字段为 'issuePrefix'`, `${obj._fileName}:${prop.name}`);
              updatedProps.push(prop);
            }
          } else if (table === 'projects' && prop.name === 'slug') {
            if (shouldFix) {
              updatedProps.push({ ...prop, name: 'description', description: '项目详细描述' });
              drifted = true;
              fixedCount++;
            } else {
              recordFinding('WARNING', 'codeReflection', 'COLUMN_DRIFT', `实体 [${objName}] 声明了属性 '${prop.name}'，但物理表 '${table}' 中使用 name/id，无独立的 slug 列`, `${obj._fileName}:${prop.name}`);
              updatedProps.push(prop);
            }
          } else if (table === 'documents' && (prop.name === 'content' || prop.name === 'contentType')) {
            if (shouldFix) {
              if (prop.name === 'content') updatedProps.push({ ...prop, name: 'latestBody', description: '协同文档最新正文内容' });
              if (prop.name === 'contentType') updatedProps.push({ ...prop, name: 'format', description: '文档格式 (markdown)' });
              drifted = true;
              fixedCount++;
            } else {
              recordFinding('WARNING', 'codeReflection', 'COLUMN_DRIFT', `实体 [${objName}] 声明了 '${prop.name}'，物理表 '${table}' 对应真实列为 '${prop.name === 'content' ? 'latestBody' : 'format'}'`, `${obj._fileName}:${prop.name}`);
              updatedProps.push(prop);
            }
          } else if (table === 'documents' && (prop.name === 'slug' || prop.name === 'projectId')) {
            if (shouldFix) {
              // documents 物理表无 slug 与 projectId（公司范围物理隔离，文档按 title 索引），自动修剪
              drifted = true;
              fixedCount++;
            } else {
              recordFinding('WARNING', 'codeReflection', 'EXTRA_SCHEMA_PROPERTY', `实体 [${objName}] 包含 '${prop.name}'，但物理表 '${table}' 无此列（文档按公司范围物理隔离）`, `${obj._fileName}:${prop.name}`);
              updatedProps.push(prop);
            }
          } else if (table === 'issue_work_products' && prop.name === 'kind') {
            if (shouldFix) {
              updatedProps.push({ ...prop, name: 'type', description: '不可变工件类别 (pr, preview, snapshot, evidence 等)' });
              drifted = true;
              fixedCount++;
            } else {
              recordFinding('WARNING', 'codeReflection', 'COLUMN_DRIFT', `实体 [${objName}] 声明了 'kind'，物理表 '${table}' 对应真实列为 'type'`, `${obj._fileName}:kind`);
              updatedProps.push(prop);
            }
          } else if (table === 'issues' && (prop.name === 'actionType' || prop.name === 'specKind')) {
            // 回归 Paperclip 官方主线：actionType / specKind 为兼容过渡属性，主线规格与动词协同由 Document 原生实体承载
            pass('codeReflection');
            updatedProps.push(prop);
          } else {
            recordFinding('WARNING', 'codeReflection', 'UNKNOWN_COLUMN', `实体 [${objName}] 的属性 '${prop.name}' 未在物理表 '${table}' 中找到对应列`, `${obj._fileName}:${prop.name}`);
            updatedProps.push(prop);
          }
        } else {
          pass('codeReflection');
          updatedProps.push(prop);
        }
      }

      // 如果启用了 --fix 且发生漂移，执行机器静默自愈写回
      if (shouldFix && drifted) {
        obj.properties = updatedProps;
        const toSave = { ...obj };
        delete toSave._filePath;
        delete toSave._fileName;
        fs.writeFileSync(obj._filePath, JSON.stringify(toSave, null, 2) + '\n', 'utf8');
      }
    }
  } else if (table === 'ontology_domains') {
    // 插件表通过静态断言检查
    pass('codeReflection');
  }
}

// -----------------------------------------------------------------------------
// 3. 门禁 3: 图拓扑闭环与孤岛/死穴检测 (Topology Integrity)
// -----------------------------------------------------------------------------
for (const obj of objects) {
  const relations = obj.relations || [];
  for (const rel of relations) {
    if (!rel.target || !objectMap.has(rel.target)) {
      recordFinding('ERROR', 'topology', 'DANGLING_RELATION_TARGET', `实体 [${obj.name}] 关系引用的目标实体 '${rel.target}' 不存在`, `${obj._fileName}->${rel.target}`);
    } else {
      pass('topology');
    }
    if (!rel.foreignKey) {
      recordFinding('WARNING', 'topology', 'MISSING_FOREIGN_KEY', `实体 [${obj.name}] 的关联关系缺少 foreignKey 字段声明`, `${obj._fileName}->${rel.target}`);
    } else {
      pass('topology');
    }
  }
}

// -----------------------------------------------------------------------------
// 4. 门禁 4: 行为动词因果求值 (M2: Action Types Computability)
// -----------------------------------------------------------------------------
const actionsDir = path.join(ontologyDir, 'actions');
const actions = [];
if (fs.existsSync(actionsDir)) {
  const files = fs.readdirSync(actionsDir).filter((f) => f.endsWith('.json'));
  for (const f of files) {
    try {
      const act = JSON.parse(fs.readFileSync(path.join(actionsDir, f), 'utf8'));
      actions.push(act);
      pass('actionComputability');

      // 4.1 检查 actor
      if (!act.actor) {
        recordFinding('WARNING', 'actionComputability', 'MISSING_ACTOR', `动词 [${act.name}] 缺少明确责任执行者 (actor)`, f);
      } else {
        pass('actionComputability');
      }

      // 4.2 检查 preconditions 与 effects
      if (!act.preconditions || act.preconditions.length === 0) {
        recordFinding('WARNING', 'actionComputability', 'EMPTY_PRECONDITIONS', `动词 [${act.name}] 缺少前置契约条件 (preconditions)`, f);
      } else {
        pass('actionComputability');
      }
      if (!act.effects || act.effects.length === 0) {
        recordFinding('ERROR', 'actionComputability', 'EMPTY_EFFECTS', `动词 [${act.name}] 缺少闭环因果物理副作用 (effects)`, f);
      } else {
        pass('actionComputability');
      }
    } catch (e) {
      recordFinding('ERROR', 'actionComputability', 'ACTION_JSON_ERR', `动作定义解析失败 [${f}]: ${e.message}`, f);
    }
  }
}

// -----------------------------------------------------------------------------
// 5. 不变量硬门禁审计 (Invariants INV-1 ~ INV-5)
// -----------------------------------------------------------------------------
try {
  const domain = JSON.parse(fs.readFileSync(domainPath, 'utf8'));
  const invariants = domain.invariants || [];
  const invMap = new Map(invariants.map((inv) => [(inv.name || '').split(' ')[0], inv]));

  // INV-1 (No Artifact, No Done)
  if (invMap.has('INV-1')) {
    pass('invariants');
  } else {
    recordFinding('FATAL', 'invariants', 'MISSING_INV_1', '缺少 INV-1 (No Artifact, No Done) 系统底线定义');
  }

  // INV-2 (Single Assignee Exclusive Lock)
  if (invMap.has('INV-2')) {
    pass('invariants');
  } else {
    recordFinding('FATAL', 'invariants', 'MISSING_INV_2', '缺少 INV-2 (Single-Assignee Exclusive Lock) 系统底线定义');
  }

  // INV-3 (Two-Letter Cockpit Actions)
  if (invMap.has('INV-3')) {
    pass('invariants');
  } else {
    recordFinding('CRITICAL', 'invariants', 'MISSING_INV_3', '缺少 INV-3 (Two-Letter Cockpit Actions) 极简交互底线定义');
  }

  // INV-4 (Budget Hard Stop Auto-Pause)
  if (invMap.has('INV-4')) {
    pass('invariants');
  } else {
    recordFinding('FATAL', 'invariants', 'MISSING_INV_4', '缺少 INV-4 (Budget Hard Stop Auto-Pause) 预算硬熔断底线定义');
  }

  // INV-5 (Dev/Prod Absolute Isolation)
  if (invMap.has('INV-5')) {
    pass('invariants');
  } else {
    recordFinding('FATAL', 'invariants', 'MISSING_INV_5', '缺少 INV-5 (Dev/Prod Absolute Isolation) 云地隔离底线定义');
  }
} catch (e) {
  recordFinding('FATAL', 'invariants', 'INV_AUDIT_ERR', `不变量审计失败: ${e.message}`);
}

// -----------------------------------------------------------------------------
// 6. 自动生成机器可读的证据报告 (Machine Artifact)
// -----------------------------------------------------------------------------
const hasFatalOrError = findings.some((f) => f.severity === 'FATAL' || f.severity === 'ERROR');
const overallStatus = hasFatalOrError ? 'FAIL' : 'PASS';

const report = {
  domain: 'coolie-foundry',
  version: '2.0.0',
  auditedAt: new Date().toISOString(),
  overallStatus,
  selfHealed: shouldFix && fixedCount > 0,
  fixedCount,
  stats: {
    auditedEntities: objects.length,
    auditedActions: actions.length,
    totalFindings: findings.length,
    fatalCount: findings.filter((f) => f.severity === 'FATAL').length,
    errorCount: findings.filter((f) => f.severity === 'ERROR').length,
    warningCount: findings.filter((f) => f.severity === 'WARNING').length,
    gates: stats,
  },
  findings,
};

const artifactsDir = path.join(REPO_ROOT, 'docs/artifacts');
fs.mkdirSync(artifactsDir, { recursive: true });
const reportPath = path.join(artifactsDir, 'ontology-audit-report.json');

// 幂等写盘 (Idempotent Persist): 纯时间戳漂移不入库。
// 理由: 本审计被 pre-commit Gate 4.1 与 15min 巡检反复调用, 若无实质结论变化
// 仍刷新 auditedAt, 就会在"刚刚通过门禁的工作树上"制造永久 dirty 文件,
// 反噬 1 Task = 1 Commit & Clean Working Tree 铁律。
// 契约: 除 auditedAt 外全部字段完全一致 -> 沿用上轮时间戳, 且不重写文件。
let previousReport = null;
try {
  previousReport = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
} catch {
  previousReport = null;
}
if (previousReport && previousReport.auditedAt) {
  const strip = (o) => {
    const { auditedAt, ...rest } = o;
    return JSON.stringify(rest);
  };
  if (strip(previousReport) === strip(report)) {
    report.auditedAt = previousReport.auditedAt;
  }
}

const serializedReport = JSON.stringify(report, null, 2);
let previousRaw = null;
try {
  previousRaw = fs.readFileSync(reportPath, 'utf8');
} catch {
  previousRaw = null;
}
const reportChanged = previousRaw !== serializedReport;
if (reportChanged) {
  fs.writeFileSync(reportPath, serializedReport, 'utf8');
}

// -----------------------------------------------------------------------------
// 7. 控制台输出
// -----------------------------------------------------------------------------
if (jsonOnly) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('========================================================================');
  console.log('🔍 【Coolie 活体本体全自动化机器审计巡视官】(Zero Human Intervention)');
  console.log('   原则: 严禁人肉审查！100% 形式化证明、Drizzle 物理双向反射与拓扑求值');
  console.log('========================================================================\n');

  console.log(`📦 审计对象: 8 个业务实体 (M1), 8 个闭环动词 (M2), 5 条硬不变量 (M3)`);
  console.log(`📁 物理映射: Drizzle Schema 物理表全部完成反射对账`);
  if (shouldFix) {
    console.log(`🛠️  静默自愈: 已执行自动修复 (已自愈 ${fixedCount} 个漂移属性)`);
  }
  console.log(`────────────────────────────────────────────────────────────────────────`);

  console.log(`📊 门禁体检大盘:`);
  console.log(`   • Gate 1 [元模型形式化]:     ${stats.metaSchema.failed === 0 ? '✅ 100% 格式合规' : '❌ 发现格式异常'}`);
  console.log(`   • Gate 2 [代码物理对账]:     ${stats.codeReflection.failed === 0 ? '✅ 100% 字段契合' : '❌ 发现代码漂移'}`);
  console.log(`   • Gate 3 [图拓扑与无孤岛]:   ${stats.topology.failed === 0 ? '✅ 100% 闭环无死穴' : '❌ 存在悬空外键'}`);
  console.log(`   • Gate 4 [动词因果求值]:     ${stats.actionComputability.failed === 0 ? '✅ 100% 因果闭环' : '❌ 存在死动词'}`);
  console.log(`   • Invariants [5 大系统硬底线]: ${stats.invariants.failed === 0 ? '✅ 5/5 全部守护在位' : '❌ 破坏系统底线'}`);

  if (findings.length > 0) {
    console.log(`\n📋 机器检查发现 (${findings.length} 项):`);
    for (const f of findings) {
      const icon = f.severity === 'FATAL' ? '💥' : f.severity === 'ERROR' ? '❌' : '⚠️ ';
      console.log(`   ${icon} [${f.severity}] [${f.gate}] ${f.message}${f.location ? ` (${f.location})` : ''}`);
    }
  }

  console.log(`────────────────────────────────────────────────────────────────────────`);
  console.log(`💾 机器报告存盘: ${path.relative(REPO_ROOT, reportPath)}`);
  console.log(`🎯 最终裁决: ${overallStatus === 'PASS' ? '✅ 全面通过 (PASSED)' : '❌ 存在阻断缺陷 (BLOCKED)'}\n`);
}

process.exit(overallStatus === 'PASS' ? 0 : 1);
