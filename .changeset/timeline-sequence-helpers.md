---
"@hussmartinez/sdk-core": minor
---

Adds timeline helpers for a sequence of items, such as clips, in whole units like samples or frames:

- `sequenceOffsets(lengths)` returns every boundary: the items' starts, then the total length.
- `locate(offsets, position)` returns `{ index, within }` for the item under a position, or `undefined` at or past the end. A position on a boundary belongs to the item that starts there.
- `snap(position, targets, tolerance)` returns the nearest target within the tolerance, the earlier one on a tie, or the position itself.

Lengths, positions, targets and tolerances must be safe integers, or they throw `RangeError`.

```ts
const offsets = sequenceOffsets([48_000, 24_000]); // [0, 48000, 72000]
locate(offsets, 50_000); // { index: 1, within: 2000 }
```
