# Standards for the `@hussmartinez` SDK family

These rules apply to `sdk-core`, `ui` and every `<kind>-sdk` repository. Each rule links to the architecture decision record (ADR) that explains it. When a rule and an ADR disagree, the newest accepted ADR wins, and this file must be corrected.

## Repositories and packages ([ADR 0002](docs/adr/0002-one-repository-per-sdk.md))

| Repository | Publishes | Role |
|---|---|---|
| `hussmartinez/sdk-core` | `@hussmartinez/sdk-core` | Headless shared runtime: worker messaging, errors, session primitives, tool registry, custom-element base, file policy, messages helper |
| | `@hussmartinez/sdk-config` | Shared tsconfig, Biome, stylelint, dependency-cruiser, Vite and Playwright presets, and the test applications |
| `hussmartinez/ui` | `@hussmartinez/ui` | Design system: tokens, themes, base styles, shared React components |
| `hussmartinez/<kind>-sdk` | `@hussmartinez/<kind>-sdk` | One media kind: `pdf`, `image`, `video`, `audio`, … |

Everything specific to one media kind stays in that SDK. `sdk-core` and `ui` stay small and stable.

## Naming ([ADR 0003](docs/adr/0003-hm-namespace.md))

| What | Pattern | Example |
|---|---|---|
| Package | `@hussmartinez/<kind>-sdk` | `@hussmartinez/pdf-sdk` |
| React editor | `<Kind>Editor` | `PdfEditor` |
| Core contracts | `<Kind>Engine`, `<Kind>Processor`, `<Kind>Error` | `PdfProcessor` |
| Custom element | `<hm-<kind>-editor>` | `<hm-pdf-editor>` |
| DOM events | `hm-<kind>-editor-<name>` | `hm-pdf-editor-change` |
| Root class | `.hm-<kind>-editor` | `.hm-pdf-editor` |
| SDK classes | `.hm-<kind>-<part>`, variants `--<variant>` | `.hm-pdf-thumb--selected` |
| Shared `ui` classes | `.hm-<part>` | `.hm-button` |
| Custom properties | `--hm-*`, SDK-specific `--hm-<kind>-*` | `--hm-color-accent` |
| Data attributes | `data-hm-*` | `data-hm-theme` |
| Error codes | `SCREAMING_SNAKE_CASE`, stable once released | `FILE_TOO_LARGE` |

Everything that reaches the page starts with `hm-`. States use ARIA attributes, then `data-hm-*`. Never use generic state classes such as `.is-active`.

## Package shape ([ADR 0004](docs/adr/0004-entry-points-and-module-format.md))

| Entry | Contents |
|---|---|
| `.` | Headless core. No React, no DOM access on import, server-safe |
| `./react` | Editor, building blocks and hooks. Starts with `"use client"` |
| `./element` | `define<Kind>EditorElement()`. Registers nothing on import |
| `./styles.css` | All styles. Imported once by the application |
| `./standalone` | Self-contained script for plain HTML pages |

- **Module format:** ESM only, with `"type": "module"`, `types` first in every `exports` condition, and `"sideEffects": ["**/*.css"]`.
- **Peer dependencies:** `react` and `react-dom` are optional, `>=18.3`.
- **No CSS from JavaScript:** library code never imports CSS.

## React API

Every SDK offers four layers:

| Layer | Example |
|---|---|
| Full editor | `<PdfEditor />` |
| Building blocks | `<PdfViewer>`, `<PdfThumbnails>`, `<PdfToolbar>` |
| Hooks | `usePdfSession()`, `usePdfDocument()` |
| Headless core | No React |

Every editor accepts the same configuration props:

| Prop | Purpose |
|---|---|
| `file` + `onChange`, or `initialFile` | Controlled or uncontrolled document |
| `onEvent` | Anonymous usage events. Never file names or contents |
| `engine`, `processor` | Replace the default adapters |
| `assets` | Self-hosted worker and WebAssembly URLs ([ADR 0011](docs/adr/0011-worker-messaging-and-assets.md)) |
| `filePolicy` | Resource limits ([ADR 0012](docs/adr/0012-hostile-input-and-no-network.md)) |
| `tools`, `toolbar`, `features` | Which tools exist, their order and grouping, and which capabilities are on |
| `theme` | Theme object or `"light"`, `"dark"` or `"system"` |
| `className`, `classNames` | Extra classes on the root and on each named part |
| `unstyled` | Drop visual styles, keeping layout and accessibility |
| `messages`, `locale` | Text overrides and formatting locale |
| `icons` | Replace any or all icons |

Programmatic control goes through a ref handle, such as `open(file)`, `export()` and `undo()`. Refs use `forwardRef`.

## Styling and theming ([ADR 0005](docs/adr/0005-plain-css-with-cascade-layers.md), [ADR 0006](docs/adr/0006-design-tokens-and-theming.md))

- **Plain CSS** in the layer order `@layer hm.tokens, hm.base, hm.components, hm.sdk;`. SDKs write only into `hm.sdk`.
- **No global selectors.** Nothing targets `html`, `body`, `*` or bare elements outside a component root.
- **No literal values.** Colours, lengths, durations, shadows, z-indexes and font values come from `--hm-*` tokens. stylelint enforces this.
- **Three token levels:** base scale, then semantic, then component. Components use only semantic and component tokens.
- **Theming:**
  - built-in themes follow the system by default;
  - `data-hm-theme` and `data-hm-density` attributes override per subtree;
  - `createTheme`, `ThemeProvider` and `themeToCss` handle custom themes;
  - applications can override every token.
- **Responsive layout:** container queries rather than viewport media queries.
- **Motion:** a reduced-motion fallback for every animation.
- **Icons:** they use `currentColor`.
- **Fonts:** never fetched.

## Server rendering ([ADR 0007](docs/adr/0007-server-rendering-and-nextjs.md))

- No browser APIs at import time or during render. Heavy dependencies load with dynamic `import()` after mount.
- Server and client render identical markup: IDs come from `useId`, and nothing in render depends on time or randomness.
- `"use client"` is kept in built React entries, and a test verifies it.
- Every repository's end-to-end tests run against the Next.js and Vite test applications from `sdk-config`.

## Architecture ([ADR 0008](docs/adr/0008-ports-adapters-and-session.md), [ADR 0009](docs/adr/0009-features-as-tools.md), [ADR 0010](docs/adr/0010-edits-as-commands.md), [ADR 0011](docs/adr/0011-worker-messaging-and-assets.md), [ADR 0017](docs/adr/0017-core-errors-and-shared-runtime-imports.md))

- **Ports and adapters:**
  - the core defines ports, such as `PdfEngine` and `PdfProcessor`;
  - adapters implement them and run in workers;
  - every core layer may import `@hussmartinez/sdk-core`, but never `@hussmartinez/ui`, `react` or `react-dom`;
  - `core/errors` is a leaf: it imports only `core/model` and `@hussmartinez/sdk-core`, and every layer may import it;
  - the dependency rules are enforced with `dependency-cruiser`.
- **Framework-agnostic session:** the store exposes `getSnapshot()`, `subscribe()` and commands. React binds with `useSyncExternalStore`, and the element binds to the same store.
- **Tools:**
  - every feature is a folder under `src/features/<feature>/`, registered with `defineTool`;
  - toolbars, menus and shortcuts are built from the registered tools.
- **Commands:**
  - every edit is a serialisable command;
  - the session provides undo, redo and grouping within a memory budget;
  - destructive actions offer undo instead of confirmation.
- **Workers** ([ADR 0018](docs/adr/0018-worker-rpc-protocol.md)):
  - typed, versioned RPC from `sdk-core`, with cancellation, progress and error codes preserved;
  - caller buffers are copied unless `transfer: true`, and results are transferred, except views into part of a buffer, which are copied;
  - a call that can't be stopped terminates its worker, other calls on it fail with `WORKER_TERMINATED`, and none are retried automatically;
  - `exposeWorker` runs before any heavy initialisation, and WebAssembly loads lazily.
- **Errors:** one `SdkError` subclass per SDK, with a stable `code`, `details` and `cause`. User-facing text comes from messages, never from error text.
- **Contract tests:** every adapter passes the contract-test suite for its port.

## Security and privacy ([ADR 0012](docs/adr/0012-hostile-input-and-no-network.md), [ADR 0020](docs/adr/0020-file-policy.md))

- **Treat every file as hostile** ([ADR 0020](docs/adr/0020-file-policy.md)):
  - parse only in workers;
  - enforce limits on size, count, pixels, decoded size and time, with `defineLimits` from `sdk-core`, extending `coreLimits` with the SDK's own;
  - check before or while decoding, failing with specific error codes and `details` naming the limit, and warning from each limit's warning threshold;
  - hosts configure limits through `filePolicy`, and unknown limit names are an error.
- **Harden parsers:**
  - pdf.js runs with `isEvalSupported: false` and scripting disabled;
  - link protocols are allowlisted;
  - links get `rel="noopener noreferrer"`.
- **Never insert file-derived strings as HTML.** Sanitise SVG, or display it only through `<img>`.
- **No network requests** by default. End-to-end tests fail on any request to another origin.
- **Supply chain:**
  - minimal, justified dependencies;
  - committed lockfiles and allowlisted install scripts;
  - licence checks;
  - GitHub Actions pinned to commit SHAs;
  - trusted publishing with provenance;
  - `SECURITY.md` in every repository.

## Platform ([ADR 0013](docs/adr/0013-browser-and-react-support.md))

- **Browsers:** the last two major versions of Chrome, Edge, Firefox and Safari, on desktop and mobile. Builds target ES2022 and ship no polyfills.
- **Feature detection:** missing platform features fail with `UNSUPPORTED_ENVIRONMENT`, naming the feature.
- **React:** `>=18.3`, avoiding React 19-only APIs.

## Accessibility and text ([ADR 0014](docs/adr/0014-accessibility-and-translatable-text.md))

- **WCAG 2.2 AA:**
  - full keyboard support, with a keyboard alternative for every drag-and-drop;
  - visible focus;
  - native `<dialog>` with `showModal()`;
  - `aria-live` announcements for results;
  - target sizes of at least 24 px, and 44 px on touch.
- **No inline text** ([ADR 0019](docs/adr/0019-message-catalogues.md)):
  - every visible string and accessible name comes from the typed message catalogue in `src/messages/en.ts`, declared with `defineMessages` and including `sdkCoreMessages`;
  - messages are plain text with `{name}` and `{name, format}` placeholders, plurals are `{ "$plural": … }` objects, and output is never markup;
  - hosts override them with `messages`, and numbers, sizes and dates use `Intl` for the `locale` the host passes;
  - error text is looked up by code under `errors.<CODE>`, never taken from `error.message`.
- **Automated checks:** `@axe-core/playwright` runs in every end-to-end suite.

## UX

- **Long operations** show progress, can be cancelled, and recover from errors with a clear next step.
- **Designed states:** empty, loading, error and success states are designed, never blank.
- **Shared shortcuts:** keyboard shortcuts are consistent across SDKs, through the shared shortcut registry.
- **Previews before downloads:** irreversible outputs, such as downloads of transformed files, show a preview or summary first when the result isn't obvious.

## Repository layout

Every `<kind>-sdk` repository follows this structure:

```text
<kind>-sdk/
├─ src/
│  ├─ core/
│  │  ├─ model/          domain types
│  │  ├─ operations/     commands
│  │  ├─ ports/          engine and processor interfaces
│  │  ├─ session/        store, history, events
│  │  └─ errors/
│  ├─ adapters/          port implementations, one folder each
│  ├─ workers/           worker entry points only
│  ├─ features/
│  │  └─ <feature>/      <feature>.operation.ts  <Feature>Tool.tsx
│  │                     <feature>.css  <feature>.messages.ts  *.test.ts
│  ├─ react/             editor shell, building blocks, hooks, providers
│  ├─ element/           custom element
│  ├─ messages/          en.ts
│  ├─ index.ts           core entry
│  ├─ react.ts           React entry
│  └─ element.ts         element entry
├─ e2e/                  Playwright suites
├─ examples/             next/  vite/  html/
├─ docs/adr/             SDK-specific decisions
├─ api/                  api-extractor report
├─ AGENTS.md
├─ SECURITY.md
├─ CONTRIBUTING.md
└─ README.md
```

- **Tests:** unit tests sit next to the code they test, as `*.test.ts`.
- **File names:** kebab-case for modules and PascalCase for React component files.
- **Exports:** one public entry file per subpath export. Deep imports into `src/` are not part of the API.

## Tooling

- **Runtime and package manager:** Node 24 and pnpm 12.
- **Build and language:** Vite 8 and TypeScript in strict mode.
- **Code checks:** Biome, stylelint and `dependency-cruiser`.
- **Tests:** Vitest, Playwright and `@axe-core/playwright`.
- **Packaging and API:** `size-limit`, `api-extractor`, `publint` and `@arethetypeswrong/cli`.
- **Component catalogue (`ui`):** Ladle.
- **Git hooks:** Husky with lint-staged.

Each repository extends the presets in `@hussmartinez/sdk-config` instead of copying configuration.

## Workflow ([ADR 0015](docs/adr/0015-verification-and-releases.md), [ADR 0016](docs/adr/0016-git-hooks-and-merge-guards.md), [ADR 0021](docs/adr/0021-version-and-release-with-changesets.md))

- **Verification:**
  - `pnpm verify` runs code checks, build, unit tests, browser tests, size budgets, the API report and package checks;
  - `pnpm verify:fast` runs the one-minute subset: types, unit tests, dependency rules and the API report.
- **Git hooks** (Husky; budgets in ADR 0016):
  - `pre-commit` lints staged files and scans them for secrets;
  - `commit-msg` checks Conventional Commits;
  - `pre-push` runs `pnpm verify:fast`;
  - `--no-verify` is never used.
- **Before a pull request is ready:** run `pnpm verify` locally, using Chromium, and report the result in the description.
- **CI:**
  - every pull request and push to `main` runs `pnpm verify`, with browser tests on Chromium, Firefox and WebKit;
  - `verify` and `pr-title` are required checks, and branches must be up to date;
  - actions are pinned to commit SHAs, with least-privilege permissions, `pull_request` events only, and no secrets in pull request workflows.
- **Pull requests:**
  - every change goes through a small, focused pull request describing what changed, why, and how it was tested;
  - squash merges only, with linear history on `main`;
  - Conventional Commits, and pull request titles become commit titles;
  - commits are signed.
- **ADRs:** significant decisions get an ADR in the owning repository.
- **Versioning** ([ADR 0021](docs/adr/0021-version-and-release-with-changesets.md)):
  - semver, with `0.x` until the API settles, and each package versioned on its own;
  - every pull request that changes a published package's source or `package.json` adds a changeset with `pnpm changeset`, describing the change for users; a required `changeset` check enforces it;
  - Conventional Commits stay for history and pull request titles, but don't drive versions;
  - the release workflow keeps a `chore: version packages` pull request open with the pending changesets; merging it publishes;
  - the same workflow then runs `pnpm verify` and publishes to npm with trusted publishing and provenance, and creates a GitHub Release per package;
  - the tarball, standalone scripts and checksums are attached to the GitHub Release, with artifact attestations.
- **Licence:** Apache-2.0, with a `NOTICE` file crediting bundled third-party code whose licence requires it.
