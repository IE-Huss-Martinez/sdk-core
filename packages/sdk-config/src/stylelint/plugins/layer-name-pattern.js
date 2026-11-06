import stylelint from "stylelint";
import { adrUrl } from "./adr.js";

const {
  createPlugin,
  utils: { report, ruleMessages, validateOptions },
} = stylelint;

const ruleName = "hm/layer-name-pattern";

const messages = ruleMessages(ruleName, {
  /** @param {string} name */
  expected: (name) => `Expected layer "${name}" to be "hm" or a sublayer such as "hm.sdk"`,
  anonymous: () => `Unexpected anonymous layer. Name it "hm" or a sublayer such as "hm.sdk"`,
});

const LAYER_NAME = /^hm(?:\.[a-z][a-z0-9-]*)*$/;
const IMPORT_LAYER = /\blayer\b(?:\(\s*([^)]*?)\s*\))?/i;
const IMPORT_URL = /url\([^)]*\)|"[^"]*"|'[^']*'/gi;

/**
 * Cascade layers are global to the page, so every layer an SDK declares must
 * sit inside the `hm` layer (ADR 0003, ADR 0005). A layer nested in a layer
 * block takes the outer name as its prefix, so only the outermost is checked.
 *
 * @type {import("stylelint").Rule<boolean>}
 */
const rule = (primary) => (root, result) => {
  if (!validateOptions(result, ruleName, { actual: primary, possible: [true] })) {
    return;
  }

  root.walkAtRules((atRule) => {
    const name = atRule.name.toLowerCase();
    if (name !== "layer" && name !== "import") {
      return;
    }
    if (name === "layer" && isInsideLayerBlock(atRule)) {
      return;
    }

    for (const layer of declaredLayers(atRule, name)) {
      if (layer === null) {
        report({ result, ruleName, node: atRule, message: messages.anonymous() });
      } else if (!LAYER_NAME.test(layer)) {
        report({ result, ruleName, node: atRule, message: messages.expected(layer), word: layer });
      }
    }
  });
};

/**
 * Lists the layers an at-rule declares. `null` stands for an anonymous layer.
 *
 * @param {import("postcss").AtRule} atRule
 * @param {string} name
 * @returns {Array<string | null>}
 */
function declaredLayers(atRule, name) {
  if (name === "import") {
    const match = IMPORT_LAYER.exec(atRule.params.replace(IMPORT_URL, ""));
    if (!match) {
      return [];
    }
    return [match[1] || null];
  }
  const names = atRule.params
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return names.length > 0 ? names : [null];
}

/**
 * @param {import("postcss").AtRule} atRule
 * @returns {boolean}
 */
function isInsideLayerBlock(atRule) {
  /** @type {import("postcss").Container | import("postcss").Document | undefined} */
  let parent = atRule.parent;
  for (; parent; parent = parent.parent) {
    if (
      parent.type === "atrule" &&
      /** @type {import("postcss").AtRule} */ (parent).name === "layer"
    ) {
      return true;
    }
  }
  return false;
}

rule.ruleName = ruleName;
rule.messages = messages;
rule.meta = { url: adrUrl("0003-hm-namespace.md") };

export default createPlugin(ruleName, rule);
