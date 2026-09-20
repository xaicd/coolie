import { logger } from "../middleware/logger.js";
import { extractJsonObject, requestHermesOneShot } from "./hermes-oneshot.js";
import { BUILD_STEP_KINDS } from "./build-orchestrator.js";
import {
  normalizeOntologyBuildSpec,
  type OntologyBuildSpec,
} from "./ontology-spec.js";

/**
 * The ontology-spec planner: one "建域 <x>" ask becomes one ontology document.
 *
 * This is the second planner in build mode, and it fails differently from the
 * first. A *code* build always has a fallback — the five phases are fixed, so a
 * missing planner degrades to `templateBuildPlan`. A *domain* build has none: the
 * object types are the whole content, and inventing them would be inventing the
 * user's business. So there is no template. A planner that is missing, slow, or
 * unusable produces no spec, and the caller reports that honestly as `rejected`.
 *
 * Validation is split by design. `normalizeOntologyBuildSpec` checks the wrapper's
 * shape; the value-level judgement — which property types, cardinalities and
 * lifecycle states are legal, whether every relation endpoint resolves — belongs to
 * `@paperclipai/ontology-core`'s `validateDocument`, which the ontology plugin
 * owns. The server does not restate that vocabulary (see `ontology-spec.ts`), so
 * the validator arrives as an injected dependency: this module decides *when* to
 * ask, the plugin decides *what is legal*.
 */

/** Default model for spec planning. A model that can hold a data model in mind. */
const DEFAULT_SPEC_MODEL = "glm-5.3-flash";

const SPEC_TIMEOUT_MS = 90_000;
const SPEC_MAX_OUTPUT_BYTES = 512 * 1024;

/**
 * The prompt states the format the model should emit. It is worth being explicit
 * that this is a *request*, not an enforcement: the model's answer is checked
 * against the format before it is believed, so anything the prompt gets wrong
 * shows up as a rejection rather than as a bad model in the database.
 */
const ONTOLOGY_SPEC_SYSTEM_PROMPT = [
  "You are the domain modeller for a software company.",
  "Turn the request into an ontology document describing the domain's entities and their relations.",
  "Return ONE JSON object and nothing else — no prose, no markdown fence.",
  'Shape: {"specVersion":"0.1","document":{"format":"paperclip.ontology/1","name":"...","description":"...",',
  '"source":{"domainSlug":"kebab-case","origin":"..."},',
  '"objectTypes":[{"key":"lowercase_slug","displayName":"...","description":"...",',
  '"orderSource":"declared","properties":[{"name":"camelCase","type":"string","description":"...","isIdentifier":true}]}],',
  '"relationTypes":[{"key":"UPPER_SNAKE","displayName":"a verb","cardinality":"one_to_many",',
  '"sourceNodeTypeKey":"lowercase_slug","targetNodeTypeKey":"lowercase_slug"}]},',
  '"build":{"steps":[{"kind":"requirements","nodeTypes":["lowercase_slug"]}]}}',
  "",
  "Rules the document is checked against:",
  "- `type` is one of string, number, boolean. Use `format` for dates: \"date\" or \"date-time\".",
  "- Give an enum as an `enum` array of strings on a string property; do not invent an `enum` type.",
  "- `format` must be \"paperclip.ontology/1\" and every object type needs a lowercase slug `key`.",
  "- Every object type needs exactly one property with `isIdentifier: true`.",
  "- `cardinality` is one of one_to_one, one_to_many, many_to_one, many_to_many.",
  "- Every `sourceNodeTypeKey` and `targetNodeTypeKey` must be the `key` of an object type in this same document.",
  "- Model relationships, not foreign keys: prefer a named relation over a `customerId` property.",
  "- Focus the model: 5 to 8 object types, each with 3 to 8 properties. A larger domain reads worse than a smaller one.",
  "- `displayName` for a relation must be a verb that reads correctly on the edge (contains, places, prescribes).",
  `- \`build.steps\` must contain each of ${BUILD_STEP_KINDS.join(", ")} exactly once, in that order.`,
  "- `nodeTypes` lists the object type keys that phase is responsible for; it may be empty for test and release.",
  "- Write displayName, description and relation names in the same language as the request.",
].join("\n");

/** One reason a document was refused, in the plugin's `DocumentProblem` shape. */
export interface SpecProblem {
  severity: "error" | "warning";
  code: string;
  subject: string;
  message: string;
}

export interface SpecValidation {
  problems: SpecProblem[];
}

/**
 * Asks the ontology plugin whether a document is loadable and whether it is any
 * good. Injected so this module does not need the plugin (or `ontology-core`) to
 * be importable, and so the planner can be tested without either.
 */
export type OntologySpecValidator = (
  document: Record<string, unknown>,
) => Promise<SpecValidation>;

export interface GenerateOntologySpecInput {
  companyId: string;
  prompt: string;
  apiUrl?: string;
  /** Stamped onto `document.source.origin`, e.g. `build_spec:<buildId>`. */
  origin: string;
  validate: OntologySpecValidator;
}

export interface GenerateOntologySpecResult {
  spec: OntologyBuildSpec | null;
  /**
   * `hermes` — the planner answered and the document passed validation.
   * `rejected` — no usable document. Covers the planner being unavailable, the
   * answer not being formatted as asked, and the document being refused by
   * `validateDocument`. Kept as one value because the caller's response is the
   * same in every case (there is nothing to approve), and the `problems` carry
   * the detail.
   */
  source: "hermes" | "rejected";
  problems: SpecProblem[];
}

export async function generateOntologySpec(
  input: GenerateOntologySpecInput,
): Promise<GenerateOntologySpecResult> {
  let raw: string;
  try {
    raw = await requestHermesOneShot({
      companyId: input.companyId,
      apiUrl: input.apiUrl,
      systemPrompt: ONTOLOGY_SPEC_SYSTEM_PROMPT,
      requestLabel: "DOMAIN REQUEST",
      requestBody: input.prompt,
      model: process.env.ONTOLOGY_SPEC_MODEL ?? DEFAULT_SPEC_MODEL,
      timeoutMs: SPEC_TIMEOUT_MS,
      maxOutputBytes: SPEC_MAX_OUTPUT_BYTES,
      label: "ontology spec planner",
    });
  } catch (error) {
    logger.warn(
      { err: error, companyId: input.companyId },
      "ontology spec planner unavailable; no spec to review",
    );
    return { spec: null, source: "rejected", problems: [] };
  }

  const normalized = normalizeOntologyBuildSpec(extractJsonObject(raw), BUILD_STEP_KINDS);
  if (!normalized) {
    logger.warn(
      { companyId: input.companyId },
      "ontology spec planner returned no well-formed document; nothing to review",
    );
    return { spec: null, source: "rejected", problems: [] };
  }

  const document = specDocumentForValidation(normalized, input.origin);

  let validation: SpecValidation;
  try {
    validation = await input.validate(document);
  } catch (error) {
    // A validator that cannot be reached is not a document that is wrong. Refuse
    // the spec rather than storing one nobody checked — the whole point of the
    // gate is that nothing reaches the database unvalidated.
    logger.warn(
      { err: error, companyId: input.companyId },
      "ontology spec validation unavailable; refusing the spec rather than storing it unvalidated",
    );
    return { spec: null, source: "rejected", problems: [] };
  }

  const errors = validation.problems.filter((problem) => problem.severity === "error");
  if (errors.length) {
    // All or nothing, matching `normalizeBuildPlan`: a document that half loads
    // is harder to reason about than one that does not load, and the user is
    // being asked to approve a model they can read in full or not at all.
    logger.warn(
      { companyId: input.companyId, errors: errors.length },
      "ontology spec refused by the ontology validator",
    );
    return { spec: null, source: "rejected", problems: validation.problems };
  }

  return { spec: normalized, source: "hermes", problems: validation.problems };
}

/**
 * The document as it goes to the validator and later to the provisioner.
 *
 * `exportedAt` is stamped here rather than taken from the model: it is a fact
 * about when this document was produced, and a model has no way to know it. The
 * build envelope is dropped — the validator is being asked about the *model*, and
 * `canonicalize()` would discard the envelope anyway, so sending it would only
 * imply it is part of the model.
 */
function specDocumentForValidation(
  spec: OntologyBuildSpec,
  origin: string,
): Record<string, unknown> {
  const document: Record<string, unknown> = {
    ...spec.document,
    exportedAt: new Date().toISOString(),
    source: {
      ...(spec.document.source ?? {}),
      origin,
    },
  };
  return document;
}
