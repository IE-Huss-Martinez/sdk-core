/// <reference lib="dom" preserve="true" />
// Whether the browser running the tests has a working audio output, for
// browser tests that need real-time audio (sdk-core ADR 0043). Firefox in the
// family's pinned test image has none: its AudioContext stays suspended
// because the image has no sound server. Tests that need audio skip there,
// all the same way, with the reason this returns.
//
// Test code only: this entry is never imported by published runtime code.

/**
 * @typedef {object} AudioOutput
 * @property {boolean} available Whether an `AudioContext` runs, at real-time speed.
 * @property {string} reason Why not, as a suffix for a skipped test's name, such as
 *   ` (skipped: … ; sdk-core ADR 0043)`. Empty when available.
 * @property {number} [clockRatio] How fast the context's clock ran against
 *   `performance.now()`, when it ran: 1 is real time.
 */

/**
 * @typedef {object} AudioOutputOptions
 * @property {(button: HTMLButtonElement) => Promise<void>} [activate]
 *   Clicks the given button as a user would, such as `userEvent.click` from
 *   `vitest/browser`, for browsers that only start audio after a user
 *   gesture.
 * @property {() => AudioContext} [createContext] Creates the context to
 *   probe. Defaults to `new AudioContext()`; tests of this helper replace it.
 * @property {number} [measureMs] How long to measure the clock, in
 *   milliseconds. Defaults to 300.
 */

/** Where the result is kept, so the browser is probed once per test run. */
const STORAGE_KEY = "@hussmartinez/sdk-config/testing/audio-output";
/** How long to wait for the context to start. Firefox without a sound server never settles. */
const START_TIMEOUT_MS = 2_000;
/** The slowest and fastest clock that still counts as real time. */
const SLOWEST = 0.8;
const FASTEST = 1.25;
const ADR = "sdk-core ADR 0043";

/** @param {number} ms */
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @returns {Promise<T | undefined>}
 */
const within = (promise, ms) =>
  Promise.race([promise.catch(() => undefined), delay(ms).then(() => undefined)]);

/**
 * Probes, once per test run, whether this browser can play audio at
 * real-time speed, and says why not. The result is kept in `sessionStorage`,
 * which every test file's frame shares within one browser.
 *
 * Call it inside the tests that need audio, never at a file's top level: its
 * probe clicks, which gives the page user activation, and a test of
 * behaviour before any gesture, such as autoplay, would then see that click.
 *
 * @example
 * ```ts
 * import { audioOutput } from "@hussmartinez/sdk-config/testing/audio-output";
 * import { userEvent } from "vitest/browser";
 *
 * it("keeps audio and video in sync", async (context) => {
 *   const audio = await audioOutput({ activate: (button) => userEvent.click(button) });
 *   if (!audio.available) context.skip(audio.reason.trim());
 *   // …
 * });
 * ```
 *
 * @param {AudioOutputOptions} [options]
 * @returns {Promise<AudioOutput>}
 */
export async function audioOutput(options = {}) {
  const stored = sessionStorage.getItem(STORAGE_KEY);
  if (stored) {
    return /** @type {AudioOutput} */ (JSON.parse(stored));
  }
  const result = await probe(options);
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(result));
  return result;
}

/**
 * Forgets the stored result, so the next call probes again. For tests of
 * this helper.
 */
export function resetAudioOutput() {
  sessionStorage.removeItem(STORAGE_KEY);
}

/**
 * @param {AudioOutputOptions} options
 * @returns {Promise<AudioOutput>}
 */
async function probe({ activate, createContext = () => new AudioContext(), measureMs = 300 }) {
  const unavailable = (/** @type {string} */ why) => ({
    available: false,
    reason: ` (skipped: ${why}; ${ADR})`,
  });
  let context;
  try {
    context = createContext();
  } catch (error) {
    return unavailable(`AudioContext can't be created: ${String(error)}`);
  }
  try {
    if (context.state !== "running" && activate) {
      const button = document.createElement("button");
      button.textContent = "Start audio";
      button.addEventListener("click", () => void context.resume().catch(() => undefined), {
        once: true,
      });
      document.body.append(button);
      try {
        await activate(button);
      } finally {
        button.remove();
      }
    }
    await within(context.resume(), START_TIMEOUT_MS);
    if (context.state !== "running") {
      return unavailable(`the AudioContext stays "${context.state}", so there's no audio output`);
    }

    const startTime = context.currentTime;
    const startWall = performance.now();
    await delay(measureMs);
    const clockRatio = (context.currentTime - startTime) / ((performance.now() - startWall) / 1000);
    if (!(clockRatio >= SLOWEST && clockRatio <= FASTEST)) {
      return unavailable(`the audio clock runs at ${clockRatio.toFixed(2)}× real time`);
    }
    return { available: true, reason: "", clockRatio };
  } finally {
    // Closing can hang too where the output never started.
    await within(context.close(), 500);
  }
}
