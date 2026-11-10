---
"@hussmartinez/sdk-config": patch
---

The stylelint preset now ignores build output and tool caches: `dist/`, `temp/`, `coverage/`, `storybook-static/` and `node_modules/`, at any depth. Running `stylelint "**/*.css"` after a build no longer reports `hm/no-literal-values` errors for built CSS, which inlines the token values. This applies when your `stylelint.config.js` re-exports the preset (`export { default } from "@hussmartinez/sdk-config/stylelint"`). If you use `extends` instead, stylelint resolves the preset's ignore globs against the preset's own directory, so add the same `ignoreFiles` to your config.
