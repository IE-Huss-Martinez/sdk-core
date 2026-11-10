---
"@hussmartinez/sdk-core": patch
---

Bundlers can now drop the code you don't import. A bundle that imports `SdkError`, `createMessages` or `createWorkerClient` no longer includes `sdkCoreMessages`, the English catalogue, with bundlers that rely on `@__PURE__` annotations, such as esbuild and webpack with Terser: an esbuild bundle of `SdkError` alone goes from 714 to 185 bytes, minified and brotli-compressed. A bundle that doesn't use `SdkError`, such as one that imports only `plural`, no longer includes it. `isSdkError` works as before, including for errors from older copies of sdk-core.
