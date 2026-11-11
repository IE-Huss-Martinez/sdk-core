import layerNamePattern from "./plugins/layer-name-pattern.js";
import noLiteralValues from "./plugins/no-literal-values.js";
import selectorScope from "./plugins/selector-scope.js";

/** A lowercase, hyphen-separated name, such as `pdf-thumb`. */
const NAME = "[a-z0-9]+(?:-[a-z0-9]+)*";

/**
 * Stylelint preset for the SDK family. It enforces the family's own rules:
 * the `hm` namespace (ADR 0003), scoped selectors (ADR 0005) and tokens for
 * every design value (ADR 0006). General CSS correctness and formatting are
 * Biome's job, so this preset doesn't extend a general-purpose config.
 *
 * @type {import("stylelint").Config}
 */
const config = {
  plugins: [layerNamePattern, noLiteralValues, selectorScope],
  // Build output and tool caches. Built CSS inlines the token values, so
  // linting it would report every one. Stylelint resolves these globs against
  // the directory of the config file that declares them, so they apply when a
  // repository's stylelint.config.js re-exports this preset, as documented.
  ignoreFiles: [
    "**/dist/**",
    "**/temp/**",
    "**/coverage/**",
    "**/storybook-static/**",
    "**/node_modules/**",
    // Next.js builds, and server-rendered Vite builds.
    "**/.next/**",
    "**/dist-server/**",
  ],
  reportDescriptionlessDisables: true,
  reportInvalidScopeDisables: true,
  reportNeedlessDisables: true,
  rules: {
    "custom-property-pattern": [
      `^hm-${NAME}$`,
      {
        message: /** @param {string} name */ (name) =>
          `Expected custom property "--${name}" to start with "--hm-"`,
      },
    ],
    "keyframes-name-pattern": [
      `^hm-${NAME}$`,
      {
        message: /** @param {string} name */ (name) =>
          `Expected keyframes "${name}" to start with "hm-"`,
      },
    ],
    "selector-attribute-name-disallowed-list": [
      ["/^data-(?!hm-)/"],
      {
        message: /** @param {string} name */ (name) =>
          `Expected data attribute "${name}" to start with "data-hm-"`,
      },
    ],
    "selector-class-pattern": [
      `^hm-${NAME}(?:--${NAME})?$`,
      {
        message: /** @param {string} name */ (name) =>
          `Expected class "${name}" to match ".hm-<part>" or ".hm-<part>--<variant>". Use ARIA or data-hm-* attributes for states`,
      },
    ],
    "selector-id-pattern": [
      `^hm-${NAME}$`,
      {
        message: /** @param {string} name */ (name) => `Expected id "${name}" to start with "hm-"`,
      },
    ],
    "hm/layer-name-pattern": true,
    "hm/no-literal-values": true,
    "hm/selector-scope": true,
  },
  overrides: [
    {
      // Token definitions are where literal values belong.
      files: ["**/*.tokens.css", "**/tokens/**/*.css"],
      rules: { "hm/no-literal-values": null },
    },
  ],
};

export default config;
