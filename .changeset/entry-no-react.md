---
"@hussmartinez/sdk-config": minor
---

The dependency-cruiser preset's `entry-no-ui` rule is now `entry-no-react` (ADR 0036, amended). Nothing the `.` entry reaches may import `react`, `react-dom` or `@hussmartinez/ui/react`, even as types, but it may now reach `@hussmartinez/ui`'s root entry through `src/features`, so headless tool definitions can import `IconName`. `core-no-ui` still keeps `src/core`, `src/adapters` and `src/workers` free of ui entirely. If your `.dependency-cruiser.js` adjusts the rule by name, rename `entry-no-ui` to `entry-no-react`.
