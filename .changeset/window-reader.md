---
"@hussmartinez/sdk-core": minor
---

Adds `createWindowReader(file, { windowSize })`, for probes and parsers that walk a `Blob` in small steps. `bytes(offset, length)` answers from a window read 1 MiB at a time by default, returns fewer bytes at the end of the file and none past it, and never holds more than the rest of the file. Results are views into the window, so don't modify them. An offset, length or window size that isn't a non-negative integer (positive, for the window size) throws `RangeError`.

```ts
const reader = createWindowReader(file);
const header = await reader.bytes(0, 12);
```
