import { describe, it, expect } from "vitest";
import {
  parseOntologyYamlBundle,
  yamlBundleToOntologyDocument,
  yamlBundleToMermaid,
  lintOntologyYamlBundle,
} from "@paperclipai/ontology-core";

describe("Declarative Ontology YAML Suite", () => {
  const sampleManifest = `
model_type: MANIFEST
version: "1.0"
domain: "test-domain"
model_files:
  - m1-objects.yaml
  - m2-behaviors.yaml
  - m3-rules.yaml
  - mu-views.yaml
`;

  const sampleObjects = `
model_type: OBJECT
version: "1.0"
domain: "test-domain"
aggregates:
  - id: AGG_CONTRACT
    name: 合同
    alias: Contract
    aggregateType: AGGREGATE_ROOT
    lifecycle: [草稿, 待审批, 生效]
    attributes:
      - name: id
        label: 主键
        type: String
        required: true
      - name: status
        label: 状态
        type: String
      - name: amount
        label: 金额
        type: Decimal
`;

  const sampleBehaviors = `
model_type: BEHAVIOR
version: "1.0"
domain: "test-domain"
behaviors:
  - id: Contract_Submit
    name: 提交合同
    ownerEntity: AGG_CONTRACT
    behaviorType: COMMAND
    triggerType: USER_ACTION
    appliedRules:
      - RULE_AMOUNT_POSITIVE
    postconditions:
      - field: status
        setValue: 待审批
`;

  const sampleRules = `
model_type: RULE
version: "1.0"
domain: "test-domain"
rules:
  - id: RULE_AMOUNT_POSITIVE
    name: 金额为正
    ruleType: VALIDATION
    conditionExpression: "record.amount > 0"
    errorMessage: "合同金额必须大于 0"
`;

  const sampleUi = `
model_type: UI
version: "1.0"
domain: "test-domain"
screens:
  - id: SCR_CONTRACT_FORM
    name: 合同表单
    routePath: /contracts/edit
    targetEntity: AGG_CONTRACT
    screenType: FORM_EDIT
    actionPoints:
      - id: btn_submit
        label: 提交
        behaviorRef: Contract_Submit
`;

  it("should parse multi-file YAML bundle accurately", () => {
    const bundle = parseOntologyYamlBundle({
      "manifest.yaml": sampleManifest,
      "m1-objects.yaml": sampleObjects,
      "m2-behaviors.yaml": sampleBehaviors,
      "m3-rules.yaml": sampleRules,
      "mu-views.yaml": sampleUi,
    });

    expect(bundle.manifest?.domain).toBe("test-domain");
    expect(bundle.objects?.aggregates.length).toBe(1);
    expect(bundle.behaviors?.behaviors.length).toBe(1);
    expect(bundle.rules?.rules.length).toBe(1);
    expect(bundle.ui?.screens.length).toBe(1);
  });

  it("should pass static lint audit for clean model bundle", () => {
    const bundle = parseOntologyYamlBundle({
      "m1-objects.yaml": sampleObjects,
      "m2-behaviors.yaml": sampleBehaviors,
      "m3-rules.yaml": sampleRules,
      "mu-views.yaml": sampleUi,
    });

    const findings = lintOntologyYamlBundle(bundle);
    const errors = findings.filter((f) => f.severity === "error");
    expect(errors.length).toBe(0);
  });

  it("should catch dead UI button referencing non-existing behavior", () => {
    const brokenUi = sampleUi.replace("Contract_Submit", "NonExisting_Action");
    const bundle = parseOntologyYamlBundle({
      "m1-objects.yaml": sampleObjects,
      "m2-behaviors.yaml": sampleBehaviors,
      "m3-rules.yaml": sampleRules,
      "mu-views.yaml": brokenUi,
    });

    const findings = lintOntologyYamlBundle(bundle);
    const deadButton = findings.find((f) => f.code === "DEAD_UI_BUTTON");
    expect(deadButton).toBeDefined();
    expect(deadButton?.message).toContain("NonExisting_Action");
  });

  it("should catch illegal state transition violating lifecycle", () => {
    const brokenBehavior = sampleBehaviors.replace("待审批", "非法未定义状态");
    const bundle = parseOntologyYamlBundle({
      "m1-objects.yaml": sampleObjects,
      "m2-behaviors.yaml": brokenBehavior,
      "m3-rules.yaml": sampleRules,
      "mu-views.yaml": sampleUi,
    });

    const findings = lintOntologyYamlBundle(bundle);
    const stateErr = findings.find((f) => f.code === "ILLEGAL_LIFECYCLE_STATE");
    expect(stateErr).toBeDefined();
    expect(stateErr?.message).toContain("非法未定义状态");
  });

  it("should transpile YAML bundle to standard OntologyDocument", () => {
    const bundle = parseOntologyYamlBundle({
      "manifest.yaml": sampleManifest,
      "m1-objects.yaml": sampleObjects,
      "m2-behaviors.yaml": sampleBehaviors,
      "m3-rules.yaml": sampleRules,
      "mu-views.yaml": sampleUi,
    });

    const doc = yamlBundleToOntologyDocument(bundle);
    expect(doc.format).toBe("paperclip.ontology/1");
    expect(doc.name).toBe("test-domain");
    expect(doc.objectTypes.length).toBe(1);
    expect(doc.objectTypes[0].key).toBe("Contract");
    expect(doc.objectTypes[0].properties.map((p) => p.name)).toContain("amount");
  });

  it("should compile YAML bundle to Mermaid ER diagram and state transitions", () => {
    const bundle = parseOntologyYamlBundle({
      "m1-objects.yaml": sampleObjects,
      "m2-behaviors.yaml": sampleBehaviors,
      "m3-rules.yaml": sampleRules,
      "mu-views.yaml": sampleUi,
    });

    const { erDiagram, stateDiagrams } = yamlBundleToMermaid(bundle);
    expect(erDiagram).toContain("erDiagram");
    expect(erDiagram).toContain("Contract");
    expect(stateDiagrams["Contract"]).toContain("stateDiagram-v2");
    expect(stateDiagrams["Contract"]).toContain("草稿");
  });
});
