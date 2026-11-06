import { defineConfig } from "vite";

// Library build of the headless entry: one ES module, unminified so that
// consumers' bundlers can tree-shake and minify it, with a source map.
export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: "index",
    },
    target: "es2022",
    minify: false,
    sourcemap: true,
  },
});
