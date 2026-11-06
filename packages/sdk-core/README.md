# @hussmartinez/sdk-core

Headless runtime shared by the `@hussmartinez` SDK family: worker messaging, errors, session primitives, the tool registry, the custom-element base, file policy and the messages helper.

The package is ESM only, has no dependencies, and does nothing on import, so it's safe to load on a server ([ADR 0004](../../docs/adr/0004-entry-points-and-module-format.md)).

> Status: not published yet. Errors and worker messaging are available; the rest of the API lands in upcoming pull requests.

## Errors

Every SDK throws one subclass of `SdkError`, with a stable `code`, serialisable `details` and a standard `cause` ([ADR 0008](../../docs/adr/0008-ports-adapters-and-session.md)). Codes are `SCREAMING_SNAKE_CASE` and never change once released. User-facing text is looked up by code in the messages catalogue, never taken from `message` ([ADR 0014](../../docs/adr/0014-accessibility-and-translatable-text.md)).

```ts
import { isSdkError, SdkError } from "@hussmartinez/sdk-core";

type PdfErrorCode = "FILE_TOO_LARGE" | "PDF_ENCRYPTED";

export class PdfError extends SdkError<PdfErrorCode> {
  override readonly name = "PdfError";
}

throw new PdfError("FILE_TOO_LARGE", "The file exceeds the size limit.", {
  details: { limit: 52_428_800, size: 73_400_320 },
});
```

- **Subclasses** narrow `code` to their own union and set `name` explicitly, so it survives minification. They keep the base constructor's signature `(code, message, options)`, so errors can be rebuilt after crossing a worker boundary.
- **`details`** accept JSON-compatible values only: strings, finite numbers, booleans, `null`, arrays and plain objects.
- **`isSdkError(value, code?)`** narrows a caught value, optionally to one code. It recognises errors from other realms and from duplicate copies of sdk-core, where `instanceof` fails, through a shared brand. Errors that merely look similar, such as Node errors with a string `code`, aren't accepted.

### Across a worker boundary

`structuredClone` and `postMessage` drop an error's `code` and `details`. Serialise errors explicitly instead:

```ts
// In the worker
port.postMessage({ error: serializeError(error) });

// On the page
const error = deserializeError(message.error, { errorClasses: { PdfError } });
error instanceof PdfError; // true
```

- **`serializeError(error, options?)`** turns any thrown value into plain data and never throws for the value itself. Values that aren't `SdkError`s get the code `UNKNOWN`. Their original name goes in `details.originalName`, or their `typeof` in `details.thrownType`. Stack traces are left out unless you pass `includeStack: true`, so they don't cross the boundary in production.
- **`deserializeError(data, options?)`** rebuilds the error with its registered class, or as `SdkError` keeping its name. It treats the data as untrusted: invalid input becomes an `UNKNOWN` error, details are sanitised again, and class names are only looked up as own keys of `errorClasses`.
- **Both** follow the `cause` chain up to `maxDepth` levels (8 by default) and stop at cycles.

## Workers

`createWorkerClient` and `exposeWorker` are a small, typed, versioned RPC layer for SDK workers ([ADR 0011](../../docs/adr/0011-worker-messaging-and-assets.md), [ADR 0018](../../docs/adr/0018-worker-rpc-protocol.md)). One interface describes the methods, and both sides are checked against it:

```ts
// contract.ts
export interface PdfWorker {
  render: { input: { bytes: ArrayBuffer; page: number }; output: ImageBitmap; progress: number };
}
```

```ts
// pdf.worker.ts: call exposeWorker first, and load WebAssembly lazily
exposeWorker<PdfWorker>({
  async render({ bytes, page }, { signal, progress }) {
    const engine = await loadEngine();
    return engine.render(bytes, page, { signal, onProgress: progress });
  },
});
```

```ts
// On the page
const client = createWorkerClient<PdfWorker>({
  createWorker: () => new Worker(new URL("./pdf.worker.js", import.meta.url), { type: "module" }),
  errorClasses: { PdfError },
});

const bitmap = await client.call("render", { bytes, page: 1 }, { signal, onProgress });
```

- **Lifetimes:** the worker starts on the first call or `start()`, stops after `idleTimeout` without calls (30 s by default), and is recreated when needed. `destroy()` stops it for good.
- **Start-up:** `exposeWorker` must run before any heavy initialisation. The client waits up to `startTimeout` (10 s) for the worker to announce itself, and that should measure start-up, not WebAssembly compilation.
- **Cancellation:** an aborted call rejects at once with code `ABORTED`, or `TIMEOUT` when the signal timed out, with the signal's reason as `cause`. These aren't `AbortError`s. The handler's `signal` is aborted. If the call is still running after `cancelTimeout` (1 s), the worker is terminated, and other calls on it fail with `WORKER_TERMINATED`. Nothing is retried automatically.
- **Buffers:** inputs are copied unless you pass `transfer: true`, which detaches them. Results are transferred, so handlers must return buffers they no longer need. Views into part of a buffer, such as WebAssembly memory, are always copied, and only their bytes. An input or result that can't be cloned, such as one containing a function, fails that call with `WORKER_DATA_NOT_CLONEABLE`.
- **Errors:** handler errors arrive rebuilt with `deserializeError`, so `PdfError` codes survive. Errors that escape the handlers, and failures to start, arrive as `WORKER_CRASHED`, `WORKER_START_FAILED` or `WORKER_PROTOCOL_MISMATCH`.
- **Crash reporting:** pass `onCrash` to hear about those three failures even when no call is pending. SDKs should forward it to their host's `onEvent` or error reporting. Expected shutdowns, such as the idle timeout, `destroy()` or a stuck call being stopped, don't trigger it.

## API report

The public API is recorded in [`api/sdk-core.api.md`](api/sdk-core.api.md) by api-extractor ([ADR 0015](../../docs/adr/0015-verification-and-releases.md)). `pnpm check:api`, part of `verify` and `verify:fast`, fails when the API changes without the report. After an intended change, run `pnpm api:update` and commit the updated report with the change.

## Tests

`pnpm test` runs the unit tests in Node. `pnpm test:browser` runs the browser tests, with real workers, in Chromium. `pnpm test:browser:all` runs them in Chromium, Firefox and WebKit, as CI does. Install the browsers once with `pnpm exec playwright install`.

## License

[Apache-2.0](../../LICENSE)
