---
"@hussmartinez/sdk-config": patch
---

`testing/audio-output` and `testing/conformance` now ship TypeScript declarations, so TypeScript test projects can import them without a shim. `describeConformance` and `checkCase` take a generic `Input`, the type of the cases' inputs, instead of `any`.

The `audioOutput()` documentation now says to probe inside the tests that need audio, never at a file's top level: the probe clicks, which gives the page user activation, so a test of behaviour before any gesture, such as autoplay, would see that click. The README shows a `needAudio(context)` helper that skips the test with the reason.
