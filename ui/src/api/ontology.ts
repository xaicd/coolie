import { api } from "./client";
import { pluginsApi } from "./plugins";

const ONTOLOGY_PLUGIN_ID = "paperclipai.plugin-ontology";

export interface OntologyDomainOption {
  id: string;
  slug: string;
  display_name: string;
  schema_version?: number;
  version?: number;
}

export interface OntologyBusinessSystemSummary {
  id: string;
  code: string;
  name: string;
  status: string;
  ontology_domain_id?: string | null;
  ontology_binding?: {
    domainVersion?: number;
    domainSlug?: string;
    syncPolicy?: string;
    allowedActionIds?: string[];
    actionPolicies?: unknown[];
    subscribedEventTypes?: string[];
    upgradeHistory?: Array<{
      fromVersion: number;
      toVersion: number;
      at: string;
      action: "upgrade" | "downgrade" | "initial";
      reason?: string;
    }>;
    [key: string]: unknown;
  } | null;
  metadata?: Record<string, unknown> | null;
}

export interface SyncProjectPayload {
  projectId: string;
  code: string;
  name: string;
  description?: string;
  ontologyDomainId: string;
  targetDomainVersion?: number;
  domainSlug?: string;
  repos?: Array<{ name: string; cwd?: string | null; repoUrl?: string | null }>;
}

export const ontologyApi = {
  listDomains: async (companyId: string): Promise<OntologyDomainOption[]> => {
    try {
      const res = await api.get<{ domains: OntologyDomainOption[] }>(
        `/plugins/${ONTOLOGY_PLUGIN_ID}/api/domains?companyId=${encodeURIComponent(companyId)}`,
      );
      return res.domains ?? [];
    } catch {
      return [];
    }
  },

  createDomain: async (
    companyId: string,
    slug: string,
    displayName: string,
  ): Promise<OntologyDomainOption | null> => {
    const res = await pluginsApi.bridgePerformAction<{
      domain?: { id: string; slug: string; display_name: string };
    }>(
      ONTOLOGY_PLUGIN_ID,
      "create-domain",
      {
        companyId,
        slug,
        displayName,
        description: `Domain for ${displayName}`,
      },
      companyId,
    );
    const data = res.data as { domain?: { id: string; slug: string; display_name: string } } | undefined;
    return data?.domain ?? null;
  },

  listBusinessSystems: async (companyId: string): Promise<OntologyBusinessSystemSummary[]> => {
    try {
      const res = await api.get<{ businessSystems: OntologyBusinessSystemSummary[] }>(
        `/plugins/${ONTOLOGY_PLUGIN_ID}/api/business-systems?companyId=${encodeURIComponent(companyId)}`,
      );
      return res.businessSystems ?? [];
    } catch {
      return [];
    }
  },

  syncProjectToBusinessSystem: async (
    companyId: string,
    payload: SyncProjectPayload,
  ): Promise<{ businessSystemId?: string; code: string; domainVersion: number }> => {
    const existing = await ontologyApi.listBusinessSystems(companyId);
    const match = existing.find((s) => s.code.toUpperCase() === payload.code.toUpperCase());

    let businessSystemId = match?.id;
    const prevBinding = (match?.ontology_binding ?? {}) as Record<string, unknown>;
    const history = Array.isArray(prevBinding.upgradeHistory) ? [...prevBinding.upgradeHistory] : [];
    const fromVer = typeof prevBinding.domainVersion === "number" ? prevBinding.domainVersion : null;
    const toVer = payload.targetDomainVersion ?? 0;
    if (fromVer !== null && fromVer !== toVer) {
      history.push({
        fromVersion: fromVer,
        toVersion: toVer,
        at: new Date().toISOString(),
        action: toVer > fromVer ? "upgrade" : "downgrade",
      });
    }

    const updatedBinding = {
      ...prevBinding,
      syncPolicy: prevBinding.syncPolicy ?? "manual",
      domainVersion: toVer,
      domainSlug: payload.domainSlug,
      boundAt: new Date().toISOString(),
      upgradeHistory: history,
    };

    const updatedMetadata = {
      ...(match?.metadata ?? {}),
      projectId: payload.projectId,
      syncedAt: new Date().toISOString(),
      domainVersion: toVer,
      domainSlug: payload.domainSlug,
    };

    if (match) {
      await api.patch(
        `/plugins/${ONTOLOGY_PLUGIN_ID}/api/business-systems/${encodeURIComponent(match.id)}`,
        {
          companyId,
          name: payload.name,
          description: payload.description,
          ontologyDomainId: payload.ontologyDomainId,
          repos: payload.repos,
          ontologyBinding: updatedBinding,
          metadata: updatedMetadata,
        },
      );
    } else {
      const res = await pluginsApi.bridgePerformAction<{
        businessSystem?: { id: string; code: string; name: string };
      }>(
        ONTOLOGY_PLUGIN_ID,
        "create-business-system",
        {
          companyId,
          code: payload.code.toUpperCase(),
          name: payload.name,
          description: payload.description,
          ontologyDomainId: payload.ontologyDomainId,
          repos: payload.repos,
          ontologyBinding: updatedBinding,
          metadata: updatedMetadata,
        },
        companyId,
      );
      const data = res.data as { businessSystem?: { id: string } } | undefined;
      businessSystemId = data?.businessSystem?.id;
    }

    try {
      await pluginsApi.bridgePerformAction(
        ONTOLOGY_PLUGIN_ID,
        "link-ontology-resource",
        {
          companyId,
          domainId: payload.ontologyDomainId,
          resourceKind: "project",
          resourceId: payload.projectId,
          resourceLabel: payload.name,
          role: "owner",
        },
        companyId,
      );
    } catch {
      // Non-fatal if link already exists
    }

    return { businessSystemId, code: payload.code, domainVersion: toVer };
  },
};
