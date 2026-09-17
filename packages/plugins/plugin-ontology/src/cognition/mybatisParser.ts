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

  return { entities, relations: [], actions: [] };
}
