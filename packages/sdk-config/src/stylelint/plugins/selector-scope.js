import selectorParser from "postcss-selector-parser";
import stylelint from "stylelint";
import { adrUrl } from "./adr.js";

const {
  createPlugin,
  utils: { report, ruleMessages, validateOptions },
} = stylelint;

const ruleName = "hm/selector-scope";

const messages = ruleMessages(ruleName, {
  /** @param {string} selector */
  rejected: (selector) =>
    `Expected "${selector}" to match only elements inside an hm root, such as ".hm-pdf-editor" or "[data-hm-theme]"`,
});

const HM_NAME = /^hm-/i;
const HM_DATA_ATTRIBUTE = /^data-hm-/i;
const SCOPING_PSEUDOS = new Set([":is", ":where", ":matches"]);
const SIBLING_COMBINATORS = new Set(["+", "~"]);

/**
 * SDK styles must never reach the host page (ADR 0005). A selector is scoped
 * when the element it styles is, or is inside, an hm-namespaced element:
 * an `.hm-*` class, `#hm-*` id, `[data-hm-*]` attribute, `<hm-*>` element or
 * `:host`. A sibling of an hm root is outside it, so `.hm-a + p` is rejected.
 *
 * `:root` is allowed only for rules that declare nothing but `--hm-*` custom
 * properties, which is how themes publish tokens. Nested rules inherit their
 * parent's scope and aren't checked again.
 *
 * @type {import("stylelint").Rule<boolean>}
 */
const rule = (primary) => (root, result) => {
  if (!validateOptions(result, ruleName, { actual: primary, possible: [true] })) {
    return;
  }

  root.walkRules((ruleNode) => {
    if (hasScopedAncestor(ruleNode)) {
      return;
    }

    /** @type {selectorParser.Root} */
    let selectors;
    try {
      selectors = selectorParser().astSync(ruleNode.selector);
    } catch {
      // Unparseable selectors are reported by the CSS parser and by Biome.
      return;
    }

    const tokensOnly = declaresOnlyTokens(ruleNode);
    for (const selector of selectors.nodes) {
      if (isScoped(selector) || (tokensOnly && isRoot(selector))) {
        continue;
      }
      const text = selector.toString().trim();
      report({ result, ruleName, node: ruleNode, message: messages.rejected(text), word: text });
    }
  });
};

/**
 * Walks the compound selectors from left to right, tracking whether the
 * current element has an hm-namespaced ancestor. Descendant and child
 * combinators make an anchored compound an ancestor. A sibling shares its
 * parent, so it keeps the ancestors but not the anchor itself.
 *
 * @param {selectorParser.Selector} selector
 * @returns {boolean}
 */
function isScoped(selector) {
  let insideAnchor = false;
  let compoundAnchored = false;
  for (const node of selector.nodes) {
    if (node.type === "combinator") {
      if (!SIBLING_COMBINATORS.has(node.value.trim())) {
        insideAnchor ||= compoundAnchored;
      }
      compoundAnchored = false;
    } else if (isAnchor(node)) {
      compoundAnchored = true;
    }
  }
  return insideAnchor || compoundAnchored;
}

/**
 * @param {selectorParser.Node} node
 * @returns {boolean}
 */
function isAnchor(node) {
  switch (node.type) {
    case "class":
    case "id":
    case "tag":
      return HM_NAME.test(node.value);
    case "attribute":
      return HM_DATA_ATTRIBUTE.test(node.attribute);
    case "pseudo": {
      const name = node.value.toLowerCase();
      if (name === ":host") {
        return true;
      }
      return (
        SCOPING_PSEUDOS.has(name) &&
        node.nodes.length > 0 &&
        node.nodes.every((inner) => isScoped(inner))
      );
    }
    default:
      return false;
  }
}

/**
 * @param {selectorParser.Selector} selector
 * @returns {boolean}
 */
function isRoot(selector) {
  const [only, ...rest] = selector.nodes;
  return rest.length === 0 && only?.type === "pseudo" && only.value.toLowerCase() === ":root";
}

/**
 * @param {import("postcss").Rule} ruleNode
 * @returns {boolean}
 */
function declaresOnlyTokens(ruleNode) {
  const nodes = ruleNode.nodes ?? [];
  const declarations = nodes.filter((node) => node.type === "decl");
  return (
    declarations.length > 0 &&
    nodes.every((node) => node.type === "comment" || node.type === "decl") &&
    declarations.every((decl) => decl.prop.startsWith("--hm-"))
  );
}

/**
 * Rules nested in another rule inherit its scope, and keyframe selectors
 * aren't element selectors. `@scope (.hm-*)` scopes everything inside it.
 *
 * @param {import("postcss").Rule} ruleNode
 * @returns {boolean}
 */
function hasScopedAncestor(ruleNode) {
  /** @type {import("postcss").Container | import("postcss").Document | undefined} */
  let parent = ruleNode.parent;
  for (; parent; parent = parent.parent) {
    if (parent.type === "rule") {
      return true;
    }
    if (parent.type === "atrule") {
      const atRule = /** @type {import("postcss").AtRule} */ (parent);
      const name = atRule.name.toLowerCase();
      if (name.endsWith("keyframes")) {
        return true;
      }
      if (name === "scope" && isScopedScopeRoot(atRule.params)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * @param {string} params `@scope` prelude, such as `(.hm-pdf-editor) to (.hm-pdf-page)`.
 * @returns {boolean}
 */
function isScopedScopeRoot(params) {
  const match = /^\s*\(([^)]*)\)/.exec(params);
  if (!match?.[1]) {
    return false;
  }
  try {
    const selectors = selectorParser().astSync(match[1]);
    return selectors.nodes.every((selector) => isScoped(selector));
  } catch {
    return false;
  }
}

rule.ruleName = ruleName;
rule.messages = messages;
rule.meta = { url: adrUrl("0005-plain-css-with-cascade-layers.md") };

export default createPlugin(ruleName, rule);
