---
"@hussmartinez/sdk-config": patch
---

The stylelint preset now also ignores `.next/` and `dist-server/`, at any depth: Next.js builds, and server-rendered Vite builds. Their CSS inlines the token values, so stylelint reported it as `hm/no-literal-values` errors when an editor, lint-staged or an explicit path linted it. If your repository lists these two in a `.stylelintignore`, you can remove them once you're on this version. As before, the ignores apply when your `stylelint.config.js` re-exports the preset.
