import type { PlaybookDefinition } from "../types.js";
import { governanceWaiverTestPlaybook } from "./testing/governance-waiver.playbook.js";
import { inboxApprovalsTestPlaybook } from "./testing/inbox-approvals.playbook.js";
import { ontologyDomainsTestPlaybook } from "./testing/ontology-domains.playbook.js";
import { mobileAppTestPlaybook } from "./testing/mobile-app.playbook.js";

import { governancePatrolOpsPlaybook } from "./operations/governance-patrol.playbook.js";
import { inboxTriageOpsPlaybook } from "./operations/inbox-triage.playbook.js";
import { ontologyPatrolOpsPlaybook } from "./operations/ontology-patrol.playbook.js";
import { mobileOtaCheckOpsPlaybook } from "./operations/mobile-ota-check.playbook.js";

export * from "./testing/governance-waiver.playbook.js";
export * from "./testing/inbox-approvals.playbook.js";
export * from "./testing/ontology-domains.playbook.js";
export * from "./testing/mobile-app.playbook.js";

export * from "./operations/governance-patrol.playbook.js";
export * from "./operations/inbox-triage.playbook.js";
export * from "./operations/ontology-patrol.playbook.js";
export * from "./operations/mobile-ota-check.playbook.js";

export const ALL_PLAYBOOKS: PlaybookDefinition[] = [
  // 自动化测试用例
  governanceWaiverTestPlaybook,
  inboxApprovalsTestPlaybook,
  ontologyDomainsTestPlaybook,
  mobileAppTestPlaybook,

  // 自动化运营剧本
  governancePatrolOpsPlaybook,
  inboxTriageOpsPlaybook,
  ontologyPatrolOpsPlaybook,
  mobileOtaCheckOpsPlaybook,
];

export function findPlaybook(id: string): PlaybookDefinition {
  const pb = ALL_PLAYBOOKS.find((p) => p.id === id);
  if (!pb) {
    throw new Error(`未找到 Playbook: ${id}。可选列表: ${ALL_PLAYBOOKS.map((p) => p.id).join(", ")}`);
  }
  return pb;
}

export function listPlaybooksByDomain(domain: string): PlaybookDefinition[] {
  return ALL_PLAYBOOKS.filter((p) => p.targetDomain === domain);
}

export function listPlaybooksByPersona(personaId: string): PlaybookDefinition[] {
  return ALL_PLAYBOOKS.filter((p) => p.preferredPersona === personaId);
}
