import { afterEach, describe, expect, it } from "vitest";
import { isSdkError } from "../errors/sdk-error.js";
import { createWorkerClient, type WorkerClient, type WorkerClientOptions } from "./client.js";
import { PdfError, type TestWorker } from "./fixtures/contract.js";

const clients: Array<WorkerClient<never>> = [];

afterEach(() => {
  for (const client of clients.splice(0)) {
    client.destroy();
  }
});

/** A client for the test worker that counts how many workers it created. */
function setup(options: Partial<WorkerClientOptions> = {}) {
  const created = { count: 0 };
  const client = createWorkerClient<TestWorker>({
    createWorker: () => {
      created.count += 1;
      return new Worker(new URL("./fixtures/test.worker.ts", import.meta.url), { type: "module" });
    },
    errorClasses: { PdfError },
    ...options,
  });
  clients.push(client as unknown as WorkerClient<never>);
  return { client, created };
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected the promise to reject.");
}

describe("worker RPC in a real browser", () => {
  it("calls a method and returns its output", async () => {
    const { client, created } = setup();

    await expect(client.call("echo", "hello")).resolves.toBe("hello");
    expect(created.count).toBe(1);
  });

  it("starts lazily, and start() warms the worker up", async () => {
    const { client, created } = setup();
    expect(created.count).toBe(0);

    await client.start();
    await client.call("echo", "x");
    expect(created.count).toBe(1);
  });

  it("reports progress", async () => {
    const { client } = setup();
    const updates: number[] = [];

    await client.call("progress", { steps: 3 }, { onProgress: (value) => updates.push(value) });
    expect(updates).toEqual([1, 2, 3]);
  });

  it("keeps SdkError subclasses and codes across the boundary", async () => {
    const { client } = setup();
    const error = await rejection(client.call("fail", { code: "PDF_ENCRYPTED" }));

    expect(error).toBeInstanceOf(PdfError);
    expect(error).toMatchObject({ code: "PDF_ENCRYPTED", details: { code: "PDF_ENCRYPTED" } });
  });

  describe("cancellation", () => {
    it("rejects with ABORTED at once, and a cooperative worker stays in use", async () => {
      const { client, created } = setup();
      await client.start();
      const controller = new AbortController();
      const call = client.call("wait", { ms: 10_000 }, { signal: controller.signal });

      const reason = new Error("User cancelled.");
      controller.abort(reason);
      const error = await rejection(call);

      expect(isSdkError(error, "ABORTED")).toBe(true);
      expect((error as Error).cause).toBe(reason);
      await expect(client.call("echo", "still here")).resolves.toBe("still here");
      expect(created.count).toBe(1);
    });

    it("rejects with TIMEOUT when the signal times out", async () => {
      const { client } = setup();
      const error = await rejection(
        client.call("wait", { ms: 10_000 }, { signal: AbortSignal.timeout(50) }),
      );

      expect(isSdkError(error, "TIMEOUT")).toBe(true);
      expect((error as Error).cause).toMatchObject({ name: "TimeoutError" });
    });

    it("terminates a worker that can't stop, fails its other calls and recreates it", async () => {
      const { client, created } = setup({ cancelTimeout: 100 });
      await client.start();
      const controller = new AbortController();
      const stuck = client.call("spin", { ms: 3_000 }, { signal: controller.signal });
      const bystander = client.call("wait", { ms: 10_000 });
      // Abort once the worker is busy. Aborting before the call is sent
      // rejects it without involving the worker at all.
      await new Promise((resolve) => setTimeout(resolve, 100));

      controller.abort();
      expect(isSdkError(await rejection(stuck), "ABORTED")).toBe(true);
      expect(isSdkError(await rejection(bystander), "WORKER_TERMINATED")).toBe(true);

      await expect(client.call("echo", "new worker")).resolves.toBe("new worker");
      expect(created.count).toBe(2);
    });
  });

  describe("buffers", () => {
    it("copies inputs by default, so the caller's buffer stays usable", async () => {
      const { client } = setup();
      const data = new Uint8Array([1, 2, 3]).buffer;

      await expect(client.call("byteLength", { data })).resolves.toBe(3);
      expect(data.byteLength).toBe(3);
    });

    it("transfers inputs with transfer: true, detaching the caller's buffer", async () => {
      const { client } = setup();
      const data = new Uint8Array([1, 2, 3]);

      await expect(client.call("byteLength", { data }, { transfer: true })).resolves.toBe(3);
      expect(data.buffer.byteLength).toBe(0);
    });

    it("copies only a view's bytes, even with transfer: true", async () => {
      const { client } = setup();
      const whole = new Uint8Array(1024);
      const data = whole.subarray(10, 20);

      await expect(client.call("byteLength", { data }, { transfer: true })).resolves.toBe(10);
      expect(whole.buffer.byteLength).toBe(1024);
    });

    it("transfers results instead of copying them", async () => {
      const { client } = setup();
      const output = await client.call("freshBuffer", undefined);

      expect([...new Uint8Array(output)]).toEqual([1, 2, 3, 4]);
      await expect(client.call("lastFreshBufferDetached", undefined)).resolves.toBe(true);
    });

    it("copies a result that views part of a buffer, without detaching it", async () => {
      const { client } = setup();
      const slice = await client.call("cacheSlice", undefined);

      expect([...slice]).toEqual([4, 5, 6, 7]);
      expect(slice.buffer.byteLength).toBe(4);
      await expect(client.call("cacheByteLength", undefined)).resolves.toBe(16);
    });

    it("copies results that view WebAssembly memory instead of failing", async () => {
      const { client } = setup();
      const whole = await client.call("wasmView", { whole: true });
      const part = await client.call("wasmView", { whole: false });

      expect(whole.byteLength).toBe(65_536);
      expect([...whole.subarray(0, 3)]).toEqual([7, 8, 9]);
      expect([...part]).toEqual([7, 8, 9]);
      expect(part.buffer.byteLength).toBe(3);
    });
  });

  describe("untrusted and non-cloneable data", () => {
    it.each(["missing", "constructor", "__proto__", "toString"])(
      "fails an unknown method %j with WORKER_METHOD_NOT_FOUND",
      async (method) => {
        const { client } = setup();
        const call = (client.call as (name: string, input: unknown) => Promise<unknown>)(
          method,
          null,
        );

        expect(isSdkError(await rejection(call), "WORKER_METHOD_NOT_FOUND")).toBe(true);
      },
    );

    it("fails a call whose result can't be cloned, and the worker stays usable", async () => {
      const { client, created } = setup();
      const error = await rejection(client.call("notCloneable", undefined));

      expect(error).toMatchObject({ code: "UNKNOWN", details: { originalName: "DataCloneError" } });
      await expect(client.call("echo", "fine")).resolves.toBe("fine");
      expect(created.count).toBe(1);
    });

    it("rejects only the call whose input can't be cloned", async () => {
      const { client } = setup();
      await client.start();
      const other = client.call("wait", { ms: 50 });
      const bad = client.call("echo", (() => "x") as unknown as string);

      const error = await rejection(bad);
      expect(error).toMatchObject({ code: "UNKNOWN", cause: { name: "DataCloneError" } });
      await expect(other).resolves.toBe("waited");
    });
  });

  describe("crashes", () => {
    it.each([
      ["an uncaught error", "crashInTimer"],
      ["an unhandled rejection", "crashWithRejection"],
    ] as const)("fails in-flight calls with WORKER_CRASHED after %s", async (_label, method) => {
      const { client, created } = setup();
      const inFlight = client.call("wait", { ms: 10_000 });
      await client.call(method, undefined);

      expect(isSdkError(await rejection(inFlight), "WORKER_CRASHED")).toBe(true);
      await expect(client.call("echo", "recreated")).resolves.toBe("recreated");
      expect(created.count).toBe(2);
    });
  });

  it("reports a crash through onCrash even when no call is pending", async () => {
    const crashes: unknown[] = [];
    const { client } = setup({ onCrash: (error) => crashes.push(error) });
    await client.call("crashInTimer", undefined);
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(crashes).toHaveLength(1);
    expect(isSdkError(crashes[0], "WORKER_CRASHED")).toBe(true);
  });

  describe("start-up failures", () => {
    it("fails with WORKER_PROTOCOL_MISMATCH when versions differ", async () => {
      const client = createWorkerClient<TestWorker>({
        createWorker: () =>
          new Worker(new URL("./fixtures/mismatch.worker.ts", import.meta.url), { type: "module" }),
      });
      clients.push(client as unknown as WorkerClient<never>);

      const error = await rejection(client.call("echo", "x"));
      expect(isSdkError(error, "WORKER_PROTOCOL_MISMATCH")).toBe(true);
    });

    it("fails with WORKER_START_FAILED when the worker never announces itself", async () => {
      const client = createWorkerClient<TestWorker>({
        createWorker: () =>
          new Worker(new URL("./fixtures/silent.worker.ts", import.meta.url), { type: "module" }),
        startTimeout: 200,
      });
      clients.push(client as unknown as WorkerClient<never>);

      expect(isSdkError(await rejection(client.start()), "WORKER_START_FAILED")).toBe(true);
    });

    it("fails with WORKER_START_FAILED when the script doesn't load", async () => {
      const client = createWorkerClient<TestWorker>({
        createWorker: () => new Worker("/does-not-exist.worker.js", { type: "module" }),
      });
      clients.push(client as unknown as WorkerClient<never>);

      expect(isSdkError(await rejection(client.call("echo", "x")), "WORKER_START_FAILED")).toBe(
        true,
      );
    });
  });

  describe("lifetime", () => {
    it("terminates an idle worker and recreates it on the next call", async () => {
      const { client, created } = setup({ idleTimeout: 50 });
      await client.call("echo", "first");
      await new Promise((resolve) => setTimeout(resolve, 150));

      await client.call("echo", "second");
      expect(created.count).toBe(2);
    });

    it("rejects calls in flight and after destroy() with WORKER_TERMINATED", async () => {
      const { client } = setup();
      const inFlight = client.call("wait", { ms: 10_000 });
      await client.start();

      client.destroy();
      expect(isSdkError(await rejection(inFlight), "WORKER_TERMINATED")).toBe(true);
      expect(isSdkError(await rejection(client.call("echo", "x")), "WORKER_TERMINATED")).toBe(true);
    });
  });
});
