---
"@hussmartinez/sdk-core": minor
---

Adds `createErrorHelpers(errorClass, { fallbackCode, fallbackMessage })`, which returns `adapt`, `abortError` and `throwIfAborted` for an SDK's own error class:

- `adapt(reason, message?)` returns the SDK's error as it is, keeps another `SdkError`'s code, message and details, and gives anything else the fallback code. The original is the `cause`.
- `abortError(signal)` keeps an `SdkError` reason's code, such as `PROCESSING_TIME_EXCEEDED`, makes a `TimeoutError` `TIMEOUT`, and anything else `ABORTED`.
- `throwIfAborted(signal)` throws that error once the signal has aborted.

```ts
export const { adapt: asAudioError, abortError, throwIfAborted } = createErrorHelpers(AudioError, {
  fallbackCode: "UNKNOWN",
  fallbackMessage: "Audio processing failed.",
});
```
