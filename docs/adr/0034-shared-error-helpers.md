# 0034. Shared helpers that adapt failures to an SDK's error class

- **Status:** Accepted
- **Date:** 2026-11-12
- **Refines:** [ADR 0018](0018-worker-rpc-protocol.md) and [ADR 0020](0020-file-policy.md)'s abort rules, by giving SDKs one implementation of them

## Context

Every port an SDK defines promises to reject with the SDK's own error class, such as `PdfError` or `AudioError` ([ADR 0008](0008-ports-adapters-and-session.md)). [ADR 0018](0018-worker-rpc-protocol.md), as [ADR 0020](0020-file-policy.md) amended it, fixes what an aborted operation rejects with: the signal's reason when it's an `SdkError`, `TIMEOUT` for a `TimeoutError`, and `ABORTED` otherwise.

`pdf-sdk` and `audio-sdk` each have `src/core/errors/abort.ts`, with the same three functions: `as<Kind>Error`, `abortError` and `throwIfAborted`. They differ only in the error class and the code for unknown failures (`PROCESSING_FAILED` and `UNKNOWN`). The image SDK would make a third copy. Copies drift, and this one already had a small flaw: it recognises timeouts with `instanceof DOMException`, which fails for a reason from another realm, such as an iframe, where the worker client's own check, by name, doesn't.

## Decision

`sdk-core`'s root entry adds `createErrorHelpers(errorClass, { fallbackCode, fallbackMessage })`. It returns:

- **`adapt(reason, message?)`:** the SDK's error as it is; another `SdkError` with its code, message and details, and itself as `cause`; anything else with the fallback code, the given or fallback message, and itself as `cause`.
- **`abortError(signal)`:** an `SdkError` reason adapted as above, so a file policy's `PROCESSING_TIME_EXCEEDED` keeps its code and details; `TIMEOUT` for a reason named `TimeoutError`; `ABORTED` otherwise. The reason is the `cause`.
- **`throwIfAborted(signal)`:** throws `abortError(signal)` when the signal has aborted.

The types require the class's codes to include `ABORTED` and `TIMEOUT`, which every SDK's codes do by including `SdkCoreErrorCode`, and the fallback code to be one of the class's codes. An SDK keeps its own names by destructuring:

```ts
export const { adapt: asAudioError, abortError, throwIfAborted } = createErrorHelpers(AudioError, {
  fallbackCode: "UNKNOWN",
  fallbackMessage: "Audio processing failed.",
});
```

## Alternatives considered

- **Keep a copy in each SDK:** they'd drift, as the `instanceof DOMException` check already shows.
- **Fix one fallback code for the family:** an SDK's code for unknown failures is part of its own catalogue, with its own message, such as `pdf-sdk`'s `PROCESSING_FAILED` for an engine failure. Each SDK chooses its own, as it chooses its other codes.
- **Functions that take the class on every call:** more to write at every call site, for no benefit.

## Consequences

- `pdf-sdk` and `audio-sdk` replace their `abort.ts` with these helpers, and the image SDK starts with them. Each SDK's own tests of the semantics can shrink to one test of its wiring.
- A timeout reason from another realm becomes `TIMEOUT` in every SDK, as it already does in the worker client.
- These become public API of `@hussmartinez/sdk-core`.
- The worker client's own `abortError` could use the same mapping later. It returns plain `SdkError`s with slightly different messages, so it's left as it is here.
