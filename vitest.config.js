import { defineConfig } from "vitest/config";

// Tests of the repository's own tooling, such as its Changesets
// configuration. Each package has its own Vitest config for its tests.
export default defineConfig({
  test: {
    include: ["test/**/*.test.js"],
    // The same isolation as sdk-config's tests: these tests run git in
    // temporary repositories, possibly from inside a git hook.
    setupFiles: ["packages/sdk-config/test/isolate-git-env.js"],
    // These are integration tests: each runs scripts, git, pnpm and fake
    // CLIs as separate processes. Under load, such as the pre-push hook
    // running every package's tests at once, they can take several seconds,
    // past Vitest's default of 5. The limit only catches hangs; tests that
    // depend on timing check their own timestamps.
    testTimeout: 30_000,
  },
});
