import type {
  EntityType,
  OntologyGraphResponse,
  OntologyGraphView,
  OntologyPathsResponse,
  OntologyStatsResponse,
} from "@paperclipai/shared";
import { api } from "./client";

/**
 * Ontology graph client (wave154, extended wave155). Paths are relative to
 * `/api`, matching the server's `ontologyGraphRoutes`.
 */
export const ontologyGraphApi = {
  graph: (
    companyId: string,
    params: {
      rootType: EntityType;
      rootId: string;
      depth?: number;
      view?: OntologyGraphView;
      relations?: string[];
    },
  ) => {
    const search = new URLSearchParams({
      root_type: params.rootType,
      root_id: params.rootId,
    });
    // Depth is left to the server's preset when the caller does not pin one, so
    // "agent_dashboard" opens at its own depth rather than a generic default.
    if (params.depth !== undefined) search.set("depth", String(params.depth));
    if (params.view) search.set("view", params.view);
    if (params.relations && params.relations.length > 0) {
      search.set("relations", params.relations.join(","));
    }
    return api.get<OntologyGraphResponse>(
      `/companies/${encodeURIComponent(companyId)}/ontology/graph?${search.toString()}`,
    );
  },

  paths: (
    companyId: string,
    params: {
      srcType: EntityType;
      srcId: string;
      targetType: EntityType;
      targetId: string;
      maxDepth?: number;
    },
  ) => {
    const search = new URLSearchParams({
      src_type: params.srcType,
      src_id: params.srcId,
      target_type: params.targetType,
      target_id: params.targetId,
      max_depth: String(params.maxDepth ?? 5),
    });
    return api.get<OntologyPathsResponse>(
      `/companies/${encodeURIComponent(companyId)}/ontology/paths?${search.toString()}`,
    );
  },

  stats: (companyId: string) =>
    api.get<OntologyStatsResponse>(`/companies/${encodeURIComponent(companyId)}/ontology/stats`),
};
