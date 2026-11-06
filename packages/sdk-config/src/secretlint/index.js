import { fileURLToPath } from "node:url";

/**
 * secretlint preset for the SDK family: the recommended rules, which detect
 * cloud, npm, GitHub, Slack and other credentials and private keys (ADR 0016).
 *
 * secretlint resolves rule ids from its own install location, so the rule
 * package is resolved here, from the preset, and passed as an absolute path.
 * Consumers don't need to install it themselves.
 *
 * @type {{ rules: Array<{ id: string }> }}
 */
const config = {
  rules: [
    {
      id: fileURLToPath(import.meta.resolve("@secretlint/secretlint-rule-preset-recommend")),
    },
  ],
};

export default config;
