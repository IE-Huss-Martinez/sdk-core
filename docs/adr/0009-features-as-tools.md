# 0009. Features as registered tool modules

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

An editor grows by adding tools, such as compress, annotate, rotate, crop or trim. When each tool is wired by hand into a central toolbar, state object and stylesheet, every addition touches shared files, tools can't be turned off independently, and third parties can't add their own. With many tools across many SDKs, a uniform extension point is needed.

## Decision

Each feature is a self-contained folder under `src/features/<feature>/` containing:

- its command or commands;
- its React UI;
- its styles;
- its messages;
- its tests.

It is registered with `defineTool` from `sdk-core`, which declares:

- **identity:** `id`, a label message key and an icon;
- **commands** and their availability, as a function of session state;
- **UI contributions:** a toolbar item, panels, dialogs and context-menu entries;
- **keyboard shortcuts**, registered with the shared shortcut registry;
- **required capabilities**, such as encryption support or a browser feature, so unavailable tools hide themselves.

The editor builds its toolbar, menus and shortcuts from the registered tools. The `tools` and `toolbar` props become plain data: which tools are present, in which order and in which groups. Applications can register their own tools through the same API.

## Alternatives considered

- **Hand-wiring each tool into the editor:** fine for five tools, unmanageable for fifty, and closed to extension.
- **A general plugin system with lifecycle hooks into everything:** more power than needed, and harder to keep stable as public API. `defineTool` exposes only declared contribution points.

## Consequences

- Adding or removing a tool touches one folder, which also makes pull requests small and reviewable.
- Turning features on or off, and building minimal editors such as "viewer plus download", is configuration rather than code.
- The tool API becomes public surface and must evolve compatibly, so it is tracked in the API report ([0015](0015-local-verification-and-releases.md)).
