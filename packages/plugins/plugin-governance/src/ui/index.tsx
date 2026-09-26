import type { PluginDetailTabProps } from "@paperclipai/plugin-sdk/ui";
import { ProjectCmmiGovernance } from "./ProjectCmmiGovernance.js";
import { ProjectCmmiBaseline } from "./ProjectCmmiBaseline.js";
import { ProjectCmmiRtm } from "./ProjectCmmiRtm.js";
import { ProjectCmmiSpc } from "./ProjectCmmiSpc.js";
import { ProjectCmmiLivingTopology } from "./ProjectCmmiLivingTopology.js";
import { ProjectApiLifecycleHarness } from "./ProjectApiLifecycleHarness.js";

export { GovernancePage } from "./GovernancePage.js";
export { SidebarLink } from "./SidebarLink.js";

export function GovernanceTab({ context }: PluginDetailTabProps) {
  const projectId = context.projectId ?? context.entityId ?? "";
  const projectName = context.projectRef ?? "Project";
  return <ProjectCmmiGovernance projectId={projectId} projectName={projectName} />;
}

export function BaselineTab({ context }: PluginDetailTabProps) {
  const projectId = context.projectId ?? context.entityId ?? "";
  const projectName = context.projectRef ?? "Project";
  return <ProjectCmmiBaseline projectId={projectId} projectName={projectName} />;
}

export function RtmTab({ context }: PluginDetailTabProps) {
  const projectId = context.projectId ?? context.entityId ?? "";
  const projectName = context.projectRef ?? "Project";
  return <ProjectCmmiRtm projectId={projectId} projectName={projectName} />;
}

export function SpcTab({ context }: PluginDetailTabProps) {
  const projectId = context.projectId ?? context.entityId ?? "";
  const projectName = context.projectRef ?? "Project";
  return <ProjectCmmiSpc projectId={projectId} projectName={projectName} />;
}

export function LivingTopologyTab({ context }: PluginDetailTabProps) {
  const projectId = context.projectId ?? context.entityId ?? "";
  const projectName = context.projectRef ?? "Project";
  return <ProjectCmmiLivingTopology projectId={projectId} projectName={projectName} />;
}

export function ApiLifecycleTab({ context }: PluginDetailTabProps) {
  const projectId = context.projectId ?? context.entityId ?? "";
  const projectName = context.projectRef ?? "Project";
  return <ProjectApiLifecycleHarness projectId={projectId} projectName={projectName} />;
}
