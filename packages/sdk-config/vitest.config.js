import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["test/isolate-git-env.js"],
  },
});
