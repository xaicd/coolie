/**
 * Java / Kotlin source → ontology draft material.
 *
 * The previous pass regexed `class X` and `@(Get|Post|…)Mapping("/p")` and
 * nothing else, so a real Spring project — JEECGBoot, RuoYi-Pro, or a
 * hand-assembled Spring Boot stack — arrived as a list of bare class names with
 * no fields, no table mapping and no package. That is why imported Java domains
 * looked worse than a UML sketch.
 *
 * Everything those frameworks know is declared in annotations, so that is what
 * this reads:
 *
 *   @TableName("sys_user")            MyBatis-Plus / JEECGBoot   → mapped table
 *   @Table(name = "sys_dept")         JPA / Hibernate            → mapped table
 *   @Entity / @Document               JPA / Mongo                → it is persistent
 *   @TableId / @TableField("col")     MyBatis-Plus               → column name
 *   @Column(name = "col") / @Id       JPA                        → column name
 *   @Excel(name = "用户名称")          JEECGBoot / RuoYi          → field label (中文)
 *   @ApiModelProperty("用户名称")      Swagger v2                 → field description
 *   @Schema(description = "…")        OpenAPI v3                 → field description
 *   @ApiModel(value = "用户对象")      Swagger v2                 → type display name
 *   @RestController + @RequestMapping("/system/user")             → route prefix
 *   @GetMapping("/list")              → an action, prefix-joined
 *
 * Relations are derived later, in `extractRepoDraft`: a field whose declared
 * type is another type in the same scan (`private SysDept dept;`) is how a
 * monolith actually expresses its object graph, and JPA's `@ManyToOne` /
 * `@OneToMany` say so explicitly.
 *
 * Pure functions, no I/O, so the whole thing is unit-testable.
 */

import type {
  ExtractedAction,
  ExtractedEntity,
  ExtractedOrigin,
  ExtractedProperty,
  FileExtraction,
} from "./extractionTypes.js";
import { dropOrgPrefix, firstQuoted, joinPaths } from "./extractionText.js";

// --- low-level source scanning -----------------------------------------------

/** Index just past the string literal starting at `i`. */
function skipString(source: string, i: number): number {
  const quote = source[i]!;
  let j = i + 1;
  while (j < source.length) {
    if (source[j] === "\\") {
      j += 2;
      continue;
    }
    if (source[j] === quote) return j + 1;
    j += 1;
  }
  return source.length;
}

/** Index of the delimiter balancing the opener at `open`, or -1. */
function matchDelimiter(source: string, open: number, openCh: string, closeCh: string): number {
  let depth = 0;
  let i = open;
  while (i < source.length) {
    const ch = source[i]!;
    if (ch === '"' || ch === "'") {
      i = skipString(source, i);
      continue;
    }
    if (ch === openCh) depth += 1;
    else if (ch === closeCh) {
      depth -= 1;
      if (depth === 0) return i;
    }
    i += 1;
  }
  return -1;
}

/**
 * Blank out `//` and `/* *\/` comments, keeping every offset (and newline) in
 * place so later index math stays valid. String literals are skipped so a URL
 * like `"http://x"` is not mistaken for a comment.
 */
export function stripJavaComments(source: string): string {
  const out = source.split("");
  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    const next = source[i + 1];
    if (ch === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") {
        out[i] = " ";
        i += 1;
      }
      continue;
    }
    if (ch === "/" && next === "*") {
      out[i] = " ";
      out[i + 1] = " ";
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) {
        out[i] = source[i] === "\n" ? "\n" : " ";
        i += 1;
      }
      if (i < source.length) {
        out[i] = " ";
        out[i + 1] = " ";
        i += 2;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      i = skipString(source, i);
      continue;
    }
    i += 1;
  }
  return out.join("");
}

// --- annotations -------------------------------------------------------------

interface AnnotationHit {
  name: string;
  args: string;
  start: number;
  end: number;
}

/** Every `@Name` / `@Name(...)` in a (comment-stripped) source, with offsets. */
function scanAnnotations(source: string): AnnotationHit[] {
  const hits: AnnotationHit[] = [];
  const re = /@([A-Za-z_$][\w$.:]*)/g;
  for (let m; (m = re.exec(source)); ) {
    let end = re.lastIndex;
    let i = end;
    while (i < source.length && /\s/.test(source[i]!)) i += 1;
    let args = "";
    if (source[i] === "(") {
      const close = matchDelimiter(source, i, "(", ")");
      if (close === -1) continue;
      args = source.slice(i + 1, close);
      end = close + 1;
    }
    hits.push({
      // `@javax.persistence.Table` → `Table`; `@field:NotNull` → `NotNull`
      name: m[1]!.split(/[.:]/).pop() ?? m[1]!,
      args,
      start: m.index,
      end,
    });
    re.lastIndex = end;
  }
  return hits;
}

/**
 * The contiguous block of annotations immediately above `index`.
 * Stops at the first gap that is not whitespace, so a field above a class does
 * not donate its annotations to the class.
 */
function annotationBlockBefore(
  source: string,
  hits: AnnotationHit[],
  index: number,
): AnnotationHit[] {
  const block: AnnotationHit[] = [];
  let cursor = index;
  for (let i = hits.length - 1; i >= 0; i -= 1) {
    const hit = hits[i]!;
    if (hit.end > cursor) continue;
    if (!/^\s*$/.test(source.slice(hit.end, cursor))) break;
    block.unshift(hit);
    cursor = hit.start;
  }
  return block;
}

/** First string value among the named annotations, e.g. `@TableName("t")`. */
function annotationValue(block: AnnotationHit[], names: string[]): string | undefined {
  for (const hit of block) {
    if (!names.includes(hit.name)) continue;
    const value = firstQuoted(hit.args);
    if (value) return value;
  }
  return undefined;
}

/** A named argument, e.g. `@ApiModelProperty(description = "…")` or JPA's `name =`. */
function annotationArg(block: AnnotationHit[], names: string[], arg: string): string | undefined {
  for (const hit of block) {
    if (!names.includes(hit.name)) continue;
    const re = new RegExp(`\\b${arg}\\s*=\\s*('(?:[^']|'')*'|"(?:[^"]|"")*")`);
    const value = firstQuoted(re.exec(hit.args)?.[1]);
    if (value) return value;
  }
  return undefined;
}

function hasAnnotation(block: AnnotationHit[], names: string[]): boolean {
  return block.some((hit) => names.includes(hit.name));
}

// --- members -----------------------------------------------------------------

interface MemberSegment {
  text: string;
  /** True when the segment was a `{ … }` header (a method or nested type). */
  block: boolean;
}

/**
 * Split a class body into member segments: fields end at `;`, methods and
 * nested types end at the `{` that opens their body (which is then skipped
 * whole). Scanning only at brace depth 0 is what keeps `return x;` inside a
 * method from being mistaken for a field.
 */
function memberSegments(body: string): MemberSegment[] {
  const out: MemberSegment[] = [];
  let segStart = 0;
  let i = 0;
  while (i < body.length) {
    const ch = body[i]!;
    if (ch === '"' || ch === "'") {
      i = skipString(body, i);
      continue;
    }
    if (ch === "{") {
      const close = matchDelimiter(body, i, "{", "}");
      out.push({ text: body.slice(segStart, i), block: true });
      i = close === -1 ? body.length : close + 1;
      segStart = i;
      continue;
    }
    if (ch === ";") {
      out.push({ text: body.slice(segStart, i), block: false });
      i += 1;
      segStart = i;
      continue;
    }
    i += 1;
  }
  if (body.slice(segStart).trim() !== "") out.push({ text: body.slice(segStart), block: false });
  return out;
}

const LEADING_ANNOTATIONS = /^\s*(?:@[A-Za-z_$][\w$.:]*(?:\s*\((?:[^()]|\([^()]*\))*\))?\s*)*/;
const JAVA_MODIFIERS =
  /^(?:(?:public|private|protected|static|final|transient|volatile|synchronized|strictfp|abstract|default)\s+)+/;
/** Fields that are plumbing rather than data. */
const NOISE_FIELDS = new Set(["log", "logger", "serialVersionUID", "LOGGER", "LOG"]);

/** `java.util.List<SysDept>` → the schema types this plugin knows. */
export function javaTypeToSchemaType(javaType: string): string {
  const bare = javaType.replace(/<[\s\S]*>/, "").replace(/\[\s*\]/g, "").trim().toLowerCase();
  const last = bare.split(".").pop() ?? bare;
  if (last === "boolean") return "boolean";
  if (
    ["int", "long", "short", "byte", "integer", "bigdecimal", "biginteger", "double", "float",
      "number", "atomicinteger", "atomiclong"].includes(last)
  ) {
    return "number";
  }
  if (["list", "set", "collection", "arraylist", "hashset", "iterable", "linkedlist", "queue"].includes(last)) {
    return "array";
  }
  if (["map", "hashmap", "linkedhashmap", "jsonobject", "jsonnode", "treemap"].includes(last)) {
    return "object";
  }
  return "string";
}

interface JavaField {
  name: string;
  type: string;
  declaredType: string;
  description?: string;
  column?: string;
}

/** Annotations that carry a human label for a field. */
function fieldDescription(block: AnnotationHit[]): string | undefined {
  return (
    annotationArg(block, ["Excel"], "name")
    ?? annotationArg(block, ["ApiModelProperty", "Schema", "ApiOperationSupport"], "description")
    ?? annotationArg(block, ["ApiModelProperty", "Schema"], "value")
    ?? annotationValue(block, ["ApiModelProperty", "Schema"])
    ?? annotationValue(block, ["Comment"])
  );
}

/** Parse one field declaration (annotations included) or return null. */
function parseFieldSegment(text: string): JavaField | null {
  const annotationsText = LEADING_ANNOTATIONS.exec(text)?.[0] ?? "";
  const block = scanAnnotations(annotationsText);
  const tail = text.slice(annotationsText.length);
  const modifiers = JAVA_MODIFIERS.exec(tail)?.[0] ?? "";
  const declaration = tail.slice(modifiers.length).trim();
  // A `static final` field is a constant, not part of the object's shape.
  if (/\bstatic\b/.test(modifiers) && /\bfinal\b/.test(modifiers)) return null;

  // Kotlin: `val name: Type` / `var name: Type`
  const kotlin = /^(?:val|var)\s+([A-Za-z_$][\w$]*)\s*:\s*([^=]+?)\s*(?:=\s*[\s\S]*)?$/.exec(declaration);
  if (kotlin) {
    const name = kotlin[1]!;
    if (NOISE_FIELDS.has(name)) return null;
    const declaredType = kotlin[2]!.trim();
    const description = fieldDescription(block);
    return {
      name,
      type: javaTypeToSchemaType(declaredType),
      declaredType,
      ...(description ? { description } : {}),
    };
  }

  const java = /^([A-Za-z_$][\w$.]*(?:\s*<[\s\S]+>)?(?:\s*\[\s*\])*)\s+([a-z_$][\w$]*)\s*(?:=[\s\S]*)?$/.exec(
    declaration,
  );
  if (!java) return null;
  const declaredType = java[1]!.replace(/\s+/g, "");
  const name = java[2]!;
  if (NOISE_FIELDS.has(name)) return null;
  const description = fieldDescription(block);
  const column = annotationValue(block, ["TableField", "Column", "TableId", "Id", "Field"]);
  return {
    name,
    type: javaTypeToSchemaType(declaredType),
    declaredType,
    ...(column ? { column } : {}),
    ...(description ? { description } : {}),
  };
}

// --- package → module --------------------------------------------------------

/** Segments that describe a layer, not a business module. */
const LAYER_PACKAGE_SEGMENTS = new Set([
  "entity", "entities", "domain", "model", "pojo", "po", "vo", "bo", "dto", "dto", "form",
  "service", "services", "impl", "controller", "controllers", "web", "rest", "api", "apis",
  "mapper", "mappers", "dao", "repository", "data", "repository", "handler", "config",
  "common", "core", "util", "utils", "exception", "constant", "constants", "enums", "converter",
  "annotation", "annotations", "component", "components", "interceptor", "filter", "job",
]);

/**
 * The business module a package belongs to: `org.jeecg.modules.system.entity` →
 * `system`, `com.ruoyi.system.domain` → `system`, `com.example.order.service.impl`
 * → `order`. Returns undefined when the package names no module at all.
 */
export function moduleFromJavaPackage(pkg: string): string | undefined {
  const segments = pkg.split(".").filter((s) => s.trim() !== "" && !/^\$/.test(s));
  const rest = dropOrgPrefix(segments).filter(
    (s) => !LAYER_PACKAGE_SEGMENTS.has(s.toLowerCase()),
  );
  return rest.length > 0 ? rest[rest.length - 1] : undefined;
}

// --- the parser --------------------------------------------------------------

const CONTROLLER_ANNOTATIONS = ["RestController", "Controller"];
const PERSISTENCE_ANNOTATIONS = ["TableName", "Table", "Entity", "Document", "MappedSuperclass"];
/** Full annotation names — `scanAnnotations` reports `GetMapping`, not `Get`. */
const MAPPING_ANNOTATIONS = ["GetMapping", "PostMapping", "PutMapping", "PatchMapping", "DeleteMapping"];
const TYPE_DECL =
  /\b(?:(?:public|final|abstract|static|sealed)\s+)*(class|interface|enum|record)\s+([A-Za-z_$][\w$]*)/g;

/**
 * Index of the `{` opening a type's body, or -1 when it has none.
 *
 * Bounded on purpose: it steps over the parenthesised constructor/parameter
 * list (Kotlin `data class X(...)`, Java `record X(...)`) and stops at a `;` or
 * at the next type declaration, so a body-less type never inherits the braces
 * of the class below it.
 */
function findClassBody(source: string, from: number): number {
  const nextDecl = /\b(?:(?:public|final|abstract|static|sealed)\s+)*(?:class|interface|enum|record)\s/;
  let i = from;
  while (i < source.length) {
    const ch = source[i]!;
    if (ch === '"' || ch === "'") {
      i = skipString(source, i);
      continue;
    }
    if (ch === "(") {
      const close = matchDelimiter(source, i, "(", ")");
      i = close === -1 ? source.length : close + 1;
      continue;
    }
    if (ch === "{") return i;
    if (ch === ";") return -1;
    if (nextDecl.test(source.slice(i, i + 40))) return -1;
    i += 1;
  }
  return -1;
}

/** The parenthesised declaration list right after a type name, when present. */
function constructorText(source: string, nameEnd: number): string | undefined {
  let i = nameEnd;
  while (i < source.length && /\s/.test(source[i]!)) i += 1;
  if (source[i] !== "(") return undefined;
  const close = matchDelimiter(source, i, "(", ")");
  return close === -1 ? undefined : source.slice(i + 1, close);
}

/** Split on a separator that sits outside any bracket — commas in a param list. */
function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === '"' || ch === "'") {
      i = skipString(text, i);
      continue;
    }
    if (ch === "(" || ch === "{" || ch === "<" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "}" || ch === ">" || ch === "]") depth -= 1;
    else if (ch === separator && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
    i += 1;
  }
  parts.push(text.slice(start));
  return parts;
}

export function parseJavaFile(content: string, file: string): FileExtraction {
  const source = stripJavaComments(content);
  const annotations = scanAnnotations(source);
  const entities: ExtractedEntity[] = [];
  const actions: ExtractedAction[] = [];

  const namespace = /^\s*package\s+([\w.]+)\s*;/m.exec(source)?.[1];
  // The package names a business module, not a deployable unit — a monolith has
  // many of these but ships as one service. The project scanner fills `service`.
  const module = namespace ? moduleFromJavaPackage(namespace) : undefined;
  const originBase: ExtractedOrigin = {
    kind: "java",
    ...(namespace ? { namespace } : {}),
    ...(module ? { module } : {}),
  };

  TYPE_DECL.lastIndex = 0;
  for (let decl; (decl = TYPE_DECL.exec(source)); ) {
    const keyword = decl[1]!;
    const typeName = decl[2]!;
    const block = annotationBlockBefore(source, annotations, decl.index);

    // Both scans start *after* the type name: at the name itself the
    // "next declaration" guard would match the declaration we are reading.
    const nameEnd = decl.index + decl[0]!.length;
    const opens = findClassBody(source, nameEnd);
    const closes = opens === -1 ? -1 : matchDelimiter(source, opens, "{", "}");
    const body = opens === -1 ? "" : source.slice(opens + 1, closes === -1 ? source.length : closes);
    const members = body === "" ? [] : memberSegments(body);

    const isController =
      hasAnnotation(block, CONTROLLER_ANNOTATIONS) || /Controller$/.test(typeName);
    const table = annotationValue(block, ["TableName", "Table", "Document"]);
    const isPersistent = table !== undefined || hasAnnotation(block, PERSISTENCE_ANNOTATIONS);

    if (isController) {
      // A controller is plumbing, not a business object: its routes matter.
      const prefix = annotationValue(block, ["RequestMapping"]);
      for (const member of members) {
        if (!member.block) continue;
        const hits = scanAnnotations(LEADING_ANNOTATIONS.exec(member.text)?.[0] ?? "");
        const mapping = hits.find((h) => MAPPING_ANNOTATIONS.includes(h.name));
        const plainMapping = hits.find((h) => h.name === "RequestMapping");
        if (!mapping && !plainMapping) continue;
        const path = firstQuoted((mapping ?? plainMapping)!.args) ?? "";
        const httpMethod = mapping
          ? mapping.name.replace(/Mapping$/, "").toUpperCase()
          : (/RequestMethod\.([A-Za-z]+)/.exec(plainMapping!.args)?.[1] ?? "ANY").toUpperCase();
        const target = /@RequestBody\s+([A-Z][\w$.]*)/.exec(member.text)?.[1]?.split(".").pop();
        const full = joinPaths(prefix, path);
        actions.push({
          name: `${httpMethod} ${full}`,
          httpMethod,
          routePath: full,
          ...(target ? { targetEntity: target } : {}),
          sourceFile: file,
        });
      }
      continue;
    }

    const stereotype = keyword === "enum" ? "enum" : isPersistent ? "entity" : "dto";
    const properties: ExtractedProperty[] = [];
    // Kotlin `data class X(val a: String)` and Java `record X(String a)` declare
    // their fields as constructor parameters, not as body members.
    const declared = constructorText(source, nameEnd);
    const segments = declared
      ? [...splitTopLevel(declared, ",").map((text) => ({ text, block: false })), ...members]
      : members;
    for (const member of segments) {
      if (member.block) continue;
      const field = parseFieldSegment(member.text);
      if (!field) continue;
      properties.push({
        name: field.name,
        type: field.type,
        declaredType: field.declaredType,
        ...(field.description ? { description: field.description } : {}),
        ...(field.column ? { column: field.column } : {}),
      });
    }

    // An enum's constants are its vocabulary, not its fields.
    if (keyword === "enum") {
      const constants = body
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter((s) => /^[A-Z][A-Z0-9_]*$/.test(s));
      if (constants.length > 0) {
        properties.push({
          name: "values",
          type: "array",
          description: constants.join(" / "),
        });
      }
    }

    const displayName = annotationValue(block, ["ApiModel", "Api"]) ?? typeName;
    const description =
      annotationArg(block, ["ApiModel", "Api"], "description")
      ?? annotationValue(block, ["ApiModel", "Api"]);
    entities.push({
      typeName,
      displayName,
      ...(description && description !== displayName ? { description } : {}),
      ...(properties.length > 0 ? { properties } : {}),
      sourceFile: file,
      origin: { ...originBase, stereotype, ...(table ? { table } : {}) },
    });
  }

  return { entities, relations: [], actions };
}
