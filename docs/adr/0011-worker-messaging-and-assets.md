# 0011. Typed worker messaging, with inline or self-hosted assets

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

Parsing and transforming media is CPU-heavy and must not block the page, so it runs in Web Workers, often with WebAssembly. Every SDK needs the same plumbing:

- request and response matching;
- cancellation and progress;
- moving large buffers without copying;
- errors that keep their codes across the boundary;
- worker lifetimes.

Getting worker and WebAssembly files into the host's build is a common integration failure. Inlining them avoids bundler configuration, but blob-URL workers are blocked by strict Content Security Policies.

## Decision

### Messaging

`sdk-core` provides `createWorkerClient` and `exposeWorker`, a small typed RPC layer:

- **Typed, versioned messages.** A protocol version mismatch between page and worker fails with a clear error instead of misbehaving.
- **Cancellation:** every call accepts an `AbortSignal`. Aborting sends a cancel message. Work that can't stop mid-way, such as a WebAssembly call already in progress, ends by terminating the worker, which is then recreated on demand.
- **Progress:** an optional `onProgress` callback, for long operations.
- **Buffer ownership:** input buffers are copied before being sent unless the caller passes `transfer: true`, so a caller's bytes are never detached by surprise. Results are always transferred, without copying.
- **Errors:** `SdkError` subclasses are serialised with their `code`, `details` and message, and rebuilt on the other side.
- **Lifetimes:** workers start lazily, can be warmed up early, terminate after an idle timeout, and are cleaned up when their owner is destroyed.

### Assets

- **Inline by default:** worker and WebAssembly assets are inlined, so the SDKs work in any bundler without configuration. This requires `worker-src blob:` and `script-src 'wasm-unsafe-eval'` in the host's Content Security Policy.
- **Self-hosted option:** every SDK accepts `assets: { workerUrl, wasmUrl, … }`. The package also ships the asset files, so strict-CSP sites can serve them from their own origin.
- **Documentation:** each SDK's README documents the exact CSP directives for both modes.

## Alternatives considered

- **Comlink:** mature, but it proxies arbitrary objects and functions, which makes the message contract implicit and harder to version. Our needs are a small, explicit subset.
- **Requiring bundler configuration for workers (`new URL(…, import.meta.url)`):** the most common source of "works in Vite, breaks in Next.js" reports.
- **Inline only:** excludes sites with strict Content Security Policies, which often includes the security-conscious users who want client-side processing in the first place.

## Consequences

- Workers behave identically across SDKs, and their protocol is tested once in `sdk-core`.
- Inlined assets increase the size of the lazily loaded chunks. Size budgets track this ([0015](0015-verification-and-releases.md)).
- Two asset modes must both be tested end to end.
