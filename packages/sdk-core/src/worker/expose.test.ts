import { describe, expect, it } from "vitest";
import { SdkError } from "../errors/sdk-error.js";
import { exposeWorker, type WorkerScope } from "./expose.js";

interface Contract {
  echo: { input: string; output: string };
  slow: { input: undefined; output: string; progress: number };
  fail: { input: undefined; output: never };
  notCloneable: { input: undefined; output: () => void };
}

/** A worker scope that clones posted messages, like the real one. */
class FakeScope extends EventTarget implements WorkerScope {
  readonly posted: Array<Record<string, unknown>> = [];

  postMessage(message: unknown, transfer: Transferable[]): void {
    this.posted.push(structuredClone(message, { transfer }) as Record<string, unknown>);
  }

  call(id: number, method: string, input?: unknown, version = 1): void {
    const data = { protocol: "hm-rpc", version, type: "call", id, method, input };
    this.dispatchEvent(new MessageEvent("message", { data }));
  }

  cancel(id: number): void {
    const data = { protocol: "hm-rpc", version: 1, type: "cancel", id };
    this.dispatchEvent(new MessageEvent("message", { data }));
  }

  last(): Record<string, unknown> | undefined {
    return this.posted.at(-1);
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup() {
  const scope = new FakeScope();
  let signal: AbortSignal | undefined;
  let finish: (() => void) | undefined;
  let report: ((value: number) => void) | undefined;
  exposeWorker<Contract>(
    {
      echo: (input) => `echo: ${input}`,
      slow: (_input, context) => {
        signal = context.signal;
        report = context.progress;
        return new Promise((resolve) => {
          finish = () => resolve("finished");
        });
      },
      fail: () => {
        throw new SdkError("FILE_TOO_LARGE", "Too large.", { details: { limit: 1 } });
      },
      notCloneable: () => () => undefined,
    },
    { scope },
  );
  return {
    scope,
    signal: () => signal,
    finish: () => finish?.(),
    report: (value: number) => report?.(value),
  };
}

describe("exposeWorker", () => {
  it("announces the worker at once", () => {
    const { scope } = setup();
    expect(scope.posted).toEqual([{ protocol: "hm-rpc", version: 1, type: "ready" }]);
  });

  it("announces its package version when given one", () => {
    const scope = new FakeScope();
    exposeWorker<Contract>(
      {
        echo: (input) => input,
        slow: () => "",
        fail: () => {
          throw new Error("x");
        },
        notCloneable: () => () => undefined,
      },
      { scope, packageVersion: "1.4.0" },
    );

    expect(scope.posted).toEqual([
      { protocol: "hm-rpc", version: 1, type: "ready", packageVersion: "1.4.0" },
    ]);
  });

  it("answers a call with a result message", async () => {
    const { scope } = setup();
    scope.call(7, "echo", "hi");
    await flush();

    expect(scope.last()).toEqual({
      protocol: "hm-rpc",
      version: 1,
      type: "result",
      id: 7,
      output: "echo: hi",
    });
  });

  it("sends handler errors as serialized errors", async () => {
    const { scope } = setup();
    scope.call(1, "fail");
    await flush();

    expect(scope.last()).toMatchObject({
      type: "error",
      id: 1,
      error: { name: "SdkError", code: "FILE_TOO_LARGE", details: { limit: 1 } },
    });
    expect(scope.last()?.["error"]).not.toHaveProperty("stack");
  });

  it.each(["missing", "constructor", "__proto__", "hasOwnProperty"])(
    "answers %j with WORKER_METHOD_NOT_FOUND",
    async (method) => {
      const { scope } = setup();
      scope.call(1, method);
      await flush();

      expect(scope.last()).toMatchObject({
        type: "error",
        id: 1,
        error: { code: "WORKER_METHOD_NOT_FOUND" },
      });
    },
  );

  it("turns a result that can't be cloned into an error response", async () => {
    const { scope } = setup();
    scope.call(1, "notCloneable");
    await flush();

    expect(scope.last()).toMatchObject({
      type: "error",
      id: 1,
      error: {
        code: "WORKER_DATA_NOT_CLONEABLE",
        details: { method: "notCloneable" },
        cause: { code: "UNKNOWN", details: { originalName: "DataCloneError" } },
      },
    });
  });

  it("aborts the handler's signal on cancel, and drops progress after the call settles", async () => {
    const { scope, signal, finish, report } = setup();
    scope.call(1, "slow");
    await flush();
    report(1);
    scope.cancel(1);

    expect(signal()?.aborted).toBe(true);
    finish();
    await flush();
    const count = scope.posted.length;
    report(2);
    expect(scope.posted).toHaveLength(count);
    expect(scope.posted.filter((message) => message["type"] === "progress")).toEqual([
      { protocol: "hm-rpc", version: 1, type: "progress", id: 1, value: 1 },
    ]);
  });

  it("ignores calls from a page with another protocol version", async () => {
    const { scope } = setup();
    scope.call(1, "echo", "x", 2);
    await flush();

    expect(scope.posted).toHaveLength(1);
  });

  it("reports unhandled rejections and uncaught errors as crashes", () => {
    const { scope } = setup();
    const rejection = new Event("unhandledrejection");
    Object.defineProperty(rejection, "reason", { value: new Error("nobody caught this") });
    scope.dispatchEvent(rejection);
    const uncaught = new Event("error");
    Object.defineProperty(uncaught, "error", { value: new TypeError("timer bug") });
    scope.dispatchEvent(uncaught);

    expect(scope.posted.slice(1)).toMatchObject([
      { type: "crash", error: { code: "UNKNOWN", message: "nobody caught this" } },
      {
        type: "crash",
        error: { code: "UNKNOWN", message: "timer bug", details: { originalName: "TypeError" } },
      },
    ]);
  });
});
