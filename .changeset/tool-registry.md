---
"@hussmartinez/sdk-core": minor
---

New, headless tools for SDK editors (ADR 0030), from the root entry:

- **`defineTool(definition)`** checks and freezes a tool:
  - its `id` (`<sdk>.<tool>`, such as `pdf.rotate-left`), a `label` message key, an `icon` and a toolbar `group`;
  - the capabilities it `requires`;
  - `isAvailable`, `isEnabled` and `isActive` from your session state;
  - `run(context)`, its `shortcuts`, and an optional `view` that only your UI layer reads.

  A malformed definition, including a misspelt key, throws a `TypeError`.
- **`createToolRegistry(tools, { tools, toolbar, capabilities })`** resolves your editor's `tools` and `toolbar` props into the present tools, in order, and the toolbar's groups.
  - **Default grouping:** without `toolbar`, tools are grouped by their `group`.
  - **Capabilities:** tools that require a capability that's off are left out and listed in `omitted`.
  - **Mistakes fail when the editor is created:** an unknown or repeated tool id throws a `TypeError` that names it.
