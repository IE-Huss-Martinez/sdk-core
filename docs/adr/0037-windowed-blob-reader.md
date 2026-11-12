# 0037. A windowed `Blob` reader for probes and parsers

- **Status:** Accepted
- **Date:** 2026-11-12

## Context

[ADR 0031](0031-platform-decoders-on-the-page.md) requires an SDK to probe a file in a worker before a platform decoder sees it: the SDK's own parser walks every packet or frame to bound the decoded output. [ADR 0012](0012-hostile-input-and-no-network.md) holds that parser to the bar for hostile input.

Such a probe reads a file in many small steps, such as a 4-byte frame header and then the next one. Reading each step from the `Blob` would make thousands of asynchronous reads, and reading the whole file at once would hold all of it in memory. `audio-sdk` solved this with `WindowReader` (`src/adapters/bytes/window-reader.ts`): it reads 1 MiB at a time and answers small reads from that window. Its MP3, AAC, Ogg and FLAC probes use it. The image SDK's probes need the same, and video's will too.

The copy is internal, so it doesn't check its arguments: a negative or fractional offset, or a length that isn't a number, gives wrong bytes rather than an error.

## Decision

`sdk-core`'s root entry adds `createWindowReader(file, { windowSize })`, which returns `{ size, bytes(offset, length) }`:

- **Reads:** `bytes(offset, length)` returns up to `length` bytes at `offset`, fewer at the end of the file, and none at or past it. When they aren't in the current window, it reads a new window from `offset`, of `length` bytes or the window size (1 MiB by default), whichever is larger.
- **Memory is bounded by the file:** a window never extends past the end of the file, so a read never holds more than the rest of it. A hostile length, such as one taken from a header, costs at most the file's size, which the file policy already limits ([ADR 0020](0020-file-policy.md)). Probes that read more than the window at once, as `audio-sdk`'s scans do, keep working.
- **Arguments are checked:** `offset` and `length` must be non-negative integers, and `windowSize` a positive one. Anything else throws `RangeError`, since it's the calling code's mistake, not the file's.
- **Results are views:** each result is a view into the window, not a copy, so walking a file allocates nothing per step. It stays valid after the window moves, because every window is a new buffer. Callers mustn't modify it, because later reads from the same window would see the change.
- **Errors:** a `Blob` that can't be read rejects with its own error, such as `NotReadableError`, for the SDK to adapt with its error helpers ([ADR 0034](0034-shared-error-helpers.md)).
- **It's a factory returning an interface,** like `sdk-core`'s other primitives, not a class.

## Alternatives considered

- **Keep a copy in each SDK:** the copies would drift, and none checks its arguments.
- **Cap `length` at the window size:** it would bound reads more tightly, but break probes that read a step and a header beyond it. The file's size is already the real bound.
- **Return copies:** safer against callers that modify results, but a probe walking a file in small steps would allocate on every step.
- **Read the whole file once:** simplest, but it holds every byte of a large file in the worker's memory for a probe that reads a fraction of them.

## Consequences

- `audio-sdk` replaces its `WindowReader` with `createWindowReader`, and the image SDK's probes start with it.
- Arguments that the copy silently mishandled now throw `RangeError`.
- These become public API of `@hussmartinez/sdk-core`.
