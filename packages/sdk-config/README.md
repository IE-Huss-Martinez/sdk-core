# @hussmartinez/sdk-config

Shared development configuration for the `@hussmartinez` SDK family. Every repository extends these presets instead of copying configuration, so a rule changes in one place ([STANDARDS.md](../../STANDARDS.md#tooling)).

> Status: not published yet. Inside this workspace, the root configuration files use these presets.

## Presets

Install, as devDependencies, the tools for the presets you use. They are optional peer dependencies, so a repository without CSS doesn't need stylelint, for example. Plugins that a preset loads itself, such as `@commitlint/config-conventional`, come with the preset.

| Preset | Install |
|---|---|
| `tsconfig/*` | `typescript` (and `@types/node` for `tsconfig/node`) |
| `biome` | `@biomejs/biome` |
| `stylelint` | `stylelint` |
| `dependency-cruiser` | `dependency-cruiser` |
| `commitlint` | `@commitlint/cli` |
| `lint-staged` | `lint-staged`, plus `secretlint`, `@biomejs/biome` and `stylelint`, which it runs |
| `secretlint` | `secretlint` |

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

### dependency-cruiser

The layer rules of [ADR 0008](../../docs/adr/0008-ports-adapters-and-session.md), as clarified by [ADR 0017](../../docs/adr/0017-core-errors-and-shared-runtime-imports.md), as forbidden imports between `src/core/*`, `src/adapters`, `src/features`, `src/react`, `src/element` and `src/workers`. The core may import `@hussmartinez/sdk-core` but never `@hussmartinez/ui` or React, and `src/core/errors` imports only `src/core/model` and `@hussmartinez/sdk-core`. It also rejects cycles, unresolvable and undeclared imports, devDependencies in published code and imports of tests.

```js
// .dependency-cruiser.js
export { default } from "@hussmartinez/sdk-config/dependency-cruiser";
```

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
