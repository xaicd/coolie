// The esbuild UI build loads .css imports as text (see esbuild.config.mjs), so
// the ReactFlow stylesheet arrives as a string we inject at runtime.
declare module "*.css" {
  const content: string;
  export default content;
}
