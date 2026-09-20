import type { Db } from "@paperclipai/db";
import { documentService } from "./documents.js";
import { unprocessable } from "../errors.js";
import type { BuildActor } from "./build-orchestrator.js";
import {
  normalizeOntologyBuildSpec,
  type OntologyBuildSpec,
} from "./ontology-spec.js";
import { BUILD_STEP_KINDS } from "./build-orchestrator.js";

/**
 * Where a build spec lives between being planned and being instantiated.
 *
 * It is stored as an *issue document*, under a dedicated key, rather than in a
 * table of its own. That choice buys three things the feature needs and none of
 * them has to be built:
 *
 *  - **Version history.** `documents` + `document_revisions` + `issue_documents`
 *    already keeps every revision, which is the "快照历史" the reference
 *    implementation shows next to a schema edit. Re-planning a spec is a new
 *    revision, not an overwrite.
 *  - **A restore path.** The existing document-revision restore endpoint gives
 *    back a previous spec, which is the rollback for a spec that was approved
 *    and shouldn't have been.
 *  - **An approvable thing.** The control plane's approval links to an issue, so
 *    the spec and the approval end up on the same object. The spec is what the
 *    reviewer opens, and its issue is what carries the approval.
 *
 * The document is JSON text: `format` is `application/json` so the workbench and
 * the app can render it without a parser, and the body is the spec itself, so a
 * reader that only has the document has the whole model.
 */

/** The document key. Matches `issueDocumentKeySchema` (`^[a-z0-9][a-z0-9_-]*$`). */
export const ONTOLOGY_SPEC_DOCUMENT_KEY = "ontology-spec";

export const ONTOLOGY_SPEC_FORMAT = "application/json";

export function ontologySpecDocumentTitle(spec: OntologyBuildSpec): string {
  const types = spec.document.objectTypes?.length ?? 0;
  const relations = spec.document.relationTypes?.length ?? 0;
  return `本体规范: ${spec.document.name}（${types} 对象类型 / ${relations} 关系类型）`;
}

export async function saveOntologySpec(
  db: Db,
  input: {
    issueId: string;
    spec: OntologyBuildSpec;
    actor: BuildActor;
    changeSummary?: string | null;
  },
): Promise<{ documentId: string; revisionNumber: number }> {
  const result = await documentService(db).upsertIssueDocument({
    issueId: input.issueId,
    key: ONTOLOGY_SPEC_DOCUMENT_KEY,
    title: ontologySpecDocumentTitle(input.spec),
    format: ONTOLOGY_SPEC_FORMAT,
    body: JSON.stringify(input.spec, null, 2),
    changeSummary: input.changeSummary ?? null,
    createdByAgentId: input.actor.agentId,
    createdByUserId: input.actor.actorType === "user" ? input.actor.actorId : null,
    createdByRunId: input.actor.runId,
  });
  return {
    documentId: result.document.id,
    revisionNumber: result.document.latestRevisionNumber,
  };
}

/**
 * Read a stored spec back.
 *
 * Re-normalized on read rather than trusted: the document is JSON text that a
 * human can edit through the ordinary document editor, so what comes back is
 * whatever is in the row. A stored body that no longer parses is reported as a
 * bad request instead of being handed to the provisioner as if it were a model.
 */
export async function readOntologySpec(
  db: Db,
  issueId: string,
): Promise<{ spec: OntologyBuildSpec; documentId: string; revisionNumber: number } | null> {
  const document = await documentService(db).getIssueDocumentByKey(issueId, ONTOLOGY_SPEC_DOCUMENT_KEY);
  if (!document) return null;

  // An empty body is the same class of problem as unparseable JSON: there is a
  // document under this key and it does not contain a spec. Treated identically
  // rather than as a separate case, because the caller's response is the same.
  if (typeof document.body !== "string" || !document.body.trim()) {
    throw unprocessable("the stored ontology spec is empty", {
      code: "ONTOLOGY_SPEC_UNREADABLE",
      documentId: document.id,
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(document.body);
  } catch {
    throw unprocessable("the stored ontology spec is not valid JSON", {
      code: "ONTOLOGY_SPEC_UNREADABLE",
      documentId: document.id,
    });
  }

  const spec = normalizeOntologyBuildSpec(parsed, BUILD_STEP_KINDS);
  if (!spec) {
    throw unprocessable("the stored ontology spec is no longer a well-formed spec", {
      code: "ONTOLOGY_SPEC_UNREADABLE",
      documentId: document.id,
    });
  }

  return {
    spec,
    documentId: document.id,
    revisionNumber: document.latestRevisionNumber,
  };
}
