# 0038. Self-hosted assets: one `assetsUrl`, and workers that must match the page's version

- **Status:** Accepted
- **Date:** 2026-11-12
- **Refines:** [ADR 0011](0011-worker-messaging-and-assets.md)'s self-hosted option, and [ADR 0018](0018-worker-rpc-protocol.md)'s `ready` message

## Context

[ADR 0011](0011-worker-messaging-and-assets.md) lets strict-CSP hosts serve an SDK's workers and WebAssembly from their own origin, and describes the option as `assets: { workerUrl, wasmUrl, … }`. The SDKs did it differently, and more simply: `pdf-sdk` and `audio-sdk` both take one `assetsUrl`, where the host serves the package's `dist/assets/` directory, and find each file under it. Both have the same `src/adapters/assets-url.ts` to resolve it.

Self-hosting adds a failure that inlined workers can't have. After an upgrade, a host that forgets to copy `dist/assets/` again serves the old worker. It speaks the same protocol, so [ADR 0018](0018-worker-rpc-protocol.md)'s protocol version doesn't catch it, but it runs other code: older parsers and limits, or results in a shape the page no longer expects. `audio-sdk` #19 added a check: the worker reports its package version through an extra `version` method, and the engine refuses a mismatch with `WORKER_START_FAILED` and `{ asset, expected, actual }`. Every SDK with self-hosted workers needs the same.

## Decision

### `assetsUrl`

- **One option:** every SDK's self-hosted option is `assetsUrl`, the URL where the host serves the package's `dist/assets/` directory, absolute or relative to the page. The SDK documents the files under it. This replaces [ADR 0011](0011-worker-messaging-and-assets.md)'s `assets: { workerUrl, wasmUrl, … }`: one URL is less to configure, and the SDK can add or move files without changing its API.
- **`resolveAssetsBase(assetsUrl)`** in `sdk-core` resolves it to an absolute URL ending in `/`, against the page or, inside a worker, the worker's own URL. SDKs resolve each file against it with `new URL(path, base)`.
- **Mistakes fail when the SDK is set up,** with `TypeError`: a relative URL where there's no page to resolve it against, as during server rendering, and a URL with a query or fragment, which the resolved files would silently lose.

### The worker's package version

- **The worker announces it:** `exposeWorker(handlers, { packageVersion })` adds `packageVersion` to [ADR 0018](0018-worker-rpc-protocol.md)'s `ready` message. The field is optional, and older clients ignore it, so the protocol version stays 1.
- **The client checks it:** `createWorkerClient({ packageVersion, workerAsset })` refuses a worker that announces another version, or none, before any call reaches it. It fails like any other start failure: `WORKER_START_FAILED`, with `details` of `{ asset, expected, actual }`, reported to `onCrash`, the worker terminated, and a new one tried on the next call. `asset` is `workerAsset`, or `null`; `actual` is `null` when the worker announces none.
- **SDKs pass their own version** to both, from their build, for inlined and self-hosted workers alike. An inlined worker always matches, so the check costs nothing there.

## Alternatives considered

- **A `version` method in each SDK's contract,** as `audio-sdk` #19 did: it works, but each SDK writes the call and the error itself, and a mismatch is found only after a round trip, outside the client's start-failure handling and `onCrash`.
- **A new protocol version for the field:** an optional field that older peers ignore needs none. Bumping it would make every page and worker built before this change refuse each other.
- **Comparing file hashes:** catches more, such as a corrupted copy, but needs a manifest generated at build time and fetched at run time. A version mismatch is the failure that actually happens.
- **Keep `assets: { workerUrl, … }`:** more flexible, since files could live on different origins, but no host has needed that, and every new asset would need a new option.

## Consequences

- `pdf-sdk` and `audio-sdk` replace their `assets-url.ts` with `resolveAssetsBase`. `audio-sdk` replaces its `version` method with `packageVersion`, and `pdf-sdk` gets the check its self-hosted workers don't have yet. The image SDK starts with both.
- Hosts that forget to copy `dist/assets/` after an upgrade get a clear start failure naming the asset and both versions, instead of subtly wrong behaviour.
- `ExposeWorkerOptions`, `WorkerClientOptions` and `resolveAssetsBase` become public API of `@hussmartinez/sdk-core`.
