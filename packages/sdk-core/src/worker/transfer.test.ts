import { describe, expect, it, vi } from "vitest";
import { postWithFallback, prepareMessage } from "./transfer.js";

describe("prepareMessage", () => {
  it("transfers the buffer of a view that covers it, only when asked", () => {
    const view = new Uint8Array(8);

    expect(prepareMessage({ view }, true)).toEqual({
      value: { view },
      transferables: [view.buffer],
    });
    expect(prepareMessage({ view }, false).transferables).toEqual([]);
  });

  it("copies only the bytes of a view into part of a buffer, and never transfers it", () => {
    const whole = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
    const part = whole.subarray(2, 5);
    const { value, transferables } = prepareMessage({ part }, true);
    const copy = (value as { part: Uint8Array }).part;

    expect(copy).toBeInstanceOf(Uint8Array);
    expect([...copy]).toEqual([2, 3, 4]);
    expect(copy.buffer.byteLength).toBe(3);
    expect(transferables).toEqual([]);
  });

  it("keeps the view type, including DataView", () => {
    const buffer = new ArrayBuffer(16);
    const { value } = prepareMessage(
      [new Float64Array(buffer, 8, 1), new DataView(buffer, 4, 4)],
      true,
    );
    const [floats, data] = value as [Float64Array, DataView];

    expect(floats).toBeInstanceOf(Float64Array);
    expect(floats.length).toBe(1);
    expect(data).toBeInstanceOf(DataView);
    expect(data.byteLength).toBe(4);
  });

  it("copies views over a SharedArrayBuffer and never transfers them", () => {
    const view = new Uint8Array(new SharedArrayBuffer(4));
    const { value, transferables } = prepareMessage(view, true);

    expect((value as Uint8Array).buffer).toBeInstanceOf(ArrayBuffer);
    expect(transferables).toEqual([]);
  });

  it("lists bare ArrayBuffers and MessagePorts for transfer, each once", () => {
    const buffer = new ArrayBuffer(4);
    const { port1 } = new MessageChannel();
    const { transferables } = prepareMessage({ a: buffer, b: buffer, port: port1 }, true);

    expect(transferables).toEqual([buffer, port1]);
    port1.close();
  });

  it("walks arrays, maps and sets, without mutating the caller's value", () => {
    const part = new Uint8Array(8).subarray(0, 2);
    const input = { list: [part], map: new Map([["k", part]]), set: new Set([part]) };
    const { value } = prepareMessage(input, false);
    const output = value as typeof input;

    expect(output).not.toBe(input);
    expect(input.list[0]).toBe(part);
    expect(output.list[0]?.buffer.byteLength).toBe(2);
    expect(output.map.get("k")?.buffer.byteLength).toBe(2);
    expect([...output.set][0]?.buffer.byteLength).toBe(2);
  });

  it("returns containers unchanged when nothing inside needs copying", () => {
    const input = { nested: { list: [1, "two", { three: true }] } };
    expect(prepareMessage(input, true).value).toBe(input);
  });

  it("handles cycles", () => {
    const input: { self?: unknown; part: Uint8Array } = { part: new Uint8Array(4).subarray(1) };
    input.self = input;
    const { value } = prepareMessage(input, false);
    const output = value as typeof input;

    expect(output.self).toBe(output);
    expect(output.part.byteLength).toBe(3);
  });
});

describe("postWithFallback", () => {
  it("posts once with the transfer list when that works", () => {
    const post = vi.fn();
    const buffer = new ArrayBuffer(1);
    postWithFallback(post, "message", [buffer]);

    expect(post).toHaveBeenCalledExactlyOnceWith("message", [buffer]);
  });

  it("retries without transferring when posting with transfers throws", () => {
    const post = vi.fn().mockImplementationOnce(() => {
      throw new TypeError("not detachable");
    });
    postWithFallback(post, "message", [new ArrayBuffer(1)]);

    expect(post).toHaveBeenLastCalledWith("message", []);
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("throws when the message can't be sent even without transfers", () => {
    const failure = new DOMException("Could not be cloned.", "DataCloneError");
    const post = vi.fn(() => {
      throw failure;
    });

    expect(() => postWithFallback(post, "message", [new ArrayBuffer(1)])).toThrow(failure);
    expect(() => postWithFallback(post, "message", [])).toThrow(failure);
  });
});
