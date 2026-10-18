/**
 * ============================================================================
 * Coolie Spec-Kit 声明式活体本体 YAML 驱动引擎 (Spec-Kit Ontology Driver)
 * 全面整合 GitHub ODD 七模型标准与 Palantir Foundry 活体本体双核
 * ============================================================================
 */

const fs = require("node:fs");
const path = require("node:path");
let yaml;
try {
  yaml = require("js-yaml");
} catch {
  try {
    yaml = require(path.resolve(__dirname, "../../node_modules/.pnpm/js-yaml@4.3.1/node_modules/js-yaml"));
  } catch (err) {
    // Lazy fallback
  }
}

const ROOT = path.resolve(__dirname, "../..");

/**
 * 1. 初始化特性的声明式本体 YAML 骨架 (在 specs/<domain>/<name>/ontology/ 下)
 */
function initOntologyYaml(targetDir, domain, specName, title) {
  const ontologyDir = path.join(targetDir, "ontology");
  fs.mkdirSync(ontologyDir, { recursive: true });

  const upperSpec = specName.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();
  const aggId = `AGG_${domain.toUpperCase()}_${upperSpec}`;

  // 1. manifest.yaml
  const manifest = {
    model_type: "MANIFEST",
    version: "1.0",
    domain: domain,
    project: specName,
    title: title || specName,
    framework: "ontology_modeling_framework_v9.md",
    model_files: [
      "m1-objects.yaml",
      "m2-behaviors.yaml",
      "m3-rules.yaml",
      "m5-actors.yaml",
      "m6-flows.yaml",
      "mu-views.yaml",
    ],
  };
  fs.writeFileSync(path.join(ontologyDir, "manifest.yaml"), yaml.dump(manifest, { indent: 2 }), "utf8");

  // 2. m1-objects.yaml
  const m1 = {
    model_type: "OBJECT",
    version: "1.0",
    domain: domain,
    aggregates: [
      {
        id: aggId,
        name: title || specName,
        alias: specName,
        aggregateType: "AGGREGATE_ROOT",
        description: `${title || specName} 核心业务聚合根`,
        lifecycle: ["草稿", "待审批", "生效中", "已结项", "已废弃"],
        tags: ["业务核心", domain],
        attributes: [
          { name: "id", label: "主键 ID", type: "String", required: true, unique: true },
          { name: "company_id", label: "租户企业 ID", type: "String", required: true },
          { name: "biz_no", label: "业务单号", type: "String", required: true, unique: true },
          { name: "status", label: "生命周期状态", type: "String", required: true },
          { name: "title", label: "标题说明", type: "String", required: true },
          { name: "amount", label: "结算金额", type: "Decimal", required: false },
          { name: "created_at", label: "创建时间", type: "DateTime", required: true },
          { name: "updated_at", label: "更新时间", type: "DateTime", required: true },
        ],
        relations: [],
      },
    ],
  };
  fs.writeFileSync(path.join(ontologyDir, "m1-objects.yaml"), yaml.dump(m1, { indent: 2 }), "utf8");

  // 3. m2-behaviors.yaml
  const m2 = {
    model_type: "BEHAVIOR",
    version: "1.0",
    domain: domain,
    behaviors: [
      {
        id: `${specName}_save_draft`,
        name: "保存草稿",
        ownerEntity: aggId,
        behaviorType: "COMMAND",
        triggerType: "USER_ACTION",
        summary: "经办人暂存业务单据草稿",
        apiContract: {
          httpMethod: "POST",
          routePath: `/api/v1/${domain}/${specName}/draft`,
        },
        preconditions: ["status in ('草稿', '已驳回')"],
        postconditions: [{ field: "status", setValue: "草稿" }],
        appliedRules: [`RULE_${upperSpec}_MULTI_TENANT_ISOLATION`],
        requiredPermissions: [`perm:${domain}:${specName}:create`],
        syncTriggers: [],
      },
      {
        id: `${specName}_submit`,
        name: "提交审批",
        ownerEntity: aggId,
        behaviorType: "COMMAND",
        triggerType: "USER_ACTION",
        summary: "提交单据进入跨角色审批流",
        apiContract: {
          httpMethod: "POST",
          routePath: `/api/v1/${domain}/${specName}/submit`,
        },
        preconditions: ["status == '草稿'", "title != null && title != ''"],
        postconditions: [{ field: "status", setValue: "待审批" }],
        appliedRules: [
          `RULE_${upperSpec}_MULTI_TENANT_ISOLATION`,
          `RULE_${upperSpec}_SUBMIT_CHECK`,
        ],
        requiredPermissions: [`perm:${domain}:${specName}:submit`],
        syncTriggers: [],
      },
    ],
  };
  fs.writeFileSync(path.join(ontologyDir, "m2-behaviors.yaml"), yaml.dump(m2, { indent: 2 }), "utf8");

  // 4. m3-rules.yaml
  const m3 = {
    model_type: "RULE",
    version: "1.0",
    domain: domain,
    rules: [
      {
        id: `RULE_${upperSpec}_MULTI_TENANT_ISOLATION`,
        name: "多企业租户物理隔离规则",
        ruleType: "VALIDATION",
        ownerEntity: aggId,
        conditionExpression: "current_company_id == record.company_id",
        errorMessage: "越权访问：禁止跨企业操作业务实体",
      },
      {
        id: `RULE_${upperSpec}_SUBMIT_CHECK`,
        name: "提审完整性与前置校验",
        ruleType: "GATE",
        ownerEntity: aggId,
        conditionExpression: "record.title != null && record.title.length >= 2",
        errorMessage: "单据提交失败：标题不能为空且长度须不少于2个字",
      },
    ],
  };
  fs.writeFileSync(path.join(ontologyDir, "m3-rules.yaml"), yaml.dump(m3, { indent: 2 }), "utf8");

  // 5. m5-actors.yaml
  const m5 = {
    model_type: "ACTOR",
    version: "1.0",
    domain: domain,
    roles: [
      {
        id: `ROLE_${upperSpec}_OPERATOR`,
        name: "前线业务经办人",
        code: `${domain}_operator`,
        roleType: "INTERNAL",
        permissions: [`perm:${domain}:${specName}:create`, `perm:${domain}:${specName}:submit`],
        dataScope: "SELF",
      },
      {
        id: `ROLE_${upperSpec}_APPROVER`,
        name: "交付总监/掌柜审批官",
        code: `${domain}_approver`,
        roleType: "INTERNAL",
        permissions: [`perm:${domain}:${specName}:approve`, `perm:${domain}:${specName}:reject`],
        dataScope: "ALL",
      },
    ],
  };
  fs.writeFileSync(path.join(ontologyDir, "m5-actors.yaml"), yaml.dump(m5, { indent: 2 }), "utf8");

  // 6. m6-flows.yaml
  const m6 = {
    model_type: "FLOW",
    version: "1.0",
    domain: domain,
    flows: [
      {
        id: `FLOW_${upperSpec}_APPROVAL`,
        name: `${title || specName} 审批协同流`,
        flowType: "APPROVAL",
        ownerEntity: aggId,
        startState: "草稿",
        endStates: ["生效中", "已废弃"],
        activities: [
          {
            id: "ACT_01",
            name: "经办人提交",
            activityType: "USER_TASK",
            roleRef: `ROLE_${upperSpec}_OPERATOR`,
            behaviorRef: `${specName}_submit`,
            next: ["ACT_GATE_01"],
          },
          {
            id: "ACT_GATE_01",
            name: "提审完整性网关",
            activityType: "GATEWAY",
            ruleRef: `RULE_${upperSpec}_SUBMIT_CHECK`,
            next: ["ACT_02"],
          },
          {
            id: "ACT_02",
            name: "掌柜/总监复核",
            activityType: "USER_TASK",
            roleRef: `ROLE_${upperSpec}_APPROVER`,
            next: ["END"],
          },
        ],
      },
    ],
  };
  fs.writeFileSync(path.join(ontologyDir, "m6-flows.yaml"), yaml.dump(m6, { indent: 2 }), "utf8");

  // 7. mu-views.yaml
  const mu = {
    model_type: "UI",
    version: "1.0",
    domain: domain,
    screens: [
      {
        id: `SCR_${upperSpec}_CONSOLE`,
        name: `${title || specName} 移动/Web 极简工作台`,
        routePath: `/${domain}/${specName}`,
        targetEntity: aggId,
        screenType: "FORM_EDIT",
        actionPoints: [
          {
            id: "btn_save",
            label: "保存",
            behaviorRef: `${specName}_save_draft`,
            style: "SECONDARY",
            isDraftOrSubmit: true,
          },
          {
            id: "btn_submit",
            label: "提交",
            behaviorRef: `${specName}_submit`,
            style: "PRIMARY",
            confirmPrompt: "确认提交进入审批流？",
            isDraftOrSubmit: true,
          },
        ],
      },
    ],
  };
  fs.writeFileSync(path.join(ontologyDir, "mu-views.yaml"), yaml.dump(mu, { indent: 2 }), "utf8");

  return ontologyDir;
}

/**
 * 2. 读取指定目录下的全部本体 YAML 并装配为 Bundle
 */
function loadOntologyYaml(ontologyDir) {
  if (!fs.existsSync(ontologyDir)) return null;

  const bundle = {};
  const files = fs.readdirSync(ontologyDir);

  for (const file of files) {
    if (!file.endsWith(".yaml") && !file.endsWith(".yml")) continue;
    const fullPath = path.join(ontologyDir, file);
    try {
      const doc = yaml.load(fs.readFileSync(fullPath, "utf8"));
      if (!doc || typeof doc !== "object") continue;

      const type = doc.model_type;
      if (type === "MANIFEST") bundle.manifest = doc;
      else if (type === "OBJECT") bundle.objects = doc;
      else if (type === "BEHAVIOR") bundle.behaviors = doc;
      else if (type === "RULE") bundle.rules = doc;
      else if (type === "ACTOR") bundle.actors = doc;
      else if (type === "FLOW") bundle.flows = doc;
      else if (type === "REPORT") bundle.reports = doc;
      else if (type === "UI") bundle.ui = doc;
    } catch (e) {
      throw new Error(`YAML 解析错误 [${file}]: ${e.message}`);
    }
  }

  return bundle;
}

/**
 * 3. 静态门禁与交叉引用审计 (Lint)
 */
function lintOntologyYaml(ontologyDir) {
  const bundle = loadOntologyYaml(ontologyDir);
  if (!bundle) {
    return [{ severity: "error", code: "NO_ONTOLOGY_DIR", message: `未找到本体目录: ${ontologyDir}` }];
  }

  const findings = [];
  const aggregates = bundle.objects?.aggregates || [];
  const behaviors = bundle.behaviors?.behaviors || [];
  const rules = bundle.rules?.rules || [];
  const roles = bundle.actors?.roles || [];
  const screens = bundle.ui?.screens || [];
  const flows = bundle.flows?.flows || [];

  const aggIds = new Set(aggregates.map((a) => a.id));
  const aggAliasMap = new Map(aggregates.map((a) => [a.id, a]));
  const behaviorIds = new Set(behaviors.map((b) => b.id));
  const ruleIds = new Set(rules.map((r) => r.id));
  const roleIds = new Set(roles.map((r) => r.id));

  // 1. 检查 UI ActionPoints
  const uiUsedBehaviors = new Set();
  for (const scr of screens) {
    for (const ap of scr.actionPoints || []) {
      uiUsedBehaviors.add(ap.behaviorRef);
      if (!behaviorIds.has(ap.behaviorRef)) {
        findings.push({
          severity: "error",
          code: "DEAD_UI_BUTTON",
          message: `UI [${scr.name}] 的按钮 [${ap.label}] 引用了未定义的行为: '${ap.behaviorRef}'`,
        });
      }
    }
  }

  // 2. 检查 Behaviors
  for (const b of behaviors) {
    if (!aggIds.has(b.ownerEntity)) {
      findings.push({
        severity: "error",
        code: "UNKNOWN_OWNER_ENTITY",
        message: `行为 [${b.name} (${b.id})] 归属实体 '${b.ownerEntity}' 未在 M1 中定义`,
      });
    }

    if (b.triggerType === "USER_ACTION" && !uiUsedBehaviors.has(b.id)) {
      findings.push({
        severity: "warning",
        code: "UNREFERENCED_USER_ACTION",
        message: `用户行为 [${b.name} (${b.id})] 未在任何 UI 界面中作为按钮入口引用 (孤立动词)`,
      });
    }

    for (const rId of b.appliedRules || []) {
      if (!ruleIds.has(rId)) {
        findings.push({
          severity: "error",
          code: "UNDEFINED_RULE",
          message: `行为 [${b.name} (${b.id})] 引用的规则 '${rId}' 未在 M3 中定义`,
        });
      }
    }

    // 状态机闭环
    const ownerAgg = aggAliasMap.get(b.ownerEntity);
    if (ownerAgg && ownerAgg.lifecycle && ownerAgg.lifecycle.length > 0) {
      const allowed = new Set(ownerAgg.lifecycle);
      for (const p of b.postconditions || []) {
        if (p.field.toLowerCase().includes("status") && !allowed.has(p.setValue)) {
          findings.push({
            severity: "error",
            code: "ILLEGAL_STATE_TRANSITION",
            message: `行为 [${b.name}] 将状态跳变为 '${p.setValue}'，该值不在实体生命周期 [${ownerAgg.lifecycle.join(", ")}] 中`,
          });
        }
      }
    }
  }

  // 3. 检查 Flows
  for (const f of flows) {
    for (const act of f.activities || []) {
      if (act.roleRef && !roleIds.has(act.roleRef)) {
        findings.push({
          severity: "error",
          code: "UNDEFINED_ROLE",
          message: `流程活动 [${act.name}] 引用的角色 '${act.roleRef}' 未在 M5 中定义`,
        });
      }
      if (act.behaviorRef && !behaviorIds.has(act.behaviorRef)) {
        findings.push({
          severity: "error",
          code: "FLOW_UNDEFINED_BEHAVIOR",
          message: `流程活动 [${act.name}] 引用的行为 '${act.behaviorRef}' 未在 M2 中定义`,
        });
      }
    }
  }

  return findings;
}

/**
 * 4. 自动编译生成 Mermaid 拓扑图与契约 Markdown
 */
function buildOntologyMermaid(ontologyDir) {
  const bundle = loadOntologyYaml(ontologyDir);
  if (!bundle) return "";

  const lines = [];

  lines.push("### 1. 领域实体模型 (M1 Object ER Diagram)");
  lines.push("```mermaid");
  lines.push("erDiagram");
  for (const agg of bundle.objects?.aggregates || []) {
    const key = (agg.alias || agg.id).replace(/-/g, "_");
    lines.push(`    ${key} {`);
    for (const attr of agg.attributes || []) {
      lines.push(`        ${attr.type} ${attr.name} "${attr.label || attr.name}"`);
    }
    lines.push(`    }`);
  }
  lines.push("```\n");

  lines.push("### 2. 状态机生命周期跃迁 (State Transition Diagram)");
  for (const agg of bundle.objects?.aggregates || []) {
    if (!agg.lifecycle || agg.lifecycle.length === 0) continue;
    lines.push(`#### 实体 [${agg.name}] 生命周期图`);
    lines.push("```mermaid");
    lines.push("stateDiagram-v2");
    lines.push(`    [*] --> ${agg.lifecycle[0]}`);
    for (let i = 0; i < agg.lifecycle.length - 1; i++) {
      lines.push(`    ${agg.lifecycle[i]} --> ${agg.lifecycle[i + 1]}`);
    }
    lines.push("```\n");
  }

  lines.push("### 3. 核心业务动词契约清单 (M2 Action Contract Table)");
  lines.push("| 行为 ID | 动词名称 | 触发类型 | 前置条件 | 跃迁状态 | 规则守卫 |");
  lines.push("| :--- | :--- | :--- | :--- | :--- | :--- |");
  for (const b of bundle.behaviors?.behaviors || []) {
    const pre = (b.preconditions || []).join("; ") || "-";
    const post = (b.postconditions || []).map((p) => `${p.field}=${p.setValue}`).join("; ") || "-";
    const rules = (b.appliedRules || []).join(", ") || "-";
    lines.push(`| \`${b.id}\` | **${b.name}** | \`${b.triggerType}\` | ${pre} | \`${post}\` | ${rules} |`);
  }
  lines.push("\n");

  return lines.join("\n");
}

module.exports = {
  initOntologyYaml,
  loadOntologyYaml,
  lintOntologyYaml,
  buildOntologyMermaid,
};
