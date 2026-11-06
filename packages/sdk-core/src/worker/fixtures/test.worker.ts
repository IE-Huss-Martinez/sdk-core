import { exposeWorker } from "../expose.js";
import { PdfError, type TestWorker } from "./contract.js";

const cache = new Uint8Array(16).map((_, index) => index);
let lastFreshBuffer: ArrayBuffer | undefined;

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason);
    });
  });

exposeWorker<TestWorker>({
  echo: (input) => input,
  async progress({ steps }, { progress, signal }) {
    for (let step = 1; step <= steps; step += 1) {
      await sleep(5, signal);
      progress(step);
    }
    return "done";
  },
  async wait({ ms }, { signal }) {
    await sleep(ms, signal);
    return "waited";
  },
  spin({ ms }) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      // Busy loop: the worker can't process the cancel message.
    }
    return "spun";
  },
  fail({ code }) {
    throw new PdfError(code, "Failed on purpose.", { details: { code } });
  },
  byteLength: ({ data }) => data.byteLength,
  freshBuffer() {
    lastFreshBuffer = new Uint8Array([1, 2, 3, 4]).buffer;
    return lastFreshBuffer;
  },
  lastFreshBufferDetached: () => lastFreshBuffer?.byteLength === 0,
  cacheSlice: () => cache.subarray(4, 8),
  cacheByteLength: () => cache.byteLength,
  wasmView({ whole }) {
    const memory = new WebAssembly.Memory({ initial: 1 });
    const bytes = new Uint8Array(memory.buffer);
    bytes.set([7, 8, 9], 0);
    return whole ? bytes : bytes.subarray(0, 3);
  },
  notCloneable: () => ({ callback: () => undefined }),
  crashInTimer() {
    setTimeout(() => {
      throw new Error("Escaped from a timer.");
    }, 0);
    return "scheduled";
  },
  crashWithRejection() {
    void Promise.reject(new Error("Nobody handled this."));
    return "scheduled";
  },
});
