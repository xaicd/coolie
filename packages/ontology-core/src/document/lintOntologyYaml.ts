/**
 * ============================================================================
 * Coolie 声明式活体本体 YAML 静态守卫与交叉门禁审计器 (Ontology YAML Linter)
 * 严格执行 CMMI G2/G3 质量门禁与可追溯性铁律
 * ============================================================================
 */

import type { OntologyYamlBundle } from "./OntologyYamlTypes.js";

export type LintSeverity = "error" | "warning";

export interface YamlFinding {
  severity: LintSeverity;
  code: string;
  message: string;
  location?: string;
}

export function lintOntologyYamlBundle(bundle: OntologyYamlBundle): YamlFinding[] {
  const findings: YamlFinding[] = [];

  const aggregates = bundle.objects?.aggregates ?? [];
  const behaviors = bundle.behaviors?.behaviors ?? [];
  const rules = bundle.rules?.rules ?? [];
  const roles = bundle.actors?.roles ?? [];
  const flows = bundle.flows?.flows ?? [];
  const reports = bundle.reports?.reports ?? [];
  const screens = bundle.ui?.screens ?? [];

  const aggregateIds = new Set(aggregates.map((a) => a.id));
  const aggregateAliasMap = new Map(aggregates.map((a) => [a.id, a]));
  const behaviorIds = new Set(behaviors.map((b) => b.id));
  const ruleIds = new Set(rules.map((r) => r.id));
  const roleIds = new Set(roles.map((r) => r.id));

  // 收集所有 UI 操作功能点引用的行为
  const uiReferencedBehaviors = new Set<string>();
  for (const screen of screens) {
    for (const ap of screen.actionPoints ?? []) {
      uiReferencedBehaviors.add(ap.behaviorRef);
      // 门禁 1: UI 按钮引用的行为必须存在 (消灭死按钮)
      if (!behaviorIds.has(ap.behaviorRef)) {
        findings.push({
          severity: "error",
          code: "DEAD_UI_BUTTON",
          message: `UI 界面 [${screen.name} (${screen.id})] 的操作点 [${ap.label} (${ap.id})] 引用了不存在的行为: '${ap.behaviorRef}'`,
          location: `ui.screens[${screen.id}].actionPoints[${ap.id}]`,
        });
      }
    }
  }

  // 校验行为模型 (M2)
  for (const b of behaviors) {
    // 门禁 2: 行为归属实体必须在 M1 中定义
    if (!aggregateIds.has(b.ownerEntity)) {
      findings.push({
        severity: "error",
        code: "UNKNOWN_OWNER_ENTITY",
        message: `行为 [${b.name} (${b.id})] 归属的实体 '${b.ownerEntity}' 在 M1 对象模型中未定义`,
        location: `behaviors[${b.id}].ownerEntity`,
      });
    }

    // 门禁 3: USER_ACTION 行为必须至少被一个 UI 功能点引用 (消灭孤立僵尸接口，反向可追溯)
    if (b.triggerType === "USER_ACTION" && !uiReferencedBehaviors.has(b.id)) {
      findings.push({
        severity: "warning",
        code: "UNREFERENCED_USER_ACTION",
        message: `用户触发行为 [${b.name} (${b.id})] 未被任何 MU 操作功能点引用，存在界面孤立风险`,
        location: `behaviors[${b.id}]`,
      });
    }

    // 门禁 4: 行为引用的业务规则必须在 M3 中定义
    for (const ruleId of b.appliedRules ?? []) {
      if (!ruleIds.has(ruleId)) {
        findings.push({
          severity: "error",
          code: "UNDEFINED_RULE_REF",
          message: `行为 [${b.name} (${b.id})] 引用的业务规则 '${ruleId}' 在 M3 规则模型中未定义`,
          location: `behaviors[${b.id}].appliedRules`,
        });
      }
    }

    // 门禁 5: 同步联动 (syncTriggers) 校验
    for (const sync of b.syncTriggers ?? []) {
      if (!behaviorIds.has(sync.invokeBehavior)) {
        findings.push({
          severity: "error",
          code: "DEAD_SYNC_TRIGGER",
          message: `行为 [${b.name} (${b.id})] 的同步联动目标行为 '${sync.invokeBehavior}' 不存在`,
          location: `behaviors[${b.id}].syncTriggers`,
        });
      }
      if (sync.whenRule && !ruleIds.has(sync.whenRule)) {
        findings.push({
          severity: "error",
          code: "UNDEFINED_SYNC_RULE",
          message: `行为 [${b.name} (${b.id})] 的同步联动判定规则 '${sync.whenRule}' 在 M3 规则模型中未定义`,
          location: `behaviors[${b.id}].syncTriggers`,
        });
      }
    }

    // 门禁 6: 状态机跳变闭环性校验
    const ownerAgg = aggregateAliasMap.get(b.ownerEntity);
    if (ownerAgg?.lifecycle && ownerAgg.lifecycle.length > 0) {
      const allowedStates = new Set(ownerAgg.lifecycle);
      for (const post of b.postconditions ?? []) {
        if (
          post.field.toLowerCase().includes("status") &&
          !allowedStates.has(post.setValue)
        ) {
          findings.push({
            severity: "error",
            code: "ILLEGAL_LIFECYCLE_STATE",
            message: `行为 [${b.name} (${b.id})] 将状态跳变为 '${post.setValue}'，但该状态未在实体 [${ownerAgg.name}] 的生命周期集合 [${ownerAgg.lifecycle.join(", ")}] 中定义`,
            location: `behaviors[${b.id}].postconditions`,
          });
        }
      }
    }
  }

  // 校验流程模型 (M6)
  for (const flow of flows) {
    if (!aggregateIds.has(flow.ownerEntity)) {
      findings.push({
        severity: "error",
        code: "FLOW_UNKNOWN_ENTITY",
        message: `流程 [${flow.name} (${flow.id})] 所属实体 '${flow.ownerEntity}' 不存在`,
        location: `flows[${flow.id}].ownerEntity`,
      });
    }

    for (const act of flow.activities ?? []) {
      if (act.roleRef && !roleIds.has(act.roleRef)) {
        findings.push({
          severity: "error",
          code: "FLOW_UNDEFINED_ROLE",
          message: `流程活动 [${act.name} (${act.id})] 引用的角色 '${act.roleRef}' 在 M5 角色模型中未定义`,
          location: `flows[${flow.id}].activities[${act.id}].roleRef`,
        });
      }
      if (act.behaviorRef && !behaviorIds.has(act.behaviorRef)) {
        findings.push({
          severity: "error",
          code: "FLOW_UNDEFINED_BEHAVIOR",
          message: `流程活动 [${act.name} (${act.id})] 绑定的行为 '${act.behaviorRef}' 在 M2 行为模型中未定义`,
          location: `flows[${flow.id}].activities[${act.id}].behaviorRef`,
        });
      }
    }
  }

  // 校验报表模型 (M7)
  for (const report of reports) {
    if (!behaviorIds.has(report.behaviorRef)) {
      findings.push({
        severity: "error",
        code: "REPORT_MISSING_BEHAVIOR",
        message: `报表 [${report.name} (${report.id})] 未绑定合法的 M2 查询行为 '${report.behaviorRef}'`,
        location: `reports[${report.id}].behaviorRef`,
      });
    }
  }

  return findings;
}
