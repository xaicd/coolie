// Metro only resolves modules inside the project root plus its watch folders, and
// `@coolie/api-client` is a symlink to `../api-client` — outside this directory.
// Without the extra watch folder the bundle fails to resolve the package at all,
// which is the real reason this app needs a metro config (not a formality).
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

// Covers the sibling package (clients/api-client) while this app stays standalone.
config.watchFolders = [path.resolve(projectRoot, "..")];

// Files under the symlinked api-client resolve their own imports from *this*
// app's node_modules as a fallback. Without it, Babel's `@babel/runtime` helper
// cannot be found from ../api-client, which deliberately has no node_modules of
// its own (it is a source-only package).
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, "node_modules")];

module.exports = config;
