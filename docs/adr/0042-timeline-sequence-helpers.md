# 0042. Timeline sequence helpers: offsets, locating a position, and snapping

- **Status:** Accepted
- **Date:** 2026-11-12
- **Refines:** `audio-sdk`'s and `video-sdk`'s ADR 0003, by sharing the arithmetic of their clip sequences

## Context

The audio and video SDKs model a document as a plan: an ordered sequence of clips over immutable sources, each a whole number of units long (samples in audio, output frames in video). Their ADR 0003s agree on the rules that matter:

- **Time on the timeline is whole units, never floating-point seconds,** which drift and can't name an exact sample or frame.
- **A clip's place is derived, never stored:** it's the sum of the lengths before it, so it can't disagree with the clips, and no rounding builds up along the timeline.

Each SDK already has the same `clipOffsets(plan)`, and `video-sdk` has `locateFrame`, which scans every clip to find the one under a position. Neither has snapping yet: video's ADR 0003 says only that "the UI snaps every edit to the grid". `ui`'s Timeline component, which both SDKs will render, needs all three:

- **offsets,** to lay out the clips;
- **locate,** to map the playhead and the pointer to a clip and a position within it, on every animation frame during playback;
- **snap,** to pull a dragged edge or playhead onto nearby clip boundaries, the playhead or markers.

Written three times, they'd differ at the edges: whether a position on a boundary belongs to the clip before or after it, what happens at the very end, and how ties between snap targets break.

## Decision

`sdk-core`'s root entry adds three pure functions over whole units. They know nothing of samples, frames or seconds; each SDK passes its own lengths.

### `sequenceOffsets(lengths)`

- **Returns every boundary:** `[0, l₀, l₀ + l₁, …, total]`, frozen, so `n` clips have `n + 1` boundaries. The first `n` are the clips' starts, and the last is the sequence's length. One array serves layout, `locate`, snap targets and the total.
- **Each length must be a positive safe integer,** as both SDKs' clips are at least one unit long, and the total must stay a safe integer. Anything else throws `RangeError`.
- **Safe integers are ample:** they reach 2⁵³ − 1, about 9 × 10¹⁵. A day of 192 kHz audio is about 1.7 × 10¹⁰ samples, and a day of 240 fps video about 2.1 × 10⁷ frames, so the check only rejects corrupt input.

### `locate(offsets, position)`

- **Returns `{ index, within }`:** the clip under `position`, and the position inside it. A position on a boundary belongs to the clip that starts there, so `within` is never negative and is always less than the clip's length.
- **`undefined` at or past the end,** where no clip is, and for an empty sequence. The total length is out of range: it isn't clamped to the last clip, because a playhead at the end shows nothing, and a caller that wants the last clip asks for `total − 1`.
- **A binary search,** `O(log n)`, so polling it on every animation frame stays cheap on timelines with thousands of clips.
- **`position` must be a non-negative safe integer,** or it throws `RangeError`. `offsets` must come from `sequenceOffsets`. It isn't checked again on each call, because that would cost the `O(n)` the search avoids.

### `snap(position, targets, tolerance)`

- **Returns the nearest target within `tolerance`,** or `position` itself when none is.
- **Ties go to the earlier target,** so snapping doesn't depend on the order targets are listed in.
- **Targets are any whole units the caller chooses:** the boundaries from `sequenceOffsets`, the playhead, markers, or a grid's lines.
- **The tolerance is in the same whole units, never pixels.** The UI converts it, because only it knows the zoom: `tolerance = Math.round(snapPixels × unitsPerPixel)`, where `unitsPerPixel` is the visible length in units divided by the timeline's width in CSS pixels. A fixed pixel tolerance, such as 8 CSS pixels, makes snapping feel the same at every zoom level; `ui`'s Timeline chooses its value.
- **`position`, every target and `tolerance` must be non-negative safe integers,** or it throws `RangeError`.

## Alternatives considered

- **Keep a copy in each SDK:** the boundary and tie rules would differ between audio and video, and `ui`'s Timeline would need one adapter for each.
- **Floating-point seconds:** they drift, and can't name an exact sample or frame. Both SDKs' ADR 0003s rule them out.
- **Store each clip's offset:** stored offsets can disagree with the clips after an edit, which the SDKs' ADR 0003s rule out.
- **A linear `locate`, as `video-sdk` has:** simpler, but it scans every clip on every animation frame during playback.
- **Return only the clips' starts, as `clipOffsets` does:** callers would compute the total separately, and `locate` and snapping would each need it.
- **Snapping in `ui`:** `ui` is React, and headless code, such as keyboard nudges in a session or tests, needs the same rule.

## Consequences

- **The migration path:** once a release of `sdk-core` with these helpers has passed their `minimumReleaseAge`, `audio-sdk` and `video-sdk` move their `clipOffsets` and `locateFrame` onto them in follow-up pull requests, each with no change in behaviour, and keep their own units and validation of clips. `clipOffsets(plan)` becomes the first `n` boundaries of `sequenceOffsets`, and `locateFrame` keeps its own source-time mapping on top of `locate`.
- `ui`'s Timeline lays out, locates and snaps with the same functions as the SDKs' sessions, so the playhead, the pointer and keyboard edits agree.
- These become public API of `@hussmartinez/sdk-core`.
