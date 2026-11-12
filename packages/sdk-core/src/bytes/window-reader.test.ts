import { describe, expect, it, vi } from "vitest";
import { createWindowReader } from "./window-reader.js";

/** A file of `size` bytes where each byte is its offset modulo 256, with its reads counted. */
function counted(size: number) {
  const bytes = Uint8Array.from({ length: size }, (_, index) => index % 256);
  const file = new Blob([bytes]);
  const slice = vi.spyOn(file, "slice");
  return { file, slice };
}

/** The bytes the counted file has from `offset` to `end`. */
const expected = (offset: number, end: number) =>
  Uint8Array.from({ length: end - offset }, (_, index) => (offset + index) % 256);

describe("createWindowReader", () => {
  it("reports the file's size", () => {
    expect(createWindowReader(new Blob(["abc"])).size).toBe(3);
  });

  it("reads small steps from one window, with one Blob read", async () => {
    const { file, slice } = counted(1000);
    const reader = createWindowReader(file, { windowSize: 100 });

    expect(await reader.bytes(0, 4)).toEqual(expected(0, 4));
    expect(await reader.bytes(4, 10)).toEqual(expected(4, 14));
    expect(await reader.bytes(90, 10)).toEqual(expected(90, 100));
    expect(slice).toHaveBeenCalledTimes(1);
    expect(slice).toHaveBeenLastCalledWith(0, 100);
  });

  it("reads a new window from the offset when the bytes aren't in the current one", async () => {
    const { file, slice } = counted(1000);
    const reader = createWindowReader(file, { windowSize: 100 });

    await reader.bytes(0, 4);
    expect(await reader.bytes(95, 10)).toEqual(expected(95, 105));
    expect(slice).toHaveBeenLastCalledWith(95, 195);
    // Backwards, before the window's start.
    expect(await reader.bytes(10, 2)).toEqual(expected(10, 12));
    expect(slice).toHaveBeenLastCalledWith(10, 110);
    expect(slice).toHaveBeenCalledTimes(3);
  });

  it("reads a whole request that's larger than the window", async () => {
    const { file, slice } = counted(1000);
    const reader = createWindowReader(file, { windowSize: 100 });

    expect(await reader.bytes(10, 300)).toEqual(expected(10, 310));
    expect(slice).toHaveBeenLastCalledWith(10, 310);
  });

  it("returns fewer bytes at the end of the file, and none at or past it", async () => {
    const { file, slice } = counted(1000);
    const reader = createWindowReader(file, { windowSize: 100 });

    expect(await reader.bytes(990, 64)).toEqual(expected(990, 1000));
    expect(slice).toHaveBeenLastCalledWith(990, 1000);
    expect(await reader.bytes(1000, 4)).toEqual(new Uint8Array(0));
    expect(await reader.bytes(5000, 4)).toEqual(new Uint8Array(0));
    expect(await reader.bytes(10, 0)).toEqual(new Uint8Array(0));
  });

  it("never reads past the end of the file, whatever the length", async () => {
    const { file, slice } = counted(1000);
    const reader = createWindowReader(file);

    expect(await reader.bytes(0, Number.MAX_SAFE_INTEGER)).toEqual(expected(0, 1000));
    expect(slice).toHaveBeenLastCalledWith(0, 1000);
  });

  it("uses a 1 MiB window by default", async () => {
    const { file, slice } = counted(3 << 20);
    const reader = createWindowReader(file);

    await reader.bytes(0, 4);
    expect(slice).toHaveBeenLastCalledWith(0, 1 << 20);
  });

  it("keeps earlier results valid after the window moves", async () => {
    const { file } = counted(1000);
    const reader = createWindowReader(file, { windowSize: 100 });

    const first = await reader.bytes(0, 4);
    await reader.bytes(500, 4);

    expect(first).toEqual(expected(0, 4));
  });

  it("answers concurrent reads with their own bytes", async () => {
    const { file } = counted(1000);
    const reader = createWindowReader(file, { windowSize: 100 });

    const [low, high] = await Promise.all([reader.bytes(0, 8), reader.bytes(700, 8)]);

    expect(low).toEqual(expected(0, 8));
    expect(high).toEqual(expected(700, 708));
  });

  it.each([
    ["offset", -1, 4],
    ["offset", 1.5, 4],
    ["offset", Number.NaN, 4],
    ["length", 0, -1],
    ["length", 0, Number.POSITIVE_INFINITY],
  ])("rejects an invalid %s with a RangeError", async (_name, offset, length) => {
    const reader = createWindowReader(new Blob(["abc"]));

    await expect(reader.bytes(offset, length)).rejects.toBeInstanceOf(RangeError);
  });

  it.each([0, -1, 2.5, Number.NaN])("throws a RangeError for a window size of %s", (windowSize) => {
    expect(() => createWindowReader(new Blob(["abc"]), { windowSize })).toThrow(RangeError);
  });

  it("rejects with the Blob's own error when the file can't be read", async () => {
    const failure = new DOMException("Gone.", "NotReadableError");
    const file = new Blob(["abc"]);
    vi.spyOn(file, "slice").mockReturnValue({
      arrayBuffer: () => Promise.reject(failure),
    } as unknown as Blob);

    await expect(createWindowReader(file).bytes(0, 2)).rejects.toBe(failure);
  });
});
