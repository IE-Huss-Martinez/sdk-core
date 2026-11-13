/// <reference lib="dom" preserve="true" />
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
export function audioOutput(options?: AudioOutputOptions): Promise<AudioOutput>;
/**
 * Forgets the stored result, so the next call probes again. For tests of
 * this helper.
 */
export function resetAudioOutput(): void;
export type AudioOutput = {
    /**
     * Whether an `AudioContext` runs, at real-time speed.
     */
    available: boolean;
    /**
     * Why not, as a suffix for a skipped test's name, such as
     * ` (skipped: … ; sdk-core ADR 0043)`. Empty when available.
     */
    reason: string;
    /**
     * How fast the context's clock ran against
     * `performance.now()`, when it ran: 1 is real time.
     */
    clockRatio?: number;
};
export type AudioOutputOptions = {
    /**
     * Clicks the given button as a user would, such as `userEvent.click` from
     * `vitest/browser`, for browsers that only start audio after a user
     * gesture.
     */
    activate?: (button: HTMLButtonElement) => Promise<void>;
    /**
     * Creates the context to
     * probe. Defaults to `new AudioContext()`; tests of this helper replace it.
     */
    createContext?: () => AudioContext;
    /**
     * How long to measure the clock, in
     * milliseconds. Defaults to 300.
     */
    measureMs?: number;
};
