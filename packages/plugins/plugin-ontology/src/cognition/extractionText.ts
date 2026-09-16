/**
 * Small text helpers shared by the source parsers.
 *
 * `firstQuoted` used to live privately in `AstExtractor`; the Java and proto
 * parsers need exactly the same quoting rules (single, double and backtick
 * quotes, doubled-quote escaping), and two copies of that logic would drift.
 */

/**
 * Pull a quoted string out of a fragment, tolerating both quote styles.
 * Returns undefined for empty/absent values.
 */
export function firstQuoted(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const m = /'((?:[^']|'')*)'|"((?:[^"]|"")*)"|`([^`]*)`/.exec(text);
  if (!m) return undefined;
  const raw = m[1] ?? m[2] ?? m[3] ?? "";
  const unescaped = raw.replace(/''/g, "'").replace(/""/g, '"').trim();
  return unescaped === "" ? undefined : unescaped;
}

/** Join a class-level route prefix with a method path, collapsing slashes. */
export function joinPaths(prefix: string | undefined, path: string): string {
  const left = (prefix ?? "").trim().replace(/\/+$/, "");
  const right = path.trim().replace(/^\/+/, "");
  if (left === "") return right === "" ? "/" : `/${right}`;
  if (right === "") return left;
  return `${left}/${right}`;
}

/** Top-level domains, i.e. the markers of a reversed-domain org prefix. */
const TLDS = new Set([
  "com", "org", "io", "net", "edu", "gov", "co", "cn", "dev", "cloud", "ai",
  "me", "tech", "info", "biz", "app", "sh", "xyz",
]);

/**
 * Strip the organisation prefix from a dotted namespace, whatever convention it
 * follows. `com.acme.order` and `org.jeecg.modules.system` lose two segments
 * (TLD + org), while `ecommerce.order.v1` — a proto package that is *not* a
 * reversed domain — loses only one. Assuming Java's two-segment rule for both
 * silently turned every proto package into no service at all.
 */
export function dropOrgPrefix(segments: string[]): string[] {
  const first = (segments[0] ?? "").toLowerCase();
  return TLDS.has(first) ? segments.slice(2) : segments.slice(1);
}
