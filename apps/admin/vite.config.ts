import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("hls.js")) return "media-player";
        },
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    // Keep the browser's Host (localhost:5173) when proxying. The string
    // shorthand rewrites it to 127.0.0.1:8000, so the API's origin check sees
    // Origin localhost:5173 vs Host 127.0.0.1:8000 and answers 403 on POSTs.
    proxy: {
      "/api": { target: "http://127.0.0.1:8000", changeOrigin: false },
      "/uploads": { target: "http://127.0.0.1:8000", changeOrigin: false },
      "/socket.io": {
        target: "http://127.0.0.1:8000",
        ws: true,
        changeOrigin: false,
      },
    },
  },
});
