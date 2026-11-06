# 0020. File policy: typed limits with warnings, shared by every SDK

- **Status:** Accepted
- **Date:** 2026-11-06
- **Supersedes:** the rule in [ADR 0018](0018-worker-rpc-protocol.md) that every abort reason becomes `ABORTED` or `TIMEOUT`

## Context

[ADR 0012](0012-hostile-input-and-no-network.md) requires every SDK to enforce limits on file size, page or frame count, pixel count, decoded size and processing time. Exceeding a limit must fail with a specific error code, limits must be configurable through `filePolicy`, and defaults must be safe. It doesn't say:

- how limits are named and typed, or how an SDK adds its own;
- which codes and defaults sdk-core owns;
- how hosts can disable a limit;
- how users learn that a file is allowed but will be slow. The original PDF editor warned at 100 MB and rejected at 300 MB.

A time limit also has to reach the worker client. [ADR 0018](0018-worker-rpc-protocol.md) turns every abort reason into `ABORTED` or `TIMEOUT`, which would lose the limit's code and details.

## Decision

### Limits are definitions that SDKs extend

- **The definition:** a limit has a name, an error code, a unit (`bytes`, `count`, `milliseconds` or `pixels`), a default maximum and an optional default warning threshold.
- **Defining an SDK's limits:** `defineLimits(definitions, { errorClass })` defines an SDK's limits, usually the core limits plus its own. Violations are thrown as the SDK's error class, such as `PdfError`.
- **Resolving a policy:** `limits.resolve(filePolicy)` applies a host's settings. Each setting is a number (a new maximum) or `{ maximum, warning }`. The result is a typed, validated policy.

sdk-core keeps only the media-agnostic limits. Each SDK adds the limits specific to its kind, such as pages, pixels or duration.

### Core limits

| Limit | Code | Default maximum | Default warning |
|---|---|---|---|
| `maxFileSize` | `FILE_TOO_LARGE` | 100 MB | 50 MB |
| `maxFiles` | `TOO_MANY_FILES` | 20 | none |
| `maxDecodedSize` | `DECODED_SIZE_TOO_LARGE` | 500 MB | none |
| `maxProcessingTime` | `PROCESSING_TIME_EXCEEDED` | 120 s | none |

Sizes are decimal (1 MB = 1 000 000 bytes), as in messages ([0019](0019-message-catalogues.md)). SDKs may change the defaults for their kind.

### Checking

- **`policy.check(limit, actual)`:**
  - throws the SDK's error class when `actual` is above the maximum, with `details: { limit, maximum, actual, unit }`;
  - returns `"warning"` when `actual` is at or above the warning threshold but within the maximum, and otherwise returns `undefined`.

  A returned value rather than a thrown one keeps the common case, "allowed", free of exception handling, and leaves the UI to decide how to show the warning.
- **`policy.error(limit, actual)`** builds the same error, for limits measured another way, such as elapsed time.
- **Helpers enforce limits before or during decoding:**
  - `checkFile` checks the size before reading;
  - `checkFiles` checks the count, then each size;
  - `createDecodedSizeBudget` is fed chunk by chunk while decompressing, so a decompression bomb fails as soon as it passes the limit;
  - `processingSignal` aborts after `maxProcessingTime`.

### Settings are validated

- **Positive numbers only:** a maximum or warning must be a positive number or `Infinity`. Zero, negative numbers, `NaN` and non-numbers throw `RangeError` or `TypeError`.
- **Unknown names throw.** An unknown limit name, or an unknown key in a setting, throws `TypeError` rather than being ignored. This is security configuration, so a typo like `maxFilesize` must not silently leave the default in place.
- **`Infinity`** disables a maximum, which removes a protection against hostile files and is documented as such, or disables a warning.

### Text

Error text uses the `errors.<CODE>` keys of [ADR 0019](0019-message-catalogues.md), with the error's `details` as parameters. Warnings use `warnings.<limit>` keys, such as `warnings.maxFileSize`. `sdkCoreMessages` provides English text for every core code and every core limit's warning, and a type check fails if one is missing.

### Time limits and the worker client

- **`processingSignal(policy, signal?)`** combines the caller's signal with a timer, using `AbortSignal.any`. When the time is up, it aborts with the policy's `PROCESSING_TIME_EXCEEDED` error as the reason. The timer is cleared when either signal aborts.
- **Feature detection:** `processingSignal` checks for `AbortSignal.any` when it's called, not at import. If it's missing, it fails with `UNSUPPORTED_ENVIRONMENT` and `details.feature`, as [ADR 0013](0013-browser-and-react-support.md) requires. `UNSUPPORTED_ENVIRONMENT` joins sdk-core's codes.
- **This supersedes part of ADR 0018:** when a call's abort reason is already an `SdkError`, the worker client rejects with that error unchanged. Other reasons still become `ABORTED`, or `TIMEOUT` for a `TimeoutError`. This lets the policy, and SDKs, cancel calls with their own codes and details.

## Alternatives considered

- **A fixed `FilePolicy` interface listing every limit of every kind:** it would put page, pixel and duration limits into sdk-core, and change sdk-core for every new kind.
- **Separate warning callbacks:** they spread one concern over two code paths. A returned `"warning"` is simpler to test and to render.
- **Ignoring unknown settings, as message overrides do:** acceptable for text, but for limits it hides misconfiguration of a security control.
- **Keeping `TIMEOUT` for time limits:** it needs no change to ADR 0018, but users and hosts couldn't tell a policy limit from the caller's own timeout, and the details naming the limit would be lost.

## Consequences

- Every SDK enforces the same core limits with the same codes, details and text, and hosts configure all SDKs the same way.
- Users can be told when a file is allowed but may be slow.
- An SDK adding a limit adds its definition, its error code, and `errors.*` and `warnings.*` text.
- A host's misspelt limit fails loudly when the policy is resolved.
