import valueParser from "postcss-value-parser";
import stylelint from "stylelint";
import { adrUrl } from "./adr.js";
import { NAMED_COLORS } from "./named-colors.js";

const {
  createPlugin,
  utils: { report, ruleMessages, validateOptions },
} = stylelint;

const ruleName = "hm/no-literal-values";

const messages = ruleMessages(ruleName, {
  /**
   * @param {string} kind
   * @param {string} value
   */
  rejected: (kind, value) => `Unexpected literal ${kind} "${value}". Use a --hm-* design token`,
});

const LENGTH_UNITS = new Set([
  "cap",
  "ch",
  "cm",
  "cqb",
  "cqh",
  "cqi",
  "cqmax",
  "cqmin",
  "cqw",
  "dvb",
  "dvh",
  "dvi",
  "dvmax",
  "dvmin",
  "dvw",
  "em",
  "ex",
  "ic",
  "in",
  "lh",
  "lvb",
  "lvh",
  "lvi",
  "lvmax",
  "lvmin",
  "lvw",
  "mm",
  "pc",
  "pt",
  "px",
  "q",
  "rcap",
  "rch",
  "rem",
  "rex",
  "ric",
  "rlh",
  "svb",
  "svh",
  "svi",
  "svmax",
  "svmin",
  "svw",
  "vb",
  "vh",
  "vi",
  "vmax",
  "vmin",
  "vw",
]);
const TIME_UNITS = new Set(["ms", "s"]);
const COLOR_FUNCTIONS = new Set([
  "color",
  "device-cmyk",
  "hsl",
  "hsla",
  "hwb",
  "lab",
  "lch",
  "oklab",
  "oklch",
  "rgb",
  "rgba",
]);
const EASING_FUNCTIONS = new Set(["cubic-bezier", "linear", "steps"]);
const EASING_KEYWORDS = new Set([
  "ease",
  "ease-in",
  "ease-in-out",
  "ease-out",
  "linear",
  "step-end",
  "step-start",
]);
const GLOBAL_KEYWORDS = new Set(["inherit", "initial", "revert", "revert-layer", "unset"]);
const MATH_OPERATORS = new Set(["*", "+", "-", "/"]);
const OPAQUE_FUNCTIONS = new Set(["attr", "env", "format", "image-set", "local", "url"]);

/** Properties whose unitless numbers are design values. */
const NUMERIC_TOKEN_PROPERTIES = new Set(["font-weight", "line-height", "opacity", "z-index"]);
/** Properties where every keyword other than a CSS-wide one is a literal font value. */
const FONT_PROPERTIES = new Set(["font", "font-family", "font-size", "font-weight", "line-height"]);
const EASING_PROPERTIES = new Set([
  "animation",
  "animation-timing-function",
  "transition",
  "transition-timing-function",
]);
const COLOR_PROPERTY =
  /color|background|border|outline|shadow|fill|stroke|caret|column-rule|decoration|emphasis|scrollbar/;

/**
 * Every colour, length, duration, easing, shadow, z-index, opacity and font
 * value must come from a `--hm-*` token, so themes can change any of them
 * (ADR 0006). Literals are only allowed where they carry no design decision:
 * zero, percentages, `fr`, angles, unitless multipliers such as `flex: 1`,
 * `transparent`, `currentColor`, system colours and CSS-wide keywords.
 * At-rule preludes, such as container query breakpoints, aren't checked.
 *
 * Token definition files are exempted by the preset's `overrides`.
 *
 * @type {import("stylelint").Rule<boolean>}
 */
const rule = (primary) => (root, result) => {
  if (!validateOptions(result, ruleName, { actual: primary, possible: [true] })) {
    return;
  }

  root.walkDecls((decl) => {
    const property = decl.prop.toLowerCase();
    const isCustomProperty = property.startsWith("--");
    const context = {
      property,
      colorBearing: isCustomProperty || COLOR_PROPERTY.test(property),
      easingBearing: EASING_PROPERTIES.has(property),
      fontProperty: FONT_PROPERTIES.has(property),
    };

    valueParser(decl.value).walk((node) => {
      const kind = literalKind(node, context);
      if (kind === "skip") {
        return false;
      }
      if (kind) {
        report({
          result,
          ruleName,
          node: decl,
          message: messages.rejected(kind, valueParser.stringify(node)),
          word: valueParser.stringify(node),
        });
        return false;
      }
      return undefined;
    });
  });
};

/**
 * @typedef {object} DeclarationContext
 * @property {string} property
 * @property {boolean} colorBearing
 * @property {boolean} easingBearing
 * @property {boolean} fontProperty
 */

/**
 * Classifies one value node. Returns the kind of literal it is, `"skip"` for
 * nodes whose contents mustn't be inspected, or `null` when it's allowed.
 *
 * @param {valueParser.Node} node
 * @param {DeclarationContext} context
 * @returns {string | null}
 */
function literalKind(node, context) {
  if (node.type === "function") {
    const name = node.value.toLowerCase();
    if (OPAQUE_FUNCTIONS.has(name)) {
      return "skip";
    }
    if (COLOR_FUNCTIONS.has(name)) {
      return "colour";
    }
    if (EASING_FUNCTIONS.has(name)) {
      return "easing";
    }
    return null;
  }

  if (node.type === "string") {
    return context.fontProperty ? "font value" : null;
  }

  if (node.type !== "word") {
    return null;
  }

  const word = node.value.toLowerCase();
  if (word.startsWith("--") || GLOBAL_KEYWORDS.has(word) || MATH_OPERATORS.has(word)) {
    return null;
  }
  if (/^#[0-9a-f]{3,8}$/.test(word)) {
    return "colour";
  }

  const dimension = valueParser.unit(word);
  if (dimension && dimension.number !== "" && Number.isFinite(Number(dimension.number))) {
    const number = Number(dimension.number);
    const unit = dimension.unit.toLowerCase();
    if (number === 0) {
      return null;
    }
    if (LENGTH_UNITS.has(unit)) {
      return "length";
    }
    if (TIME_UNITS.has(unit)) {
      return "duration";
    }
    if (unit !== "" && unit !== "%") {
      return null;
    }
    if (context.property === "font") {
      return "font value";
    }
    if (NUMERIC_TOKEN_PROPERTIES.has(context.property)) {
      const fullyOpaque = number === (unit === "%" ? 100 : 1);
      return context.property === "opacity" && fullyOpaque ? null : context.property;
    }
    return null;
  }

  if (context.fontProperty) {
    return "font value";
  }
  if (context.easingBearing && EASING_KEYWORDS.has(word)) {
    return "easing";
  }
  if (context.colorBearing && NAMED_COLORS.has(word)) {
    return "colour";
  }
  return null;
}

rule.ruleName = ruleName;
rule.messages = messages;
rule.meta = { url: adrUrl("0006-design-tokens-and-theming.md") };

export default createPlugin(ruleName, rule);
