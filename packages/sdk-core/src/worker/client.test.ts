import { afterEach, describe, expect, it, vi } from "vitest";
import { isSdkError } from "../errors/sdk-error.js";
import { serializeError } from "../errors/serialize.js";
import { createWorkerClient, type WorkerLike } from "./client.js";

interface Echo {
  echo: { input: string; output: string };
  slow: { input: number; output: number; progress: string };
}

/** A worker whose replies the test controls. Posted messages are cloned like postMessage does. */
class FakeWorker extends EventTarget implements WorkerLike {
  readonly sent: Array<Record<string, unknown>> = [];
  terminated = false;

  postMessage(message: unknown, transfer: Transferable[]): void {
    this.sent.push(structuredClone(message, { transfer }) as Record<string, unknown>);
  }

  terminate(): void {
    this.terminated = true;
  }

  reply(data: Record<string, unknown>): void {
    this.dispatchEvent(new MessageEvent("message", { data }));
  }

  ready(version = 1): void {
    this.reply({ protocol: "hm-rpc", version, type: "ready" });
  }

  respond(id: unknown, output: unknown): void {
    this.reply({ protocol: "hm-rpc", version: 1, type: "result", id, output });
  }

  calls(): Array<Record<string, unknown>> {
    return this.sent.filter((message) => message["type"] === "call");
  }
}

function setup(
  options: {
    startTimeout?: number;
    cancelTimeout?: number;
    idleTimeout?: number;
    onCrash?: (error: unknown) => void;
  } = {},
) {
  const workers: FakeWorker[] = [];
  const client = createWorkerClient<Echo>({
    createWorker: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    },
    idleTimeout: 0,
    ...options,
  });
  return { client, workers };
}

/** Lets queued promise callbacks run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected the promise to reject.");
}

afterEach(() => {
  vi.useRealTimers();
});

describe("createWorkerClient", () => {
  it("holds calls until the worker is ready, then sends the protocol message", async () => {
    const { client, workers } = setup();
    const call = client.call("echo", "hi");
    await flush();
    const [worker] = workers;
    expect(worker?.calls()).toEqual([]);

    worker?.ready();
    await flush();
    expect(worker?.calls()).toEqual([
      { protocol: "hm-rpc", version: 1, type: "call", id: 1, method: "echo", input: "hi" },
    ]);
    worker?.respond(1, "hi back");
    await expect(call).resolves.toBe("hi back");
  });

  it("touches nothing until the first call", () => {
    const createWorker = vi.fn();
    createWorkerClient<Echo>({ createWorker });

    expect(createWorker).not.toHaveBeenCalled();
  });

  it("ignores messages that aren't this protocol's", async () => {
    const { client, workers } = setup();
    const call = client.call("echo", "x");
    const worker = workers[0];
    worker?.reply({ type: "result", id: 1, output: "not ours" });
    worker?.reply({ protocol: "hm-rpc", version: 1, type: "result", id: "1", output: "bad id" });
    worker?.ready();
    await flush();
    worker?.respond(1, "ours");

    await expect(call).resolves.toBe("ours");
  });

  it("fails with WORKER_PROTOCOL_MISMATCH and terminates the worker when versions differ", async () => {
    const { client, workers } = setup();
    const call = client.call("echo", "x");
    workers[0]?.ready(2);

    const error = await rejection(call);
    expect(isSdkError(error, "WORKER_PROTOCOL_MISMATCH")).toBe(true);
    expect(workers[0]?.terminated).toBe(true);
  });

  it("fails with WORKER_START_FAILED when the worker can't be created", async () => {
    const client = createWorkerClient<Echo>({
      createWorker: () => {
        throw new Error("CSP blocked it");
      },
    });

    const callError = await rejection(client.call("echo", "x"));
    expect(isSdkError(callError, "WORKER_START_FAILED")).toBe(true);
    expect((callError as Error).cause).toMatchObject({ message: "CSP blocked it" });
    expect(isSdkError(await rejection(client.start()), "WORKER_START_FAILED")).toBe(true);
  });

  it("fails with WORKER_START_FAILED after the start timeout", async () => {
    vi.useFakeTimers();
    const { client, workers } = setup({ startTimeout: 500 });
    const started = rejection(client.start());

    await vi.advanceTimersByTimeAsync(500);
    expect(isSdkError(await started, "WORKER_START_FAILED")).toBe(true);
    expect(workers[0]?.terminated).toBe(true);
  });

  it("rejects an already aborted call without starting a worker", async () => {
    const { client, workers } = setup();
    const error = await rejection(client.call("echo", "x", { signal: AbortSignal.abort() }));

    expect(isSdkError(error, "ABORTED")).toBe(true);
    expect(workers).toHaveLength(0);
  });

  it("maps a TimeoutError reason to TIMEOUT and any other reason to ABORTED", async () => {
    const { client } = setup();
    const timeout = new DOMException("Too slow.", "TimeoutError");

    const timedOut = await rejection(
      client.call("echo", "x", { signal: AbortSignal.abort(timeout) }),
    );
    const aborted = await rejection(
      client.call("echo", "x", {
        signal: AbortSignal.abort(new DOMException("No.", "AbortError")),
      }),
    );
    expect(timedOut).toMatchObject({ code: "TIMEOUT", cause: timeout });
    expect(aborted).toMatchObject({ code: "ABORTED" });
  });

  it("sends cancel for a call in flight, and a late result doesn't terminate the worker", async () => {
    vi.useFakeTimers();
    const { client, workers } = setup({ cancelTimeout: 1_000 });
    void client.start();
    const worker = workers[0];
    worker?.ready();
    await vi.advanceTimersByTimeAsync(0);
    const controller = new AbortController();
    const call = rejection(client.call("slow", 1, { signal: controller.signal }));
    await vi.advanceTimersByTimeAsync(0);

    controller.abort();
    expect(isSdkError(await call, "ABORTED")).toBe(true);
    expect(worker?.sent.at(-1)).toMatchObject({ type: "cancel", id: 1 });

    worker?.reply({
      protocol: "hm-rpc",
      version: 1,
      type: "error",
      id: 1,
      error: serializeError(new Error("stopped")),
    });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(worker?.terminated).toBe(false);
  });

  it("terminates the worker when a cancelled call doesn't settle, failing other calls", async () => {
    vi.useFakeTimers();
    const { client, workers } = setup({ cancelTimeout: 1_000 });
    void client.start();
    workers[0]?.ready();
    await vi.advanceTimersByTimeAsync(0);
    const controller = new AbortController();
    const stuck = rejection(client.call("slow", 1, { signal: controller.signal }));
    const bystander = rejection(client.call("echo", "x"));
    await vi.advanceTimersByTimeAsync(0);

    controller.abort();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(isSdkError(await stuck, "ABORTED")).toBe(true);
    expect(isSdkError(await bystander, "WORKER_TERMINATED")).toBe(true);
    expect(workers[0]?.terminated).toBe(true);
  });

  it("keeps call IDs unique across worker recreations", async () => {
    const { client, workers } = setup();
    const first = client.call("echo", "a");
    workers[0]?.ready();
    await flush();
    workers[0]?.reply({
      protocol: "hm-rpc",
      version: 1,
      type: "crash",
      error: serializeError(new Error("boom")),
    });
    expect(isSdkError(await rejection(first), "WORKER_CRASHED")).toBe(true);

    const second = client.call("echo", "b");
    workers[1]?.ready();
    await flush();
    expect(workers[0]?.calls()[0]?.["id"]).toBe(1);
    expect(workers[1]?.calls()[0]?.["id"]).toBe(2);
    workers[1]?.respond(2, "b");
    await expect(second).resolves.toBe("b");
  });

  it("ignores messages from a replaced worker, even with a current call's ID", async () => {
    const { client, workers } = setup();
    const first = client.call("echo", "a");
    workers[0]?.ready();
    await flush();
    workers[0]?.reply({
      protocol: "hm-rpc",
      version: 1,
      type: "crash",
      error: serializeError(new Error("boom")),
    });
    await rejection(first);

    const second = client.call("echo", "b");
    workers[1]?.ready();
    await flush();
    workers[0]?.respond(2, "from the old worker");
    workers[0]?.reply({
      protocol: "hm-rpc",
      version: 1,
      type: "crash",
      error: serializeError(new Error("late")),
    });
    workers[1]?.respond(2, "from the new worker");

    await expect(second).resolves.toBe("from the new worker");
    expect(workers[1]?.terminated).toBe(false);
  });

  it("removes the abort listener when a call settles", async () => {
    const { client, workers } = setup();
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, "addEventListener");
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const call = client.call("echo", "x", { signal: controller.signal });
    workers[0]?.ready();
    await flush();
    workers[0]?.respond(1, "x");
    await call;

    expect(add).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith("abort", add.mock.calls[0]?.[1]);
  });

  it("keeps working when a progress listener throws", async () => {
    const { client, workers } = setup();
    const errors: unknown[] = [];
    const onError = (error: unknown) => errors.push(error);
    process.on("uncaughtException", onError);
    try {
      const call = client.call("slow", 1, {
        onProgress: () => {
          throw new Error("listener bug");
        },
      });
      workers[0]?.ready();
      await flush();
      workers[0]?.reply({ protocol: "hm-rpc", version: 1, type: "progress", id: 1, value: "half" });
      workers[0]?.respond(1, 2);

      await expect(call).resolves.toBe(2);
      await flush();
      expect(errors).toEqual([expect.objectContaining({ message: "listener bug" })]);
    } finally {
      process.off("uncaughtException", onError);
    }
  });

  it("rejects only the call whose input can't be cloned", async () => {
    const { client, workers } = setup();
    const bad = rejection(client.call("echo", (() => "x") as unknown as string));
    const good = client.call("echo", "fine");
    workers[0]?.ready();
    await flush();

    expect(await bad).toMatchObject({ code: "UNKNOWN", cause: { name: "DataCloneError" } });
    workers[0]?.respond(workers[0]?.calls()[0]?.["id"], "fine");
    await expect(good).resolves.toBe("fine");
  });

  it("terminates an idle worker", async () => {
    vi.useFakeTimers();
    const { client, workers } = setup({ idleTimeout: 1_000 });
    const call = client.call("echo", "x");
    workers[0]?.ready();
    await vi.advanceTimersByTimeAsync(0);
    workers[0]?.respond(1, "x");
    await call;

    await vi.advanceTimersByTimeAsync(999);
    expect(workers[0]?.terminated).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(workers[0]?.terminated).toBe(true);
  });

  it.each(["startTimeout", "cancelTimeout", "idleTimeout"] as const)(
    "rejects a negative %s",
    (name) => {
      expect(() =>
        createWorkerClient<Echo>({ createWorker: () => new FakeWorker(), [name]: -1 }),
      ).toThrow(RangeError);
    },
  );

  describe("onCrash", () => {
    const crash = {
      protocol: "hm-rpc",
      version: 1,
      type: "crash",
      error: serializeError(new Error("boom")),
    };

    it("reports a crash while no call is pending", async () => {
      const onCrash = vi.fn();
      const { client, workers } = setup({ onCrash });
      const started = client.start();
      workers[0]?.ready();
      await started;

      workers[0]?.reply(crash);
      expect(onCrash).toHaveBeenCalledOnce();
      expect(onCrash.mock.calls[0]?.[0]).toMatchObject({ code: "WORKER_CRASHED" });
    });

    it("passes the same error that pending calls reject with", async () => {
      const onCrash = vi.fn();
      const { client, workers } = setup({ onCrash });
      const call = rejection(client.call("echo", "x"));
      workers[0]?.ready();
      await flush();
      workers[0]?.reply(crash);

      expect(onCrash).toHaveBeenCalledExactlyOnceWith(await call);
    });

    it.each([
      ["WORKER_PROTOCOL_MISMATCH", (worker: FakeWorker) => worker.ready(2)],
      ["WORKER_START_FAILED", (worker: FakeWorker) => worker.dispatchEvent(new Event("error"))],
    ] as const)("reports %s", async (code, fail) => {
      const onCrash = vi.fn();
      const { client, workers } = setup({ onCrash });
      const started = rejection(client.start());
      const worker = workers[0];
      if (worker) {
        fail(worker);
      }

      expect(isSdkError(await started, code)).toBe(true);
      expect(onCrash).toHaveBeenCalledExactlyOnceWith(await started);
    });

    it("reports an unreadable message as WORKER_CRASHED", async () => {
      const onCrash = vi.fn();
      const { client, workers } = setup({ onCrash });
      const started = client.start();
      workers[0]?.ready();
      await started;
      workers[0]?.dispatchEvent(new Event("messageerror"));

      expect(onCrash.mock.calls[0]?.[0]).toMatchObject({ code: "WORKER_CRASHED" });
    });

    it("reports a start timeout and a worker that can't be created", async () => {
      vi.useFakeTimers();
      const onCrash = vi.fn();
      const { client } = setup({ onCrash, startTimeout: 100 });
      const started = rejection(client.start());
      await vi.advanceTimersByTimeAsync(100);
      expect(onCrash).toHaveBeenLastCalledWith(await started);

      const failing = createWorkerClient<Echo>({
        createWorker: () => {
          throw new Error("blocked");
        },
        onCrash,
      });
      const error = await rejection(failing.call("echo", "x"));
      expect(onCrash).toHaveBeenLastCalledWith(error);
      expect(onCrash).toHaveBeenCalledTimes(2);
    });

    it("isn't called for the idle timeout, destroy() or a cancel-forced termination", async () => {
      vi.useFakeTimers();
      const onCrash = vi.fn();
      const idle = setup({ onCrash, idleTimeout: 100 });
      void idle.client.start();
      idle.workers[0]?.ready();
      await vi.advanceTimersByTimeAsync(100);
      expect(idle.workers[0]?.terminated).toBe(true);

      const destroyed = setup({ onCrash });
      const inFlight = rejection(destroyed.client.call("echo", "x"));
      destroyed.workers[0]?.ready();
      await vi.advanceTimersByTimeAsync(0);
      destroyed.client.destroy();
      expect(isSdkError(await inFlight, "WORKER_TERMINATED")).toBe(true);

      const cancelled = setup({ onCrash, cancelTimeout: 100 });
      void cancelled.client.start();
      cancelled.workers[0]?.ready();
      await vi.advanceTimersByTimeAsync(0);
      const controller = new AbortController();
      const stuck = rejection(cancelled.client.call("slow", 1, { signal: controller.signal }));
      await vi.advanceTimersByTimeAsync(0);
      controller.abort();
      await vi.advanceTimersByTimeAsync(100);
      await stuck;
      expect(cancelled.workers[0]?.terminated).toBe(true);

      expect(onCrash).not.toHaveBeenCalled();
    });

    it("keeps working when the listener throws", async () => {
      const errors: unknown[] = [];
      const onError = (error: unknown) => errors.push(error);
      process.on("uncaughtException", onError);
      try {
        const { client, workers } = setup({
          onCrash: () => {
            throw new Error("tracker bug");
          },
        });
        const call = rejection(client.call("echo", "x"));
        workers[0]?.ready();
        await flush();
        workers[0]?.reply(crash);

        expect(isSdkError(await call, "WORKER_CRASHED")).toBe(true);
        const next = client.call("echo", "y");
        workers[1]?.ready();
        await flush();
        workers[1]?.respond(2, "y");
        await expect(next).resolves.toBe("y");
        await flush();
        expect(errors).toEqual([expect.objectContaining({ message: "tracker bug" })]);
      } finally {
        process.off("uncaughtException", onError);
      }
    });
  });
});
