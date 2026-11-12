import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { locate, sequenceOffsets, snap } from "./sequence.js";

describe("sequenceOffsets", () => {
  it("returns every boundary: the starts, then the total", () => {
    expect(sequenceOffsets([48_000, 24_000, 1])).toEqual([0, 48_000, 72_000, 72_001]);
    expect(sequenceOffsets([])).toEqual([0]);
  });

  it("freezes the result", () => {
    expect(Object.isFrozen(sequenceOffsets([1, 2]))).toBe(true);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects a length of %s",
    (length) => {
      expect(() => sequenceOffsets([10, length])).toThrow(RangeError);
      expect(() => sequenceOffsets([10, length])).toThrow(/Length 1 must be/);
    },
  );

  it("accepts lengths up to the largest safe integer", () => {
    expect(sequenceOffsets([Number.MAX_SAFE_INTEGER])).toEqual([0, Number.MAX_SAFE_INTEGER]);
    expect(() => sequenceOffsets([Number.MAX_SAFE_INTEGER + 1])).toThrow(/Length 0 must be/);
  });

  it("rejects a total past the safe integers", () => {
    expect(() => sequenceOffsets([Number.MAX_SAFE_INTEGER, 1])).toThrow(/The total length/);
    expect(sequenceOffsets([Number.MAX_SAFE_INTEGER - 1, 1]).at(-1)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("keeps a day of 192 kHz audio exact", () => {
    const hour = 3_600 * 192_000;
    expect(sequenceOffsets(Array.from({ length: 24 }, () => hour)).at(-1)).toBe(24 * hour);
  });
});

describe("locate", () => {
  const offsets = sequenceOffsets([10, 20, 5]);

  it("finds the item under a position, and the position within it", () => {
    expect(locate(offsets, 0)).toEqual({ index: 0, within: 0 });
    expect(locate(offsets, 9)).toEqual({ index: 0, within: 9 });
    expect(locate(offsets, 29)).toEqual({ index: 1, within: 19 });
    expect(locate(offsets, 34)).toEqual({ index: 2, within: 4 });
  });

  it("gives a position on a boundary to the item that starts there", () => {
    expect(locate(offsets, 10)).toEqual({ index: 1, within: 0 });
    expect(locate(offsets, 30)).toEqual({ index: 2, within: 0 });
  });

  it("returns undefined at the total length and past it, and for an empty sequence", () => {
    expect(locate(offsets, 35)).toBeUndefined();
    expect(locate(offsets, 1_000)).toBeUndefined();
    expect(locate(sequenceOffsets([]), 0)).toBeUndefined();
  });

  it("agrees with a linear scan at every position of a long sequence", () => {
    const lengths = Array.from({ length: 257 }, (_, index) => (index % 7) + 1);
    const bounds = sequenceOffsets(lengths);
    const total = bounds.at(-1) ?? 0;
    let index = 0;
    for (let position = 0; position < total; position += 1) {
      while (position >= (bounds[index + 1] ?? 0)) {
        index += 1;
      }
      expect(locate(bounds, position)).toEqual({ index, within: position - (bounds[index] ?? 0) });
    }
    expect(locate(bounds, total)).toBeUndefined();
  });

  it("places every position below the total inside its item (property)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 1_000_000 }), { minLength: 1, maxLength: 200 }),
        fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true }),
        (lengths, fraction) => {
          const bounds = sequenceOffsets(lengths);
          const total = bounds.at(-1) ?? 0;
          const position = Math.floor(fraction * total);
          const found = locate(bounds, position);
          expect(found).toBeDefined();
          const { index, within } = found ?? { index: -1, within: -1 };
          expect((bounds[index] ?? 0) + within).toBe(position);
          expect(within).toBeGreaterThanOrEqual(0);
          expect(within).toBeLessThan(lengths[index] ?? 0);
        },
      ),
    );
  });

  it("accepts positions up to the largest safe integer", () => {
    expect(locate(sequenceOffsets([Number.MAX_SAFE_INTEGER]), Number.MAX_SAFE_INTEGER - 1)).toEqual(
      {
        index: 0,
        within: Number.MAX_SAFE_INTEGER - 1,
      },
    );
    expect(() => locate(offsets, Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
  });

  it.each([-1, 0.5, Number.NaN])("rejects a position of %s", (position) => {
    expect(() => locate(offsets, position)).toThrow(RangeError);
  });
});

describe("snap", () => {
  const targets = [0, 1_000, 2_000];

  it("snaps to the nearest target within the tolerance", () => {
    expect(snap(1_005, targets, 10)).toBe(1_000);
    expect(snap(995, targets, 10)).toBe(1_000);
    expect(snap(1_010, targets, 10)).toBe(1_000);
  });

  it("keeps the position when no target is within the tolerance", () => {
    expect(snap(1_011, targets, 10)).toBe(1_011);
    expect(snap(1_500, [], 10)).toBe(1_500);
  });

  it("prefers the nearer target, and the earlier one on a tie, in any order", () => {
    expect(snap(1_004, [1_010, 1_000], 10)).toBe(1_000);
    expect(snap(1_005, [1_010, 1_000], 10)).toBe(1_000);
    expect(snap(1_005, [1_000, 1_010], 10)).toBe(1_000);
    expect(snap(1_006, [1_000, 1_010], 10)).toBe(1_010);
  });

  it("snaps only exact matches with a tolerance of 0", () => {
    expect(snap(1_000, targets, 0)).toBe(1_000);
    expect(snap(1_001, targets, 0)).toBe(1_001);
  });

  it("takes any iterable of targets", () => {
    expect(snap(1_998, new Set(targets), 5)).toBe(2_000);
  });

  it("returns the position or a target within the tolerance, with none strictly closer (property)", () => {
    const units = fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER });
    fc.assert(
      fc.property(
        units,
        fc.array(units, { maxLength: 50 }),
        fc.integer({ min: 0, max: 2 ** 40 }),
        (position, points, tolerance) => {
          const result = snap(position, points, tolerance);
          const distance = (value: number) => Math.abs(value - position);
          if (result !== position || points.includes(position)) {
            expect(points).toContain(result);
            expect(distance(result)).toBeLessThanOrEqual(tolerance);
          }
          for (const point of points) {
            if (distance(point) <= tolerance) {
              expect(distance(point)).toBeGreaterThanOrEqual(distance(result));
            }
          }
          if (!points.some((point) => distance(point) <= tolerance)) {
            expect(result).toBe(position);
          }
        },
      ),
    );
  });

  it("rejects an invalid position, tolerance or target", () => {
    expect(() => snap(-1, targets, 10)).toThrow(/The position/);
    expect(() => snap(1, targets, 0.5)).toThrow(/The tolerance/);
    expect(() => snap(1, [0, Number.NaN], 10)).toThrow(/A target/);
    expect(() => snap(Number.MAX_SAFE_INTEGER + 1, targets, 10)).toThrow(/The position/);
    expect(snap(Number.MAX_SAFE_INTEGER, [Number.MAX_SAFE_INTEGER - 1], 1)).toBe(
      Number.MAX_SAFE_INTEGER - 1,
    );
  });
});
