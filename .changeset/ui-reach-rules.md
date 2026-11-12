---
"@hussmartinez/sdk-config": minor
---

The dependency-cruiser preset keeps React and `@hussmartinez/ui` out of every headless part of an SDK (ADR 0036). `core-no-ui` now also covers `src/adapters` and `src/workers`, and the new `entry-no-ui` rule fails when anything the `.` entry module, `src/index.*`, reaches imports `react`, `react-dom` or `@hussmartinez/ui`, naming the path it took. A headless entry that reaches them through a feature or an adapter now fails `hm-lint-deps`: move that import behind the `./react` or `./element` entry.
