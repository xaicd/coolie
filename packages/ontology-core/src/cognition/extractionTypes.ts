/**
 * Shared shapes for the source-extraction pipeline.
 *
 * These live outside `AstExtractor` so the per-language parsers can be separate
 * modules without a circular import; `AstExtractor` re-exports them, so the
 * public surface is unchanged.
 *
 * `origin` is the addition that matters: scanners have always been able to see
 * *which* file a type came from, but nothing recorded the structure it belonged
 * to (Java package, Maven module, proto package, mapped table). Without that,
 * a schema can only be grouped by guessing from names — which is exactly what
 * the workbench had to do before.
 */

/** How a type was discovered. */
export type ExtractionKind = "ddl" | "java" | "proto" | "mybatis" | "openapi" | "source";

/**
 * What role the source gives a type in its own codebase. Kept separate from the
 * ontology's own `layer` (aggregate_root/child_entity/…) because they answer
 * different questions: `stereotype` is what the *source* called it, and `table`
 * is here because a mapper's SQL is a source that calls something a table.
 */
export type SourceStereotype =
  | "entity"
  | "dto"
  | "controller"
  | "enum"
  | "message"
  | "service"
  | "table";

export interface ExtractedOrigin {
  kind: ExtractionKind;
  /** Java package, proto package, or DB schema the type lives in. */
  namespace?: string;
  /**
   * Business module *within* a deployable unit — the meaningful segment of a
   * Java package (`org.jeecg.modules.system.entity` → `system`). Distinct from
   * `service`: a monolith has many modules but ships as one service.
   */
  module?: string;
  /** The deployable unit: a Maven/Gradle module, a Spring app, a proto service. */
  service?: string;
  /** Physical table this type maps to, when the framework declares one. */
  table?: string;
  /** What the source called this type. */
  stereotype?: SourceStereotype;
}

export interface ExtractedProperty {
  name: string;
  type?: string;
  /** Column comment, when the source carried one. */
  description?: string;
  /**
   * The type as the source language declared it (`SysDept`, `List<OrderItem>`,
   * `ecommerce.v1.Money`). Used to derive relations between types; never
   * persisted into the schema, which keeps only the mapped `type`.
   */
  declaredType?: string;
  /**
   * Physical column this field maps to, when the framework names one
   * (`@TableField("real_name")`, `@Column(name = "real_name")`). Lets an
   * annotation-sourced domain line up with a DDL-sourced one.
   */
  column?: string;
}

export interface ExtractedEntity {
  typeName: string;
  displayName?: string;
  /** Table comment, when the source carried one. */
  description?: string;
  properties?: ExtractedProperty[];
  sourceFile?: string;
  origin?: ExtractedOrigin;
}

export interface ExtractedRelation {
  sourceType: string;
  targetType: string;
  relationType: string;
  sourceFile?: string;
  /** Set when the relation was derived from a field referencing another type. */
  viaField?: string;
}

export interface ExtractedAction {
  name: string;
  httpMethod?: string;
  routePath?: string;
  targetEntity?: string;
  sourceFile?: string;
}

export interface FileExtraction {
  entities: ExtractedEntity[];
  relations: ExtractedRelation[];
  actions: ExtractedAction[];
}

export interface SourceFile {
  path: string;
  content: string;
}
