import type { BuildStepKind } from "./build-orchestrator.js";

/**
 * The build spec — the control plane's contract for a domain that does not exist
 * yet.
 *
 * A "建域 <x>" ask in the board room has to cross a boundary that the ordinary
 * build mode does not: it ends in a *model change*, not in a task. So the plan is
 * split in two, and the split is the point.
 *
 *   `document` — a `paperclip.ontology/1` ontology document, verbatim and opaque
 *                to this module. It is the thing the ontology plugin owns: the
 *                plugin validates it (`validateDocument` + `lintDocument`) and
 *                writes it (`documentToWritePlan`).
 *   `build`    — the build envelope, which lives only here. It says which object
 *                types belong to which build phase, and it drives the issue
 *                decomposition. The plugin never sees it.
 *
 * Who validates what, and why it is split this way:
 *
 *   The vocabulary — allowed property types, cardinalities, lifecycle states —
 *   belongs to `@paperclipai/ontology-core`, which the ontology plugin owns and
 *   the server deliberately does not depend on. Restating those unions here would
 *   create a second vocabulary that drifts from the first, and the one that drifts
 *   is always the one that is not enforced. So this module checks *shape* only
 *   ("is this an object with a name and a list of objectTypes?") and defers every
 *   value-level judgement to the plugin. `validateDocument` is the single
 *   authority; the server asks it through the plugin rather than copying it.
 *
 * `SpecDocumentView` below is therefore a *view*, not a model: it declares the
 * shape the control plane reads (so the decomposition and the diff card can be
 * typed) and no allowed values at all. If a field here ever grows a literal
 * union, that is the bug this comment exists to prevent.
 */

export const ONTOLOGY_SPEC_VERSION = "0.1";

/**
 * The read-only subset of an ontology document the control plane reads.
 *
 * Deliberately structural and value-free: `type` is a `string`, not a union of
 * the storage types, because deciding which strings are legal is the plugin's
 * job. See the module comment.
 *
 * The index signatures are load-bearing, not tidiness. The server passes the
 * document through untouched, so every field it does not name here — a property's
 * `isIdentifier`, its `enum`, its `format` — has to survive normalization. An
 * earlier version of this file enumerated the fields it kept and silently dropped
 * the rest, which dropped the very field `validateDocument` requires on every
 * object type: the plugin then refused every spec, and the bug looked like "the
 * planner never produces anything".
 */
export interface SpecDocumentView {
  format: string;
  name: string;
  description?: string;
  source?: { domainSlug?: string; origin?: string };
  objectTypes: Array<{
    key: string;
    displayName?: string;
    description?: string;
    properties?: Array<{ name: string; type?: string; description?: string }>;
    [key: string]: unknown;
  }>;
  relationTypes?: Array<{
    key: string;
    displayName?: string;
    sourceNodeTypeKey?: string;
    targetNodeTypeKey?: string;
    cardinality?: string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

/** One build phase and the object types it is responsible for. */
export interface BuildSpecStep {
  kind: BuildStepKind;
  /** Object type keys from `document.objectTypes`. Empty is legal: the test and
   * release phases have no object type of their own. */
  nodeTypes: string[];
}

export interface OntologyBuildSpec {
  specVersion: string;
  document: SpecDocumentView;
  build: { steps: BuildSpecStep[] };
}

/** The document keys the spec refers to, in declaration order. */
export function specObjectTypeKeys(spec: OntologyBuildSpec): string[] {
  return spec.document.objectTypes.map((type) => type.key);
}

/** `ecommerce` from `{source:{domainSlug}}`; null when the document names none. */
export function specDomainSlug(spec: OntologyBuildSpec): string | null {
  const slug = spec.document.source?.domainSlug;
  return typeof slug === "string" && slug.trim() ? slug.trim() : null;
}

/**
 * A stable id for this spec inside its issue, used as the provisioner's
 * idempotency key so a retried instantiate returns the same domain instead of
 * creating a second one.
 */
export function specIdempotencyKey(input: { companyId: string; buildId: string }): string {
  return `build_spec:${input.companyId}:${input.buildId}`;
}

/**
 * Shape-only normalization of a planner's answer. Returns null when the answer
 * is not a well-formed wrapper — the caller falls back rather than merging, for
 * the same reason `normalizeBuildPlan` does: half model output and half
 * placeholder is harder to reason about than a fallback that is wholly one or
 * the other.
 *
 * This does NOT decide whether the model is any good. A spec that passes here can
 * still be rejected by the plugin's `validateDocument`, and that is the check
 * that matters; this one only keeps malformed JSON out of the typed path.
 */
export function normalizeOntologyBuildSpec(
  value: unknown,
  allowedStepKinds: readonly BuildStepKind[],
): OntologyBuildSpec | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;

  const document = record.document;
  if (!document || typeof document !== "object" || Array.isArray(document)) return null;
  const documentRecord = document as Record<string, unknown>;
  if (typeof documentRecord.format !== "string" || !documentRecord.format.trim()) return null;
  if (typeof documentRecord.name !== "string" || !documentRecord.name.trim()) return null;
  if (!Array.isArray(documentRecord.objectTypes) || !documentRecord.objectTypes.length) return null;

  // Read the keys to resolve the envelope's references, and nothing else. Every
  // other field of the document is left exactly as the planner wrote it: the
  // plugin is the authority on what those fields mean.
  const declaredKeys = new Set<string>();
  for (const entry of documentRecord.objectTypes) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const key = (entry as Record<string, unknown>).key;
    if (typeof key !== "string" || !key.trim()) return null;
    declaredKeys.add(key);
  }

  const build = record.build;
  if (!build || typeof build !== "object" || Array.isArray(build)) return null;
  const buildRecord = build as Record<string, unknown>;
  if (!Array.isArray(buildRecord.steps)) return null;

  const seenKinds = new Set<string>();
  const steps: BuildSpecStep[] = [];
  for (const entry of buildRecord.steps) {
    if (!entry || typeof entry !== "object") return null;
    const step = entry as Record<string, unknown>;
    const kind = step.kind;
    if (typeof kind !== "string") return null;
    if (!(allowedStepKinds as readonly string[]).includes(kind)) return null;
    if (seenKinds.has(kind)) return null;
    seenKinds.add(kind);

    // A phase that names an object type the document does not declare is
    // dropped rather than refused: the envelope only decides which card carries
    // which type, and losing that association is a bookkeeping loss, not a
    // reason to discard a model the plugin is about to rule on. The plugin
    // refuses dangling *relations* — those change the model.
    const nodeTypes = Array.isArray(step.nodeTypes)
      ? step.nodeTypes.filter((key): key is string => typeof key === "string" && declaredKeys.has(key))
      : [];
    steps.push({ kind: kind as BuildStepKind, nodeTypes });
  }

  // Every phase must be present exactly once. A spec that names four phases
  // cannot be turned into a five-step chain, and inventing the missing one would
  // mean the chain no longer matches the model it was approved with.
  if (steps.length !== allowedStepKinds.length) return null;

  return {
    specVersion:
      typeof record.specVersion === "string" && record.specVersion.trim()
        ? record.specVersion.trim()
        : ONTOLOGY_SPEC_VERSION,
    // Verbatim, including the fields this interface does not name. Rebuilding the
    // document field by field is what dropped `isIdentifier` once already.
    document: documentRecord as unknown as SpecDocumentView,
    build: { steps },
  };
}

/**
 * The document as it is handed to the plugin: the wrapper's envelope stripped.
 *
 * The plugin is given the `paperclip.ontology/1` document and nothing else,
 * because the build envelope is not part of the model — a model that carries
 * "which phase builds me" would be answering a question about a process, and
 * `canonicalize()` would drop it anyway, so sending it would only make the wire
 * format look like it means something it does not.
 */
export function specDocumentForProvisioning(spec: OntologyBuildSpec): Record<string, unknown> {
  return { ...spec.document };
}
