/** Throws `RangeError` unless the value is a safe integer of at least `minimum`. */
function checkUnits(name: string, value: number, minimum: number): void {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new RangeError(
      `${name} must be a whole number of units of at least ${minimum}, not ${String(value)}.`,
    );
  }
}

/**
 * Every boundary of a sequence of items, such as the clips of a timeline:
 * `[0, l₀, l₀ + l₁, …, total]`. The first `n` values are the items' starts,
 * and the last is the sequence's length (ADR 0042).
 *
 * Offsets are derived from the lengths, never stored, so they can't disagree
 * with them. Units are whole, such as samples or frames, never seconds.
 *
 * @example
 * ```ts
 * sequenceOffsets([48_000, 24_000]); // [0, 48000, 72000]
 * ```
 *
 * @param lengths - Each item's length, in whole units.
 * @returns The `n + 1` boundaries, frozen.
 * @throws `RangeError` if a length isn't a positive safe integer, or the
 *   total isn't a safe integer.
 * @public
 */
export function sequenceOffsets(lengths: readonly number[]): readonly number[] {
  const offsets = [0];
  let total = 0;
  for (const [index, length] of lengths.entries()) {
    checkUnits(`Length ${index}`, length, 1);
    total += length;
    checkUnits("The total length", total, 0);
    offsets.push(total);
  }
  return Object.freeze(offsets);
}

/**
 * Where a position falls in a sequence: the item under it, and the position
 * within that item, from {@link locate}.
 *
 * @public
 */
export interface SequenceLocation {
  /** The item's index. */
  readonly index: number;
  /** The position within the item: at least 0, and less than its length. */
  readonly within: number;
}

/**
 * The item under a position, found with a binary search (ADR 0042). A
 * position exactly on a boundary belongs to the item that starts there.
 *
 * @example
 * ```ts
 * const offsets = sequenceOffsets([10, 20]);
 * locate(offsets, 10); // { index: 1, within: 0 }
 * locate(offsets, 30); // undefined: the total length is past the end
 * ```
 *
 * @param offsets - The boundaries from {@link sequenceOffsets}. They aren't
 *   checked again.
 * @param position - A position in whole units.
 * @returns The item and the position within it, or `undefined` at or past
 *   the end, and for an empty sequence.
 * @throws `RangeError` if `position` isn't a non-negative safe integer.
 * @public
 */
export function locate(offsets: readonly number[], position: number): SequenceLocation | undefined {
  checkUnits("The position", position, 0);
  const items = offsets.length - 1;
  const total = offsets[items] ?? 0;
  if (items < 1 || position >= total) {
    return undefined;
  }
  // The last item whose start is at or before the position.
  let low = 0;
  let high = items - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if ((offsets[middle] ?? 0) <= position) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return { index: low, within: position - (offsets[low] ?? 0) };
}

/**
 * The nearest target within `tolerance` of a position, or the position
 * itself when none is (ADR 0042). Ties go to the earlier target.
 *
 * The tolerance is in whole units too. A UI converts its pixel tolerance with
 * `Math.round(snapPixels × unitsPerPixel)`.
 *
 * @example
 * ```ts
 * snap(1_005, [0, 1_000, 2_000], 10); // 1000
 * snap(1_500, [0, 1_000, 2_000], 10); // 1500
 * ```
 *
 * @param position - The position to snap, in whole units.
 * @param targets - Positions to snap to, such as boundaries, the playhead or
 *   markers, in any order.
 * @param tolerance - The largest distance that snaps, in whole units.
 * @throws `RangeError` if the position, a target or the tolerance isn't a
 *   non-negative safe integer.
 * @public
 */
export function snap(position: number, targets: Iterable<number>, tolerance: number): number {
  checkUnits("The position", position, 0);
  checkUnits("The tolerance", tolerance, 0);
  let best = position;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const target of targets) {
    checkUnits("A target", target, 0);
    const distance = Math.abs(target - position);
    if (
      distance <= tolerance &&
      (distance < bestDistance || (distance === bestDistance && target < best))
    ) {
      best = target;
      bestDistance = distance;
    }
  }
  return best;
}
