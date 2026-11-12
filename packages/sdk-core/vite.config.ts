import { defineConfig } from "vite";

// Library build of the headless entry and the element entry (ADR 0040): ES
// modules, unminified so that consumers' bundlers can tree-shake and minify
// them, with source maps. Code they share goes into a shared chunk.
export default defineConfig({
  build: {
    lib: {
      entry: { index: "src/index.ts", element: "src/element.ts" },
      formats: ["es"],
    },
    target: "es2022",
    minify: false,
    sourcemap: true,
    rolldownOptions: {
      output: {
        // Code both entries use goes in shared/, so the size budgets count
        // it with each entry (.size-limit.js).
        chunkFileNames: "shared/[name]-[hash].js",
      },
    },
  },
});
