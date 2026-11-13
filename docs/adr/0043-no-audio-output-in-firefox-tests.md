# 0043. Firefox has no audio output in the browser test image

- **Status:** Accepted
- **Date:** 2026-11-13
- **Refines:** [ADR 0025](0025-one-browser-test-image-in-one-place.md), by recording what the pinned image can't test, and how tests skip it

## Context

The family's browser tests run in Microsoft's Playwright image, pinned by digest and used as it is ([ADR 0025](0025-one-browser-test-image-in-one-place.md)). `video-sdk`'s playback tests found that Firefox there has no audio output: an `AudioContext` stays suspended, even after a real click, while Chromium and WebKit play. `video-sdk` skips its audio and video sync tests in Firefox through its own click probe.

Measured in the pinned image (`v1.65.0-noble`), as user 1001: each run started an `AudioContext` after a real click, and compared its clock with `performance.now()` over 2 seconds. A ratio of 1 is real time.

| Engine and setting | State | `currentTime` ratio |
|---|---|---|
| Chromium | running | 1.006 |
| WebKit | running | 1.000 |
| Firefox | suspended | 0 |
| Firefox, with `media.cubeb.force_null_context`, the autoplay preferences, `media.cubeb.backend` set to `alsa` or `null`, or an ALSA `null` default device | suspended | 0 |
| Firefox, with a PulseAudio server reachable | running | 0.998 |

The image has the audio client libraries, but no sound server. Firefox's audio needs one: without it, `resume()` never settles, and no preference changes that. With a server, Firefox's clock runs at real time.

## Decision

- **Accept the gap.** Firefox runs every browser test except those that need real-time audio output. Chromium and WebKit cover those. Firefox's media pipeline, decoding and elements still run in every test.
- **Skip it the same way everywhere.** `@hussmartinez/sdk-config/testing/audio-output` exports `audioOutput({ activate })`, a test-only helper:
  - it starts an `AudioContext`, clicking a button through `activate` when the browser needs a user gesture;
  - it measures the context's clock against `performance.now()`;
  - it returns `{ available, reason, clockRatio }`. Output counts only when the context runs, and its clock runs at between 0.8 and 1.25 times real time, so a context that only claims to run doesn't count;
  - it probes once per test run, keeping the result in `sessionStorage`, which every test file's frame shares within one browser;
  - `reason` is a suffix for the skipped test's name, naming this record.
- **Tests that need audio output use it,** such as `it.skipIf(!audio.available)(\`keeps audio and video in sync${audio.reason}\`, …)`. `video-sdk`'s click probe becomes this helper.

## Alternatives considered

- **A Firefox preference for a null audio backend, delivered as a Vitest preset:** none of the preferences tried gets the context running. The measurements above rule it out.
- **Our own image, derived from Playwright's, with a PulseAudio null sink:** real coverage in all three engines, but it reverses [ADR 0025](0025-one-browser-test-image-in-one-place.md)'s use of Microsoft's image as it is. We'd own a build and publish pipeline and the rebuilds on every Playwright update. The server would also have to start in each job, because GitHub Actions replaces the image's entrypoint in container jobs. That's too much for one assertion in one engine, for now.
- **A PulseAudio service container next to each job, over TCP:** the test image stays Microsoft's, but there's a second image to pin and trust (there's no official one), and every repository's verify jobs gain `services:`.
- **Install PulseAudio with apt during the job:** [ADR 0023](0023-verify-releases-in-an-unprivileged-job.md) removed package installs at job time, because of the mirror's delays.

## Consequences

- Real-time audio behaviour is tested in Chromium and WebKit, not in Firefox. A Firefox-only regression in it wouldn't be caught by CI.
- **When to revisit:** a Firefox-only audio or video bug, or a host that needs Firefox audio guarantees, triggers building our own image with a null sink. That decision gets a new record that supersedes the image part of [ADR 0025](0025-one-browser-test-image-in-one-place.md).
- Every repository skips the same tests in the same way, and the skipped tests' names say why.
