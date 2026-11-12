# 0028. Third-party engines: no code from file data, proven offline, and their own workers

- **Status:** Accepted
- **Date:** 2026-11-12
- **Supersedes:** the rule in [ADR 0012](0012-hostile-input-and-no-network.md) that pdf.js runs with `isEvalSupported: false`; the rest of 0012 stands
- **Refines:** [ADR 0011](0011-worker-messaging-and-assets.md) and [ADR 0018](0018-worker-rpc-protocol.md), which govern the workers an SDK writes, by saying how an engine's own worker is treated

## Context

`pdf-sdk`, the first SDK, adopted three third-party engines: pdf.js, qpdf compiled to WebAssembly, and pdf-lib (`pdf-sdk`'s [ADR 0001](https://github.com/ie-huss-martinez/pdf-sdk/blob/main/docs/adr/0001-pdf-engines.md) and [ADR 0002](https://github.com/ie-huss-martinez/pdf-sdk/blob/main/docs/adr/0002-workers-and-assets.md)). Doing so showed three gaps in the family's rules, and every later SDK will meet them too, with ONNX Runtime, LibRaw or ffmpeg:

- **The eval rule names an option that's gone.** [ADR 0012](0012-hostile-input-and-no-network.md) requires pdf.js to run with `isEvalSupported: false`. pdf.js 6 no longer has that option: it compiles PostScript functions to WebAssembly or interprets them. The rule can't be followed as written, and its intent, that a file must never become code, isn't stated anywhere.
- **"No network requests" doesn't say how an engine is proven offline.** Engines fetch data by URL by default. pdf.js 6 loads CMaps, standard font data, an ICC profile and its WebAssembly decoders from URLs, and when a decoder is missing it `import()`s a JavaScript fallback from a relative URL. Ordinary test documents don't trigger any of this, so a suite can pass while a scanned or CJK document makes a request.
- **[ADR 0011](0011-worker-messaging-and-assets.md) and [ADR 0018](0018-worker-rpc-protocol.md) assume the SDK writes its workers.** pdf.js's display layer talks to its own worker with its own protocol, which can't be replaced by `sdk-core`'s RPC. The ADRs don't say whether that's allowed.

## Decision

### No code generated from file data

- **No engine may turn file data into code.** No `eval`, `new Function`, string `setTimeout` or `setInterval`, or anything equivalent, may run on content that comes from a file. WebAssembly modules that the SDK itself bundles are not file data, and compiling them is allowed.
- **Proven by a build test:** each SDK has a test that scans the built chunks containing engine code, the worker chunks included, and fails if any contains `eval(` or `new Function`. A new engine version that brings code generation back fails the build, whatever its options are called.
- **Engine options that enable code generation are turned off** where they exist, and scripting features stay off, such as pdf.js's scripting and XFA.
- **The Content Security Policy never needs `'unsafe-eval'`.** `'wasm-unsafe-eval'` is enough for WebAssembly, in both asset modes of [ADR 0011](0011-worker-messaging-and-assets.md). An SDK whose documented CSP needs `'unsafe-eval'` breaks this rule.

### Engines are proven offline

- **An engine never fetches anything itself.** Every data file it needs comes from the SDK's asset provider, either inlined or from the host's origin through `assets` ([ADR 0011](0011-worker-messaging-and-assets.md)), and never from the engine's default URLs or a CDN. Examples are character maps, fonts, colour profiles, decoders and models.
- **Fallbacks that load code by URL are left out of the bundle,** such as pdf.js's JavaScript decoder fallbacks. If a feature then can't work, it fails with `UNSUPPORTED_ENVIRONMENT`, rather than reaching for the network.
- **Unknown asset requests fail closed.** The provider serves only files from its bundled set, so a crafted document can't make it read an arbitrary path or URL.
- **Proven with fixtures that exercise those paths.** Each SDK's end-to-end suite includes documents that make its engines load every kind of data they can load. For PDFs, that's JBIG2 and JPX images, CJK text without embedded fonts, and CMYK colour. In inline mode, the suite asserts that the page makes no request at all beyond itself and its scripts; in self-hosted mode, only requests to the host's own asset URLs. Where an engine has a loading step of its own, such as compiling WebAssembly, a unit test also proves it never calls `fetch`.

### An engine's own worker protocol

- **ADRs 0011 and 0018 govern the workers an SDK writes,** which always use `sdk-core`'s typed RPC.
- **An engine's own worker protocol is allowed when it can't be replaced,** as with pdf.js's display layer and worker. In that case the SDK's adapter around it gives callers the same guarantees as [ADR 0018](0018-worker-rpc-protocol.md):
  - **copied inputs:** buffers are copied before the engine transfers them, unless the caller passes `transfer: true`;
  - **abort:** an `AbortSignal` cancels the engine's work, rejecting with `ABORTED` or `TIMEOUT`, or with the abort reason when it's an `SdkError` ([ADR 0020](0020-file-policy.md));
  - **time limits:** work runs under `withProcessingTime`;
  - **termination:** if the engine doesn't settle after a cancel, the adapter terminates its worker, fails the work still pending on it with `WORKER_TERMINATED`, and creates a new worker on demand;
  - **error codes:** the engine's errors become the SDK's `SdkError` codes, and a worker crash fails pending work with `WORKER_CRASHED`;
  - **lifetimes and isolation:** the worker starts lazily, is cleaned up with its owner, and the adapter sets no global engine state, such as pdf.js's `GlobalWorkerOptions`, so another copy of the engine on the page isn't affected.
- **The adapter's contract tests cover each guarantee.**

## Alternatives considered

- **Keep naming each engine's options in the standards:** the rule broke at pdf.js's next major version, and every new engine would need its own entry. Stating the intent and testing the built output holds across engines and versions.
- **Rely on the existing end-to-end network test alone:** it only proves the paths its documents happen to exercise, and ordinary documents don't make engines load data.
- **Require every engine to run inside `sdk-core`'s RPC:** not possible for pdf.js, whose text layer and font loading need the page, and it would rule out engines with their own worker architecture.

## Consequences

- The rules apply to every engine and every version, and a regression shows up as a failing build or end-to-end test, not as a review finding.
- Each SDK carries the build scan, fixtures that exercise its engines' data paths, and, for an engine with its own worker, an adapter and its contract tests. `pdf-sdk` already has all three.
- An engine that can't be configured to stay offline, or that generates code from file data with no way to turn it off, can't be adopted. Its replacement is chosen in the SDK's own ADR.
