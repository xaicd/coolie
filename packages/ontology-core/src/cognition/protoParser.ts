/**
 * gRPC / Protocol Buffers `.proto` → ontology draft material.
 *
 * The plugin had no `.proto` support at all, so a gRPC system — an increasingly
 * common legacy system, and a common *new* one — could not be brought in by any
 * route. A `.proto` is unusually well suited to this: it already declares the
 * object model (`message`), the vocabulary (`enum`) and the operations
 * (`service` / `rpc`) in one typed file.
 *
 *   package ecommerce.order.v1;     → the service/module boundary
 *   message Order { … }             → an object type, with typed fields
 *   enum OrderStatus { … }          → a type whose vocabulary is the constants
 *   service OrderService { rpc … }  → actions, at their canonical gRPC path
 *   repeated OrderItem items = 2;   → an array, and a relation to OrderItem
 *
 * The canonical gRPC path is `/package.Service/Method`, which is exactly what a
 * gateway routes on, so actions are named that way.
 *
 * Pure functions, no I/O.
 */

import { dropOrgPrefix } from "./extractionText.js";
import type {
  ExtractedAction,
  ExtractedEntity,
  ExtractedOrigin,
  ExtractedProperty,
  FileExtraction,
} from "./extractionTypes.js";

/** Proto scalar → the schema types this plugin knows. */
export function protoTypeToSchemaType(protoType: string): string {
  const bare = protoType.replace(/^repeated\s+/, "").replace(/^\./, "").trim();
  const lower = bare.toLowerCase();
  if (lower === "bool") return "boolean";
  if (
    ["int32", "int64", "uint32", "uint64", "sint32", "sint64", "fixed32", "fixed64",
      "sfixed32", "sfixed64", "double", "float"].includes(lower)
  ) {
    return "number";
  }
  // includes `bytes`, which we carry as a string
  return "string";
}

/**
 * The service boundary a proto package describes:
 * `ecommerce.order.v1` → `order`, `com.acme.payments.api` → `payments`.
 * The segments `api`, `pb`, `proto`, `grpc`, `service` and `v1`-style versions
 * are dropped, as is the organisation prefix; the last meaningful segment names
 * the service.
 */
export function serviceFromProtoPackage(pkg: string): string | undefined {
  const noise = new Set(["api", "apis", "pb", "proto", "protos", "grpc", "service", "services"]);
  const rest = dropOrgPrefix(
    pkg.split(".").filter((s) => s.trim() !== ""),
  ).filter((s) => !noise.has(s.toLowerCase()) && !/^v\d+$/i.test(s));
  return rest.length > 0 ? rest[rest.length - 1] : undefined;
}

/** Index of the `}` balancing the `{` at `open`, or -1. Comments/strings skipped. */
function matchBrace(source: string, open: number): number {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i]!;
    if (ch === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? source.length : end + 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i += 1;
      while (i < source.length && source[i] !== quote) {
        if (source[i] === "\\") i += 1;
        i += 1;
      }
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Everything between the braces of a `message` / `enum` / `service` body. */
function bodyOf(source: string, open: number): string {
  const close = matchBrace(source, open);
  return source.slice(open + 1, close === -1 ? source.length : close);
}

/**
 * Blank out line comments *in place*, keeping every offset identical to the raw
 * source. Field parsing then never trips over prose, while descriptions can
 * still be recovered from the original text at the same indices.
 */
function stripLineComments(source: string): string {
  return source
    .split("\n")
    .map((line) => {
      const at = line.indexOf("//");
      return at === -1 ? line : line.slice(0, at) + " ".repeat(line.length - at);
    })
    .join("\n");
}

/**
 * Blank out nested `message` / `enum` blocks in place (same length, so offsets
 * hold). Without this, a nested message's fields are also read as fields of its
 * parent, which silently duplicates them.
 */
function blankNestedBlocks(body: string, keywords: string[]): string {
  let out = body;
  for (const keyword of keywords) {
    const re = new RegExp(`(^|\\n)([ \\t]*)${keyword}\\s+[A-Za-z_][\\w]*\\s*\\{`, "g");
    for (let m; (m = re.exec(out)); ) {
      const open = out.indexOf("{", m.index);
      if (open === -1) break;
      const close = matchBrace(out, open);
      if (close === -1) break;
      out = out.slice(0, m.index) + " ".repeat(close + 1 - m.index) + out.slice(close + 1);
    }
  }
  return out;
}

/**
 * The `//` comment block immediately above a declaration — the normal way a
 * `.proto` documents a message. Returns undefined when there is none.
 *
 * `declarationIndex` must point at the declaration keyword itself, not at the
 * preceding newline: comments are blanked to spaces before matching, so the
 * `\s*` in the declaration pattern swallows them and reports a match that
 * starts *before* the comment.
 */
function leadingComment(raw: string, declarationIndex: number): string | undefined {
  const lines = raw.slice(0, declarationIndex).split("\n");
  const collected: string[] = [];
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]!;
    const match = /^\s*\/\/\s?(.*)$/.exec(line);
    if (!match) {
      // Blank lines between the declaration and its doc comment are expected.
      if (line.trim() === "" && collected.length === 0) continue;
      break;
    }
    const text = match[1]!.trim();
    if (text !== "") collected.unshift(text);
  }
  return collected.length > 0 ? collected.join(" ") : undefined;
}

/** A trailing `// comment` on the declaration line, used as the description. */
function trailingComment(raw: string, declarationEnd: number): string | undefined {
  const lineEnd = raw.indexOf("\n", declarationEnd);
  const rest = raw.slice(declarationEnd, lineEnd === -1 ? raw.length : lineEnd);
  const at = rest.indexOf("//");
  if (at === -1) return undefined;
  const text = rest.slice(at + 2).trim();
  return text === "" ? undefined : text;
}

/** Leading doc comment wins; a trailing one is the fallback. */
function protoDescription(raw: string, declarationIndex: number, declarationEnd: number): string | undefined {
  return leadingComment(raw, declarationIndex) ?? trailingComment(raw, declarationEnd);
}

export function parseProtoFile(content: string, file: string): FileExtraction {
  // `raw` keeps the comments; `source` blanks them without moving a single
  // offset, so a description can be read from `raw` at an index found in
  // `source`.
  const raw = content;
  const source = stripLineComments(content);
  const entities: ExtractedEntity[] = [];
  const actions: ExtractedAction[] = [];

  const pkg = /(^|\n)\s*package\s+([\w.]+)\s*;/.exec(source)?.[2];
  const service = pkg ? serviceFromProtoPackage(pkg) : undefined;
  const originBase: ExtractedOrigin = {
    kind: "proto",
    ...(pkg ? { namespace: pkg } : {}),
    ...(service ? { service } : {}),
  };

  // --- messages --------------------------------------------------------------
  const messageRe = /(^|\n)\s*message\s+([A-Za-z_][\w]*)\s*(?=\{)/g;
  for (let m; (m = messageRe.exec(source)); ) {
    const name = m[2]!;
    const open = source.indexOf("{", messageRe.lastIndex);
    if (open === -1) continue;
    const close = matchBrace(source, open);
    const body = bodyOf(source, open);
    const properties: ExtractedProperty[] = [];

    const ownFields = blankNestedBlocks(body, ["message", "enum"]);
    const fieldRe = /(^|\n)\s*(?:(repeated|optional|required)\s+)?([.\w]+)\s+([A-Za-z_][\w]*)\s*=\s*(\d+)\s*;/g;
    for (let f; (f = fieldRe.exec(ownFields)); ) {
      const label = f[2] ?? "";
      const bare = f[3]!.replace(/^\./, "").split(".").pop() ?? f[3]!;
      properties.push({
        name: f[4]!,
        type: label === "repeated" ? "array" : protoTypeToSchemaType(f[3]!),
        declaredType: bare,
        description: `字段 #${f[5]!}`,
      });
    }

    const description = protoDescription(
      raw,
      source.indexOf("message", m.index),
      close === -1 ? open : close + 1,
    );
    entities.push({
      typeName: name,
      displayName: name,
      ...(properties.length > 0 ? { properties } : {}),
      ...(description ? { description } : {}),
      sourceFile: file,
      origin: { ...originBase, stereotype: "message" },
    });
    messageRe.lastIndex = open;
  }

  // --- enums -----------------------------------------------------------------
  const enumRe = /(^|\n)\s*enum\s+([A-Za-z_][\w]*)\s*(?=\{)/g;
  for (let m; (m = enumRe.exec(source)); ) {
    const name = m[2]!;
    const open = source.indexOf("{", enumRe.lastIndex);
    if (open === -1) continue;
    const close = matchBrace(source, open);
    const constants = [
      ...bodyOf(source, open).matchAll(/(^|\n)\s*([A-Z][A-Z0-9_]*)\s*=\s*\d+\s*;/g),
    ].map((c) => c[2]!);
    const description = protoDescription(
      raw,
      source.indexOf("enum", m.index),
      close === -1 ? open : close + 1,
    );
    entities.push({
      typeName: name,
      displayName: name,
      ...(constants.length > 0
        ? { properties: [{ name: "values", type: "array", description: constants.join(" / ") }] }
        : {}),
      ...(description ? { description } : {}),
      sourceFile: file,
      origin: { ...originBase, stereotype: "enum" },
    });
    enumRe.lastIndex = open;
  }

  // --- services --------------------------------------------------------------
  const serviceRe = /(^|\n)\s*service\s+([A-Za-z_][\w]*)\s*(?=\{)/g;
  for (let m; (m = serviceRe.exec(source)); ) {
    const serviceName = m[2]!;
    const open = source.indexOf("{", serviceRe.lastIndex);
    if (open === -1) continue;
    const body = bodyOf(source, open);
    const rpcRe =
      /rpc\s+([A-Za-z_][\w]*)\s*\(\s*(?:stream\s+)?([.\w]+)\s*\)\s*returns\s*\(\s*(?:stream\s+)?([.\w]+)\s*\)/g;
    for (let r; (r = rpcRe.exec(body)); ) {
      const method = r[1]!;
      const response = r[3]!.replace(/^\./, "").split(".").pop() ?? r[3]!;
      // The canonical gRPC path — what a gateway actually routes on.
      const path = `/${pkg ? `${pkg}.` : ""}${serviceName}/${method}`;
      actions.push({
        name: `RPC ${path}`,
        httpMethod: "RPC",
        routePath: path,
        targetEntity: response,
        sourceFile: file,
      });
    }
    serviceRe.lastIndex = open;
  }

  return { entities, relations: [], actions };
}
