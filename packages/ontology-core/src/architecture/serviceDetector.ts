/**
 * Architecture extraction — service boundaries.
 *
 * Service edges are only visible in the *directory structure*: which folder
 * carries a manifest, and which folder follows the `services/<name>` /
 * `apps/<name>` convention. Nothing else in the pipeline reads paths this way,
 * which is why a legacy import used to produce object types and routes but no
 * notion of "this repository contains three deployable things".
 *
 * Pure and browser-safe (takes `{path, content}`, never touches the file
 * system) so the import wizard can preview the result client-side and the
 * worker can run the identical code.
 *
 * Every verdict carries `evidence` — these are regex heuristics, so a wrong
 * answer has to be visible rather than silently authoritative.
 */
import type { SubProjectType } from "../enums.js";

export interface SourceFile {
  path: string;
  content: string;
}

/**
 * The database a service connects to, out of its Spring `datasource.url`.
 *
 * Worth reading for one reason: a legacy "distributed" system very often turns
 * out to be several services on **one** database, and nothing in the code says
 * so. Two services that touch different tables of the same schema are invisible
 * to a table-name match; the connection string is where it is stated.
 */
export interface SpringDatasource {
  database: string;
  host?: string;
  port?: number;
  /** `mysql`, `postgresql`, `oracle`… out of the JDBC url. */
  vendor?: string;
  /** `<file>:<key>` — the edge an architecture finding points back at. */
  evidence: string;
}

export interface DetectedService {
  /** Stable slug used as the sub-project code. */
  key: string;
  name: string;
  /** Directory prefix (no trailing slash); "" means the repository root. */
  path: string;
  type: SubProjectType;
  evidence: string[];
  /** Absent when the service declares no datasource this parser can resolve. */
  datasource?: SpringDatasource;
}

/** Files whose presence marks a directory as a buildable unit. */
export const MANIFEST_FILES = [
  "package.json",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "pyproject.toml",
  "requirements.txt",
  "Cargo.toml",
  "pubspec.yaml",
  "composer.json",
  "Gemfile",
] as const;

/** Directory conventions that imply a service boundary without a manifest. */
export const SERVICE_ROOT_SEGMENTS = ["services", "apps", "packages", "modules"] as const;

const FRONTEND_PACKAGES = ["react", "vue", "next", "svelte", "@angular/core", "nuxt", "solid-js"];
const SERVER_PACKAGES = [
  "express",
  "fastify",
  "koa",
  "@nestjs/core",
  "hapi",
  "@hapi/hapi",
  "restify",
  "polka",
];

function basename(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

function dirname(path: string): string {
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "service";
}

/** Parse a `package.json` in the given directory, if there is one. */
export function readPackageJson(
  files: SourceFile[],
  root: string,
): { name?: string; dependencies?: Record<string, string>; scripts?: Record<string, string>; main?: string; exports?: unknown } | null {
  const target = root === "" ? "package.json" : `${root}/package.json`;
  const file = files.find((f) => f.path === target);
  if (!file) return null;
  try {
    const parsed = JSON.parse(file.content) as Record<string, unknown>;
    return {
      name: typeof parsed.name === "string" ? parsed.name : undefined,
      dependencies: {
        ...(typeof parsed.dependencies === "object" && parsed.dependencies !== null
          ? (parsed.dependencies as Record<string, string>)
          : {}),
        ...(typeof parsed.devDependencies === "object" && parsed.devDependencies !== null
          ? (parsed.devDependencies as Record<string, string>)
          : {}),
      },
      scripts: typeof parsed.scripts === "object" && parsed.scripts !== null
        ? (parsed.scripts as Record<string, string>)
        : undefined,
      main: typeof parsed.main === "string" ? parsed.main : undefined,
      exports: parsed.exports,
    };
  } catch {
    return null;
  }
}

/**
 * Workspace declarations, which are a stronger statement of service boundaries
 * than "this directory has a manifest".
 *
 * Without this a monorepo collapses: the root `package.json` is a manifest, so
 * it became the single service and every workspace package nested inside it was
 * dropped as "already owned by an outer root".
 */
interface WorkspaceDeclaration {
  declaringDir: string;
  globs: string[];
}

function readWorkspaceDeclarations(files: SourceFile[]): WorkspaceDeclaration[] {
  const declarations: WorkspaceDeclaration[] = [];

  for (const file of files) {
    const base = basename(file.path);
    const dir = dirname(file.path);

    if (base === "package.json") {
      try {
        const parsed = JSON.parse(file.content) as { workspaces?: unknown };
        const raw = Array.isArray(parsed.workspaces)
          ? parsed.workspaces
          : (parsed.workspaces as { packages?: unknown } | undefined)?.packages;
        if (Array.isArray(raw)) {
          const globs = raw.filter((entry): entry is string => typeof entry === "string");
          if (globs.length > 0) declarations.push({ declaringDir: dir, globs });
        }
      } catch {
        // A malformed manifest is not a workspace declaration.
      }
      continue;
    }

    if (base === "pnpm-workspace.yaml" || base === "pnpm-workspace.yml") {
      const globs: string[] = [];
      let inPackages = false;
      for (const rawLine of file.content.split("\n")) {
        const line = rawLine.replace(/#.*$/, "").trimEnd();
        if (/^packages:\s*$/.test(line)) {
          inPackages = true;
          continue;
        }
        if (!inPackages) continue;
        const entry = /^\s*-\s*['"]?([^'"]+?)['"]?\s*$/.exec(line);
        if (entry?.[1]) globs.push(entry[1]);
        else if (/^\S/.test(line)) inPackages = false; // next top-level key
      }
      if (globs.length > 0) declarations.push({ declaringDir: dir, globs });
    }
  }

  return declarations;
}

/** Directories a glob matches that directly contain a manifest. */
function expandWorkspaceGlob(glob: string, declaringDir: string, files: SourceFile[]): string[] {
  const pattern = declaringDir === "" ? glob : `${declaringDir}/${glob}`;
  const hasManifest = (dir: string) =>
    files.some((f) => (MANIFEST_FILES as readonly string[]).includes(basename(f.path)) && dirname(f.path) === dir);

  if (pattern.endsWith("/**") || pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, pattern.endsWith("/**") ? -3 : -2);
    const children = new Set<string>();
    for (const file of files) {
      if (!file.path.startsWith(`${prefix}/`)) continue;
      const child = file.path.slice(prefix.length + 1).split("/")[0];
      if (child) children.add(`${prefix}/${child}`);
    }
    // `packages/*` also matches `packages/plugins`, which is a grouping folder
    // rather than a package. Requiring a manifest keeps the real ones.
    return [...children].filter(hasManifest);
  }

  return hasManifest(pattern) ? [pattern] : [];
}

/** Candidate service roots, most specific first. */
function findRoots(files: SourceFile[]): string[] {
  const declarations = readWorkspaceDeclarations(files);
  const roots = new Set<string>();
  const excluded: string[] = [];
  const declaringDirs = new Set<string>();

  for (const declaration of declarations) {
    declaringDirs.add(declaration.declaringDir);
    for (const glob of declaration.globs) {
      if (glob.startsWith("!")) {
        excluded.push(...expandWorkspaceGlob(glob.slice(1), declaration.declaringDir, files));
        continue;
      }
      for (const root of expandWorkspaceGlob(glob, declaration.declaringDir, files)) roots.add(root);
    }
  }

  // A directory that declared workspaces is not itself a service — that is the
  // whole point of the declaration.
  for (const file of files) {
    if (!(MANIFEST_FILES as readonly string[]).includes(basename(file.path))) continue;
    const dir = dirname(file.path);
    if (declaringDirs.has(dir) && roots.size > 0) continue;
    roots.add(dir);
  }

  for (const dir of excluded) {
    roots.delete(dir);
    for (const root of [...roots]) {
      if (root.startsWith(`${dir}/`)) roots.delete(root);
    }
  }

  if (roots.size > 0) return [...roots];

  // No manifest and no declaration — fall back to the directory convention.
  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    for (const segment of SERVICE_ROOT_SEGMENTS) {
      const index = parts.indexOf(segment);
      // A name must follow the segment, and something must follow that.
      if (index >= 0 && index + 2 < parts.length) {
        roots.add(parts.slice(0, index + 2).join("/"));
        break;
      }
    }
  }
  return [...roots];
}

function filesUnder(files: SourceFile[], root: string): SourceFile[] {
  return root === ""
    ? files
    : files.filter((f) => f.path === root || f.path.startsWith(`${root}/`));
}

function inferType(
  root: string,
  owned: SourceFile[],
  packageJson: ReturnType<typeof readPackageJson>,
  multiService: boolean,
): { type: SubProjectType; evidence: string[] } {
  const evidence: string[] = [];
  const names = new Set(owned.map((f) => basename(f.path)));
  const deps = packageJson?.dependencies ?? {};
  const hasDep = (candidates: string[]) => candidates.find((dep) => dep in deps);

  if (names.has("pubspec.yaml")) {
    return { type: "mobile-flutter", evidence: ["发现 pubspec.yaml"] };
  }
  if (names.has("AndroidManifest.xml") && (names.has("build.gradle") || names.has("build.gradle.kts"))) {
    return { type: "mobile-android", evidence: ["发现 AndroidManifest.xml + gradle 构建脚本"] };
  }
  if (names.has("Info.plist")) {
    return { type: "mobile-ios", evidence: ["发现 Info.plist"] };
  }
  if (hasDep(["react-native"])) {
    return { type: "mobile-rn", evidence: ["package.json 依赖 react-native"] };
  }

  const frontend = hasDep(FRONTEND_PACKAGES);
  if (frontend) {
    return { type: "frontend", evidence: [`package.json 依赖 ${frontend}`] };
  }

  const server = hasDep(SERVER_PACKAGES);
  if (server) {
    evidence.push(`package.json 依赖 ${server}`);
    if (names.has("Dockerfile")) evidence.push("发现 Dockerfile");
    return { type: multiService ? "microservice" : "backend", evidence };
  }

  // go / python / jvm server markers (no package.json deps to read).
  const hasGo = names.has("go.mod");
  const hasPython = names.has("pyproject.toml") || names.has("requirements.txt");
  const hasJvm = names.has("pom.xml") || names.has("build.gradle") || names.has("build.gradle.kts");
  const hasServerRoute = owned.some((f) =>
    /\b(gin|echo|fiber|chi)\b|@app\.(get|post|put|patch|delete)|@(RestController|RequestMapping)|@Get\(/.test(f.content),
  );
  if ((hasGo || hasPython || hasJvm) && hasServerRoute) {
    evidence.push("发现服务端路由声明");
    if (names.has("Dockerfile")) evidence.push("发现 Dockerfile");
    return { type: multiService ? "microservice" : "backend", evidence };
  }

  const entryless = packageJson && !packageJson.scripts?.start && (packageJson.main || packageJson.exports);
  if (entryless) {
    return { type: "library", evidence: ["package.json 有 main/exports 但没有 start 脚本"] };
  }

  if (owned.length > 0 && owned.every((f) => /\.(md|mdx|txt)$/i.test(f.path))) {
    return { type: "docs", evidence: ["目录内只有文档"] };
  }

  const onlyInfra = owned.length > 0
    && owned.every((f) =>
      /(^|\/)(Dockerfile|docker-compose\.ya?ml)$/.test(f.path)
      || /\.tfvars?$/.test(f.path)
      || /(^|\/)(\.github|\.gitlab-ci\.yml|k8s|helm)\//.test(f.path),
    );
  if (onlyInfra) return { type: "devops", evidence: ["目录内只有容器/编排配置"] };

  evidence.push("无明确特征,按后端兜底");
  return { type: "backend", evidence };
}

const SPRING_CONFIG_RE = /(^|\/)(application|bootstrap)(-[\w.]+)?\.(ya?ml|properties)$/i;

/**
 * `spring.application.name` — the authoritative service name for a Spring Cloud
 * system, and the only place a Spring Boot app states it. The name used to come
 * from `package.json` or the directory, which for a Java module meant the
 * folder happened to be named right (`ruoyi-system`), not that anything had
 * declared the service.
 */
/** A value the way Spring writes it: quoted, with a trailing comment allowed. */
function stripConfigValue(value: string): string | undefined {
  const cleaned = value.trim().replace(/^["']|["']$/g, "").replace(/\s+#.*$/, "").trim();
  return cleaned === "" ? undefined : cleaned;
}

function springConfigs(files: SourceFile[], root: string): SourceFile[] {
  return filesUnder(files, root)
    .filter((file) => SPRING_CONFIG_RE.test(file.path))
    // `src/main/resources` is the real config; test/profile files are secondary.
    .sort((a, b) => {
      const rank = (path: string) => (path.includes("/src/main/resources/") ? 0 : 1);
      return rank(a.path) - rank(b.path) || a.path.length - b.path.length;
    });
}

/**
 * Read `a.b.c` out of a Spring config file, whichever way it is written.
 *
 * YAML's nesting is indentation, so it is walked rather than regexed; the
 * flattened `a.b.c: value` form is one key and is read directly. Properties files
 * say it on one line either way. Both `parseSpringAppName` and the datasource
 * reader go through here, so the two cannot disagree about what the file says.
 */
function springConfigValue(content: string, path: string, keys: string[]): string | undefined {
  const flat = keys.join(".");
  if (/\.properties$/i.test(path)) {
    const match = new RegExp(`^\\s*${flat.replace(/\./g, "\\.")}\\s*[:=]\\s*(.+)$`, "m").exec(content);
    return match ? stripConfigValue(match[1]!) : undefined;
  }

  // One entry per level already descended; its value is that level's indentation.
  const open: number[] = [];
  for (const line of content.split("\n")) {
    if (line.trim() === "" || /^\s*#/.test(line)) continue;
    const match = /^(\s*)([\w.\-]+)\s*:\s*(.*)$/.exec(line);
    if (!match) continue;
    const indent = match[1]!.length;
    const key = match[2]!;
    const value = match[3]!;

    if (key === flat) return stripConfigValue(value);

    // A sibling or shallower key closes every level it is not nested under.
    while (open.length > 0 && indent <= open[open.length - 1]!) open.pop();
    if (key !== keys[open.length]) continue;
    if (open.length === keys.length - 1) return stripConfigValue(value);
    open.push(indent);
  }
  return undefined;
}

export function parseSpringAppName(content: string, path: string): string | undefined {
  return springConfigValue(content, path, ["spring", "application", "name"]);
}

/**
 * The database out of a JDBC url, or undefined — including when the url is a
 * placeholder (`${MYSQL_URL}`) or a shape this reader does not know. A database
 * name guessed out of the wrong part of the string is worse than none: it would
 * pair two services that share nothing.
 */
function parseJdbcUrl(url: string): Omit<SpringDatasource, "evidence"> | undefined {
  // jdbc:mysql://db:3306/ruoyi?useUnicode=true
  const uri = /^jdbc:([a-z0-9]+):\/\/([^/?;]*)(?:\/([^?;]+))?/i.exec(url);
  if (uri) {
    const [host, port] = (uri[2] ?? "").split(":");
    // jdbc:sqlserver://db:1433;databaseName=ruoyi
    const named = /(?:^|;)databaseName=([^;]+)/i.exec(url);
    const database = (named?.[1] ?? uri[3])?.trim();
    if (!database) return undefined;
    return {
      vendor: uri[1]!.toLowerCase(),
      ...(host ? { host } : {}),
      ...(port && /^\d+$/.test(port) ? { port: Number(port) } : {}),
      database,
    };
  }
  // jdbc:oracle:thin:@db:1521:ORCL
  const sid = /^jdbc:(oracle):[a-z]+:@([^:]+)(?::(\d+))?:(\w+)/i.exec(url);
  if (sid) {
    return {
      vendor: sid[1]!.toLowerCase(),
      host: sid[2]!,
      ...(sid[3] ? { port: Number(sid[3]) } : {}),
      database: sid[4]!,
    };
  }
  return undefined;
}

/** The datasource a Spring config states, if it states one this parser can read. */
export function parseSpringDatasource(content: string, path: string): SpringDatasource | undefined {
  for (const keys of [
    ["spring", "datasource", "url"],
    ["spring", "datasource", "druid", "url"],
    ["spring", "datasource", "master", "url"],
    ["spring", "datasource", "slave", "url"],
  ]) {
    const url = springConfigValue(content, path, keys);
    if (!url) continue;
    const parsed = parseJdbcUrl(url);
    if (parsed) return { ...parsed, evidence: `${path}:${keys.join(".")}` };
  }
  return undefined;
}

/** The datasource for a service root, from the same configs the name comes from. */
export function readSpringDatasource(files: SourceFile[], root: string): SpringDatasource | undefined {
  for (const config of springConfigs(files, root)) {
    const datasource = parseSpringDatasource(config.content, config.path);
    if (datasource) return datasource;
  }
  return undefined;
}

/** The Spring-declared app name for a service root, when it declares one. */
export function readSpringAppName(files: SourceFile[], root: string): string | undefined {
  for (const config of springConfigs(files, root)) {
    const name = parseSpringAppName(config.content, config.path);
    if (name) return name;
  }
  return undefined;
}

/**
 * Identify the services in a set of scanned files.
 *
 * Returns an empty list for an empty scan — a workspace with nothing
 * recognisable must produce nothing, not one fabricated service.
 */
export function detectServices(files: SourceFile[]): DetectedService[] {
  const roots = findRoots(files).sort((a, b) => a.length - b.length);
  if (roots.length === 0) return [];

  // Drop roots nested inside another root: the outer one owns them.
  const topLevel: string[] = [];
  for (const root of roots) {
    if (topLevel.some((existing) => root === existing || root.startsWith(`${existing}/`))) continue;
    topLevel.push(root);
  }

  const multiService = topLevel.length > 1;
  const services: DetectedService[] = [];

  for (const root of topLevel) {
    const owned = filesUnder(files, root);
    if (owned.length === 0) continue;
    const packageJson = readPackageJson(files, root);
    const { type, evidence } = inferType(root, owned, packageJson, multiService);
    const gitRepoName = root.split("/").filter(Boolean).pop() ?? "repository";
    // A JS package names itself in package.json; a Spring app names itself in
    // application.yml. Falling back to the directory is a last resort.
    const springName = packageJson ? undefined : readSpringAppName(files, root);
    if (springName) evidence.push(`spring.application.name = ${springName}`);
    // Read even when `package.json` named the service: a JS service can point at
    // the same database as a Java one, and that is the coupling the edge is for.
    const datasource = readSpringDatasource(owned, root);
    if (datasource) evidence.push(`datasource.url → ${datasource.database}`);
    services.push({
      key: slug(packageJson?.name ?? springName ?? gitRepoName),
      name: packageJson?.name ?? springName ?? gitRepoName,
      path: root,
      type,
      evidence,
      ...(datasource ? { datasource } : {}),
    });
  }

  return services;
}
