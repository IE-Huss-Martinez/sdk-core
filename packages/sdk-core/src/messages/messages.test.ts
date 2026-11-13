import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { SdkError } from "../errors/sdk-error.js";
import { sdkCoreMessages } from "./core-messages.js";
import { clearIntlCache } from "./intl.js";
import { createMessages, defineMessages, plural } from "./messages.js";
import type { MessageOverrides, MessageParams } from "./types.js";

const en = defineMessages({
  ...sdkCoreMessages,
  "toolbar.rotate": "Rotate",
  "file.opened": "Opened {name}",
  "result.saved": "Saved {size, fileSize}",
  "audio.length": "Length: {length, duration}",
  "image.size": "The image is {actual, megapixels} megapixels.",
  "pages.total": "{count, number} pages",
  "file.modified": "Modified {when, date} at {when, time}",
  "pages.selected": plural("count", {
    one: "{count} page selected",
    other: "{count} pages selected",
  }),
  "errors.FILE_TOO_LARGE": "This file is {actual, fileSize}. The limit is {maximum, fileSize}.",
});

let warnings: string[];

beforeEach(() => {
  warnings = [];
  vi.spyOn(console, "warn").mockImplementation((message: string) => {
    warnings.push(message);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("message types", () => {
  it("types a megapixels parameter as a number", () => {
    expectTypeOf<MessageParams<"{actual, megapixels} MP">>().toEqualTypeOf<{
      readonly actual: number;
    }>();
  });

  it("types a duration parameter as a number", () => {
    expectTypeOf<MessageParams<"Length: {length, duration}">>().toEqualTypeOf<{
      readonly length: number;
    }>();
  });

  it("derive parameters from placeholders", () => {
    expectTypeOf<keyof MessageParams<"Rotate">>().toEqualTypeOf<never>();
    expectTypeOf<MessageParams<"Opened {name}">>().toEqualTypeOf<{
      readonly name: string | number;
    }>();
    expectTypeOf<MessageParams<"{size, fileSize} of {total, fileSize}">>().toEqualTypeOf<{
      readonly size: number;
      readonly total: number;
    }>();
    expectTypeOf<MessageParams<"{when, date}">>().toEqualTypeOf<{ readonly when: Date | number }>();
    expectTypeOf<MessageParams<(typeof en)["pages.selected"]>>().toEqualTypeOf<{
      readonly count: number;
    }>();
  });

  it("reject unknown keys and missing or wrong parameters", () => {
    const messages = createMessages(en);
    // @ts-expect-error The catalogue has no such key.
    messages.t("toolbar.missing");
    // @ts-expect-error "name" is required.
    messages.t("file.opened");
    // @ts-expect-error "size" must be a number.
    messages.t("result.saved", { size: "big" });
    // @ts-expect-error A message without placeholders takes no parameters.
    messages.t("toolbar.rotate", { extra: 1 });
    expect(warnings).not.toHaveLength(0);
  });

  it("reject override keys and placeholders the catalogue doesn't have", () => {
    // @ts-expect-error The catalogue has no such key.
    createMessages(en, { overrides: { "toolbar.missing": "x" } });
    // @ts-expect-error {size} isn't a placeholder of "file.opened".
    createMessages(en, { overrides: { "file.opened": "{name} ({size})" } });
    createMessages(en, { overrides: { "file.opened": "Opened", "toolbar.rotate": "Drehen" } });
    const fromJson: Record<string, string> = { "toolbar.rotate": "Drehen" };
    createMessages(en, { overrides: fromJson });
  });

  it("accept overrides typed as MessageOverrides, as an SDK's messages prop is, with no cast", () => {
    // What an SDK receives from its host and passes on (ADR 0019, ADR 0046).
    const fromHost: MessageOverrides<typeof en> = { "toolbar.rotate": "Drehen" };
    const messages = createMessages(en, { locale: "de", overrides: fromHost });
    expect(messages.t("toolbar.rotate")).toBe("Drehen");
    // Literal overrides are still checked, plurals included.
    createMessages(en, {
      // @ts-expect-error {total} isn't a placeholder of "pages.selected".
      overrides: { "pages.selected": { $plural: "total", one: "1", other: "{total}" } },
    });
    createMessages(en, {
      overrides: {
        "pages.selected": { $plural: "count", one: "1 Seite", other: "{count} Seiten" },
      },
    });
    // Optional, as a component's prop is.
    const maybe: MessageOverrides<typeof en> | undefined = undefined;
    createMessages(en, { ...(maybe ? { overrides: maybe } : {}) });
  });
});

describe("createMessages", () => {
  it("renders text and parameters, with English as the default locale", () => {
    const messages = createMessages(en);

    expect(messages.locale).toBe("en");
    expect(messages.t("toolbar.rotate")).toBe("Rotate");
    expect(messages.t("file.opened", { name: "report.pdf" })).toBe("Opened report.pdf");
  });

  it("formats numbers in default placeholders, and inserts strings as they are", () => {
    const de = createMessages(en, { locale: "de" });

    expect(de.t("file.opened", { name: 1234.5 })).toBe("Opened 1.234,5");
    expect(de.t("file.opened", { name: "1234.5" })).toBe("Opened 1234.5");
    expect(de.t("pages.total", { count: 12_000 })).toBe("12.000 pages");
  });

  it("formats file sizes in decimal units for the locale", () => {
    const messages = createMessages(en);
    const de = createMessages(en, { locale: "de" });

    expect(messages.t("result.saved", { size: 999 })).toBe("Saved 999 byte");
    expect(messages.t("result.saved", { size: 1_300_000 })).toBe("Saved 1.3 MB");
    expect(messages.t("result.saved", { size: 2_000_000_000 })).toBe("Saved 2 GB");
    expect(de.t("result.saved", { size: 1_300_000 })).toBe("Saved 1,3 MB");
  });

  describe("megapixels", () => {
    it("formats a pixel count in millions, with up to one fraction digit, for the locale", () => {
      const messages = createMessages(en);
      const de = createMessages(en, { locale: "de" });

      expect(messages.t("image.size", { actual: 50_000_000 })).toBe("The image is 50 megapixels.");
      expect(messages.t("image.size", { actual: 24_159_744 })).toBe(
        "The image is 24.2 megapixels.",
      );
      expect(messages.t("image.size", { actual: 1_234_567_890 })).toBe(
        "The image is 1,234.6 megapixels.",
      );
      expect(messages.t("image.size", { actual: 0 })).toBe("The image is 0 megapixels.");
      expect(de.t("image.size", { actual: 24_159_744 })).toBe("The image is 24,2 megapixels.");
    });

    it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, "50"])(
      "leaves out %s, with a warning",
      (actual) => {
        const messages = createMessages(en);

        expect(messages.t("image.size", { actual: actual as number })).toBe(
          "The image is  megapixels.",
        );
        expect(warnings).toEqual([
          expect.stringContaining(
            'The message "image.size" is missing a valid "actual" parameter.',
          ),
        ]);
      },
    );
  });

  describe("durations", () => {
    afterEach(() => {
      clearIntlCache();
    });

    it("formats milliseconds as hours, minutes and seconds for the locale", () => {
      const messages = createMessages(en);
      const de = createMessages(en, { locale: "de" });

      expect(messages.t("audio.length", { length: (3 * 60 + 5) * 60_000 })).toBe(
        "Length: 3 hr, 5 min",
      );
      expect(messages.t("audio.length", { length: 90 * 60_000 })).toBe("Length: 1 hr, 30 min");
      expect(messages.t("audio.length", { length: 42_000 })).toBe("Length: 42 sec");
      expect(de.t("audio.length", { length: ((3 * 60 + 5) * 60 + 30) * 1000 })).toBe(
        "Length: 3 Std., 5 Min. und 30 Sek.",
      );
    });

    it("rounds to the nearest second, and shows zero as 0 seconds", () => {
      const messages = createMessages(en);

      expect(messages.t("audio.length", { length: 0 })).toBe("Length: 0 sec");
      expect(messages.t("audio.length", { length: 499 })).toBe("Length: 0 sec");
      expect(messages.t("audio.length", { length: 1_500 })).toBe("Length: 2 sec");
    });

    it("falls back to unit-formatted numbers where Intl.DurationFormat is missing", () => {
      clearIntlCache();
      // Intl's members aren't enumerable, so inherit them rather than spread them.
      vi.stubGlobal("Intl", Object.create(Intl, { DurationFormat: { value: undefined } }));
      try {
        const messages = createMessages(en);

        expect(messages.t("audio.length", { length: (3 * 60 + 5) * 60_000 })).toBe(
          "Length: 3 hr, 5 min",
        );
        expect(messages.t("audio.length", { length: 0 })).toBe("Length: 0 sec");
        expect(messages.t("audio.length", { length: 3_661_000 })).toBe(
          "Length: 1 hr, 1 min, 1 sec",
        );
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, "90"])(
      "leaves out %s, with a warning",
      (length) => {
        const messages = createMessages(en);

        expect(messages.t("audio.length", { length: length as number })).toBe("Length: ");
        expect(warnings).toEqual([
          expect.stringContaining(
            'The message "audio.length" is missing a valid "length" parameter.',
          ),
        ]);
      },
    );
  });

  it("formats dates and times", () => {
    const when = Date.UTC(2026, 10, 6, 12, 30);
    const text = createMessages(en).t("file.modified", { when });

    expect(text).toMatch(/^Modified Nov 6, 2026 at \d{1,2}:30/);
  });

  describe("plurals", () => {
    it("select the form with Intl.PluralRules, and format the count", () => {
      const messages = createMessages(en);

      expect(messages.t("pages.selected", { count: 1 })).toBe("1 page selected");
      expect(messages.t("pages.selected", { count: 1_000 })).toBe("1,000 pages selected");
    });

    it("accept plain JSON overrides with forms English doesn't have", () => {
      const polish = createMessages(en, {
        locale: "pl",
        overrides: {
          "pages.selected": {
            $plural: "count",
            one: "Wybrano {count} stronę",
            few: "Wybrano {count} strony",
            many: "Wybrano {count} stron",
            other: "Wybrano {count} strony",
          },
        },
      });

      expect(polish.t("pages.selected", { count: 1 })).toBe("Wybrano 1 stronę");
      expect(polish.t("pages.selected", { count: 3 })).toBe("Wybrano 3 strony");
      expect(polish.t("pages.selected", { count: 5 })).toBe("Wybrano 5 stron");
      expect(warnings).toEqual([]);
    });

    it("are the same plain shape whether written with plural() or as JSON", () => {
      expect(plural("count", { one: "a", other: "b" })).toEqual({
        $plural: "count",
        one: "a",
        other: "b",
      });
    });
  });

  describe("errors", () => {
    it("look up text by SdkError code, with details as parameters", () => {
      const error = new SdkError("FILE_TOO_LARGE", "73400320 > 50000000", {
        details: { actual: 73_400_320, maximum: 50_000_000 },
      });

      expect(createMessages(en).error(error)).toBe("This file is 73.4 MB. The limit is 50 MB.");
    });

    it("use sdk-core's text for its own codes", () => {
      expect(createMessages(en).error(new SdkError("ABORTED", "x"))).toBe(
        "The operation was cancelled.",
      );
    });

    it.each([
      ["an unknown code", new SdkError("NOT_IN_THE_CATALOGUE", "internal detail")],
      ["a plain Error", new Error("internal detail")],
      ["a string", "internal detail"],
    ])("fall back to errors.UNKNOWN for %s, never showing the message", (_label, error) => {
      const text = createMessages(en).error(error);

      expect(text).toBe("Something went wrong. Please try again.");
      expect(text).not.toContain("internal detail");
    });
  });

  describe("untrusted overrides", () => {
    it("ignore unknown keys, with a warning", () => {
      const overrides: Record<string, unknown> = {
        "toolbar.missing": "x",
        "toolbar.rotate": "Drehen",
      };
      const messages = createMessages(en, { overrides: overrides as never });

      expect(messages.t("toolbar.rotate")).toBe("Drehen");
      expect(warnings).toEqual([
        expect.stringContaining('"toolbar.missing": the catalogue has no such key'),
      ]);
    });

    it.each([
      ["an unbalanced brace", "Opened {name"],
      ["a stray closing brace", "Opened name}"],
      ["an unknown format", "Opened {name, currency}"],
      ["an empty placeholder", "Opened {}"],
      ["a placeholder English doesn't have", "Opened {name} from {folder}"],
      ["a number", 42],
      ["a plural without other", { $plural: "name", one: "x" }],
      ["a plural with an unknown form", { $plural: "name", other: "x", lots: "y" }],
    ])("fall back to English for %s, with a warning", (_label, override) => {
      const messages = createMessages(en, { overrides: { "file.opened": override } as never });

      expect(messages.t("file.opened", { name: "a.pdf" })).toBe("Opened a.pdf");
      expect(warnings).toHaveLength(1);
    });

    it("render a parameter missing at runtime as empty, with a warning", () => {
      const messages = createMessages(en);
      const t = messages.t as (key: string, params?: object) => string;

      expect(t("file.opened")).toBe("Opened ");
      expect(t("result.saved", { size: "big" })).toBe("Saved ");
      expect(t("pages.selected", {})).toBe(" pages selected");
      expect(warnings).toHaveLength(3);
    });

    it("never read parameters from the prototype chain", () => {
      const messages = createMessages(
        defineMessages({ ...sdkCoreMessages, greeting: "Hi {constructor}" }),
      );
      const t = messages.t as (key: string, params?: object) => string;

      expect(t("greeting", {})).toBe("Hi ");
    });

    it("return the key for an unknown key at runtime, with a warning", () => {
      const t = createMessages(en).t as (key: string) => string;

      expect(t("not.there")).toBe("not.there");
      expect(warnings).toHaveLength(1);
    });

    it("reject a malformed message in the SDK's own catalogue", () => {
      expect(() => createMessages({ ...sdkCoreMessages, broken: "{oops" })).toThrow(TypeError);
    });

    it("fall back to English for an invalid locale, with a warning", () => {
      const messages = createMessages(en, { locale: "not a locale!" });

      expect(messages.locale).toBe("en");
      expect(warnings).toHaveLength(1);
    });
  });

  it("output plain text only, so markup in parameters stays text", () => {
    const text = createMessages(en).t("file.opened", { name: "<img src=x onerror=alert(1)>" });

    expect(text).toBe("Opened <img src=x onerror=alert(1)>");
    expect(typeof text).toBe("string");
  });

  it("caches Intl formatters and plural rules per locale and options", () => {
    clearIntlCache();
    const numberFormat = vi.spyOn(Intl, "NumberFormat");
    const pluralRules = vi.spyOn(Intl, "PluralRules");
    const first = createMessages(en, { locale: "fr" });
    const second = createMessages(en, { locale: "fr" });

    for (let index = 0; index < 50; index += 1) {
      first.t("pages.selected", { count: index });
      second.t("result.saved", { size: index * 1_000_000 });
    }

    expect(pluralRules).toHaveBeenCalledTimes(1);
    // One plain number format, plus one per file-size unit used (byte and megabyte).
    expect(numberFormat).toHaveBeenCalledTimes(3);
  });

  it("doesn't warn in production builds", () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      const t = createMessages(en).t as (key: string) => string;
      t("not.there");
      expect(warnings).toEqual([]);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
