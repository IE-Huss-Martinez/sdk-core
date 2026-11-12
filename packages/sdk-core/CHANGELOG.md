# @hussmartinez/sdk-core

## 0.2.0

### Minor Changes

- [#54](https://github.com/ie-huss-martinez/sdk-core/pull/54) [`0d5db0d`](https://github.com/ie-huss-martinez/sdk-core/commit/0d5db0db9d6589e3727778c9df530e3943b40d9b) Thanks [@hussmartinez](https://github.com/hussmartinez)! - New session primitives for SDK sessions (ADR 0029), from the root entry:
  
  - **`createStore(initial)`** returns `{ getSnapshot, subscribe, set }`, a small observable store for `useSyncExternalStore`. Setting the same value notifies no one, and a listener that throws doesn't stop the others.
  - **`type Reducer<S, C>`** is a pure function that applies one command and returns the new state with the command's inverse. **`applyCommands(reducer, state, commands)`** applies a sequence and returns the inverses in the order that undoes it.
  - **`createHistory()`** gives undo and redo stacks of command steps:
    - `push`, `undo`, `redo`, `canUndo` and `canRedo`;
    - `restore(direction)` after a step fails to apply;
    - **`group(fn)`** records everything pushed inside `fn` as one undoable step;
    - `steps`, `dropOrder`, `drop(count)` and `trimmed`, for building a memory budget that only drops steps in an order that keeps the rest applicable.
  
  Your session keeps its own commands, snapshot and memory policy, and builds on these.

- [#58](https://github.com/ie-huss-martinez/sdk-core/pull/58) [`7571472`](https://github.com/ie-huss-martinez/sdk-core/commit/7571472a52d1e29ade0e31c227437164881abaeb) Thanks [@hussmartinez](https://github.com/hussmartinez)! - Shared keyboard shortcuts for SDK editors (ADR 0030), from the root entry:
  
  - **`createShortcutRegistry({ platform, tools })`** registers your tools' shortcuts and matches keyboard events to them:
    - **`match(event)`** works with DOM events and plain objects, and returns the tool id to run. From a React handler, pass `event.nativeEvent`: React's synthetic event has no `composedPath`, which `match` needs to recognise fields inside shadow roots. Call it from a listener on the editor's root, never on `window`.
    - **It won't take keys that belong to something else.** It never fires in text fields unless a shortcut sets `inEditable`, never takes `Space`, `Enter` or arrows from focused buttons, links and other controls, and ignores IME input, handled events, and held-down keys unless a shortcut sets `repeat`.
    - **`Shift` is ignored for symbol keys,** so `+` and `0` work on every keyboard layout.
    - **Letters work on every layout:** a Latin layout, including Dvorak and AZERTY, follows its printed letter, and on Cyrillic, Greek, Hebrew or Arabic layouts the physical key decides, so `Ctrl+Z` is still undo.
    - **Fields inside shadow roots count as fields:** pass events with `composedPath`, as DOM events have.
    - **Conflicting chords throw a `TypeError`** naming both tools.
    - **`ariaKeyShortcuts(id)` and `describe(id)`** give `aria-keyshortcuts` values and label parts. Label parts use new `keys.*` messages in `sdkCoreMessages`, so you can translate them.
  - **`platformOf(navigator)`** gives `"apple"` or `"other"`. `Mod` means `Meta` on Apple platforms and `Control` elsewhere.
  - **`familyShortcuts`** are the keys every SDK shares: undo, redo, delete, select all, zoom, cancel and play/pause. A tool takes them with `shortcuts: "undo"`. Zoom uses `+`, `-` and `0` without a modifier, leaving `Mod+=`, `Mod+-` and `Mod+0` to the browser's page zoom.
  - **`defineTool`'s `shortcuts`** also accept chords with options, such as `{ keys: "Mod+S", inEditable: true }`.

- [#56](https://github.com/ie-huss-martinez/sdk-core/pull/56) [`42f3cd3`](https://github.com/ie-huss-martinez/sdk-core/commit/42f3cd381abc6065e95e60224c22c392d4f1d33d) Thanks [@hussmartinez](https://github.com/hussmartinez)! - New, headless tools for SDK editors (ADR 0030), from the root entry:
  
  - **`defineTool(definition)`** checks and freezes a tool:
    - its `id` (`<sdk>.<tool>`, such as `pdf.rotate-left`), a `label` message key, an `icon` and a toolbar `group`;
    - the capabilities it `requires`;
    - `isAvailable`, `isEnabled` and `isActive` from your session state;
    - `run(context)`, its `shortcuts`, and an optional `view` that only your UI layer reads.
  
    A malformed definition, including a misspelt key, throws a `TypeError`.
  - **`createToolRegistry(tools, { tools, toolbar, capabilities })`** resolves your editor's `tools` and `toolbar` props into the present tools, in order, and the toolbar's groups.
    - **Default grouping:** without `toolbar`, tools are grouped by their `group`.
    - **Capabilities:** tools that require a capability that's off are left out and listed in `omitted`.
    - **Mistakes fail when the editor is created:** an unknown or repeated tool id throws a `TypeError` that names it.

## 0.1.3

### Patch Changes

- [#41](https://github.com/ie-huss-martinez/sdk-core/pull/41) [`d8d674a`](https://github.com/ie-huss-martinez/sdk-core/commit/d8d674a48bd5a60bd4cc136562511cd86bd8aea1) Thanks [@hussmartinez](https://github.com/hussmartinez)! - The source repository has moved to the `ie-huss-martinez` GitHub organisation: `https://github.com/ie-huss-martinez/sdk-core`. The package's `repository` and its README links point there, and it now has `bugs` and `homepage` links too. Old `github.com/hussmartinez/sdk-core` links redirect. The npm package name doesn't change, and there's nothing to migrate.

## 0.1.2

### Patch Changes

- [#34](https://github.com/hussmartinez/sdk-core/pull/34) [`515704a`](https://github.com/hussmartinez/sdk-core/commit/515704a3df2fc90f0d11eda462cf26d6a1495b4e) Thanks [@hussmartinez](https://github.com/hussmartinez)! - Bundlers can now drop the code you don't import. A bundle that imports `SdkError`, `createMessages` or `createWorkerClient` no longer includes `sdkCoreMessages`, the English catalogue, with bundlers that rely on `@__PURE__` annotations, such as esbuild and webpack with Terser: an esbuild bundle of `SdkError` alone goes from 714 to 185 bytes, minified and brotli-compressed. A bundle that doesn't use `SdkError`, such as one that imports only `plural`, no longer includes it. `isSdkError` works as before, including for errors from older copies of sdk-core.

## 0.1.1

### Patch Changes

- [#22](https://github.com/hussmartinez/sdk-core/pull/22) [`06f2162`](https://github.com/hussmartinez/sdk-core/commit/06f2162f3563d6329ee8664ea22d6ff95c5c8ac4) Thanks [@hussmartinez](https://github.com/hussmartinez)! - Add npm version, CI and licence badges to the README, and replace the outdated "not published yet" status with the package's `0.x` status.

## 0.1.0

### Minor Changes

- [#18](https://github.com/hussmartinez/sdk-core/pull/18) [`eb00396`](https://github.com/hussmartinez/sdk-core/commit/eb003962dce7f1922bb2906788f1d43d10210c18) Thanks [@hussmartinez](https://github.com/hussmartinez)! - First release of `@hussmartinez/sdk-core`, the headless runtime shared by the `@hussmartinez` SDKs. It's ESM only, has no dependencies, and does nothing on import, so it's safe to load during server rendering.
  
  - **Errors.** `SdkError` carries a stable `code`, serialisable `details` and a standard `cause`. Each SDK subclasses it and narrows the codes. `isSdkError()` recognises these errors across realms and duplicate copies of the package. `serializeError()` and `deserializeError()` carry them across worker boundaries, rebuilding the right subclass and treating received data as untrusted.
  - **Worker messaging.** `createWorkerClient()` and `exposeWorker()` form a small, typed RPC layer over one contract interface shared by the page and the worker.
    - Calls start the worker lazily, report progress, and can be cancelled with an `AbortSignal`. A worker that can't stop is terminated and recreated on demand.
    - Inputs are copied unless you transfer them, and results are transferred. Views into part of a buffer, such as WebAssembly memory, are copied safely.
    - Failures arrive with specific codes, such as `WORKER_CRASHED` or `TIMEOUT`. `onCrash` reports crashes even when no call is waiting.
  - **Messages.** `createMessages()` renders a typed message catalogue as plain text.
    - Placeholders and plural forms are type-checked, and numbers, file sizes and dates are formatted with `Intl` for the locale you pass.
    - Hosts can override any message, including from a translator's JSON file, and invalid overrides fall back to English.
    - Error text is looked up by code, so users never see internal error messages. `sdkCoreMessages` provides the English text for sdk-core's own codes.
  - **File policy.** `defineLimits()` and `coreLimits` let each SDK enforce limits on untrusted files: file size, number of files, decoded size and processing time.
    - Hosts configure them through `filePolicy`, and mistyped names are reported instead of ignored.
    - `check()` warns when a file is large but allowed, and rejects it with a specific code and details when it's over the limit.
    - `checkFile()`, `checkFiles()`, `createDecodedSizeBudget()` and `withProcessingTime()` apply the limits before and during decoding.
  
  The public API is tracked in an API report, and every release is published with npm provenance.
