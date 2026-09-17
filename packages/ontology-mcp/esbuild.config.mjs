import esbuild from "esbuild";

// A CLI: bundle our own code plus the core, keep node_modules external. `pg`
// has native bindings and must stay a real require; the core is TypeScript
// source in this workspace, so it has to be compiled in.
await esbuild.build({
  entryPoints: ["src/stdio.ts"],
  outfile: "dist/stdio.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  // `packages: "external"` would also externalise the workspace core, and Node
  // would then load its TypeScript source directly — type-stripping rejects
  // constructs the core legitimately uses. Only real dependencies stay external;
  // our code and the core are compiled in.
  external: ["pg", "zod", "@modelcontextprotocol/sdk", "@modelcontextprotocol/sdk/*"],
  sourcemap: true,
  banner: {
    // esbuild's ESM output still needs a `require` for interop with CJS deps.
    js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
  },
});
console.log("built dist/stdio.js");
