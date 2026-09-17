/**
 * Where an object type came from.
 *
 * `ontology_node_types` has no provenance columns, and the scanners have always
 * been able to see *which* file a type came from — `AstExtractor` even computed
 * the file list — but nothing could store it, so it was discarded at publish.
 * That is why the workbench had to guess at structure from names.
 *
 * Adding a column per future importer would mean a migration each time, so the
 * `metadata` jsonb bag carries it instead:
 *
 *     { origin: { kind, namespace, module, service, table, stereotype },
 *       sourceFiles: ["…/SysUser.java"] }
 *
 * Readers go through this module so the shape is written and parsed in exactly
 * one place — `metadata` is free-form jsonb, and anything at all may be in there.
 */

import type { ExtractedOrigin, ExtractionKind, SourceStereotype } from "./cognition/extractionTypes.js";

/**
 * A type defined by hundreds of generated files is still one type; the list
 * exists to answer "where does this come from", not to be complete.
 */
export const MAX_SOURCE_FILES = 20;

const KINDS: readonly string[] = ["ddl", "java", "proto", "mybatis", "openapi", "source"];
const STEREOTYPES: readonly string[] = ["entity", "dto", "controller", "enum", "message", "service"];

/** Provenance as read back, with every field validated. */
export interface TypeProvenance {
  origin?: ExtractedOrigin;
  sourceFiles: string[];
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * Read the origin out of a node type's `metadata`, tolerating anything: rows
 * written before this existed, hand-edited jsonb, a different importer's keys.
 */
export function readOrigin(metadata: unknown): ExtractedOrigin | undefined {
  const origin = asRecord(asRecord(metadata)?.origin);
  if (!origin) return undefined;
  const kind = asString(origin.kind);
  if (!kind || !KINDS.includes(kind)) return undefined;
  const stereotype = asString(origin.stereotype);
  const parsed: ExtractedOrigin = {
    kind: kind as ExtractionKind,
    ...(asString(origin.namespace) ? { namespace: asString(origin.namespace)! } : {}),
    ...(asString(origin.module) ? { module: asString(origin.module)! } : {}),
    ...(asString(origin.service) ? { service: asString(origin.service)! } : {}),
    ...(asString(origin.table) ? { table: asString(origin.table)! } : {}),
    ...(stereotype && STEREOTYPES.includes(stereotype)
      ? { stereotype: stereotype as SourceStereotype }
      : {}),
  };
  return parsed;
}

/** The files a type was derived from, as recorded by the importing scan. */
export function readSourceFiles(metadata: unknown): string[] {
  const files = asRecord(metadata)?.sourceFiles;
  if (!Array.isArray(files)) return [];
  return files.filter((f): f is string => typeof f === "string" && f !== "");
}

export function readTypeProvenance(metadata: unknown): TypeProvenance {
  const origin = readOrigin(metadata);
  return { ...(origin ? { origin } : {}), sourceFiles: readSourceFiles(metadata) };
}

/**
 * Build the bag an importer writes. Returns undefined when there is nothing to
 * record, so a hand-created type keeps `metadata` as `{}` rather than gaining
 * an empty provenance object that later reads would have to special-case.
 */
export function buildTypeProvenance(
  origin: ExtractedOrigin | undefined,
  sourceFiles: readonly string[] | undefined,
): Record<string, unknown> | undefined {
  const files = [...new Set(sourceFiles ?? [])].slice(0, MAX_SOURCE_FILES);
  if (!origin && files.length === 0) return undefined;
  return {
    ...(origin ? { origin } : {}),
    ...(files.length > 0 ? { sourceFiles: files } : {}),
  };
}

/**
 * A one-line human summary for the inspector, e.g.
 * `JPA 实体 · sys_user · ruoyi-system`. Returns undefined when nothing is known.
 */
export function describeProvenance(metadata: unknown): string | undefined {
  const { origin } = readTypeProvenance(metadata);
  if (!origin) return undefined;
  const kindLabels: Record<string, string> = {
    ddl: "SQL DDL",
    java: "Java/Kotlin",
    proto: "gRPC proto",
    mybatis: "MyBatis XML",
    openapi: "OpenAPI",
    source: "源码",
  };
  const stereotypeLabels: Record<string, string> = {
    entity: "实体",
    dto: "DTO",
    controller: "控制器",
    enum: "枚举",
    message: "消息",
    service: "服务",
  };
  const parts = [
    kindLabels[origin.kind] ?? origin.kind,
    origin.stereotype ? stereotypeLabels[origin.stereotype] : undefined,
    origin.table,
    origin.module,
    origin.service,
    origin.namespace,
  ].filter((p): p is string => Boolean(p));
  return parts.join(" · ");
}
