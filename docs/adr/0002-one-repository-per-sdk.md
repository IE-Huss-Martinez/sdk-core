# 0002. One repository per SDK, with shared `sdk-core` and `ui`

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

The family starts with a PDF SDK and is expected to add image, video and audio SDKs, and eventually twenty or more. The SDKs share a lot: worker messaging, error handling, the custom-element wrapper, file-size limits, the visual design and the tooling. Their dependencies differ widely: qpdf compiled to WebAssembly for PDF, ONNX Runtime and LibRaw for images, and probably ffmpeg.wasm for video. Work happens in parallel, with coding agents in separate workspaces, one per repository.

## Decision

- Each SDK lives in its own public repository, `hussmartinez/<kind>-sdk`, and publishes `@hussmartinez/<kind>-sdk`.
- `hussmartinez/sdk-core` publishes two packages:
  - `@hussmartinez/sdk-core`: shared headless runtime code with no UI framework.
  - `@hussmartinez/sdk-config`: shared development configuration.
- `hussmartinez/ui` publishes `@hussmartinez/ui`: the design system, with tokens, themes, base styles and React components. It serves both the SDKs and standalone applications.
- SDKs depend on `sdk-core` and `ui` as regular, semver-ranged dependencies, so a page using several SDKs loads one copy of each.
- `sdk-core` and `ui` stay small and stable. Anything specific to one media kind stays in that SDK.

## Alternatives considered

- **A single monorepo for every SDK:** shared tooling and atomic cross-package changes, but twenty SDKs would share one `main`, one lockfile and one test run. Parallel agents would conflict constantly, every install would pull every SDK's heavy WebAssembly dependencies, and one SDK's breaking change would block another's release.
- **Shared code bundled privately into each SDK:** no extra package to version, but in separate repositories it means copying code, and copies drift.

## Consequences

- Each SDK installs, tests and releases independently.
- A change to `sdk-core` or `ui` needs a release, then a dependency bump in each SDK. Dependabot opens those pull requests. Keeping the shared packages small keeps this rare.
- Standards can't be enforced by a shared workspace, so they are enforced by `sdk-config` presets and by `STANDARDS.md`, which every repository's `AGENTS.md` points to.
