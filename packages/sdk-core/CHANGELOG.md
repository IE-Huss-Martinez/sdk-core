# @hussmartinez/sdk-core

## 0.4.4

### Patch Changes

- [#122](https://github.com/ie-huss-martinez/sdk-core/pull/122) [`8b25404`](https://github.com/ie-huss-martinez/sdk-core/commit/8b25404d31f6fd24c201befb78d8e6543c879b70) Thanks [@hussmartinez](https://github.com/hussmartinez)! - Add `createAssetsResolver(assetsUrl)`, so an SDK's `assetsUrl` can be relative to the page, such as `"/video-sdk/"`, when its editor renders on the server. It checks the URL at once, and throws a `TypeError` on a server too, for a URL that can't be parsed or that has a query or fragment. It returns `(path) => string`, which resolves the URL against the page on its first call, once. Create engines with it, and call it where a worker starts:
  
  ```ts
  const asset = createAssetsResolver(options.assetsUrl);
  new Worker(asset("audio/audio.worker.js"), { type: "module" });
  ```
  
  `resolveAssetsBase` is unchanged, except that its error for a relative URL during server rendering now suggests `createAssetsResolver`.

## 0.4.3

### Patch Changes

- [#117](https://github.com/ie-huss-martinez/sdk-core/pull/117) [`d2c893c`](https://github.com/ie-huss-martinez/sdk-core/commit/d2c893c6e64169d77802374426e4082b68093e7d) Thanks [@hussmartinez](https://github.com/hussmartinez)! - `{size, fileSize}` now writes sizes under a kilobyte with the locale's plural, such as "1 byte" and "297 bytes" in English, "297 octets" in French and "297 bajtów" in Polish, instead of "297 byte". Kilobytes and larger units are unchanged, such as "1.3 MB". A size that would round to 1000 of a unit moves up to the next one, so 999,960 bytes is "1 MB" rather than "1,000 kB".

## 0.4.2

### Patch Changes

- [#106](https://github.com/ie-huss-martinez/sdk-core/pull/106) [`dab5a65`](https://github.com/ie-huss-martinez/sdk-core/commit/dab5a65c80abffb4848fcbe0228839e5d3c82a60) Thanks [@hussmartinez](https://github.com/hussmartinez)! - In development, sdk-core now warns once when a second copy of it is used on the page, naming both versions. Errors from one copy aren't `instanceof SdkError` of another, so use `isSdkError`. `npm ls @hussmartinez/sdk-core` shows where each copy comes from. Production builds drop the check, and importing sdk-core still has no side effects.

- [#108](https://github.com/ie-huss-martinez/sdk-core/pull/108) [`c5cf0ac`](https://github.com/ie-huss-martinez/sdk-core/commit/c5cf0acd84620ad33dd507a9caebe7be66feb776) Thanks [@hussmartinez](https://github.com/hussmartinez)! - Shortcuts no longer fire for keys pressed inside a modal `<dialog>` that sits between the key's target and the editor's root, such as an export dialog inside the editor. A key there belongs to the dialog, as it already did for text fields and controls. Before, `]` on a radio button in such a dialog could rotate an image.
  
  `match` takes the editor's root as a new option, `match(event, { root })`, and otherwise uses the event's `currentTarget`. From a React handler, pass the synthetic event's `currentTarget`, `match(event.nativeEvent, { root: event.currentTarget })`, so shortcuts keep working when a host renders the editor inside its own modal dialog. `KeyboardEventLike` also gains an optional `currentTarget`, which DOM events already have.

## 0.4.1

### Patch Changes

- [#101](https://github.com/ie-huss-martinez/sdk-core/pull/101) [`4e163f9`](https://github.com/ie-huss-martinez/sdk-core/commit/4e163f99e796daa0786aa0c2a41dca62203be1d4) Thanks [@hussmartinez](https://github.com/hussmartinez)! - `createMessages` accepts overrides typed as `MessageOverrides<Catalogue>`, such as an SDK's `messages` prop, without a cast. Before, a plural typed only as `PluralMessage` made every key look like an unknown placeholder, so SDKs passed `overrides as never`. You can remove that cast. Overrides written as literals are still checked as before, plurals included, and untyped JSON is still checked at runtime.

## 0.4.0

### Minor Changes

- [#87](https://github.com/ie-huss-martinez/sdk-core/pull/87) [`d53bb53`](https://github.com/ie-huss-martinez/sdk-core/commit/d53bb53faa8edfe69eb3e50d3031109fe54330ea) Thanks [@hussmartinez](https://github.com/hussmartinez)! - Adds the `@hussmartinez/sdk-core/element` entry, for SDKs' custom elements:
  
  - `createEditorElement({ kind, attributes, properties, methods, events, mount })` returns `define(tagName?)`, which registers `hm-<kind>-editor` and returns its class.
    - The element renders into the light DOM through the SDK's `mount`.
    - Properties set before the element was upgraded are applied.
    - Changes are batched into one `update` per microtask.
    - Moving the element keeps the editor; removing it unmounts the editor.
    - Methods throw `InvalidStateError` while the element is disconnected.
    - `dispatch` fires bubbling, composed `hm-<kind>-editor-<name>` events.
    - Importing the entry touches no browser API, and `define` throws `UNSUPPORTED_ENVIRONMENT` on a server.
  - `adoptSharedStyleSheet({ name, version, cssText })` adopts a standalone script's styles once per page. It shares them with other standalone scripts on the same minor (or major, after 1.0), and warns when two lines meet.

- [#91](https://github.com/ie-huss-martinez/sdk-core/pull/91) [`9df040b`](https://github.com/ie-huss-martinez/sdk-core/commit/9df040b35fb8faa1589273d1e10fd722195dd91e) Thanks [@hussmartinez](https://github.com/hussmartinez)! - Adds timeline helpers for a sequence of items, such as clips, in whole units like samples or frames:
  
  - `sequenceOffsets(lengths)` returns every boundary: the items' starts, then the total length.
  - `locate(offsets, position)` returns `{ index, within }` for the item under a position, or `undefined` at or past the end. A position on a boundary belongs to the item that starts there.
  - `snap(position, targets, tolerance)` returns the nearest target within the tolerance, the earlier one on a tie, or the position itself.
  
  Lengths, positions, targets and tolerances must be safe integers, or they throw `RangeError`.
  
  ```ts
  const offsets = sequenceOffsets([48_000, 24_000]); // [0, 48000, 72000]
  locate(offsets, 50_000); // { index: 1, within: 2000 }
  ```

### Patch Changes

- [#89](https://github.com/ie-huss-martinez/sdk-core/pull/89) [`f711f13`](https://github.com/ie-huss-martinez/sdk-core/commit/f711f13e1b8003dbd4f879e76aaaa540fd51b029) Thanks [@hussmartinez](https://github.com/hussmartinez)! - The built JavaScript no longer carries TSDoc comments: the `.` entry is about a third smaller before your bundler minifies it, and `./element` is about 40% smaller. The documentation is unchanged in the `.d.ts` files and the source maps, and `@__PURE__` annotations stay, so tree-shaking works as before.

## 0.3.0

### Minor Changes

- [#79](https://github.com/ie-huss-martinez/sdk-core/pull/79) [`74ea418`](https://github.com/ie-huss-martinez/sdk-core/commit/74ea4186a9030af078cdd297d146e286b6911a15) Thanks [@hussmartinez](https://github.com/hussmartinez)! - Limits can use the new `"bitsPerSecond"` unit, for data rates such as a video's bitrate. It's reported in a violation's `details.unit`, like the other units.

- [#62](https://github.com/ie-huss-martinez/sdk-core/pull/62) [`fee1a01`](https://github.com/ie-huss-martinez/sdk-core/commit/fee1a0137408e3e3579d467fd1fcbea697e49262) Thanks [@hussmartinez](https://github.com/hussmartinez)! - Messages can format durations with `{name, duration}`. It takes milliseconds and shows hours, minutes and seconds for the locale, leaving out units that are zero: `"Length: {length, duration}"` with `{ length: 11_100_000 }` reads "Length: 3 hr, 5 min" in English. Durations are rounded to the nearest second, and zero is "0 sec". A negative or non-finite value is left out, with a development warning, as a missing parameter is.
  
  Limits can use the new `"hertz"` unit, for rates such as a sample rate or a frame rate.

- [#68](https://github.com/ie-huss-martinez/sdk-core/pull/68) [`cfc781e`](https://github.com/ie-huss-martinez/sdk-core/commit/cfc781e4e294492ccfaf6a63692a7e5748724fdd) Thanks [@hussmartinez](https://github.com/hussmartinez)! - Adds `createErrorHelpers(errorClass, { fallbackCode, fallbackMessage })`, which returns `adapt`, `abortError` and `throwIfAborted` for an SDK's own error class:
  
  - `adapt(reason, message?)` returns the SDK's error as it is, keeps another `SdkError`'s code, message and details, and gives anything else the fallback code. The original is the `cause`.
  - `abortError(signal)` keeps an `SdkError` reason's code, such as `PROCESSING_TIME_EXCEEDED`, makes a `TimeoutError` `TIMEOUT`, and anything else `ABORTED`.
  - `throwIfAborted(signal)` throws that error once the signal has aborted.
  
  ```ts
  export const { adapt: asAudioError, abortError, throwIfAborted } = createErrorHelpers(AudioError, {
    fallbackCode: "UNKNOWN",
    fallbackMessage: "Audio processing failed.",
  });
  ```

- [#75](https://github.com/ie-huss-martinez/sdk-core/pull/75) [`d3c5306`](https://github.com/ie-huss-martinez/sdk-core/commit/d3c5306683e9e8e42bf9a05cc8d2f65936285d57) Thanks [@hussmartinez](https://github.com/hussmartinez)! - Messages can format pixel counts with `{name, megapixels}`. It shows the count in millions for the locale, with up to one fraction digit, and the message gives the unit: `"The image is {actual, megapixels} megapixels."` with `{ actual: 24_159_744 }` reads "The image is 24.2 megapixels." in English. A negative or non-finite value is left out, with a development warning.

- [#69](https://github.com/ie-huss-martinez/sdk-core/pull/69) [`ac41fd4`](https://github.com/ie-huss-martinez/sdk-core/commit/ac41fd48edbc9d5df2f9a84d5fa529b1b88a6cc2) Thanks [@hussmartinez](https://github.com/hussmartinez)! - Adds `createWindowReader(file, { windowSize })`, for probes and parsers that walk a `Blob` in small steps. `bytes(offset, length)` answers from a window read 1 MiB at a time by default, returns fewer bytes at the end of the file and none past it, and never holds more than the rest of the file. Results are views into the window, so don't modify them. An offset, length or window size that isn't a non-negative integer (positive, for the window size) throws `RangeError`.
  
  ```ts
  const reader = createWindowReader(file);
  const header = await reader.bytes(0, 12);
  ```

- [#71](https://github.com/ie-huss-martinez/sdk-core/pull/71) [`a8f3005`](https://github.com/ie-huss-martinez/sdk-core/commit/a8f3005d319faf460b9f213ae1201bcde780ec05) Thanks [@hussmartinez](https://github.com/hussmartinez)! - Adds support for self-hosted workers that must match the page's version, and for resolving `assetsUrl`:
  
  - `exposeWorker(handlers, { packageVersion })` announces the version the worker was built from.
  - `createWorkerClient({ packageVersion, workerAsset })` refuses a worker that announces another version, or none, with `WORKER_START_FAILED` and `details` of `{ asset, expected, actual }`, before any call reaches it. This catches a self-hosted worker left over from before an upgrade. Clients without `packageVersion` behave as before.
  - `resolveAssetsBase(assetsUrl)` resolves an SDK's `assetsUrl` against the page to an absolute URL ending in `/`, and throws `TypeError` for a relative URL with no page, as during server rendering, or a URL with a query or fragment.
  
  The worker protocol's version is unchanged: the new field is optional, and older clients ignore it.

### Patch Changes

- [#76](https://github.com/ie-huss-martinez/sdk-core/pull/76) [`703189a`](https://github.com/ie-huss-martinez/sdk-core/commit/703189a0b6f7dd5707de6b1bdce6cdba3c254663) Thanks [@hussmartinez](https://github.com/hussmartinez)! - Production bundles no longer carry the text of sdk-core's development warnings. Each warning is now guarded inline by `process.env.NODE_ENV`, which bundlers replace and fold away, so an application that only uses `createMessages` ships about 200 bytes less, compressed. Behaviour is unchanged: warnings still print in development, and never in production.

- [#81](https://github.com/ie-huss-martinez/sdk-core/pull/81) [`2b59dc2`](https://github.com/ie-huss-martinez/sdk-core/commit/2b59dc2f37251315bb3cd6851e7bf95a69466a9e) Thanks [@hussmartinez](https://github.com/hussmartinez)! - 0.1.3 and 0.2.0 were published without their built files (`dist/`), so importing them failed. This release is built and checked before publishing: every file that `package.json` points to must be in the tarball. If you're on 0.1.3 or 0.2.0, upgrade.

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
