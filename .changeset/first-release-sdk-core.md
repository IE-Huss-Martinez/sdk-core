---
"@hussmartinez/sdk-core": minor
---

First release of `@hussmartinez/sdk-core`, the headless runtime shared by the `@hussmartinez` SDKs. It's ESM only, has no dependencies, and does nothing on import, so it's safe to load during server rendering.

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
