---
"@hussmartinez/sdk-config": minor
---

First release of `@hussmartinez/sdk-config`, the shared development configuration for the `@hussmartinez` SDKs. Each repository extends these presets instead of copying configuration, so a rule changes in one place. Install the tools for the presets you use; each is an optional peer dependency.

- **TypeScript:** `tsconfig/base`, `tsconfig/browser` and `tsconfig/node`, strict and ES2022 with `nodenext` modules, plus `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` and `verbatimModuleSyntax`.
- **Biome:** formatting and linting for code, JSON and CSS, with rules that keep public code explicit about types and imports.
- **stylelint:** the family's CSS rules.
  - Everything is namespaced with `hm-`: classes, ids, custom properties, keyframes, `data-hm-*` attributes and cascade layers.
  - Selectors can only match elements inside an `hm` root.
  - Every colour, length, duration, easing, z-index, opacity and font value must come from a `--hm-*` design token, except in token files.
- **dependency-cruiser:** the layer rules for SDK repositories, for example that the core never imports React, adapters or UI. It also rejects cycles, unresolvable or undeclared imports, devDependencies in published code and imports of tests.
- **`hm-lint-deps`:** a command that runs dependency-cruiser with your configuration and also fails when a source file wasn't analysed, such as every `.ts` file when no supported TypeScript is installed. It exits 0 when clean, 1 for violations, and 2 for usage errors.
- **Git hooks:** presets for commitlint (Conventional Commits with a lowercase subject and a 72-character header), lint-staged (a secret scan, then Biome and stylelint on staged files) and secretlint (cloud, npm and GitHub credentials, and private keys).
