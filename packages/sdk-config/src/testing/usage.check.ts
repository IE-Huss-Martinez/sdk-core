// Type-checked by `pnpm typecheck`, never run or published: a TypeScript test
// project's use of the testing entries, through the package's own exports, as
// a repository imports them. A declaration that's missing or wrong fails
// here, as TS7016 did before they shipped.
import {
  type AudioOutput,
  audioOutput,
  resetAudioOutput,
} from "@hussmartinez/sdk-config/testing/audio-output";
import {
  type ConformanceCase,
  type ConformanceFile,
  checkCase,
  conforms,
  describeConformance,
  readConformance,
  schemaValidator,
} from "@hussmartinez/sdk-config/testing/conformance";
import type { TestContext } from "vitest";
import { userEvent } from "vitest/browser";

/** The README's pattern: probe inside the test that needs audio, and skip it with the reason. */
export async function needAudio(context: TestContext): Promise<void> {
  const audio = await audioOutput({ activate: (button) => userEvent.click(button) });
  if (!audio.available) {
    context.skip(audio.reason.trim());
  }
}

export async function usage(): Promise<void> {
  const audio: AudioOutput = await audioOutput({
    activate: async (button: HTMLButtonElement) => button.click(),
    measureMs: 200,
  });
  const skipped: boolean = !audio.available && audio.reason.length > 0;
  const ratio: number | undefined = audio.clockRatio;
  resetAudioOutput();

  const file: ConformanceFile = readConformance(new URL("file:///cases.json"));
  const first: ConformanceCase | undefined = file.cases[0];
  const errors: string[] = schemaValidator("schema.json")({ format: "hm-plan" });
  const same: boolean = conforms([1], [1], 0.5);
  const problem: string | undefined = first ? await checkCase(first, (input) => input) : undefined;
  describeConformance("cases.json", (input: { lengths: number[] }) => input.lengths.length);

  // @ts-expect-error: audioOutput takes options, not a number.
  await audioOutput(5);
  // @ts-expect-error: the subject isn't a number.
  const wrong: number = file.subject;

  void [skipped, ratio, errors, same, problem, wrong];
}
