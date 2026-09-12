import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5273,
    // Proxy /api to your Coolie instance during dev to avoid CORS.
    proxy: {
      "/api": {
        target: process.env.COOLIE_BASE_URL ?? "http://100.84.124.71:3100",
        changeOrigin: true,
      },
    },
  },
});
