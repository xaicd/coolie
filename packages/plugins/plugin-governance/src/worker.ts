import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";

const plugin = definePlugin({
  async setup(_ctx) {
    // Governance plugin worker setup
  },

  async onHealth() {
    return { status: "ok", message: "Governance plugin worker is running" };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
