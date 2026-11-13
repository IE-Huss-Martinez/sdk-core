import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { audioOutput, resetAudioOutput } from "./audio-output.js";

afterEach(() => {
  resetAudioOutput();
});

/**
 * A stand-in for an AudioContext in a given state, whose clock runs at
 * `speed` times real time.
 *
 * @param {{ state: AudioContextState, speed?: number, startsOnResume?: boolean }} options
 */
function fakeContext({ state, speed = 1, startsOnResume = false }) {
  const startedAt = performance.now();
  let current = state;
  const context = {
    get state() {
      return current;
    },
    get currentTime() {
      return ((performance.now() - startedAt) / 1000) * speed;
    },
    resume() {
      if (startsOnResume) {
        current = "running";
        return Promise.resolve();
      }
      // As in Firefox without a sound server: it never settles.
      return new Promise(() => undefined);
    },
    close: () => Promise.resolve(),
  };
  return /** @type {AudioContext} */ (/** @type {unknown} */ (context));
}

describe("audioOutput", () => {
  it("reports a running context at real-time speed as available", async () => {
    const result = await audioOutput({
      createContext: () => fakeContext({ state: "suspended", startsOnResume: true }),
    });

    expect(result).toMatchObject({ available: true, reason: "" });
    expect(result.clockRatio).toBeGreaterThan(0.8);
    expect(result.clockRatio).toBeLessThan(1.25);
  });

  it("gives the reason when the context never starts, without waiting forever", async () => {
    const started = performance.now();
    const result = await audioOutput({ createContext: () => fakeContext({ state: "suspended" }) });

    expect(result).toEqual({
      available: false,
      reason:
        ' (skipped: the AudioContext stays "suspended", so there\'s no audio output; sdk-core ADR 0043)',
    });
    expect(performance.now() - started).toBeLessThan(5_000);
  });

  it("treats a clock that doesn't run at real time as unavailable", async () => {
    for (const speed of [0, 0.5, 2]) {
      resetAudioOutput();
      const result = await audioOutput({
        createContext: () => fakeContext({ state: "running", speed }),
      });

      expect(result.available).toBe(false);
      expect(result.reason).toContain(`runs at ${speed.toFixed(2)}× real time`);
    }
  });

  it("says when an AudioContext can't be created", async () => {
    const result = await audioOutput({
      createContext: () => {
        throw new DOMException("no audio", "NotSupportedError");
      },
    });

    expect(result.available).toBe(false);
    expect(result.reason).toContain("AudioContext can't be created");
  });

  it("probes once per run, and keeps the result for every later call", async () => {
    const createContext = vi.fn(() => fakeContext({ state: "running" }));

    const first = await audioOutput({ createContext });
    const second = await audioOutput({ createContext });

    expect(createContext).toHaveBeenCalledOnce();
    expect(second).toEqual(first);
  });

  it("clicks a button through activate when the context waits for a user gesture", async () => {
    const activate = vi.fn(async (/** @type {HTMLButtonElement} */ button) => {
      expect(button.isConnected).toBe(true);
      await userEvent.click(button);
    });

    await audioOutput({
      activate,
      createContext: () => fakeContext({ state: "suspended", startsOnResume: true }),
    });

    expect(activate).toHaveBeenCalledOnce();
    expect(document.querySelector("button")).toBeNull();
  });

  it("gives a consistent answer for this browser's real audio output", async () => {
    const result = await audioOutput({ activate: (button) => userEvent.click(button) });

    if (result.available) {
      expect(result.reason).toBe("");
      expect(result.clockRatio).toBeGreaterThan(0.8);
      expect(result.clockRatio).toBeLessThan(1.25);
    } else {
      expect(result.reason).toMatch(/^ \(skipped: .+; sdk-core ADR 0043\)$/);
    }
  });
});
