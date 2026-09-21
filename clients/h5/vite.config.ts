import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // 5173: the h5 dev server's fixed port. Kept apart from the Expo dev server
    // (19000/19001) and the API (3100) so all three can run side by side.
    port: 5173,
    // Proxy /api to your Coolie instance during dev to avoid CORS.
    proxy: {
      "/api": {
        target: process.env.COOLIE_BASE_URL ?? "http://100.84.124.71:3100",
        changeOrigin: true,
      },
    },
  },
});
