import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Builds to ../care-hub (repo root, published at /care-hub/ alongside the
// static marketing site -- see netlify.toml's build.command and the new
// /care-hub/* SPA redirect). This project's own source directory
// (care-hub-app/) is excluded from the Netlify publish upload via
// .netlifyignore, so only the compiled output here ever gets served.
export default defineConfig({
  plugins: [react()],
  base: "/care-hub/",
  build: {
    outDir: "../care-hub",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      // Local dev: `npm run dev` inside care-hub-app talks to a `netlify
      // dev` instance (default port 8888) for every Netlify Function
      // call, so the same relative /.netlify/functions/* paths the API
      // client uses in production work unchanged in development.
      "/.netlify/functions": "http://localhost:8888",
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/vitest.setup.ts"],
    include: ["src/**/*.vitest.{ts,tsx}"],
    clearMocks: true,
  },
});
