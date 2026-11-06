# 0018. The worker RPC protocol, its errors and its buffer rules

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

[ADR 0011](0011-worker-messaging-and-assets.md) decided that `sdk-core` provides `createWorkerClient` and `exposeWorker`: a small, typed, versioned RPC layer with cancellation, progress, copied inputs, transferred results, preserved error codes and managed lifetimes. It left open the details every SDK will depend on, and that are hard to change once SDKs ship:

- the messages themselves, and how a version mismatch is detected;
- what happens to other calls when a stuck call forces the worker to be terminated;
- what an aborted call rejects with;
- which error codes sdk-core owns;
- what counts as a crash;
- how buffers are copied or transferred when a typed array is a view into a larger buffer, such as WebAssembly memory.

## Decision

### Contract

A worker's methods are described by one TypeScript interface, shared by the page and the worker. Each method has an `input`, an `output` and an optional `progress` type, all structured-cloneable data without functions. `call(method, input, options)` takes a single input.

### Messages

Every message carries `protocol: "hm-rpc"` and `version`, currently `1`. Messages without the marker are ignored, so an SDK can use the same worker for its own messages.

| Direction | Message | Meaning |
|---|---|---|
| worker → page | `ready` | Posted as soon as `exposeWorker` runs |
| page → worker | `call { id, method, input }` | Run a method |
| page → worker | `cancel { id }` | Abort that call's signal |
| worker → page | `progress { id, value }` | A progress update |
| worker → page | `result { id, output }` | The call succeeded |
| worker → page | `error { id, error }` | The call failed; `error` comes from `serializeError` |
| worker → page | `crash { error }` | An error escaped every handler |

- **Version check:** the client holds calls until `ready` arrives. A different version fails every pending call with `WORKER_PROTOCOL_MISMATCH` and terminates the worker. Any change an older peer can't handle increments the version.
- **Call IDs** are unique per client, across worker recreations.
- **Untrusted input:** both sides validate every message. The worker dispatches only to methods that are own properties of its handler object, so names like `constructor` or `__proto__` fail with `WORKER_METHOD_NOT_FOUND`.

### Error codes

sdk-core owns these codes, in `SdkCoreErrorCode`:

| Code | When |
|---|---|
| `ABORTED` | The call's `AbortSignal` was aborted |
| `TIMEOUT` | The signal's reason is a `TimeoutError`, such as from `AbortSignal.timeout()` |
| `WORKER_START_FAILED` | The worker couldn't be created or loaded, or didn't send `ready` within the start timeout |
| `WORKER_PROTOCOL_MISMATCH` | The page and the worker use different protocol versions |
| `WORKER_CRASHED` | An error escaped the worker's handlers, or a message couldn't be read |
| `WORKER_TERMINATED` | The worker was terminated while the call was in flight, or the client was destroyed |
| `WORKER_METHOD_NOT_FOUND` | The worker doesn't implement the method |

`TIMEOUT` is separate from `ABORTED` because "cancelled" and "took too long" need different user-facing text ([0014](0014-accessibility-and-translatable-text.md)), and codes can't be added cheaply after release.

### Cancellation and termination

- **Abort:** when a call's signal aborts, the call rejects at once with `SdkError("ABORTED")` or `SdkError("TIMEOUT")`, with the signal's reason as `cause`. It's deliberately not an `AbortError`, so that every SDK error is identified by its code. Checks for `error.name === "AbortError"` don't match.
- **Cancel:** the client sends `cancel`, and the worker aborts the handler's signal. If the worker doesn't settle the call within `cancelTimeout` (1 s by default), usually because it's busy in WebAssembly, the client terminates the worker. It's recreated on the next call. Late messages for a cancelled call are dropped.
- **Collateral calls:** terminating a worker ends every call on it. Those calls fail with `WORKER_TERMINATED` and are never retried automatically, because an operation isn't known to be safe to repeat. Whether to retry is the caller's decision.

### Crashes

- **On the page:** any `error` or `messageerror` event on the `Worker` is a crash. The worker is terminated, in-flight calls fail with `WORKER_CRASHED`, and a new worker is created on the next call. An error before `ready` is a start failure instead.
- **In the worker:** `exposeWorker` listens for the worker's own `error` and `unhandledrejection` events and reports them in a `crash` message. Unhandled rejections never reach `Worker.onerror`, so this is the only way the page learns about them.
- **Not crashes:** errors thrown or rejected inside handlers are ordinary `error` responses.
- **Reporting:** the page side handles the worker's `error` events itself (`preventDefault()`), so they don't appear twice in the console. To keep crashes observable when no call is pending, `createWorkerClient` takes an `onCrash` listener. It's called once for each `WORKER_CRASHED`, `WORKER_START_FAILED` or `WORKER_PROTOCOL_MISMATCH`, with the same error that pending calls receive, whether or not any call is pending. It isn't called for expected shutdowns: the idle timeout, `destroy()`, or a termination forced by a cancelled call. SDKs forward it to the host's `onEvent` or error reporting. Errors the listener throws are reported asynchronously and don't affect the client.

### Buffers

- **Inputs** are copied, which is what `postMessage` does without a transfer list. With `transfer: true`, their transferable objects are transferred.
- **Results** are always transferred. A handler must return buffers it no longer needs, never ones it keeps.
- **Views:**
  - A typed array or `DataView` keeps its buffer, and has it transferred when transferring, only when it covers the entire buffer and the buffer is an ordinary `ArrayBuffer`.
  - Any other view, a partial one or one over a `SharedArrayBuffer`, is replaced with a copy of just its bytes. This applies to copied and transferred messages alike, so a small view into a large WebAssembly heap never sends the whole heap.
  - Transferring a full-coverage view detaches its whole buffer.
- **Non-detachable buffers:** a buffer that can't be detached, such as `WebAssembly.Memory`'s, can't be recognised in advance. The transfer list is validated before anything is detached, so when posting with transfers fails, the sender retries once without transferring.
- **Messages that can't be cloned at all:**
  - a result becomes an `error` response, built with `serializeError`;
  - an input rejects only that call, with code `UNKNOWN` and the `DataCloneError` as `cause`.

  Nothing is left pending.

### Lifetimes and timeouts

- **Start:** workers start lazily. `start()` warms one up. Nothing touches `Worker` before then, so creating a client is safe during server rendering ([0007](0007-server-rendering-and-nextjs.md)).
- **Timeouts:**
  - `startTimeout` defaults to 10 s;
  - `cancelTimeout` defaults to 1 s;
  - `idleTimeout` defaults to 30 s, after which a worker without calls is terminated, and `0` keeps it.
- **`exposeWorker` runs first:** it must run before any heavy initialisation, with WebAssembly loaded lazily inside handlers or on first use. Otherwise `startTimeout` measures compilation rather than startup.
- **`destroy()`** terminates the worker, rejects calls in flight, and makes every later call reject, all with `WORKER_TERMINATED`.

## Alternatives considered

- **Retrying collateral calls automatically:** convenient for reads, but wrong for operations with side effects, and it hides the cost of a stuck call.
- **Rejecting aborted calls with `signal.reason`, as `fetch` does:** familiar to web developers, but it would make cancellation the one SDK failure without a code, and UI text is looked up by code.
- **Treating only unrecoverable failures as crashes:** an uncaught error leaves the worker running, but in an unknown state. Replacing it is predictable, and cheap for a worker that starts lazily.
- **Transferring every buffer found in a result:** simplest, but it detaches WebAssembly heaps or throws on them, and moves whole buffers for small views.
- **A proxy-based API, as in Comlink:** rejected in ADR 0011. Explicit method names keep the contract small and versionable.

## Consequences

- Every SDK's workers behave identically, and the protocol is tested once, in sdk-core, against Chromium, Firefox and WebKit.
- Hosts and SDK UIs can tell cancellation, timeouts, crashes and start-up failures apart by code, and crashes reach the host's error reporting even when no call is waiting.
- A stuck call costs every other call on the same worker. SDKs that run independent long operations concurrently should use separate clients.
- Changing the messages in a way an older peer can't handle requires a new protocol version, and page and worker must ship from the same build.
