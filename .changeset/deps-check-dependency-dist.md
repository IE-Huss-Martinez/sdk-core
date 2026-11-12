---
"@hussmartinez/sdk-config": patch
---

The dependency-cruiser preset now checks imports that resolve into a dependency's `dist/`. It used to leave out every path with a `dist/` segment, including `node_modules/<package>/dist/`, where most packages keep their code, such as `@hussmartinez/ui`, so rules such as `core-no-ui`, `entry-no-react` and `not-to-dev-dep` couldn't see imports of them. Only the repository's own `dist/`, `temp/` and `coverage/`, and fixtures under `src/`, `test/` or `tests/`, are left out now. Packages installed flat, as `node_modules/<name>`, are matched as well as pnpm's store paths, and `layer-errors` lets tests in `core/errors` import test tools. `hm-lint-deps` may now report violations it missed before: fix them, as the rule's message says.
