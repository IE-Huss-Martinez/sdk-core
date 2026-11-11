import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import stylelint from "stylelint";
import { describe, expect, it } from "vitest";
import config from "./index.js";

const PRESET = fileURLToPath(new URL("./index.js", import.meta.url));

/**
 * Lints CSS with the preset and returns `rule: text` for every warning.
 *
 * @param {string} code
 * @param {string} [codeFilename]
 * @returns {Promise<string[]>}
 */
async function lint(code, codeFilename = "src/features/thumbs/thumbs.css") {
  const { results } = await stylelint.lint({ code, codeFilename, config });
  const [result] = results;
  if (!result) {
    throw new Error("stylelint returned no result");
  }
  return result.warnings.map((warning) => `${warning.rule}: ${warning.text}`);
}

/**
 * @param {string} code
 * @returns {Promise<string[]>}
 */
async function rulesHit(code) {
  return (await lint(code)).map((warning) => warning.split(":")[0] ?? "");
}

describe("stylelint preset", () => {
  it("accepts a stylesheet that follows the family rules", async () => {
    const css = `
      @layer hm.tokens, hm.base, hm.components, hm.sdk;

      :root {
        --hm-pdf-thumb-radius: var(--hm-radius-md);
      }

      @layer hm.sdk {
        .hm-pdf-editor {
          container-type: inline-size;
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(var(--hm-pdf-thumb-size), 1fr));
          gap: var(--hm-space-2);
          margin: 0 auto;
          inline-size: 100%;
          color: var(--hm-color-text);
          background: transparent;
          font: inherit;

          & .hm-pdf-thumb {
            border-radius: var(--hm-pdf-thumb-radius, var(--hm-radius-sm));
            padding: calc(var(--hm-space-1) * 2);
            transition: opacity var(--hm-duration-fast) var(--hm-easing-standard);
          }
        }

        .hm-pdf-thumb--selected,
        .hm-pdf-thumb[aria-pressed="true"],
        [data-hm-theme="dark"] .hm-pdf-thumb {
          outline: var(--hm-focus-ring);
          rotate: 90deg;
          flex: 1;
          opacity: 1;
          z-index: auto;
        }

        .hm-pdf-thumb > img + span {
          color: currentColor;
          content: "4px";
          background-image: url("thumb-4px.svg");
        }

        @container (min-width: 40rem) {
          .hm-pdf-editor { gap: var(--hm-space-4); }
        }

        @media (forced-colors: active) {
          .hm-pdf-thumb { outline-color: CanvasText; }
        }

        @keyframes hm-pdf-pulse {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      }
    `;
    await expect(lint(css)).resolves.toEqual([]);
  });

  describe("hm namespace (ADR 0003)", () => {
    it.each([
      [".hm-a .toolbar {}", "selector-class-pattern"],
      [".hm-pdf-thumb.is-active {}", "selector-class-pattern"],
      [".hm-pdf-thumb__label {}", "selector-class-pattern"],
      [".hm-a #viewer {}", "selector-id-pattern"],
      [".hm-pdf-thumb[data-state='on'] {}", "selector-attribute-name-disallowed-list"],
      [".hm-a { --brand: var(--hm-color-accent); }", "custom-property-pattern"],
      ["@keyframes spin { from { opacity: 0; } }", "keyframes-name-pattern"],
    ])("rejects %s", async (css, rule) => {
      await expect(rulesHit(css)).resolves.toEqual([rule]);
    });

    it.each([
      ["@layer components;", 'Expected layer "components"'],
      ["@layer hm.sdk, vendor;", 'Expected layer "vendor"'],
      ["@layer hmx { .hm-a {} }", 'Expected layer "hmx"'],
      ['@import url("x.css") layer(vendor);', 'Expected layer "vendor"'],
      ['@import "x.css" layer;', "Unexpected anonymous layer"],
      ["@layer { .hm-a {} }", "Unexpected anonymous layer"],
    ])("rejects the layer in %s", async (css, message) => {
      const warnings = await lint(css);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain(message);
    });

    it.each([
      "@layer hm;",
      "@layer hm.sdk { @layer pdf { .hm-a {} } }",
      '@import "my-layer.css";',
      '@import url("vendor.css") layer(hm.vendor);',
    ])("accepts the layer in %s", async (css) => {
      await expect(lint(css)).resolves.toEqual([]);
    });
  });

  describe("selector scope (ADR 0005)", () => {
    it.each([
      "body {}",
      "* {}",
      "button {}",
      "html, .hm-a {}",
      ".hm-a + p {}",
      ".hm-a ~ p span {}",
      "p:has(.hm-a) {}",
      ":not(.hm-a) {}",
      ":is(.hm-a, p) {}",
      ":root { color: var(--hm-color-text); }",
    ])("rejects %s", async (css) => {
      await expect(rulesHit(css)).resolves.toEqual(["hm/selector-scope"]);
    });

    it.each([
      "hm-pdf-editor {}",
      ":host {}",
      "html .hm-a {}",
      ".hm-a * {}",
      ".hm-a > p + span {}",
      ".hm-a + .hm-b {}",
      ":where(.hm-a, [data-hm-theme]) p {}",
      ".hm-a { p { margin: 0; } }",
      ":root, [data-hm-theme='light'] { --hm-color-text: var(--hm-gray-900); }",
      "@scope (.hm-pdf-editor) { p { margin: 0; } }",
    ])("accepts %s", async (css) => {
      await expect(lint(css)).resolves.toEqual([]);
    });
  });

  describe("no literal values (ADR 0006)", () => {
    it.each([
      ["color: #fff", "colour", "#fff"],
      ["color: RED", "colour", "RED"],
      ["background: rgb(0 0 0 / 50%)", "colour", "rgb(0 0 0 / 50%)"],
      ["border: 1px solid var(--hm-color-border)", "length", "1px"],
      ["padding: calc(100% - 2rem)", "length", "2rem"],
      ["margin: var(--hm-space-2, 8px)", "length", "8px"],
      ["transition-duration: 200ms", "duration", "200ms"],
      ["transition: opacity var(--hm-duration-fast) ease-in", "easing", "ease-in"],
      [
        "animation-timing-function: cubic-bezier(0.2, 0, 0, 1)",
        "easing",
        "cubic-bezier(0.2, 0, 0, 1)",
      ],
      ["z-index: 10", "z-index", "10"],
      ["opacity: 0.5", "opacity", "0.5"],
      ["opacity: 50%", "opacity", "50%"],
      ["line-height: 1.5", "line-height", "1.5"],
      ["font-weight: bold", "font value", "bold"],
      ['font-family: "Inter"', "font value", '"Inter"'],
      ["font-family: var(--hm-font-body, system-ui)", "font value", "system-ui"],
      ["font: 400 var(--hm-font-size-md) var(--hm-font-body)", "font value", "400"],
      ["--hm-pdf-thumb-radius: 4px", "length", "4px"],
    ])("rejects %s", async (declaration, kind, value) => {
      const warnings = await lint(`.hm-a { ${declaration}; }`);
      expect(warnings).toEqual([
        `hm/no-literal-values: Unexpected literal ${kind} "${value}". Use a --hm-* design token (hm/no-literal-values)`,
      ]);
    });

    it("reports every literal in a shadow", async () => {
      const warnings = await lint(".hm-a { box-shadow: 0 1px 2px black; }");
      expect(warnings.map((warning) => warning.match(/"(.+)"/)?.[1])).toEqual([
        "1px",
        "2px",
        "black",
      ]);
    });

    it.each([
      "margin: 0 auto",
      "inset: 0px",
      "font-size: calc(var(--hm-font-size-md) * 1.25)",
      "grid-template-columns: repeat(3, 1fr)",
      "transform: translateX(-50%)",
      "aspect-ratio: 16 / 9",
      "transition-property: color, background-color",
      "animation: hm-spin var(--hm-duration-slow) var(--hm-easing-linear) infinite",
      "grid-area: tan",
      "outline-color: Highlight",
      "font-family: inherit",
    ])("accepts %s", async (declaration) => {
      await expect(lint(`.hm-a { ${declaration}; }`)).resolves.toEqual([]);
    });

    it("allows literals in token files", async () => {
      const css = ":root { --hm-radius-md: 4px; --hm-color-accent: #3b5bdb; }";
      await expect(lint(css, "src/tokens/base.css")).resolves.toEqual([]);
      await expect(lint(css, "src/theme.tokens.css")).resolves.toEqual([]);
      await expect(lint(css)).resolves.toHaveLength(2);
    });

    it("ignores at-rule preludes such as breakpoints", async () => {
      await expect(lint("@container (min-width: 30rem) { .hm-a { margin: 0; } }")).resolves.toEqual(
        [],
      );
    });
  });

  describe("disable comments", () => {
    it("requires a description", async () => {
      const css = `
        /* stylelint-disable-next-line hm/no-literal-values */
        .hm-visually-hidden { inline-size: 1px; }
      `;
      await expect(rulesHit(css)).resolves.toEqual(["--report-descriptionless-disables"]);
    });

    it("accepts a described, needed disable", async () => {
      const css = `
        /* stylelint-disable-next-line hm/no-literal-values -- the visually hidden pattern needs a 1px box */
        .hm-visually-hidden { inline-size: 1px; }
      `;
      await expect(lint(css)).resolves.toEqual([]);
    });
  });

  describe("build output", () => {
    // The same stylesheet, with literal values, everywhere: only the copies
    // outside build output and caches must be linted.
    const css = ".hm-a { color: #fff; margin: 3px; }\n";
    const linted = ["src/a.css", "packages/ui/src/a.css"];
    const ignored = [
      "dist/styles.css",
      "packages/ui/dist/styles.css",
      "temp/a.css",
      "coverage/a.css",
      "storybook-static/a.css",
      "node_modules/pkg/a.css",
      // A Next.js build, and a server-rendered Vite build.
      ".next/static/css/app.css",
      "apps/next/.next/static/css/app.css",
      "dist-server/assets/a.css",
      "apps/vite/dist-server/assets/a.css",
    ];

    /**
     * Writes a project that re-exports the preset, as the README documents,
     * with the stylesheet at every path, and returns the files stylelint
     * checks and doesn't ignore, relative to the project.
     *
     * @param {(project: string) => string[] | string} files
     */
    async function lintProject(files) {
      const project = await mkdtemp(join(tmpdir(), "hm-stylelint-"));
      try {
        await writeFile(
          join(project, "stylelint.config.js"),
          `export { default } from ${JSON.stringify(PRESET)};\n`,
        );
        for (const file of [...linted, ...ignored]) {
          await mkdir(dirname(join(project, file)), { recursive: true });
          await writeFile(join(project, file), css);
        }
        const { results } = await stylelint.lint({ files: files(project), cwd: project });
        const checked = results.filter((result) => !result.ignored);
        for (const result of checked) {
          expect(result.warnings.map((warning) => warning.rule)).toContain("hm/no-literal-values");
        }
        return checked.map((result) => relative(project, result.source ?? "")).sort();
      } finally {
        await rm(project, { recursive: true, force: true });
      }
    }

    it("lints sources but not build output, through a re-exported preset", async () => {
      // As a consumer runs it: stylelint "**/*.css" from the repository root.
      await expect(lintProject(() => "**/*.css")).resolves.toEqual([...linted].sort());
    });

    it("ignores build output linted by path, as editors and lint-staged do", async () => {
      // The "**/*.css" glob skips dot-directories such as .next, so only an
      // explicit path shows whether the preset ignores them.
      await expect(
        lintProject((project) => [...linted, ...ignored].map((file) => join(project, file))),
      ).resolves.toEqual([...linted].sort());
    });
  });
});
