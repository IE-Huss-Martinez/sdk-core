---
"@hussmartinez/sdk-core": minor
---

Adds support for self-hosted workers that must match the page's version, and for resolving `assetsUrl`:

- `exposeWorker(handlers, { packageVersion })` announces the version the worker was built from.
- `createWorkerClient({ packageVersion, workerAsset })` refuses a worker that announces another version, or none, with `WORKER_START_FAILED` and `details` of `{ asset, expected, actual }`, before any call reaches it. This catches a self-hosted worker left over from before an upgrade. Clients without `packageVersion` behave as before.
- `resolveAssetsBase(assetsUrl)` resolves an SDK's `assetsUrl` against the page to an absolute URL ending in `/`, and throws `TypeError` for a relative URL with no page, as during server rendering, or a URL with a query or fragment.

The worker protocol's version is unchanged: the new field is optional, and older clients ignore it.
