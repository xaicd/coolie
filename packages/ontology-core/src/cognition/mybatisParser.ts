/**
 * MyBatis mapper XML → ontology draft material.
 *
 * Java annotations are one way a project states which field is which column;
 * MyBatis mappers are the other, and for JEECGBoot, RuoYi and most hand-rolled
 * Spring stacks it is the more common one. They were being counted and skipped —
 * the import preview literally said "No parser yet: .xml×N".
 *
 * What a mapper actually contributes is the mapping, not a second object model:
 *
 *   <mapper namespace="com.ruoyi.system.mapper.SysUserMapper">
 *     <resultMap type="com.ruoyi.system.domain.SysUser" id="SysUserResult">
 *       <id     property="userId"   column="user_id"   />
 *       <result property="userName" column="user_name" />
 *     </resultMap>
 *     <select id="selectUserList" resultMap="SysUserResult"> … </select>
 *   </mapper>
 *
 * So a resultMap enriches the Java-derived type with `column` on each field,
 * which is what lines an ontology field up with the physical schema.
 *
 * Statements are deliberately *not* turned into actions. An action type in this
 * ontology is an HTTP-shaped contract (`apiContract.httpMethod` / `routePath`),
 * and a mapper statement is a data operation — emitting it would mean either
 * calling `selectUserList` a POST, which is false, or inventing a second action
 * shape to hold it. Neither is worth the noise of every query in a codebase
 * appearing as an operation on an entity.
 *
 * Statements are not wasted, though: they name the *tables*, and for a plain
 * RuoYi/MyBatis project — no DDL in the repository, no `@Table` on the class —
 * the mapper is the only artifact that states them at all. So the tables are
 * emitted as entities keyed by their name **exactly as written** (`sys_user`,
 * not `SysUser`), which is what `parseSqlDdl` keys a `CREATE TABLE` by, so a
 * table the DDL also declares merges into one type instead of two.
 *
 * Two things are still refused, both for the same reason:
 *
 *   - A table named only by SQL gets **no columns**. The mapper states the table
 *     and it states column names, but not which columns belong to which of the
 *     tables a statement joins — attributing a joined column to the first table
 *     would put a field on an entity that does not have it.
 *   - A class-to-table edge is emitted **only when the mapper leaves one
 *     candidate on each side** (one resultMap type, one table). With two of
 *     either, every pairing is a guess, and a wrong edge is worse than a missing
 *     one: it reads as a modelling decision somebody made.
 *
 * Known limitation: `origin` is first-source-wins in the fold, so if a mapper is
 * scanned before the DDL that defines the same table, the table's `origin` says
 * `mybatis`. Both files are still listed in `sourceFiles`, which is where to look
 * to see everything that stated it.
 *
 * Entities here are deliberately keyed by the *simple* class name, matching what
 * the Java parser produces, so the two merge into one type instead of a mapper
 * copy. A field's type is never invented: the mapper does not state one, and the
 * Java side does.
 *
 * Pure functions, no I/O.
 */

import type {
  ExtractedEntity,
  ExtractedOrigin,
  ExtractedProperty,
  ExtractedRelation,
  FileExtraction,
} from "./extractionTypes.js";

/** Attributes of one tag, e.g. `property="a" column="b"`. */
function attrsOf(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) out[m[1]!] = m[2]!;
  return out;
}

/**
 * Blank out XML comments in place, keeping every offset — a commented-out
 * `<select>` must not become an operation.
 */
function stripXmlComments(content: string): string {
  return content.replace(/<!--[\s\S]*?-->/g, (block) => block.replace(/[^\n]/g, " "));
}

/** The simple class name an `a.b.C` reference points at. */
function simpleName(reference: string | undefined): string | undefined {
  if (!reference) return undefined;
  const trimmed = reference.trim();
  if (trimmed === "") return undefined;
  return trimmed.split(".").pop();
}

/** Keywords that end a `from` list, or that are never a table name. */
const FROM_LIST_END =
  /\b(where|group\s+by|order\s+by|having|limit|union|on|using|join|left|right|inner|outer|full|cross|straight_join)\b/i;

/**
 * Words that can sit exactly where a table name sits but are not one. `dual` is
 * here because `select ... from dual` is the standard Oracle no-table query, and
 * recording it would put a row in the model for a table that does not exist.
 */
const NOT_A_TABLE = new Set([
  "select", "from", "where", "set", "values", "value", "for", "update", "delete",
  "insert", "into", "join", "on", "as", "and", "or", "not", "null", "dual",
  "exists", "case", "when", "then", "else", "end", "distinct", "all", "top",
]);

/** One identifier as written, unwrapped from backticks, quotes or brackets. */
function asTableName(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  // A trailing `)` or `;` is punctuation, not part of the name: `from (select …
  // from sys_user) t` reaches this as `sys_user)`, and the table it names is real.
  // A *leading* `(` is different — that is a subquery, and there is no name there.
  const bare = raw.trim().replace(/[);]+$/, "").replace(/^[`"\[]/, "").replace(/[`"\]]$/, "");
  if (!/^[A-Za-z_][\w$]*(\.[A-Za-z_][\w$]*)*$/.test(bare)) return undefined;
  const last = bare.split(".").pop()!.toLowerCase();
  if (NOT_A_TABLE.has(last)) return undefined;
  return bare;
}

/**
 * Tables a piece of SQL names.
 *
 * Only clause positions count — `from`, `join`, `into`, `update` — because
 * anywhere else an identifier is a column, an alias or a value. A `from` list is
 * split on commas so `from sys_user u, sys_dept d` yields both, and it stops at
 * the keyword that ends the clause so a later `join` is not read as another
 * entry. Placeholders are blanked first: `${tableName}` names a table this
 * parser cannot resolve, and reading the word inside the braces would record a
 * table that does not exist.
 */
export function tablesInSql(sql: string): string[] {
  const flat = sql
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/[#$]\{[^}]*\}/g, " ? ")
    .replace(/\s+/g, " ");
  const found = new Set<string>();
  const add = (raw: string | undefined) => {
    const name = asTableName(raw);
    if (name) found.add(name);
  };

  for (const m of flat.matchAll(/\bfrom\b/gi)) {
    const rest = flat.slice((m.index ?? 0) + m[0].length);
    const stop = FROM_LIST_END.exec(rest);
    const clause = stop ? rest.slice(0, stop.index) : rest;
    for (const part of clause.split(",")) add(part.trim().split(/\s/)[0]);
  }
  for (const m of flat.matchAll(/\bjoin\s+([^\s(,]+)/gi)) add(m[1]);
  for (const m of flat.matchAll(/\binto\s+([^\s(,]+)/gi)) add(m[1]);
  for (const m of flat.matchAll(/\bupdate\s+([^\s(,]+)/gi)) add(m[1]);

  return [...found];
}

/**
 * Parse one mapper.
 *
 * Returns nothing for XML that is not a mapper: most XML in a Java project is
 * configuration, and guessing at it would invent object types.
 */
export function parseMyBatisMapper(content: string, file: string): FileExtraction {
  const source = stripXmlComments(content);
  if (!/<mapper\b/.test(source)) return { entities: [], relations: [], actions: [] };

  const namespace = /<mapper\b[^>]*\bnamespace\s*=\s*"([^"]*)"/.exec(source)?.[1];
  const originBase: ExtractedOrigin = {
    kind: "mybatis",
    ...(namespace ? { namespace } : {}),
  };

  const entities: ExtractedEntity[] = [];
  const resultMapRe = /<resultMap\b([^>]*)>([\s\S]*?)<\/resultMap>/g;
  for (let m; (m = resultMapRe.exec(source)); ) {
    const typeName = simpleName(attrsOf(m[1]!).type);
    if (!typeName) continue;

    const properties: ExtractedProperty[] = [];
    // `<id>` and `<result>` both map a property to a column, and the attributes
    // may appear in either order, so read them by name.
    for (const child of (m[2] ?? "").matchAll(/<(?:id|result)\b([^>]*)\/?>/g)) {
      const attrs = attrsOf(child[1]!);
      if (!attrs.property || !attrs.column) continue;
      // No type: the mapper does not state one, and filling in "string" would
      // overwrite what the Java side already knows.
      properties.push({ name: attrs.property, column: attrs.column });
    }
    if (properties.length === 0) continue;

    const existing = entities.find((e) => e.typeName === typeName);
    if (existing) {
      const seen = new Set((existing.properties ?? []).map((p) => p.name));
      existing.properties = [...(existing.properties ?? []), ...properties.filter((p) => !seen.has(p.name))];
    } else {
      entities.push({
        typeName,
        displayName: typeName,
        properties,
        sourceFile: file,
        origin: { ...originBase, stereotype: "entity" },
      });
    }
  }

  // The tables come from the statement bodies *and* from `<sql>` fragments: a
  // statement that only holds `<include refid="…"/>` names no table itself, and
  // the fragment it pulls in does. Both are scanned for the same reason.
  const tables = new Set<string>();
  for (const m of source.matchAll(/<(select|insert|update|delete|sql)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
    for (const table of tablesInSql(m[2] ?? "")) tables.add(table);
  }

  const relations: ExtractedRelation[] = [];
  for (const table of tables) {
    // No properties: the mapper states the table's name, not its columns. DDL is
    // what knows a table's shape.
    entities.push({
      typeName: table,
      displayName: table,
      sourceFile: file,
      origin: { ...originBase, stereotype: "table", table },
    });
  }

  // One resultMap type and one table is the only pairing this file can state.
  // Two of either would make every combination equally plausible.
  if (entities.length === tables.size + 1 && tables.size === 1) {
    const onlyTable = [...tables][0]!;
    for (const e of entities) {
      if (e.typeName === onlyTable) continue;
      relations.push({
        sourceType: e.typeName,
        targetType: onlyTable,
        relationType: "maps_to",
        sourceFile: file,
      });
    }
  }

  return { entities, relations, actions: [] };
}
