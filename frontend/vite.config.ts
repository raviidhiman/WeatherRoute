/// <reference types="vitest" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // 127.0.0.1 (not "localhost"): on Windows, localhost can resolve to IPv6 ::1 where Django is not listening.
  server: { proxy: { "/api": "http://127.0.0.1:8000" } },
  build: {
    sourcemap: false,
    rollupOptions: { output: { manualChunks: { leaflet: ["leaflet"], mui: ["@mui/material", "@mui/icons-material"] } } },
  },
  test: { environment: "jsdom", setupFiles: ["./src/setupTests.ts"], globals: true },
});
