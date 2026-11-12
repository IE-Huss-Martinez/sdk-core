# Standards for the `@hussmartinez` SDK family

These rules apply to `sdk-core`, `ui`, `ai-core` and every `<kind>-sdk` repository. Each rule links to the architecture decision record (ADR) that explains it. When a rule and an ADR disagree, the newest accepted ADR wins, and this file must be corrected.

## Repositories and packages ([ADR 0002](docs/adr/0002-one-repository-per-sdk.md), [ADR 0024](docs/adr/0024-github-organisation-for-the-sdk-family.md), [ADR 0035](docs/adr/0035-ai-core-and-host-configured-network.md))

| Repository | Publishes | Role |
|---|---|---|
| `ie-huss-martinez/sdk-core` | `@hussmartinez/sdk-core` | Headless shared runtime: worker messaging, errors, session primitives, tool registry, custom-element base, file policy, messages helper |
| | `@hussmartinez/sdk-config` | Shared tsconfig, Biome, stylelint, dependency-cruiser, api-extractor, commitlint, lint-staged and secretlint presets |
| `ie-huss-martinez/ui` | `@hussmartinez/ui` | Design system: tokens, themes, base styles, shared React components |
| `ie-huss-martinez/ai-core` | `@hussmartinez/ai-core` | Headless AI provider layer: message model, provider adapters, errors, server handler and browser transport. Renders nothing, and is the only package with network code |
| `ie-huss-martinez/<kind>-sdk` | `@hussmartinez/<kind>-sdk` | One kind: media such as `pdf`, `image`, `video` and `audio`, or another product area such as `chat` |
| `ie-huss-martinez/sdk-ci` | (none: GitHub Actions) | The family's shared CI and release steps, as versioned composite actions ([ADR 0026](docs/adr/0026-share-ci-steps-from-sdk-ci.md)) |

The repositories live in the `ie-huss-martinez` GitHub organisation, and the npm scope is `@hussmartinez`. `pnpm create-sdk-repo <name>` in `sdk-core` creates a repository and keeps its GitHub settings, environments, branch protection and required checks to the family's (CONTRIBUTING.md, "Setting up a new repository"). Everything specific to one kind stays in that SDK. `sdk-core` and `ui` stay small and stable. AI provider code lives in `ai-core`, never in `sdk-core`.

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

## Package shape ([ADR 0004](docs/adr/0004-entry-points-and-module-format.md), [ADR 0036](docs/adr/0036-ui-as-a-dependency-of-the-sdks.md))

| Entry | Contents |
|---|---|
| `.` | Headless core. No React, no DOM access on import, server-safe |
| `./react` | Editor, building blocks and hooks. Starts with `"use client"` |
| `./element` | `define<Kind>EditorElement()`, built with `sdk-core/element`'s `createEditorElement`. Registers nothing on import, and renders into the light DOM ([ADR 0040](docs/adr/0040-editor-element-base.md)) |
| `./styles.css` | All styles. Imported once by the application |
| `./standalone` | Self-contained script for plain HTML pages. Adopts one shared copy of `ui`'s styles per `ui` minor ([ADR 0040](docs/adr/0040-editor-element-base.md)) |

- **Module format:** ESM only, with `"type": "module"`, `types` first in every `exports` condition, and `"sideEffects": ["**/*.css"]`.
- **Peer dependencies:** `react` and `react-dom` are optional, `>=18.3`.
- **`@hussmartinez/ui`:** a regular dependency of every SDK, on the current minor (`^0.N.0` during `0.x`), imported only by `features/`, `react/` and `element/`. Applications that use `ui` themselves depend on the same minor, so there's one copy; `ui` warns in development when there are two.
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
| `assetsUrl` | Where the host serves the package's `dist/assets/`, to self-host workers and WebAssembly ([ADR 0011](docs/adr/0011-worker-messaging-and-assets.md), [ADR 0038](docs/adr/0038-self-hosted-assets-and-worker-version.md)) |
| `filePolicy` | Resource limits ([ADR 0012](docs/adr/0012-hostile-input-and-no-network.md)) |
| `tools`, `toolbar`, `features` | Which tools exist, their order and grouping, and which capabilities are on |
| `theme` | Theme object or `"light"`, `"dark"` or `"system"` |
| `className`, `classNames` | Extra classes on the root and on each named part |
| `unstyled` | Drop visual styles, keeping layout and accessibility |
| `messages`, `locale` | Text overrides and formatting locale |
| `icons` | Replace any or all icons |

Programmatic control goes through a ref handle, such as `open(file)`, `export()` and `undo()`. Refs use `forwardRef`.

## Styling and theming ([ADR 0005](docs/adr/0005-plain-css-with-cascade-layers.md), [ADR 0006](docs/adr/0006-design-tokens-and-theming.md), [ADR 0036](docs/adr/0036-ui-as-a-dependency-of-the-sdks.md))

- **Plain CSS** in the layer order `@layer hm.tokens, hm.base, hm.components, hm.sdk;`. SDKs write only into `hm.sdk`.
- **One copy of `ui`'s stylesheet:** hosts import `@hussmartinez/ui/styles.css` once, before the SDKs' stylesheets. It's required for every surface that renders `ui`'s components, whose focus rings and target sizes live there. An SDK's `styles.css` never bundles or `@import`s it, and a custom element never ships its own copy.
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
- Every repository's end-to-end tests run against its own Next.js and Vite applications in `examples/`, required before its first release with a React layer or custom element ([ADR 0039](docs/adr/0039-test-applications-in-each-repository.md)).

## Architecture ([ADR 0008](docs/adr/0008-ports-adapters-and-session.md), [ADR 0009](docs/adr/0009-features-as-tools.md), [ADR 0010](docs/adr/0010-edits-as-commands.md), [ADR 0011](docs/adr/0011-worker-messaging-and-assets.md), [ADR 0017](docs/adr/0017-core-errors-and-shared-runtime-imports.md))

- **Ports and adapters:**
  - the core defines ports, such as `PdfEngine` and `PdfProcessor`;
  - an SDK that needs AI defines its own provider port, such as `AiProvider` with `complete()` and `stream()` taking an `AbortSignal`, with a fake and contract tests; hosts pass a provider from `ai-core` or their own backend ([ADR 0035](docs/adr/0035-ai-core-and-host-configured-network.md));
  - adapters implement them and run in workers;
  - every core layer may import `@hussmartinez/sdk-core`, but never `@hussmartinez/ui`, `react` or `react-dom`, and neither may `adapters/` or `workers/`. Nothing the `.` entry reaches may import React or `ui`'s React entry, even as types; it may reach `ui`'s server-safe root entry through `features/` ([ADR 0036](docs/adr/0036-ui-as-a-dependency-of-the-sdks.md));
  - `core/errors` is a leaf: it imports only `core/model` and `@hussmartinez/sdk-core`, and every layer may import it;
  - the dependency rules are enforced with `dependency-cruiser`.
- **Framework-agnostic session:** the store exposes `getSnapshot()`, `subscribe()` and commands. React binds with `useSyncExternalStore`, and the element binds to the same store. Sessions build on `sdk-core`'s `createStore`, `createHistory` and `Reducer` ([ADR 0029](docs/adr/0029-session-store-and-history.md)).
- **Tools:**
  - every feature is a folder under `src/features/<feature>/`, registered with `defineTool`;
  - toolbars, menus and shortcuts are built from the registered tools, with `createToolRegistry` and `createShortcutRegistry` from `sdk-core`, and unknown tool ids fail when the editor is created ([ADR 0030](docs/adr/0030-tools-and-keyboard-shortcuts.md)).
- **Commands:**
  - every edit is a serialisable command;
  - the session provides undo, redo and grouping within a memory budget, with `sdk-core`'s history and each SDK's own memory policy ([ADR 0029](docs/adr/0029-session-store-and-history.md));
  - destructive actions offer undo instead of confirmation.
- **Workers** ([ADR 0018](docs/adr/0018-worker-rpc-protocol.md)):
  - typed, versioned RPC from `sdk-core`, with cancellation, progress and error codes preserved;
  - caller buffers are copied unless `transfer: true`, and results are transferred, except views into part of a buffer, which are copied;
  - a call that can't be stopped terminates its worker, other calls on it fail with `WORKER_TERMINATED`, and none are retried automatically;
  - `exposeWorker` runs before any heavy initialisation, and WebAssembly loads lazily;
  - an engine's own worker protocol, such as pdf.js's, is allowed when it can't be replaced, if its adapter gives callers the same guarantees: copied inputs, abort, time limits, termination, error codes and managed lifetimes, with contract tests for each ([ADR 0028](docs/adr/0028-third-party-engines.md)).
- **Errors:** one `SdkError` subclass per SDK, with a stable `code`, `details` and `cause`. User-facing text comes from messages, never from error text.
- **Contract tests:** every adapter passes the contract-test suite for its port.

## Security and privacy ([ADR 0012](docs/adr/0012-hostile-input-and-no-network.md), [ADR 0020](docs/adr/0020-file-policy.md), [ADR 0028](docs/adr/0028-third-party-engines.md), [ADR 0035](docs/adr/0035-ai-core-and-host-configured-network.md))

- **Treat every file as hostile** ([ADR 0020](docs/adr/0020-file-policy.md)):
  - parse only in workers, except with a browser decoder that only exists on the page, such as `decodeAudioData`, and then only for files a worker has probed and bounded, with the decoded output checked against that bound ([ADR 0031](docs/adr/0031-platform-decoders-on-the-page.md));
  - enforce limits on size, count, pixels, decoded size and time, with `defineLimits` from `sdk-core`, extending `coreLimits` with the SDK's own;
  - check before or while decoding, failing with specific error codes and `details` naming the limit, and warning from each limit's warning threshold;
  - hosts configure limits through `filePolicy`, and unknown limit names are an error.
- **Harden parsers:**
  - no code is generated from file data: a build test fails if any built engine chunk contains `eval(` or `new Function`, and the documented CSP never needs `'unsafe-eval'` ([ADR 0028](docs/adr/0028-third-party-engines.md));
  - engine options that enable code generation or scripting are off, such as pdf.js's scripting and XFA;
  - link protocols are allowlisted;
  - links get `rel="noopener noreferrer"`.
- **Never insert file-derived strings as HTML.** Sanitise SVG, or display it only through `<img>`.
- **No network requests** by default. End-to-end tests fail on any request to an origin the test didn't configure.
  - No `@hussmartinez` SDK, and neither `sdk-core` nor `ui`, makes any request.
  - None of them imports `@hussmartinez/ai-core`, for code or types: the `sdk-config` dependency-cruiser preset forbids it, with no opt-in. An SDK that needs AI defines its own provider port, and the host passes a provider ([ADR 0035](docs/adr/0035-ai-core-and-host-configured-network.md)).
  - `ai-core` is the only package with network code. It requests only endpoints the host configures, and only for calls the host or the user started. A unit test proves that nothing is requested on import, event callbacks never carry prompts, outputs or keys, and the documented CSP limits `connect-src` to the host's endpoint.
- **AI secrets stay on the server** ([ADR 0035](docs/adr/0035-ai-core-and-host-configured-network.md)):
  - `ai-core`'s provider adapters run behind the host's request handler, and the browser talks only to the host's endpoint;
  - an adapter refuses to run in a browser unless the host passes `dangerouslyAllowBrowser: true`;
  - keys never reach an error's `message`, `details` or `cause`, serialised errors, event payloads or logs; `cause` never holds a request, headers or a raw response; request and response bodies stay out of `details`; a sentinel test covers every adapter's failure paths.
- **Provider responses and model output are hostile input** ([ADR 0035](docs/adr/0035-ai-core-and-host-configured-network.md)):
  - an SDK treats whatever its provider port returns as hostile, whichever provider the host passed;
  - `ai-core` limits response size, stream duration and idle time with `defineLimits`, failing with `RESPONSE_TOO_LARGE`, `STREAM_TIMEOUT` and `STREAM_IDLE`, and hosts set them through `limits`;
  - model output is displayed as text, or as a strict formatting subset rendered to elements, never as HTML, with no remote resources by default;
  - tool calls are never executed automatically: running one needs a host handler for its name, and a `maxSteps` limit;
  - `ai-core`'s tests replay recorded provider responses, SDKs test against their fake provider, and CI never calls a provider.
- **Third-party engines are proven offline** ([ADR 0028](docs/adr/0028-third-party-engines.md)): every data file an engine needs, such as character maps, fonts, colour profiles, decoders or models, comes from the SDK's asset provider, never from the engine's default URLs; fallbacks that load code by URL aren't bundled; unknown asset requests fail closed; and end-to-end fixtures exercise every data path the engines have.
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
- **Shared shortcuts:** keyboard shortcuts are consistent across SDKs, through the shared shortcut registry ([ADR 0030](docs/adr/0030-tools-and-keyboard-shortcuts.md)). Shortcuts never take a field's or a control's own keys, and never the browser's page zoom (`Mod+=`, `Mod+-`, `Mod+0`).
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
  - Every entry point's api-extractor configuration extends `sdk-config`'s preset. A package with more than one entry point runs `hm-check-api-reports` after api-extractor, and never turns `ae-forgotten-export` off ([ADR 0033](docs/adr/0033-api-reports-for-several-entry-points.md)).
- **Component catalogue (`ui`):** Storybook 10 with the React and Vite builder, axe checks and stories run as Vitest browser tests ([ADR 0022](docs/adr/0022-storybook-for-the-component-catalogue.md)).
- **Git hooks:** Husky with lint-staged.

Each repository extends the presets in `@hussmartinez/sdk-config` instead of copying configuration.

## Workflow ([ADR 0015](docs/adr/0015-verification-and-releases.md), [ADR 0016](docs/adr/0016-git-hooks-and-merge-guards.md), [ADR 0021](docs/adr/0021-version-and-release-with-changesets.md), [ADR 0023](docs/adr/0023-verify-releases-in-an-unprivileged-job.md))

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
  - every pull request and push to `main` runs `pnpm verify`, with browser tests on Chromium, Firefox and WebKit, in the pinned Playwright image, read from its only copy in `ci/Dockerfile` ([ADR 0023](docs/adr/0023-verify-releases-in-an-unprivileged-job.md), [ADR 0025](docs/adr/0025-one-browser-test-image-in-one-place.md));
  - `verify` and `pr-title` are required checks, and branches must be up to date;
  - actions are pinned to commit SHAs, with least-privilege permissions, `pull_request` events only, and no secrets in pull request workflows.
  - the CI and release steps come from `sdk-ci`'s composite actions, pinned by SHA and updated by Dependabot. Each repository keeps its own job skeleton, with its permissions and environments, and `sdk-ci`'s `check-workflows` keeps it identical to the pinned version ([ADR 0026](docs/adr/0026-share-ci-steps-from-sdk-ci.md)).
- **Pull requests:**
  - every change goes through a small, focused pull request describing what changed, why, and how it was tested;
  - squash merges only, with linear history on `main`;
  - Conventional Commits, and pull request titles become commit titles;
  - commits are signed;
  - the author never merges: a separate reviewer checks the full diff against `STANDARDS.md` and the ADRs, requires green CI, runs `pnpm verify` independently for code changes, and merges nothing "almost right";
  - coding agents open one pull request at a time, stop and report, and never review or merge their own; author and reviewer are always different sessions.
- **ADRs:** significant decisions get an ADR in the owning repository.
- **Versioning** ([ADR 0021](docs/adr/0021-version-and-release-with-changesets.md)):
  - semver, with `0.x` until the API settles, and each package versioned on its own;
  - every pull request that changes a published package's source or `package.json` adds a changeset, unless only `package.json`'s dev-only fields changed: `devDependencies`, `scripts`, `packageManager` and `devEngines` ([ADR 0027](docs/adr/0027-dev-only-package-json-changes-need-no-changeset.md)) with `pnpm changeset`, describing the change for users; a required `changeset` check enforces it;
  - Conventional Commits stay for history and pull request titles, but don't drive versions;
  - the release workflow keeps a `chore: version packages` pull request open with the pending changesets; merging it publishes;
  - the same workflow then runs `pnpm verify` in its own read-only job, which also packs and checks the tarballs. Only after it passes does the publish job publish exactly those tarballs to npm, with trusted publishing and provenance, and create a GitHub Release per package ([ADR 0023](docs/adr/0023-verify-releases-in-an-unprivileged-job.md), [ADR 0041](docs/adr/0041-publish-the-verified-tarballs.md));
  - the tarball, standalone scripts and checksums are attached to the GitHub Release, with artifact attestations.
- **Licence:** Apache-2.0, with a `NOTICE` file crediting bundled third-party code whose licence requires it.
