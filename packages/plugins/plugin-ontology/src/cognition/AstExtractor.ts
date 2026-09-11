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

export interface ExtractedProperty {
  name: string;
  type?: string;
}

export interface ExtractedEntity {
  typeName: string;
  displayName?: string;
  properties?: ExtractedProperty[];
  sourceFile?: string;
}

export interface ExtractedRelation {
  sourceType: string;
  targetType: string;
  relationType: string;
  sourceFile?: string;
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

export interface RepoDraftCoverage {
  entityCount: number;
  relationCount: number;
  actionCount: number;
  sqlFiles: number;
  apiFiles: number;
  fileCount: number;
}

export interface RepoDraft {
  seedNodeTypes: Array<{ typeName: string; displayName: string; layer?: string; sourceFiles: string[] }>;
  seedRelationTypes: Array<{ relationType: string; displayName: string; sourceFiles: string[] }>;
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

function parseJava(content: string, file: string): FileExtraction {
  const entities: ExtractedEntity[] = [];
  const actions: ExtractedAction[] = [];
  // classes (Spring entities/controllers)
  const classRe = /\b(?:public\s+)?(?:final\s+)?class\s+([A-Z][A-Za-z0-9_]*)/g;
  for (let m; (m = classRe.exec(content)); ) entities.push({ typeName: m[1]!, displayName: m[1]!, sourceFile: file });
  // Spring: @GetMapping("/path") / @RequestMapping(method=..., value="/path")
  const mapRe = /@(Get|Post|Put|Patch|Delete)Mapping\s*\(\s*(?:value\s*=\s*)?["']([^"']*)["']/g;
  for (let m; (m = mapRe.exec(content)); )
    actions.push({ name: `${m[1]!.toUpperCase()} ${m[2]}`, httpMethod: m[1]!.toUpperCase(), routePath: m[2], sourceFile: file });
  return { entities, actions, relations: [] };
}

function parseSqlDdl(content: string, file: string): FileExtraction {
  const entities: ExtractedEntity[] = [];
  const relations: ExtractedRelation[] = [];
  // CREATE TABLE <name> ( ... )
  const tableRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?([A-Za-z_][A-Za-z0-9_]*)[`"]?\s*\(([\s\S]*?)\)\s*;/gi;
  for (let m; (m = tableRe.exec(content)); ) {
    const table = m[1]!;
    const body = m[2] ?? "";
    const props: ExtractedProperty[] = [];
    const colRe = /^\s*[`"]?([A-Za-z_][A-Za-z0-9_]*)[`"]?\s+([A-Za-z][A-Za-z0-9_]*)/gm;
    for (let c; (c = colRe.exec(body)); ) {
      const col = c[1]!.toLowerCase();
      if (["primary", "foreign", "unique", "constraint", "key", "index", "check"].includes(col)) continue;
      props.push({ name: c[1]!, type: c[2]!.toLowerCase() });
    }
    entities.push({ typeName: table, displayName: table, properties: props, sourceFile: file });
    // FOREIGN KEY (..) REFERENCES other(..)
    const fkRe = /REFERENCES\s+[`"]?([A-Za-z_][A-Za-z0-9_]*)[`"]?/gi;
    for (let f; (f = fkRe.exec(body)); )
      relations.push({ sourceType: table, targetType: f[1]!, relationType: "references", sourceFile: file });
  }
  return { entities, actions: [], relations };
}

/** Parse one source file into entities/relations/actions by extension. */
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
      return parseJava(content, path);
    case ".sql":
      return parseSqlDdl(content, path);
    default:
      return { entities: [], relations: [], actions: [] };
  }
}

/**
 * Fold multiple source files into an O3 cognition draft. Entities become seed
 * node types (layer aggregate_root for tables/classes), FK/relations become seed
 * relation types, and routes become seed actions. Each seed carries the set of
 * source files it was derived from (provenance).
 */
export function extractRepoDraft(files: SourceFile[]): RepoDraft {
  const entityMap = new Map<string, { displayName: string; sourceFiles: Set<string> }>();
  const relationMap = new Map<string, { displayName: string; sourceFiles: Set<string> }>();
  const actionMap = new Map<string, { method: string; path: string; sourceFiles: Set<string> }>();
  let sqlFiles = 0;
  let apiFiles = 0;

  for (const f of files) {
    const ex = parseSourceFile(f.path, f.content);
    if (extFromPath(f.path) === ".sql") sqlFiles += 1;
    if (ex.actions.length > 0) apiFiles += 1;

    for (const e of ex.entities) {
      const cur = entityMap.get(e.typeName) ?? { displayName: e.displayName ?? e.typeName, sourceFiles: new Set<string>() };
      cur.sourceFiles.add(f.path);
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

  const seedNodeTypes = [...entityMap.entries()].map(([typeName, v]) => ({
    typeName,
    displayName: v.displayName,
    layer: "aggregate_root",
    sourceFiles: [...v.sourceFiles],
  }));
  const seedRelationTypes = [...relationMap.entries()].map(([key, v]) => ({
    relationType: key.split("::")[1] ?? "related",
    displayName: v.displayName,
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
