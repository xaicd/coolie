import type { Db } from "@paperclipai/db";
import type { PluginApiRequestInput, PluginApiResponse } from "@paperclipai/plugin-sdk";
import { conflict, notFound, unprocessable, HttpError } from "../errors.js";
import { logger } from "../middleware/logger.js";
import { pluginRegistryService } from "./plugin-registry.js";
import type { PluginWorkerManager } from "./plugin-worker-manager.js";
import type { BuildActor } from "./build-orchestrator.js";
import type { SpecValidation } from "./ontology-spec-planner.js";

/**
 * The provisioner: turns an approved ontology document into rows.
 *
 * The one thing this module is built to avoid is writing the plugin's tables
 * itself. The ontology's schema, its migrations and its namespace belong to
 * `paperclipai.plugin-ontology`, and the server deliberately does not depend on
 * `@paperclipai/ontology-core` — restating the ontology's vocabulary here is how
 * a second, weaker copy of it appears. So the server sends the document to the
 * plugin and lets the plugin's own `validateDocument` + `documentToWritePlan`
 * decide and write. "Validate before write" then holds by construction, because
 * the write and the validation are the same request.
 *
 * The call is in-process (`workerManager.call(..., "handleApiRequest", ...)`),
 * the same one the plugin's HTTP routes use — `routes/plugins.ts` calls it after
 * its own authz. That means the authz here is ours to do: a caller of this module
 * has already passed `assertCompanyAccess`, and the actor passed in is the one
 * the request carried, not a fresh identity this module invents.
 */

/** The bundled ontology plugin. Its manifest declares `PLUGIN_ID` in its own package. */
export const ONTOLOGY_PLUGIN_KEY = "paperclipai.plugin-ontology";

/** The plugin is not installed, not enabled, or its worker is not up. */
export class OntologyPluginUnavailableError extends Error {
  readonly code = "ONTOLOGY_PLUGIN_UNAVAILABLE";
  constructor(message: string) {
    super(message);
    this.name = "OntologyPluginUnavailableError";
  }
}

/**
 * The plugin refused the document. `status` is the plugin's own HTTP status, kept
 * so the caller can mirror it (`422` for a document that failed validation, `409`
 * for a slug already held by a hand-made domain) instead of flattening every
 * refusal into one code.
 */
export class OntologyImportRejectedError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly problems: Array<{ severity: string; code: string; subject: string; message: string }>;
  constructor(input: {
    message: string;
    status: number;
    code?: string | undefined;
    problems?: Array<{ severity: string; code: string; subject: string; message: string }>;
  }) {
    super(input.message);
    this.name = "OntologyImportRejectedError";
    this.status = input.status;
    this.code = input.code;
    this.problems = input.problems ?? [];
  }
}

export interface OntologyImportResult {
  domainId: string;
  slug: string;
  /** True when the slug already held a spec-created domain: nothing was written. */
  reused: boolean;
  created: { nodeTypes: number; relationTypes: number };
}

export interface OntologyValidateResult {
  problems: SpecValidation["problems"];
  lint: Array<{ severity: string; code: string; subject: string; message: string; advice?: string }>;
  loadable: boolean;
  fingerprint?: string;
}

export interface OntologyProvisionerDeps {
  db: Db;
  workerManager?: PluginWorkerManager;
}

export interface OntologyProvisioner {
  /** Whether the plugin is present and its worker is up. */
  isAvailable(): Promise<boolean>;
  validateDocument(document: Record<string, unknown>, actor: BuildActor, companyId: string): Promise<OntologyValidateResult>;
  importDocument(document: Record<string, unknown>, actor: BuildActor, companyId: string): Promise<OntologyImportResult>;
}

export function ontologyProvisioner(deps: OntologyProvisionerDeps): OntologyProvisioner {
  const registry = pluginRegistryService(deps.db);

  async function resolvePluginId(): Promise<string> {
    if (!deps.workerManager) {
      throw new OntologyPluginUnavailableError(
        "the plugin bridge is not configured, so the ontology plugin cannot be reached",
      );
    }
    const plugin = await registry.getByKey(ONTOLOGY_PLUGIN_KEY);
    if (!plugin) {
      throw new OntologyPluginUnavailableError(
        `the ontology plugin (${ONTOLOGY_PLUGIN_KEY}) is not installed`,
      );
    }
    if (plugin.status !== "ready") {
      // Not degraded silently: a build spec that cannot be instantiated has to
      // say so, because the alternative is a user who approved a model and
      // cannot tell why it never appeared.
      throw new OntologyPluginUnavailableError(
        `the ontology plugin is not ready (status: ${plugin.status})`,
      );
    }
    return plugin.id;
  }

  async function invoke(
    routeKey: string,
    path: string,
    body: Record<string, unknown>,
    actor: BuildActor,
    companyId: string,
  ): Promise<PluginApiResponse> {
    const pluginId = await resolvePluginId();
    const input: PluginApiRequestInput = {
      routeKey,
      method: "POST",
      path,
      params: {},
      query: {},
      body,
      actor: {
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        userId: actor.actorType === "user" ? actor.actorId : null,
        runId: actor.runId,
      },
      companyId,
      headers: {},
    };

    try {
      return (await deps.workerManager!.call(pluginId, "handleApiRequest", input)) as PluginApiResponse;
    } catch (error) {
      logger.warn(
        { err: error, routeKey, companyId },
        "ontology plugin call failed",
      );
      throw new OntologyPluginUnavailableError(
        `the ontology plugin did not answer (${routeKey}): ${(error as Error).message}`,
      );
    }
  }

  function rejectionFrom(response: PluginApiResponse): OntologyImportRejectedError {
    const body = (response.body ?? {}) as Record<string, unknown>;
    const problems = Array.isArray(body.problems)
      ? (body.problems as Array<{ severity: string; code: string; subject: string; message: string }>)
      : [];
    return new OntologyImportRejectedError({
      message: typeof body.error === "string" ? body.error : "the ontology plugin refused the document",
      status: Number.isInteger(response.status) ? Number(response.status) : 500,
      code: typeof body.code === "string" ? body.code : undefined,
      problems,
    });
  }

  return {
    async isAvailable() {
      try {
        await resolvePluginId();
        return true;
      } catch {
        return false;
      }
    },

    async validateDocument(document, actor, companyId) {
      const response = await invoke("validate-document", "/documents/validate", { document }, actor, companyId);
      const status = Number.isInteger(response.status) ? Number(response.status) : 200;
      if (status >= 400) throw rejectionFrom(response);

      const body = (response.body ?? {}) as Record<string, unknown>;
      return {
        problems: Array.isArray(body.problems) ? (body.problems as SpecValidation["problems"]) : [],
        lint: Array.isArray(body.lint) ? (body.lint as OntologyValidateResult["lint"]) : [],
        loadable: body.loadable === true,
        ...(typeof body.fingerprint === "string" ? { fingerprint: body.fingerprint } : {}),
      };
    },

    async importDocument(document, actor, companyId) {
      const response = await invoke("import-document", "/documents/import", { document }, actor, companyId);
      const status = Number.isInteger(response.status) ? Number(response.status) : 200;
      if (status >= 400) {
        const rejection = rejectionFrom(response);
        // The plugin's status is meaningful to the caller and is mirrored rather
        // than flattened: `409` means "someone else owns this slug" and is the
        // user's to resolve, while `422` means the document itself is wrong.
        if (rejection.status === 409) {
          throw conflict(rejection.message, { code: rejection.code, problems: rejection.problems });
        }
        if (rejection.status === 422 || rejection.status === 400) {
          throw unprocessable(rejection.message, { code: rejection.code, problems: rejection.problems });
        }
        throw new HttpError(rejection.status, rejection.message, {
          code: rejection.code,
          problems: rejection.problems,
        });
      }

      const body = (response.body ?? {}) as Record<string, unknown>;
      const domainId = body.domainId;
      if (typeof domainId !== "string" || !domainId) {
        // The plugin answered 2xx without a domain. Failing loudly beats
        // returning an id the caller cannot use and no way to find the model.
        throw notFound("the ontology plugin accepted the document but returned no domain");
      }
      const created = (body.created ?? {}) as Record<string, unknown>;
      return {
        domainId,
        slug: typeof body.slug === "string" ? body.slug : String(body.slug ?? ""),
        reused: body.reused === true,
        created: {
          nodeTypes: typeof created.nodeTypes === "number" ? created.nodeTypes : 0,
          relationTypes: typeof created.relationTypes === "number" ? created.relationTypes : 0,
        },
      };
    },
  };
}
