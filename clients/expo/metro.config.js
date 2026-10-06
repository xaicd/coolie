// Metro only resolves modules inside the project root plus its watch folders, and
// `@coolie/api-client` is a symlink to `../api-client` — outside this directory.
// Without the extra watch folder the bundle fails to resolve the package at all,
// which is the real reason this app needs a metro config (not a formality).
const path = require("path");
const fs = require("fs");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

// Covers the sibling package (clients/api-client) while this app stays standalone.
// wave188 — also add the workspace root so files under
// <repo_root>/node_modules (e.g. @ide/backoff, transitively
// pulled by expo-notifications) can be hashed & served by metro.
config.watchFolders = [
  path.resolve(projectRoot, ".."),
  path.resolve(projectRoot, "../.."),
];

// Files under the symlinked api-client resolve their own imports from *this*
// app's node_modules as a fallback. Without it, Babel's `@babel/runtime` helper
// cannot be found from ../api-client, which deliberately has no node_modules of
// its own (it is a source-only package).

// wave188 — expo-notifications transitively imports `@ide/backoff`, which pnpm
// hoists to the workspace root (../../node_modules) instead of
// clients/expo/node_modules. The default resolver walks up looking for
// node_modules but somehow misses this one in our workspace layout, so we
// short-circuit it in `resolveRequest`. Other packages continue using the
// default behaviour.
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "@ide/backoff") {
    const direct = path.resolve(
      projectRoot,
      "../..",
      "node_modules",
      "@ide",
      "backoff",
    );
    if (fs.existsSync(direct)) {
      return {
        type: "sourceFile",
        filePath: path.join(direct, "build/backoff.js"),
      };
    }
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
