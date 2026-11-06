# 0013. Browser and React support

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

Media processing in the browser depends on recent platform features, such as `OffscreenCanvas`, WebAssembly, Web Workers, `createImageBitmap`, WebCodecs for video and AudioWorklet for audio. Supporting old browsers would mean polyfills or disabled features everywhere. Many React applications are still on React 18.

## Decision

- **Browsers:** the last two major versions of Chrome, Edge, Firefox and Safari, on desktop and mobile. The build targets ES2022.
- **Feature detection:** each SDK checks the platform features it needs at startup. A missing feature fails with the error code `UNSUPPORTED_ENVIRONMENT`, naming the feature, rather than failing somewhere deep inside. Tools that depend on an optional feature hide themselves ([0009](0009-features-as-tools.md)).
- **React:** `react` and `react-dom` are optional peer dependencies with the range `>=18.3`.
  - Components avoid React 19-only APIs.
  - Refs use `forwardRef`.
  - End-to-end tests run against React 19, plus a smoke test against React 18.3.

## Alternatives considered

- **Baseline "widely available" only:** excludes WebCodecs and other features the video and audio SDKs need.
- **React 19 only:** simpler, but cuts off many existing applications for little gain.

## Consequences

- No polyfills are shipped.
- Users of older browsers get a clear, specific error instead of a broken editor.
- The React 18 smoke test adds a little test time. It can be dropped in a future ADR once React 18 usage falls.
