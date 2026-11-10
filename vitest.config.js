import { defineConfig } from "vitest/config";

// Tests of the repository's own tooling, such as its Changesets
// configuration. Each package has its own Vitest config for its tests.
export default defineConfig({
  test: {
    include: ["test/**/*.test.js"],
    // The same isolation as sdk-config's tests: these tests run git in
    // temporary repositories, possibly from inside a git hook.
    setupFiles: ["packages/sdk-config/test/isolate-git-env.js"],
  },
});
