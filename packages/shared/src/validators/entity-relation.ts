import { z } from "zod";
import { ENTITY_RELATION_KINDS, ENTITY_TYPES, ONTOLOGY_GRAPH_VIEWS } from "../types/entity-relation.js";

/**
 * Validators for the ontology graph routes (wave154, extended wave155).
 *
 * These only guard the query string. The server resolves ids against the
 * company's own rows, so a caller cannot ask for another tenant's subgraph even
 * with a valid-looking id.
 */

export const entityTypeSchema = z.enum(ENTITY_TYPES);
export const entityRelationKindSchema = z.enum(ENTITY_RELATION_KINDS);
export const ontologyGraphViewSchema = z.enum(ONTOLOGY_GRAPH_VIEWS);

/**
 * `key` regex kept narrow on purpose: identifiers in this app follow a
 * camelCase / snake_case convention. We reject whitespace, brackets, and
 * the Chinese colon separator that the legacy UI used so the App cannot
 * smuggle a UUID-looking key into a display row.
 */
const ONTOLOGY_PROPERTY_KEY = /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/;

/**
 * Single field on a type. Matches the agy 草图's row shape (key / type /
 * sample). The App renders these straight to a SectionList row.
 */
export const ontologyPropertyEntrySchema = z.object({
  key: z.string().regex(ONTOLOGY_PROPERTY_KEY, "key must match /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/"),
  type: z.string().min(1).max(32),
  sample: z.string().max(200).optional(),
});
export type OntologyPropertyEntry = z.infer<typeof ontologyPropertyEntrySchema>;

/**
 * `GET /api/companies/:companyId/ontology/types/:typeId/properties`.
 *
 * No body. Returns the property list (or an empty array when the type has
 * never been edited — the route does NOT 404 in that case, the absence of
 * a row is semantically "no custom properties".
 */
export const ontologyPropertiesQuerySchema = z.object({
  companyId: z.string().uuid(),
  typeId: z.string().uuid(),
});
export type OntologyPropertiesQuery = z.infer<typeof ontologyPropertiesQuerySchema>;

/**
 * `PATCH /api/companies/:companyId/ontology/types/:typeId/properties`.
 *
 * `properties` is the full new list, not a diff — clients are expected
 * to GET, mutate in memory, then PATCH the result. This makes the route
 * trivially idempotent (the new list IS the new state).
 */
export const ontologyPropertiesUpdateSchema = z.object({
  properties: z.array(ontologyPropertyEntrySchema).max(64),
});
export type OntologyPropertiesUpdate = z.infer<typeof ontologyPropertiesUpdateSchema>;

/**
 * `GET /api/companies/:companyId/ontology/instances`.
 *
 * `entityType` is required (one type at a time — the type graph is in
 * 屏 1, the instance graph in 屏 2). `ownerId` filters by the linked
 * `assigned_to` edge when present. `limit` is bounded so a noisy type
 * cannot return 50k rows.
 */
export const ontologyInstancesQuerySchema = z
  .object({
    companyId: z.string().uuid(),
    entityType: entityTypeSchema,
    ownerId: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(200).optional().default(80),
    offset: z.coerce.number().int().min(0).max(10000).optional().default(0),
  })
  .strict();
export type OntologyInstancesQuery = z.infer<typeof ontologyInstancesQuerySchema>;

/**
 * `GET /api/companies/:companyId/ontology/graph`.
 *
 * `view` names a preset (`depth` + `relations` recipe). An explicit `depth`
 * still wins over the preset's default, so "project tree, but 2 hops" is
 * expressible.
 *
 * `root_type` + `root_id` are optional (wave237): when omitted, the route
 * returns a default company-wide snapshot rather than 400-ing the smoke
 * probes that just want "what does this graph look like?". An explicit pair
 * still anchors the BFS to that node exactly like before.
 */
export const ontologyGraphQuerySchema = z
  .object({
    root_type: entityTypeSchema.optional(),
    root_id: z.string().uuid().optional(),
    depth: z.coerce.number().int().min(1).max(5).optional(),
    view: ontologyGraphViewSchema.optional().default("project_tree"),
    /** Optional comma-separated relation filter; overrides the preset's. */
    relations: z.string().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const hasType = value.root_type !== undefined;
    const hasId = value.root_id !== undefined;
    if (hasType !== hasId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "root_type and root_id must be provided together",
        path: [hasType ? "root_id" : "root_type"],
      });
    }
  });

export type OntologyGraphQuery = z.infer<typeof ontologyGraphQuerySchema>;

/** `GET /api/companies/:companyId/ontology/paths`. */
export const ontologyPathsQuerySchema = z
  .object({
    src_type: entityTypeSchema,
    src_id: z.string().uuid(),
    target_type: entityTypeSchema,
    target_id: z.string().uuid(),
    max_depth: z.coerce.number().int().min(1).max(5).optional().default(5),
  })
  .strict();

export type OntologyPathsQuery = z.infer<typeof ontologyPathsQuerySchema>;
