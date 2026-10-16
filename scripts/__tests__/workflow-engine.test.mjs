import assert from "node:assert/strict";
import test from "node:test";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "../..");
const ENGINE_SCRIPT = path.join(ROOT, "scripts", "workflow-engine.cjs");

test("workflow-engine list outputs all discovered recipes including business-recipes", () => {
  const output = execSync(`node ${ENGINE_SCRIPT} list`, { cwd: ROOT, encoding: "utf8" });
  assert.ok(output.includes("architecture-refactor"), "Must list architecture-refactor");
  assert.ok(output.includes("bugfix"), "Must list bugfix");
  assert.ok(output.includes("cmmi-full-lifecycle"), "Must list cmmi-full-lifecycle");
  assert.ok(output.includes("feature-delivery"), "Must list feature-delivery");
  assert.ok(output.includes("foundry-readiness-canary"), "Must list foundry-readiness-canary");
  assert.ok(output.includes("security-patch"), "Must list security-patch");
  assert.ok(output.includes("commercial-backend-module"), "Must list commercial-backend-module");
  assert.ok(output.includes("quad-terminal-feature"), "Must list quad-terminal-feature");
  assert.ok(output.includes("共 8 个配方"), "Must report 8 recipes");
});

test("workflow-engine list with --category business isolates business recipes", () => {
  const output = execSync(`node ${ENGINE_SCRIPT} list --category business`, { cwd: ROOT, encoding: "utf8" });
  assert.ok(output.includes("commercial-backend-module"), "Must include commercial-backend-module");
  assert.ok(output.includes("quad-terminal-feature"), "Must include quad-terminal-feature");
  assert.ok(!output.includes("bugfix.workflow.json"), "Must not include bugfix");
  assert.ok(!output.includes("security-patch.workflow.json"), "Must not include security-patch");
  assert.ok(output.includes("共 2 个配方"), "Must report 2 business recipes");
});

test("workflow-engine check passes all 8 recipes with valid DAGs and 2PC phases", () => {
  const output = execSync(`node ${ENGINE_SCRIPT} check`, { cwd: ROOT, encoding: "utf8" });
  assert.ok(output.includes("全部工作流配方静态与 DAG 依赖校验 100% 通过"), "Check must pass 100%");
  assert.ok(output.includes("commercial-backend-module.workflow.json"), "Must check commercial-backend-module");
  assert.ok(output.includes("quad-terminal-feature.workflow.json"), "Must check quad-terminal-feature");
});

test("workflow-engine dry-run expands variables, renders Mermaid DAG and 2PC tags", () => {
  const output = execSync(
    `node ${ENGINE_SCRIPT} dry-run --recipe commercial-backend-module --name points-mall --domain trade --title "积分商城微服务"`,
    { cwd: ROOT, encoding: "utf8" }
  );
  assert.ok(output.includes("flowchart TD"), "Must render Mermaid flowchart");
  assert.ok(output.includes("domain-modeling"), "Must include domain-modeling step");
  assert.ok(output.includes("[2PC: PREPARE]"), "Must identify 2PC Prepare phase");
  assert.ok(output.includes("[2PC: COMMIT]"), "Must identify 2PC Commit phase");
  assert.ok(output.includes("points-mall"), "Must interpolate variable 'points-mall'");
  assert.ok(output.includes("docs/03_design/interface-contracts/api-definitions.md"), "Must show output doc path");
});

test("workflow-engine dry-run quad-terminal-feature renders 4-terminal parallel DAG", () => {
  const output = execSync(
    `node ${ENGINE_SCRIPT} dry-run --recipe quad-terminal-feature --name refund-flow --domain mall --title "全渠道退款仲裁"`,
    { cwd: ROOT, encoding: "utf8" }
  );
  assert.ok(output.includes("vue3-admin-quad"), "Must include vue3-admin-quad step");
  assert.ok(output.includes("uniapp-miniapp"), "Must include uniapp-miniapp step");
  assert.ok(output.includes("expo-native-app"), "Must include expo-native-app step");
  assert.ok(output.includes("quad-humanlike-e2e"), "Must include quad-humanlike-e2e step");
});

test("workflow-engine throws informative error for non-existent recipe", () => {
  assert.throws(
    () => {
      execSync(`node ${ENGINE_SCRIPT} dry-run --recipe non-existent-recipe`, { cwd: ROOT, encoding: "utf8", stdio: "pipe" });
    },
    (err) => {
      return err.stderr.includes("找不到工作流配方") || err.message.includes("找不到工作流配方");
    }
  );
});
