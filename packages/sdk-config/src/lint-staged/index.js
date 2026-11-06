/**
 * lint-staged preset for the `pre-commit` hook (ADR 0016): a secret scan,
 * Biome with safe fixes, and stylelint for CSS, on staged files only.
 *
 * The globs don't overlap, because lint-staged runs globs concurrently and two
 * tools writing the same file would race. Within a glob, the secret scan runs
 * first, before anything rewrites the file.
 */
const SECRETLINT = "secretlint --maskSecrets";
const BIOME = "biome check --write --no-errors-on-unmatched --files-ignore-unknown=true";
const STYLELINT = "stylelint --allow-empty-input";

/** @type {Record<string, string[]>} */
const config = {
  "*.css": [SECRETLINT, BIOME, STYLELINT],
  "!(*.css)": [SECRETLINT, BIOME],
};

export default config;
