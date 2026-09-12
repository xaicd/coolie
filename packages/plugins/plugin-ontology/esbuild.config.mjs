import esbuild from "esbuild";
import { createPluginBundlerPresets } from "@paperclipai/plugin-sdk/bundlers";

const presets = createPluginBundlerPresets({ uiEntry: "src/ui/index.tsx" });
const watch = process.argv.includes("--watch");

// The ontology UI bundles @xyflow/react (ReactFlow), which ships a CSS file.
// Load .css as a JS text string so the component can inject it at runtime via a
// <style> tag — the plugin loader only serves ui/index.js, not a separate CSS.
const uiConfig = {
  ...presets.esbuild.ui,
  loader: { ...(presets.esbuild.ui.loader ?? {}), ".css": "text" },
};

const workerCtx = await esbuild.context(presets.esbuild.worker);
const manifestCtx = await esbuild.context(presets.esbuild.manifest);
const uiCtx = await esbuild.context(uiConfig);

if (watch) {
  await Promise.all([workerCtx.watch(), manifestCtx.watch(), uiCtx.watch()]);
  console.log("esbuild watch mode enabled for worker, manifest, and ui");
} else {
  await Promise.all([workerCtx.rebuild(), manifestCtx.rebuild(), uiCtx.rebuild()]);
  await Promise.all([workerCtx.dispose(), manifestCtx.dispose(), uiCtx.dispose()]);
}
