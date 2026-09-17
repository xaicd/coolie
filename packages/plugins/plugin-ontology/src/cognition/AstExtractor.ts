/**
 * AstExtractor — clean-room, dependency-light source scanner for the O3 legacy
 * repository cognition pipeline. It reverse-engineers source files into ontology
 * draft material (entities / relations / actions) using tolerant regex passes,
 * per language. This is a pragmatic first cut (mirrors the DigitalStaff
 * regex-based extractor); a tree-sitter backend can replace `parseSourceFile`
 * later behind the same interface without touching callers.
 *
 * Output feeds the O3 cognition draft: `extractRepoDraft` folds many files into
 * `{ seedNodeTypes, seedRelationTypes, seedActions, coverage }`, matching the
 * shape consumed by GraphStore.setCognitionDraft / publish.
 *
 * Pure functions only (no DB, no I/O) so they are trivially testable.
 */

import { firstQuoted } from "./extractionText.js";
import { parseJavaFile } from "./javaParser.js";
import { parseProtoFile } from "./protoParser.js";
import { parseMyBatisMapper } from "./mybatisParser.js";
import type {
  ExtractedAction,
  ExtractedEntity,
  ExtractedOrigin,
  ExtractedProperty,
  ExtractedRelation,
  FileExtraction,
  SourceFile,
} from "./extractionTypes.js";

export type {
  ExtractedAction,
  ExtractedEntity,
  ExtractedOrigin,
  ExtractedProperty,
  ExtractedRelation,
  ExtractionKind,
  FileExtraction,
  SourceFile,
  SourceStereotype,
} from "./extractionTypes.js";

export interface RepoDraftCoverage {
  entityCount: number;
  relationCount: number;
  actionCount: number;
  sqlFiles: number;
  apiFiles: number;
  fileCount: number;
}

export interface RepoDraft {
  seedNodeTypes: Array<{
    typeName: string;
    displayName: string;
    layer?: string;
    sourceFiles: string[];
    /** Table/class comment, when the source carried one. */
    description?: string;
    /** Flat `field -> descriptor` map. */
    properties?: Record<string, unknown>;
    /** Where the type came from: package, service, mapped table, stereotype. */
    origin?: ExtractedOrigin;
  }>;
  seedRelationTypes: Array<{
    relationType: string;
    displayName: string;
    /** Endpoints, so a caller can publish the relation without re-parsing the key. */
    sourceType: string;
    targetType: string;
    sourceFiles: string[];
  }>;
  seedActions: Array<{ name: string; method: string; path: string; sourceFiles: string[] }>;
  coverage: RepoDraftCoverage;
}

const HTTP_METHOD_RE = "(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)";

function extFromPath(path: string): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(path);
  return m ? `.${m[1]!.toLowerCase()}` : "";
}

function dedupeEntities(list: ExtractedEntity[]): ExtractedEntity[] {
  const seen = new Set<string>();
  const out: ExtractedEntity[] = [];
  for (const e of list) {
    if (!e.typeName || seen.has(e.typeName)) continue;
    seen.add(e.typeName);
    out.push(e);
  }
  return out;
}

// --- per-language passes ---

function parseTsJs(content: string, file: string): FileExtraction {
  const entities: ExtractedEntity[] = [];
  const actions: ExtractedAction[] = [];
  const relations: ExtractedRelation[] = [];

  // classes / interfaces / type aliases as entities
  const classRe = /\b(?:export\s+)?(?:abstract\s+)?(?:class|interface)\s+([A-Z][A-Za-z0-9_]*)/g;
  for (let m; (m = classRe.exec(content)); ) entities.push({ typeName: m[1]!, displayName: m[1]!, sourceFile: file });

  // express/fastify/koa style routes: router.get("/path", ...)
  const routeRe = new RegExp(`\\b(?:router|app|fastify)\\.(get|post|put|patch|delete)\\s*\\(\\s*['"\`]([^'"\`]+)['"\`]`, "gi");
  for (let m; (m = routeRe.exec(content)); )
    actions.push({ name: `${m[1]!.toUpperCase()} ${m[2]}`, httpMethod: m[1]!.toUpperCase(), routePath: m[2], sourceFile: file });

  // NestJS decorators: @Get('/path')
  const nestRe = new RegExp(`@${HTTP_METHOD_RE}\\s*\\(\\s*['"\`]([^'"\`]*)['"\`]?`, "g");
  for (let m; (m = nestRe.exec(content)); )
    actions.push({ name: `${m[1]} ${m[2] ?? ""}`.trim(), httpMethod: m[1]!, routePath: m[2] ?? "", sourceFile: file });

  return { entities, actions, relations };
}

function parsePython(content: string, file: string): FileExtraction {
  const entities: ExtractedEntity[] = [];
  const actions: ExtractedAction[] = [];
  const classRe = /\bclass\s+([A-Z][A-Za-z0-9_]*)/g;
  for (let m; (m = classRe.exec(content)); ) entities.push({ typeName: m[1]!, displayName: m[1]!, sourceFile: file });
  // Flask/FastAPI: @app.get("/path") or @router.post("/path")
  const routeRe = /@(?:app|router|blueprint|bp)\.(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]/gi;
  for (let m; (m = routeRe.exec(content)); )
    actions.push({ name: `${m[1]!.toUpperCase()} ${m[2]}`, httpMethod: m[1]!.toUpperCase(), routePath: m[2], sourceFile: file });
  return { entities, actions, relations: [] };
}

function parseGo(content: string, file: string): FileExtraction {
  const entities: ExtractedEntity[] = [];
  const actions: ExtractedAction[] = [];
  // struct types
  const structRe = /\btype\s+([A-Z][A-Za-z0-9_]*)\s+struct\b/g;
  for (let m; (m = structRe.exec(content)); ) entities.push({ typeName: m[1]!, displayName: m[1]!, sourceFile: file });
  // Gin/Echo: r.GET("/path", ...)
  const routeRe = /\b[a-zA-Z_][A-Za-z0-9_]*\.(GET|POST|PUT|PATCH|DELETE)\s*\(\s*"([^"]+)"/g;
  for (let m; (m = routeRe.exec(content)); )
    actions.push({ name: `${m[1]} ${m[2]}`, httpMethod: m[1]!, routePath: m[2], sourceFile: file });
  return { entities, actions, relations: [] };
}

/**
 * Parse one source file into entities/relations/actions by extension.
 *
 * Java/Kotlin and `.proto` delegate to their own modules — a real Spring project
 * or a gRPC contract says far more than a regex over `class X` can capture, and
 * those parsers need to be readable on their own.
 */
export function parseSourceFile(path: string, content: string): FileExtraction {
  if (!content || typeof content !== "string") return { entities: [], relations: [], actions: [] };
  const ext = extFromPath(path);
  switch (ext) {
    case ".ts":
    case ".tsx":
    case ".js":
    case ".jsx":
    case ".mjs":
    case ".cjs":
    case ".vue":
      return parseTsJs(content, path);
    case ".py":
      return parsePython(content, path);
    case ".go":
      return parseGo(content, path);
    case ".java":
    case ".kt":
      return parseJavaFile(content, path);
    case ".proto":
      return parseProtoFile(content, path);
    case ".xml":
      // Only a mapper yields anything; every other XML in a Java project is
      // configuration, and guessing at it would invent object types.
      return parseMyBatisMapper(content, path);
    case ".sql":
      return parseSqlDdl(content, path);
    default:
      return { entities: [], relations: [], actions: [] };
  }
}

/**
 * Collect comments that are not part of a column definition line:
 *   COMMENT ON TABLE  orders      IS '订单主表';
 *   COMMENT ON COLUMN orders.total IS '订单总额';
 * Keyed by `table` (lowercased) and `table.column` (lowercased).
 */
function collectStandaloneComments(content: string): {
  tables: Map<string, string>;
  columns: Map<string, string>;
} {
  const tables = new Map<string, string>();
  const columns = new Map<string, string>();
  const re = /COMMENT\s+ON\s+(TABLE|COLUMN)\s+([`"\[]?[\w.]+[`"\]]?)\s+IS\s+('(?:[^']|'')*'|"(?:[^"]|"")*")/gi;
  for (let m; (m = re.exec(content)); ) {
    const kind = m[1]!.toUpperCase();
    const target = m[2]!.replace(/[`"\[\]]/g, "").toLowerCase();
    const text = firstQuoted(m[3]);
    if (!text) continue;
    if (kind === "TABLE") {
      // `schema.table` → key on the table segment alone.
      tables.set(target.split(".").pop() ?? target, text);
    } else {
      const parts = target.split(".");
      const col = parts.pop();
      const table = parts.pop();
      if (col && table) columns.set(`${table}.${col}`, text);
    }
  }
  return { tables, columns };
}

/**
 * Column comments written on the column's own line:
 *   `total` decimal(10,2) NOT NULL COMMENT '订单总额',   -- MySQL / ClickHouse
 *   total  decimal(10,2) NOT NULL,                        -- 订单总额
 */
function inlineColumnComment(columnLine: string): string | undefined {
  const commentClause = /\bCOMMENT\s+('(?:[^']|'')*'|"(?:[^"]|"")*")/i.exec(columnLine);
  if (commentClause) return firstQuoted(commentClause[1]);
  const dash = /(?:--|#)\s*([^-\n][^\n]*)$/.exec(columnLine);
  if (dash) {
    const text = dash[1]!.trim();
    return text === "" ? undefined : text;
  }
  return undefined;
}

/** Table-level comment on the CREATE TABLE line: `) COMMENT='订单主表';` */
function tableCommentFrom(content: string, table: string): string | undefined {
  const re = new RegExp(
    `CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?[\`"]?${table}[\`"]?[\\s\\S]*?\\)\\s*[\\s\\S]{0,80}?COMMENT\\s*=?\\s*('(?:[^']|'')*'|"(?:[^"]|"")*")`,
    "i",
  );
  return firstQuoted(re.exec(content)?.[1]);
}

/**
 * Parse `CREATE TABLE` statements, including comments.
 *
 * Comments used to be dropped entirely, which is why imported legacy schemas
 * arrived with no field documentation at all — and why the property-description
 * enrichment had nothing to match against.
 *
 * Exported (it used to be reachable only through `parseSourceFile`'s extension
 * dispatch) so the description matcher and its tests can call it directly.
 */
export function parseSqlDdl(content: string, file: string): FileExtraction {
  const entities: ExtractedEntity[] = [];
  const relations: ExtractedRelation[] = [];
  const standalone = collectStandaloneComments(content);
  // CREATE TABLE <name> ( ... )
  const tableRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?([A-Za-z_][A-Za-z0-9_]*)[`"]?\s*\(([\s\S]*?)\)\s*[^\n;]*;/gi;
  for (let m; (m = tableRe.exec(content)); ) {
    const table = m[1]!;
    const body = m[2] ?? "";
    const tableKey = table.toLowerCase();
    const props: ExtractedProperty[] = [];
    const colRe = /^[ \t]*[`"]?([A-Za-z_][A-Za-z0-9_]*)[`"]?[ \t]+([A-Za-z][A-Za-z0-9_]*)/gm;
    for (let c; (c = colRe.exec(body)); ) {
      const col = c[1]!.toLowerCase();
      if (["primary", "foreign", "unique", "constraint", "key", "index", "check"].includes(col)) continue;
      // The comment can sit on the column's own line…
      const lineEnd = body.indexOf("\n", colRe.lastIndex);
      const line = body.slice(c.index, lineEnd === -1 ? body.length : lineEnd);
      const description =
        inlineColumnComment(line)
        // …or in a standalone COMMENT ON COLUMN statement.
        ?? standalone.columns.get(`${tableKey}.${col}`);
      props.push({ name: c[1]!, type: c[2]!.toLowerCase(), ...(description ? { description } : {}) });
    }
    const tableDescription = standalone.tables.get(tableKey) ?? tableCommentFrom(content, table);
    entities.push({
      typeName: table,
      displayName: table,
      properties: props,
      sourceFile: file,
      ...(tableDescription ? { description: tableDescription } : {}),
    });
    // FOREIGN KEY (..) REFERENCES other(..)
    const fkRe = /REFERENCES\s+[`"]?([A-Za-z_][A-Za-z0-9_]*)[`"]?/gi;
    for (let f; (f = fkRe.exec(body)); )
      relations.push({ sourceType: table, targetType: f[1]!, relationType: "references", sourceFile: file });
  }
  return { entities, actions: [], relations };
}

/**
 * Fold multiple source files into an O3 cognition draft. Entities become seed
 * node types (layer aggregate_root for tables/classes), FK/relations become seed
 * relation types, and routes become seed actions. Each seed carries the set of
 * source files it was derived from (provenance).
 */
export function extractRepoDraft(files: SourceFile[]): RepoDraft {
  const entityMap = new Map<
    string,
    {
      displayName: string;
      description?: string;
      /** Flat `field -> descriptor` map, the plugin's canonical schema shape. */
      properties?: Record<string, unknown>;
      /** Field -> the type it referenced, for relation derivation. */
      references: Array<{ field: string; target: string }>;
      origin?: ExtractedOrigin;
      sourceFiles: Set<string>;
    }
  >();
  const relationMap = new Map<string, { displayName: string; sourceFiles: Set<string> }>();
  const actionMap = new Map<string, { method: string; path: string; sourceFiles: Set<string> }>();
  let sqlFiles = 0;
  let apiFiles = 0;

  for (const f of files) {
    const ex = parseSourceFile(f.path, f.content);
    if (extFromPath(f.path) === ".sql") sqlFiles += 1;
    if (ex.actions.length > 0) apiFiles += 1;

    for (const e of ex.entities) {
      const cur = entityMap.get(e.typeName)
        ?? { displayName: e.displayName ?? e.typeName, references: [], sourceFiles: new Set<string>() };
      cur.sourceFiles.add(f.path);
      // Only SQL carries fields and table comments today, but the fold is
      // generic: the first entity that has them wins, later duplicates do not
      // overwrite. Dropping them here is what made imported tables arrive with
      // no columns at all.
      if (!cur.description && e.description) cur.description = e.description;
      if (!cur.origin && e.origin) cur.origin = e.origin;
      if (e.properties && e.properties.length > 0) {
        // Merge per *field*, not per file. A Java entity and its mapper know
        // different things about the same field — the annotation has the type,
        // the resultMap has the column — and taking the first source whole threw
        // the other half away. Later sources fill in what is still missing and
        // never overwrite what is already known.
        const merged: Record<string, unknown> = cur.properties ?? {};
        for (const p of e.properties) {
          const prior = (merged[p.name] ?? {}) as Record<string, unknown>;
          merged[p.name] = {
            // Only SQL states a column type; everywhere else the language type
            // is the best we have, and a mapper states neither.
            type: prior.type ?? p.type ?? "string",
            ...(prior.description ?? p.description
              ? { description: (prior.description ?? p.description) as string }
              : {}),
            ...(prior.column ?? p.column
              ? { column: (prior.column ?? p.column) as string }
              : {}),
          };
          // `declaredType` is dropped from the stored descriptor: it is a means
          // to derive relations, not part of the object's shape.
          if (p.declaredType) cur.references.push({ field: p.name, target: p.declaredType });
        }
        cur.properties = merged;
      }
      entityMap.set(e.typeName, cur);
    }
    for (const r of ex.relations) {
      const key = `${r.sourceType}::${r.relationType}::${r.targetType}`;
      const cur = relationMap.get(key) ?? { displayName: `${r.sourceType} ${r.relationType} ${r.targetType}`, sourceFiles: new Set<string>() };
      cur.sourceFiles.add(f.path);
      relationMap.set(key, cur);
    }
    for (const a of ex.actions) {
      const key = `${a.httpMethod ?? "POST"} ${a.routePath ?? a.name}`;
      const cur = actionMap.get(key) ?? { method: a.httpMethod ?? "POST", path: a.routePath ?? "", sourceFiles: new Set<string>() };
      cur.sourceFiles.add(f.path);
      actionMap.set(key, cur);
    }
  }

  // A field typed as another scanned type is a relation — that is how a
  // monolith or a gRPC contract actually expresses its object graph
  // (`private SysDept dept;`, `repeated OrderItem items = 2;`). Only types that
  // exist in this same scan count, so a `String` or a JDK type never becomes one.
  const known = new Set(entityMap.keys());
  for (const [typeName, entity] of entityMap) {
    for (const ref of entity.references) {
      const target = ref.target.replace(/<[\s\S]*>/, "").replace(/\[\s*\]/g, "").split(".").pop() ?? "";
      if (target === typeName || !known.has(target)) continue;
      const key = `${typeName}::references::${target}`;
      const cur = relationMap.get(key)
        ?? { displayName: `${typeName} references ${target}`, sourceFiles: new Set<string>() };
      for (const file of entity.sourceFiles) cur.sourceFiles.add(file);
      relationMap.set(key, cur);
    }
  }

  const seedNodeTypes = [...entityMap.entries()].map(([typeName, v]) => ({
    typeName,
    displayName: v.displayName,
    layer: "aggregate_root",
    sourceFiles: [...v.sourceFiles],
    ...(v.description ? { description: v.description } : {}),
    ...(v.properties ? { properties: v.properties } : {}),
    ...(v.origin ? { origin: v.origin } : {}),
  }));
  const seedRelationTypes = [...relationMap.entries()].map(([key, v]) => ({
    relationType: key.split("::")[1] ?? "related",
    displayName: v.displayName,
    sourceType: key.split("::")[0] ?? "",
    targetType: key.split("::")[2] ?? "",
    sourceFiles: [...v.sourceFiles],
  }));
  const seedActions = [...actionMap.entries()].map(([name, v]) => ({
    name,
    method: v.method,
    path: v.path,
    sourceFiles: [...v.sourceFiles],
  }));

  return {
    seedNodeTypes,
    seedRelationTypes,
    seedActions,
    coverage: {
      entityCount: seedNodeTypes.length,
      relationCount: seedRelationTypes.length,
      actionCount: seedActions.length,
      sqlFiles,
      apiFiles,
      fileCount: files.length,
    },
  };
}

/** Deduped convenience over a single file (used by tests / single-shard ingest). */
export function extractFile(path: string, content: string): FileExtraction {
  const ex = parseSourceFile(path, content);
  return { entities: dedupeEntities(ex.entities), relations: ex.relations, actions: ex.actions };
}
