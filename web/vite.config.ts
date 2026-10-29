import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: { target: "safari16", outDir: "dist", assetsInlineLimit: 0 },
  server: { host: true },
});
