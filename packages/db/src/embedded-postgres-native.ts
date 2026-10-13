import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

function resolveNativePackageName(): string | null {
  if (process.platform === "linux") {
    switch (process.arch) {
      case "arm64":
        return "linux-arm64";
      case "arm":
        return "linux-arm";
      case "ia32":
        return "linux-ia32";
      case "ppc64":
        return "linux-ppc64";
      case "x64":
        return "linux-x64";
      default:
        return null;
    }
  }

  if (process.platform === "darwin") {
    switch (process.arch) {
      case "arm64":
        return "darwin-arm64";
      case "x64":
        return "darwin-x64";
      default:
        return null;
    }
  }

  return null;
}

async function pathExists(value: string): Promise<boolean> {
  try {
    await fs.stat(value);
    return true;
  } catch {
    return false;
  }
}

function resolveEmbeddedPostgresPackageRoot(): string | null {
  try {
    const entry = require.resolve("embedded-postgres");
    return path.dirname(path.dirname(entry));
  } catch {
    return null;
  }
}

function prependPathEnv(name: string, value: string): void {
  const current = process.env[name] ?? "";
  const parts = current.split(path.delimiter).filter(Boolean);
  if (parts.includes(value)) return;
  process.env[name] = [value, ...parts].join(path.delimiter);
}

export async function ensureSharedLibraryAliases(libDir: string): Promise<string[]> {
  const entries = await fs.readdir(libDir, { withFileTypes: true });
  const created: string[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;

    const linuxMatch = entry.name.match(/^(lib.+\.so\.\d+)\.\d+(?:\.\d+)?$/);
    if (linuxMatch) {
      const aliasName = linuxMatch[1];
      const aliasPath = path.join(libDir, aliasName);
      try {
        await fs.symlink(entry.name, aliasPath);
        created.push(aliasPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
      continue;
    }

    const darwinMatch = entry.name.match(/^(lib.+?)\.(\d+)\.(\d+)(?:\.(\d+))?\.dylib$/);
    if (darwinMatch) {
      const base = darwinMatch[1];
      const major = darwinMatch[2];
      const aliases = [`${base}.${major}.dylib`, `${base}.dylib`];
      for (const alias of aliases) {
        const aliasPath = path.join(libDir, alias);
        try {
          await fs.symlink(entry.name, aliasPath);
          created.push(aliasPath);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        }
      }
    }
  }

  return created;
}

export async function ensurePostgresqlExtensionAliases(libDir: string): Promise<string[]> {
  const entries = await fs.readdir(libDir, { withFileTypes: true });
  const created: string[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name.endsWith(".dylib")) {
      const soName = entry.name.replace(/\.dylib$/, ".so");
      const soPath = path.join(libDir, soName);
      try {
        await fs.symlink(entry.name, soPath);
        created.push(soPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
    }
  }

  return created;
}

export const ensureLinuxSharedLibraryAliases = ensureSharedLibraryAliases;

export async function prepareEmbeddedPostgresNativeRuntime(): Promise<void> {
  const nativePackageName = resolveNativePackageName();
  const packageRoot = resolveEmbeddedPostgresPackageRoot();
  if (!nativePackageName || !packageRoot) return;

  const nativeRoot = path.resolve(packageRoot, "..", "@embedded-postgres", nativePackageName);
  const libDir = path.join(nativeRoot, "native", "lib");
  if (!(await pathExists(libDir))) return;

  if (process.platform === "linux") {
    prependPathEnv("LD_LIBRARY_PATH", libDir);
  } else if (process.platform === "darwin") {
    prependPathEnv("DYLD_LIBRARY_PATH", libDir);
  }
  await ensureSharedLibraryAliases(libDir);

  const postgresqlLibDir = path.join(libDir, "postgresql");
  if (await pathExists(postgresqlLibDir)) {
    await ensurePostgresqlExtensionAliases(postgresqlLibDir);
  }
}

