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
