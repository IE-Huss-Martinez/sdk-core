# 0035. `ai-core` for AI providers, and network access only to host-configured endpoints

- **Status:** Accepted
- **Date:** 2026-11-12
- **Supersedes:** [ADR 0012](0012-hostile-input-and-no-network.md)'s network rule, for `ai-core` only. Every SDK, `sdk-core` and `ui` keep it unchanged.
- **Refines:** which repositories [ADR 0002](0002-one-repository-per-sdk.md)'s family contains; its one-repository-per-SDK decision is unchanged

## Context

Applications built on the family need AI features. Some need a chat; others make a single call without any conversation, such as summarising a text or classifying an input. They all need the same base:
- a common model for messages and streamed output;
- adapters for providers such as Anthropic, Google Gemini and Moonshot Kimi, plus room for custom providers;
- typed errors.

Two existing decisions don't allow this:

- **[ADR 0002](0002-one-repository-per-sdk.md)** defines the family as `sdk-core`, `ui` and one `<kind>-sdk` per media kind, in the `ie-huss-martinez` organisation ([ADR 0024](0024-github-organisation-for-the-sdk-family.md)). It has no place for a shared layer that isn't media, or for a kind such as `chat` or a learning SDK.
- **[ADR 0012](0012-hostile-input-and-no-network.md)** forbids network requests, because files must never leave the device. An AI provider is a remote service, so sending a prompt to one is the feature, not a leak.

Putting the provider layer in `sdk-core` would break that package's promises. Provider APIs change often, with new models, parameters and deprecations. Every SDK would then need a dependency bump for changes it doesn't use. `sdk-core` could also no longer claim that it makes no requests and handles no secrets.

The same costs apply to any SDK that imports a provider layer: it would carry network code, follow provider churn, and come close to secrets. The family already solves "the SDK needs a capability it shouldn't own" with ports: SDKs take their `engine` and `processor` from the host ([ADR 0008](0008-ports-adapters-and-session.md)). AI can be one more port.

## Decision

### `ai-core` as a shared package

- **`ie-huss-martinez/ai-core`** publishes `@hussmartinez/ai-core`. It's a headless layer for AI providers, with:
  - the model: messages, content parts, streamed events, usage and finish reasons;
  - an adapter per provider, and a contract-test suite that custom providers must also pass;
  - `AiError`, extending `SdkError`, with stable codes;
  - a server-side request handler, and a browser transport that talks only to it.
- **It has its own repository and releases.** It follows `STANDARDS.md` and builds on `sdk-core` and `sdk-config`. `create-sdk-repo` creates it, as a shared repository that publishes a package.
- **It renders nothing.** It delivers model output as data, never as markup.
- **The `<kind>` of a `<kind>-sdk` is no longer limited to media.** A kind can be any product area with its own UI, such as `chat` or learning.

### No SDK imports `ai-core`; SDKs take AI through a port

- **No `@hussmartinez` SDK, and neither `sdk-core` nor `ui`, ever imports `@hussmartinez/ai-core`,** for code or for types.
  - A dependency-cruiser rule in the `sdk-config` preset forbids the import, and `hm-lint-deps` enforces it.
  - There's no opt-in.
  - The rule covers each package's published source. An SDK's examples and test applications may use `ai-core` to show hosts how to connect the two.
- **An SDK that needs AI defines its own provider port** in `core/ports`, like `engine` and `processor` ([ADR 0008](0008-ports-adapters-and-session.md)):
  - for example `AiProvider`, with `complete()` and `stream()`, each taking an `AbortSignal`;
  - the port contains only what that SDK needs;
  - the SDK ships a fake provider and a contract-test suite for the port;
  - the host builds a provider and passes it in as a prop, either from `ai-core` or from its own backend.
- **`ai-core` exports provider types that structurally match these ports,** so its providers can be passed straight to an SDK. Neither package depends on the other. The examples that connect them check that the types still match.
- **The result:** `ai-core` is the only package in the family with network code, and it runs only when a host constructs it. Provider changes never force an SDK release, and keys never come near an SDK.

### Network access

- **"No `@hussmartinez` SDK makes network requests" stays absolute.**
  - Every SDK, `sdk-core` and `ui` keep ADR 0012's rule unchanged.
  - An SDK with an AI port is tested end to end with its fake provider, and it still fails on any request to another origin.
- **`ai-core` requests only endpoints the host configures explicitly.**
  - Nothing is requested on import. A unit test stubs `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` and `navigator.sendBeacon`, imports every entry point, and asserts that none is called.
  - A request is made only through an adapter or transport that the host created, for a call the host or the user started.
  - No telemetry is sent. Event callbacks never contain prompts, outputs, file contents or keys.
  - Its end-to-end tests fail on any request to an origin the test didn't configure.
  - Its documented CSP limits `connect-src` to the host's own endpoint. With the browser opt-in below, it lists the exact provider origins.

### Secrets

- **Secrets stay on the server by default.** `ai-core`'s adapters that need an API key run on the host's server, behind the request handler. The browser talks only to the host's endpoint, through the transport.
- **An adapter refuses to run in a browser** unless the host passes `dangerouslyAllowBrowser: true`. That's for applications where users bring their own keys, and the name follows the providers' own SDKs.
- **Keys never appear in errors or output:** not in an error's `message`, `details` or `cause` chain, in `serializeError()` output, in event payloads or in logs.
- **An error's `cause` never holds a `Request`, headers or a raw response.** Network failures are wrapped with only the method, the provider's origin and the status.
- **Error `details` keep only** the HTTP status, the provider's error type or code, `retryAfter` and the provider's request ID. Request and response bodies stay out, because a provider's error body can repeat the prompt.
- **A sentinel test** sends a planted key and a planted prompt through every adapter's failure paths: authentication, rate limiting, network failure, a malformed stream, and abort. It asserts that neither appears in any of the places listed above.

### Provider responses and model output are hostile input

- **`ai-core` limits responses with `sdk-core`'s `defineLimits`,** with a warning threshold each, like the file policy ([ADR 0020](0020-file-policy.md)):

  | Limit | Unit | Code |
  |---|---|---|
  | `responseBytes` | bytes | `RESPONSE_TOO_LARGE` |
  | `streamDuration` | milliseconds | `STREAM_TIMEOUT` |
  | `idleTime` | milliseconds | `STREAM_IDLE` |

  Hosts set them through an option named `limits`, since these aren't file limits, and unknown limit names are an error.
- **A malformed or unexpected response fails with a specific error code.** It's never passed on half-parsed.
- **An SDK treats whatever its provider port returns as hostile,** because the host may pass any provider, not only `ai-core`'s.
- **SDKs that display model output** record their display rules in their own ADR, starting from these:
  - plain text by default, and never inserted as HTML;
  - any formatting is a strict subset, rendered to elements;
  - no remote resources such as images by default, because a URL chosen by a model is a request and can be a tracking pixel;
  - links follow the family's link rules.
- **Tool calls are never executed automatically,** in `ai-core` or in any SDK.
  - `ai-core`'s model types include tool calls and tool results from the first release, so adding tool support later isn't a breaking change. Adapters report tool calls as events.
  - Any helper that runs tools needs a handler from the host for each tool name, refuses unknown names, and stops after a `maxSteps` limit.

### Tests make no real requests

- **`ai-core`'s unit and contract tests replay recorded provider responses.** CI never calls a provider and never holds a provider key.
- **SDKs test their AI features against their fake provider.**

## Alternatives considered

- **The provider layer as part of `sdk-core`:** rejected. Every SDK would get frequent releases for changes it doesn't use, and `sdk-core` would lose its no-network, no-secrets guarantee.
- **A third package in the `sdk-core` repository:** Changesets would version it separately, but provider churn would still fill the repository's history, CI runs and review queue, against ADR 0002's aim that `sdk-core` stays small and stable.
- **SDKs that opt in to importing `ai-core`,** with an `allowAiCore` option in the dependency rule: rejected.
  - Those SDKs would contain network code, so the no-network promise would hold only for some of them.
  - Provider changes would force their releases.
  - Keys could come close to their code.
  - A port keeps all of that in `ai-core` and leaves the choice of provider to the host.
- **Port types defined in `ai-core` or `sdk-core` and imported by SDKs:** rejected. Importing them from `ai-core` would tie every AI-using SDK to `ai-core`'s versions. Defining them in `sdk-core` would put AI-specific shapes into a package that should stay small and stable. Structural matching gives the same compatibility without the dependency.
- **Building AI only into a `chat-sdk`:** rejected. Applications without a chat would have to install chat code to make one call.
- **Calling providers from the browser by default:** rejected. It exposes API keys to every visitor, and it relies on each provider allowing cross-origin requests.
- **Using the vendors' own SDKs inside the adapters:** rejected. Each adapter would add a dependency, some of them large and some Node-only. The adapters use `fetch` and a small parser for server-sent events instead, so `ai-core` needs no runtime dependencies.

## Consequences

- AI features can be shared between applications, with or without a chat, under the family's standards.
- **The no-network promise stays simple:** no `@hussmartinez` SDK makes requests. `ai-core` is the only package with network code, it runs only when a host constructs it, and its README says what it sends and where.
- **Each AI-using SDK defines a small port,** a fake and contract tests. That's a little duplication between SDKs, accepted so that SDKs stay free of `ai-core`.
- Hosts that use AI need their own server endpoint, unless they opt into browser keys. The request handler is a standard `Request` to `Response` function, so it works in Next.js route handlers, workers and other runtimes that support the Fetch API.
- `ai-core` must follow provider API changes. Its separate releases keep that work out of `sdk-core` and the SDKs.
- **Follow-up work:**
  - `create-sdk-repo` accepts `ai-core` as a shared repository that publishes a package;
  - the `sdk-config` dependency-cruiser preset forbids `sdk-core`, `ui` and every `<kind>-sdk` from importing `@hussmartinez/ai-core`, with a test that a fixture shaped like an SDK fails `hm-lint-deps`;
  - the link-safety function moves from `pdf-sdk` to `sdk-core` when a second package needs it;
  - the first SDK that displays model output records its display rules in an ADR.
