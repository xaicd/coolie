/**
 * Architecture extraction — tech stack, build config and deployment facts.
 *
 * Reads the manifests and container files the scan already collected. Nothing
 * here is guessed from filenames alone where content is available: a tech stack
 * claim always names the file it came from.
 *
 * Deployment facts land under `build_config.deploy` rather than in a new column,
 * so this needs no migration.
 */
import type { SourceFile } from "./serviceDetector.js";
import { readPackageJson } from "./serviceDetector.js";

export interface StackInfo {
  language: string;
  /** The single most descriptive label we have (framework, or the runtime). */
  primary: string;
  frameworks: string[];
  buildTool: string | null;
  runtime: string | null;
  evidence: string[];
}

export interface DeployInfo {
  /** Environment tokens seen anywhere in the service (dev / staging / prod ...). */
  envs: string[];
  ports: number[];
  image: string | null;
  replicas: number | null;
  namespace: string | null;
  evidence: string[];
}

export interface DetectedStack {
  stack: StackInfo;
  /** Exactly the shape `ontology_sub_projects.build_config` expects, plus `deploy`. */
  buildConfig: Record<string, unknown>;
  deploy: DeployInfo;
}

/** package name → display label, for the frameworks worth naming. */
const FRAMEWORK_LABELS: Record<string, string> = {
  react: "React",
  vue: "Vue",
  next: "Next.js",
  nuxt: "Nuxt",
  svelte: "Svelte",
  "@angular/core": "Angular",
  "solid-js": "Solid",
  express: "Express",
  fastify: "Fastify",
  koa: "Koa",
  "@nestjs/core": "NestJS",
  hapi: "hapi",
  "@hapi/hapi": "hapi",
  restify: "Restify",
  typescript: "TypeScript",
  "@xyflow/react": "React Flow",
};

const EXTENSION_LANGUAGES: Array<[RegExp, string]> = [
  [/\.tsx?$/, "TypeScript"],
  [/\.jsx?$/, "JavaScript"],
  [/\.go$/, "Go"],
  [/\.py$/, "Python"],
  [/\.java$/, "Java"],
  [/\.kt$/, "Kotlin"],
  [/\.rs$/, "Rust"],
  [/\.rb$/, "Ruby"],
  [/\.php$/, "PHP"],
  [/\.dart$/, "Dart"],
  [/\.cs$/, "C#"],
];

const ENV_TOKEN = /\b(dev|development|test|testing|qa|staging|stage|uat|pre|prod|production)\b/;

function detectLanguage(files: SourceFile[]): { language: string; evidence: string[] } {
  const counts = new Map<string, number>();
  for (const file of files) {
    for (const [pattern, language] of EXTENSION_LANGUAGES) {
      if (pattern.test(file.path)) {
        counts.set(language, (counts.get(language) ?? 0) + 1);
        break;
      }
    }
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!best) return { language: "unknown", evidence: [] };
  return { language: best[0], evidence: [`${best[1]} 个 ${best[0]} 源文件`] };
}

/** Lockfiles sit at the repository root and are shared by every service. */
const TREE_WIDE_LOCKFILES: Array<[string, string]> = [
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["package-lock.json", "npm"],
];

/**
 * Build tool.
 *
 * Service-local manifests win: a `go.mod` inside a Go service says more about
 * that service than a JavaScript lockfile three directories up. The lockfiles
 * are only consulted to tell npm from pnpm from yarn — they live at the
 * repository root, so a workspace package has none of its own and would
 * otherwise be reported as plain `npm`.
 */
function detectBuildTool(allFiles: SourceFile[], names: Set<string>): string | null {
  if (names.has("go.mod")) return "go";
  if (names.has("pom.xml")) return "maven";
  if (names.has("build.gradle") || names.has("build.gradle.kts")) return "gradle";
  if (names.has("Cargo.toml")) return "cargo";
  if (names.has("pyproject.toml")) return "poetry";
  if (names.has("requirements.txt")) return "pip";
  if (names.has("pubspec.yaml")) return "pub";
  if (names.has("package.json")) {
    const treeNames = new Set(allFiles.map((f) => f.path.split("/").pop() ?? ""));
    for (const [name, tool] of TREE_WIDE_LOCKFILES) {
      if (treeNames.has(name)) return tool;
    }
    return "npm";
  }
  return null;
}

function parseDockerfile(content: string): { ports: number[]; baseImage: string | null; envs: string[] } {
  const ports: number[] = [];
  let baseImage: string | null = null;
  const envs: string[] = [];
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    const from = /^FROM\s+([^\s]+)/i.exec(line);
    if (from && !baseImage) baseImage = from[1] ?? null;
    const expose = /^EXPOSE\s+(.+)$/i.exec(line);
    if (expose) {
      for (const token of (expose[1] ?? "").split(/\s+/)) {
        const port = Number.parseInt(token.replace(/\/.*$/, ""), 10);
        if (Number.isFinite(port)) ports.push(port);
      }
    }
    const env = /^ENV\s+([A-Z0-9_]+)\s*[= ]\s*"?([^"\s]+)"?/i.exec(line);
    if (env && /ENV|PROFILE|STAGE/i.test(env[1] ?? "")) {
      const match = ENV_TOKEN.exec((env[2] ?? "").toLowerCase());
      if (match) envs.push(match[1]!);
    }
  }
  return { ports: [...new Set(ports)], baseImage, envs: [...new Set(envs)] };
}

export function detectStack(files: SourceFile[], root: string): DetectedStack {
  const owned = root === "" ? files : files.filter((f) => f.path.startsWith(`${root}/`) || f.path === root);
  const names = new Set(owned.map((f) => f.path.split("/").pop() ?? ""));
  const packageJson = readPackageJson(files, root);
  const evidence: string[] = [];

  const { language, evidence: languageEvidence } = detectLanguage(owned);
  evidence.push(...languageEvidence);

  const frameworks: string[] = [];
  for (const dep of Object.keys(packageJson?.dependencies ?? {})) {
    const label = FRAMEWORK_LABELS[dep];
    if (label && !frameworks.includes(label)) frameworks.push(label);
  }
  if (frameworks.length > 0) evidence.push(`package.json 依赖:${frameworks.join(", ")}`);

  const buildTool = detectBuildTool(files, names);
  if (buildTool) evidence.push(`构建工具 ${buildTool}`);

  const runtime = packageJson?.dependencies?.["@types/node"]
    ? "Node.js"
    : names.has("go.mod")
      ? "Go"
      : names.has("pyproject.toml") || names.has("requirements.txt")
        ? "Python"
        : null;

  // ── Deployment facts ──
  const deploy: DeployInfo = { envs: [], ports: [], image: null, replicas: null, namespace: null, evidence: [] };
  const dockerfile = owned.find((f) => /(^|\/)Dockerfile$/.test(f.path));
  if (dockerfile) {
    const parsed = parseDockerfile(dockerfile.content);
    deploy.ports.push(...parsed.ports);
    deploy.image = parsed.baseImage;
    deploy.envs.push(...parsed.envs);
    deploy.evidence.push(`Dockerfile:${dockerfile.path}`);
  }

  const compose = owned.find((f) => /docker-compose\.ya?ml$/.test(f.path));
  if (compose) {
    for (const match of compose.content.matchAll(/^\s{4}(\w[\w-]*):/gm)) {
      const match2 = ENV_TOKEN.exec((match[1] ?? "").toLowerCase());
      if (match2) deploy.envs.push(match2[1]!);
    }
    for (const match of compose.content.matchAll(/"(\d{2,5}):(\d{2,5})"/g)) {
      const port = Number.parseInt(match[1] ?? "", 10);
      if (Number.isFinite(port)) deploy.ports.push(port);
    }
    const replicas = /replicas:\s*(\d+)/.exec(compose.content);
    if (replicas) deploy.replicas = Number.parseInt(replicas[1]!, 10);
    deploy.evidence.push(`compose:${compose.path}`);
  }

  const k8s = owned.find((f) => /(^|\/)(k8s|kubernetes|helm)\//.test(f.path) || /(deployment|statefulset)\.ya?ml$/.test(f.path));
  if (k8s) {
    const ns = /namespace:\s*([\w-]+)/.exec(k8s.content);
    if (ns) {
      deploy.namespace = ns[1]!;
      const token = ENV_TOKEN.exec((ns[1] ?? "").toLowerCase());
      if (token) deploy.envs.push(token[1]!);
    }
    const replicas = /replicas:\s*(\d+)/.exec(k8s.content);
    if (replicas) deploy.replicas = Number.parseInt(replicas[1]!, 10);
    deploy.evidence.push(`k8s:${k8s.path}`);
  }

  deploy.envs = [...new Set(deploy.envs)];
  deploy.ports = [...new Set(deploy.ports)];

  const scripts = packageJson?.scripts ?? {};
  const buildConfig: Record<string, unknown> = {
    ...(scripts.test ? { testCommand: scripts.test } : {}),
    ...(scripts.build ? { buildCommand: scripts.build } : {}),
    ...(scripts.start || scripts.dev ? { startCommand: scripts.start ?? scripts.dev } : {}),
    ...(deploy.ports[0] ? { previewPort: deploy.ports[0] } : {}),
    ...(runtime ? { envType: runtime } : {}),
    ...(deploy.evidence.length > 0
      ? {
        deploy: {
          envs: deploy.envs,
          ports: deploy.ports,
          image: deploy.image,
          replicas: deploy.replicas,
          namespace: deploy.namespace,
        },
      }
      : {}),
  };

  return {
    stack: {
      language,
      primary: frameworks[0] ?? language,
      frameworks,
      buildTool,
      runtime,
      evidence,
    },
    buildConfig,
    deploy,
  };
}
