---
"@hussmartinez/sdk-config": minor
---

Adds `@hussmartinez/sdk-config/testing/audio-output`, a helper for browser tests that need real-time audio output. `audioOutput({ activate })` probes the browser once per test run and returns `{ available, reason, clockRatio }`: audio counts as available only when an `AudioContext` runs, and its clock keeps real time. Firefox in the family's test image has no audio output, so tests that need it skip there with `it.skipIf(!audio.available)(\`name${audio.reason}\`, …)`. Pass `activate: (button) => userEvent.click(button)` from `vitest/browser` for browsers that start audio only after a user gesture. Import it only from tests.
