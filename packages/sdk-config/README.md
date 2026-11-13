# @hussmartinez/sdk-config

[![npm version of @hussmartinez/sdk-config](https://img.shields.io/npm/v/@hussmartinez/sdk-config)](https://www.npmjs.com/package/@hussmartinez/sdk-config) [![Verify workflow status on main](https://github.com/ie-huss-martinez/sdk-core/actions/workflows/verify.yml/badge.svg?branch=main)](https://github.com/ie-huss-martinez/sdk-core/actions/workflows/verify.yml?query=branch%3Amain) [![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/ie-huss-martinez/sdk-core/blob/main/LICENSE)

Shared development configuration for the `@hussmartinez` SDK family. Every repository extends these presets instead of copying configuration, so a rule changes in one place ([STANDARDS.md](../../STANDARDS.md#tooling)).

> Status: `0.x`, so presets may still change between minor versions. Inside this workspace, the root configuration files use these presets.

## Presets

Install, as devDependencies, the tools for the presets you use. They are optional peer dependencies, so a repository without CSS doesn't need stylelint, for example. Plugins that a preset loads itself, such as `@commitlint/config-conventional`, come with the preset.

| Preset | Install |
|---|---|
| `tsconfig/*` | `typescript` (and `@types/node` for `tsconfig/node`) |
| `biome` | `@biomejs/biome` |
| `stylelint` | `stylelint` |
| `dependency-cruiser`, `hm-lint-deps` | `dependency-cruiser` |
| `commitlint` | `@commitlint/cli` |
| `lint-staged` | `lint-staged`, plus `secretlint`, `@biomejs/biome` and `stylelint`, which it runs |
| `secretlint` | `secretlint` |
| `api-extractor/base.json`, `hm-check-api-reports` | `@microsoft/api-extractor` |
| `testing/conformance` | `vitest`, `ajv` |

### TypeScript

Strict, ES2022, `nodenext` modules. `browser` adds the DOM library, and `node` adds Node's types (install `@types/node`).

```jsonc
// tsconfig.json
{ "extends": "@hussmartinez/sdk-config/tsconfig/browser" }
```

TypeScript is pinned to 6.0, because TypeScript 7 doesn't have the JavaScript compiler API that dependency-cruiser and api-extractor use yet.

### Biome

Formatting and linting for code, JSON and CSS. Markdown isn't formatted, so tables stay hand-aligned and diffs stay small.

```jsonc
// biome.json
{ "extends": ["@hussmartinez/sdk-config/biome"] }
```

### stylelint

The family's CSS rules. General CSS correctness is left to Biome.

| Rule | Enforces | ADR |
|---|---|---|
| `selector-class-pattern`, `selector-id-pattern`, `custom-property-pattern`, `keyframes-name-pattern`, `selector-attribute-name-disallowed-list` | `.hm-<part>`, `.hm-<part>--<variant>`, `#hm-*`, `--hm-*`, `hm-*` keyframes and `data-hm-*` attributes. No generic state classes | [0003](../../docs/adr/0003-hm-namespace.md) |
| `hm/layer-name-pattern` | Cascade layers are `hm` or `hm.*` | [0003](../../docs/adr/0003-hm-namespace.md) |
| `hm/selector-scope` | Selectors only match elements inside an hm root. `:root` may only declare `--hm-*` tokens | [0005](../../docs/adr/0005-plain-css-with-cascade-layers.md) |
| `hm/no-literal-values` | Colours, lengths, durations, easings, z-indexes, opacities and font values come from `--hm-*` tokens, except in `*.tokens.css` and `tokens/` files | [0006](../../docs/adr/0006-design-tokens-and-theming.md) |

Disable comments need a description, such as `/* stylelint-disable-next-line hm/no-literal-values -- the visually hidden pattern needs a 1px box */`.

```js
// stylelint.config.js
export { default } from "@hussmartinez/sdk-config/stylelint";
```

It ignores build output and tool caches: `dist/`, `temp/`, `coverage/`, `storybook-static/`, `node_modules/`, `.next/` and `dist-server/`, at any depth. Built CSS inlines the token values, so it would fail `hm/no-literal-values`. Stylelint resolves these globs against the config file that declares them, so they apply when your config re-exports the preset as above. A config that uses `extends` instead must list its own `ignoreFiles`.

### dependency-cruiser

The layer rules of [ADR 0008](../../docs/adr/0008-ports-adapters-and-session.md), as clarified by [ADR 0017](../../docs/adr/0017-core-errors-and-shared-runtime-imports.md), as forbidden imports between `src/core/*`, `src/adapters`, `src/features`, `src/react`, `src/element` and `src/workers`. The core may import `@hussmartinez/sdk-core` but never `@hussmartinez/ui` or React. Neither may `src/adapters` and `src/workers` (`core-no-ui`). Nothing `src/index.*`, the `.` entry, reaches, however indirectly, may import React or `@hussmartinez/ui/react`, even as types; it may reach `ui`'s server-safe root entry through `src/features` (`entry-no-react`, [ADR 0036](../../docs/adr/0036-ui-as-a-dependency-of-the-sdks.md)). The report names the path. No published source under `src/`, tests aside, may import `@hussmartinez/ai-core`, even as types: an SDK that needs AI defines its own provider port, and the host passes a provider. Examples under `examples/` and tests may import it to show hosts the wiring (`no-ai-core`, [ADR 0035](../../docs/adr/0035-ai-core-and-host-configured-network.md)). `src/core/errors` imports only `src/core/model` and `@hussmartinez/sdk-core`. It also rejects cycles, unresolvable and undeclared imports, devDependencies in published code and imports of tests.

```js
// .dependency-cruiser.js
export { default } from "@hussmartinez/sdk-config/dependency-cruiser";
```

It leaves out the repository's own build output and coverage (`dist/`, `temp/` and `coverage/`, at the root or in a workspace package under `packages/` or `apps/`) and fixtures under `src/`, `test/` or `tests/`. A dependency's files are always checked, including those in its `node_modules/<package>/dist/`, where most packages, such as `@hussmartinez/ui`, keep their code.

#### `hm-lint-deps`

Run dependency-cruiser through `hm-lint-deps` rather than `depcruise`:

```json
{ "scripts": { "lint:deps": "hm-lint-deps src" } }
```

When dependency-cruiser can't parse a file type, it skips those files without failing. Without a supported TypeScript, for example, it leaves out every `.ts` file and still reports no violations. `hm-lint-deps` runs the same check, with the same report, and also fails when a source file wasn't analysed.

- **Expected files:** the files git tracks under the given paths whose extension the configuration resolves (`enhancedResolveOptions.extensions`) and dependency-cruiser can parse. Declaration files, non-code files and anything matched by the configuration's `exclude`, `doNotFollow` or `includeOnly` are left out.
- **Analysed:** a file is analysed when it's in the cruise result and dependency-cruiser can parse its file type in the current environment.
- **Missing files:** the command names up to 20 of them, with a count of the rest and the likely cause.

```text
Usage: hm-lint-deps [--config <file>] <path>...
```

| Exit code | Meaning |
|---|---|
| 0 | No violations, and every expected file was analysed |
| 1 | Rule violations, or expected files that weren't analysed |
| 2 | Usage or configuration error, including running outside a git repository |

It reads `.dependency-cruiser.js` by default and needs `dependency-cruiser` installed. Configurations that use `webpackConfig` or `babelConfig` aren't supported.

### api-extractor

The family's API report settings ([ADR 0033](../../docs/adr/0033-api-reports-for-several-entry-points.md)). Each entry point's configuration extends the preset and sets only its paths:

```json
{
  "$schema": "https://developer.microsoft.com/json-schemas/api-extractor/v7/api-extractor.schema.json",
  "extends": "@hussmartinez/sdk-config/api-extractor/base.json",
  "mainEntryPointFilePath": "<projectFolder>/temp/types/react.d.ts",
  "apiReport": {
    "enabled": true,
    "reportFileName": "<unscopedPackageName>-react.api.md",
    "reportFolder": "<projectFolder>/api/",
    "reportTempFolder": "<projectFolder>/temp/react/"
  },
  "dtsRollup": { "enabled": true, "publicTrimmedFilePath": "<projectFolder>/dist/react.d.ts" }
}
```

Use the file's full path in `extends`, because api-extractor resolves it without reading the package's `exports`.

api-extractor rolls up one entry point at a time, so an entry point such as `./react` carries its own copies of the package's types that its API uses. The preset doesn't fail on those copies (`ae-forgotten-export`); it lists each one in the entry point's committed report, so a new copy shows up in review.

It fails when a public type references an `@internal` one (`ae-incompatible-release-tags`). api-extractor trims `@internal` declarations from the published rollup, so that public type would reach users broken, while api-extractor's own default only notes it in the report.

#### `hm-check-api-reports`

Packages with more than one entry point run it after api-extractor:

```json
{
  "scripts": {
    "check:api": "api-extractor run -c api-extractor.json && api-extractor run -c api-extractor.react.json && hm-check-api-reports --main api/pdf-sdk.api.md --types dist/index.d.ts api/pdf-sdk-react.api.md"
  }
}
```

For each symbol that another entry point's report lists as copied, it checks that:

- **the main entry point exports it,** so users can name the type, and a copy never hides a type the package forgot to export;
- **it isn't a class with `private`, `protected` or `#private` members.** TypeScript treats two declarations of such a class as different types, even when one is a copy of the other, so a value typed with the copy couldn't be passed where the original is expected. API reports leave those members out, so the command reads the main entry point's declaration rollup.

```text
Usage: hm-check-api-reports --main <report> --types <rollup> [<report>...]
```

| Exit code | Meaning |
|---|---|
| 0 | Every report passes |
| 1 | A report copies a type the main entry point doesn't export, or a class with non-public members |
| 2 | Usage error, or a file that can't be read |

### Testing: conformance vectors

For the language-neutral conformance cases each SDK keeps in `conformance/` ([ADR 0045](../../docs/adr/0045-portable-formats-and-conformance-vectors.md)). A case file is an `hm-conformance` document, whose JSON Schema is `@hussmartinez/sdk-config/formats/hm-conformance/v1.schema.json`:

```json
{
  "format": "hm-conformance",
  "version": 1,
  "subject": "hm-video-commands",
  "cases": [
    { "name": "splits a clip", "input": { "plan": {}, "command": {} }, "expected": {} },
    { "name": "rejects a split at a clip's edge", "input": {}, "expected": { "error": { "code": "INVALID_COMMAND", "reason": "split-at-edge" } } }
  ]
}
```

`describeConformance(file, run)` validates the file and registers a Vitest test for each case. `run` gets the case's `input` and returns the result, or throws:

```ts
import { describeConformance } from "@hussmartinez/sdk-config/testing/conformance";

describeConformance(new URL("../../conformance/commands.json", import.meta.url), (input) =>
  applyCommand(input.plan, input.command),
);
```

- **Results** are compared exactly, or, for numbers, within the case's `tolerance` when it has one (only for computed floats).
- **A rejection** is matched by the thrown error's `code` and `details.reason`, never its message.
- **`schemaValidator(schemaFile)`** checks a value against a JSON Schema 2020-12 file, such as an SDK's own format schema, and returns the problems.

It's test code only, and needs `vitest` and `ajv`, which are optional peer dependencies.

### Testing: `audioOutput`

For browser tests that need real-time audio output ([ADR 0043](../../docs/adr/0043-no-audio-output-in-firefox-tests.md)). Firefox in the family's test image has no sound server, so its `AudioContext` never starts. `audioOutput()` probes the browser once per test run and says whether audio plays at real-time speed, so every repository skips the same tests in the same way.

**Probe inside the tests that need audio, never at the top of a file.** The probe clicks a button, which gives the page user activation. A probe at the top level, such as `const audio = await audioOutput(…)` before an `it.skipIf`, runs while the file is collected, before any test. A test that checks autoplay, that audio stays silent until a gesture, would then see the gesture that the probe made, and could skip itself or pass for the wrong reason without any warning. Call it from each test that needs audio instead:

```ts
import { audioOutput } from "@hussmartinez/sdk-config/testing/audio-output";
import { type TestContext } from "vitest";
import { userEvent } from "vitest/browser";

/** Skips the calling test, with the reason, where the browser has no audio output. */
async function needAudio(context: TestContext): Promise<void> {
  const audio = await audioOutput({ activate: (button) => userEvent.click(button) });
  if (!audio.available) {
    context.skip(audio.reason.trim());
  }
}

it("keeps audio and video in sync", async (context) => {
  await needAudio(context);
  // …
});
```

Tests that check behaviour before any gesture, such as autoplay, run in a file that never calls `audioOutput()`, because the activation it grants lasts for the rest of the page.

It returns `{ available, reason, clockRatio }`. `reason` is empty when audio is available, and otherwise says why, such as ` (skipped: the AudioContext stays "suspended", so there's no audio output; sdk-core ADR 0043)`. It's test code only, with TypeScript declarations: import it only from tests.

### `hm-check-single-copy`

Fails when `pnpm-lock.yaml` resolves more than one version of any `@hussmartinez` package ([ADR 0047](../../docs/adr/0047-one-copy-of-each-family-package.md)), which [ADR 0036](../../docs/adr/0036-ui-as-a-dependency-of-the-sdks.md) forbids. Run it in `verify`:

```json
{ "scripts": { "check:single-copy": "hm-check-single-copy" } }
```

It names every version and what brings it:

```text
@hussmartinez/sdk-core resolves to 2 versions in pnpm-lock.yaml:
  0.3.0, through @hussmartinez/ui@0.5.0
  0.4.1, through the workspace (.)
```

Workspace links aren't copies, and versions that differ only in their peer dependencies count once.

```text
Usage: hm-check-single-copy [--scope <scope>]... [<lockfile>]
```

| Exit code | Meaning |
|---|---|
| 0 | Every package resolves to one version |
| 1 | A package resolves to more than one version |
| 2 | Usage error, or a lockfile that can't be read |

### commitlint, lint-staged and secretlint

The git hook rules of [ADR 0016](../../docs/adr/0016-git-hooks-and-merge-guards.md). commitlint accepts the same types and subject pattern as the `pr-title` workflow. lint-staged runs secretlint, Biome and stylelint on staged files.

```js
// commitlint.config.js
export { default } from "@hussmartinez/sdk-config/commitlint";

// lint-staged.config.js
export { default } from "@hussmartinez/sdk-config/lint-staged";
```

secretlint loads its configuration as CommonJS:

```js
// .secretlintrc.cjs
module.exports = require("@hussmartinez/sdk-config/secretlint").default;
```

## License

[Apache-2.0](../../LICENSE)
