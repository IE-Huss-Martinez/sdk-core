# 0015. Verification, releases and trusted publishing

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

Changes are made by one maintainer working with coding agents, across many repositories. Quality has to be enforced by tooling that behaves the same in every repository. Every repository in the family is public, so GitHub Actions is available at no cost and can serve as an independent, reproducible gate. Local checks still matter, because they give the fastest feedback and keep broken work from being pushed at all. Releases must be reproducible and verifiable by users. Accidental breaking changes to the public API are the most likely way to hurt users.

## Decision

### One verification command

Each repository exposes `pnpm verify`, which runs, in order:

1. **Code checks:** Biome (format and lint), stylelint (namespace and token rules), TypeScript, and `dependency-cruiser` (layer rules).
2. **Build.**
3. **Unit tests:** Vitest.
4. **Browser tests:** Playwright end-to-end tests against the Vite, Next.js and plain-HTML test applications, including axe accessibility checks, visual regression and the no-network assertion.
5. **Bundle budgets:** `size-limit`, per entry point.
6. **API report:** `api-extractor` keeps a checked-in report of the public API, so every API change shows up in the diff and is reviewed deliberately.
7. **Package checks:** `publint` and `@arethetypeswrong/cli`.

`pnpm verify:fast` runs the subset that finishes in about a minute: TypeScript, unit tests, dependency rules and the API report check.

### Where verification runs

- **Locally:**
  - git hooks run the fast checks on every commit and push ([0016](0016-git-hooks-and-merge-guards.md));
  - contributors run the full `pnpm verify` before marking a pull request ready, and report the result in its description;
  - local browser tests use Chromium only, for speed.
- **In CI:**
  - a `verify` workflow runs `pnpm verify` on every pull request and every push to `main`, with browser tests on Chromium, Firefox and WebKit, matching the supported browsers ([0013](0013-browser-and-react-support.md));
  - `verify` and the pull request title check from [0016](0016-git-hooks-and-merge-guards.md) are required status checks;
  - branches must be up to date with `main` before merging.

### Workflow security

- **Pinned actions:** every action is pinned to a full commit SHA, and Dependabot keeps the pins current.
- **Least privilege:**
  - every workflow declares minimal `permissions`;
  - pull request workflows get read-only access and no secrets;
  - workflows use `pull_request`, never `pull_request_target`, with pull request code checked out.
- **Bounded runs:** jobs have timeouts, and superseded runs on the same branch are cancelled.

### Git and pull requests

- **Conventional Commits.**
- **Small, focused pull requests**, each describing what changed, why, and how it was tested.
- **Squash merges only**, with linear history enforced on `main`. The pull request title becomes the commit title.
- **Signed commits.**
- **ADRs** for significant decisions ([0001](0001-record-architecture-decisions.md)).

### Versioning

- **Semver:** packages stay at `0.x` until their API settles. During `0.x`, a minor version may break, and the changelog says so.
- **Deprecations:** after `1.0`, deprecated APIs remain for at least one minor release before removal in the next major.
- **release-please** reads the Conventional Commits on `main`, proposes the next version and changelog in a release pull request, and tags the release when it's merged.

### Publishing

- **Trigger:** a release workflow runs when a release tag is pushed.
- **Verification:** it runs `pnpm verify` again, then publishes with npm trusted publishing (OpenID Connect).
- **No stored token:** there is no npm token in the repository settings.
- **Provenance:** every published version carries a provenance statement linking it to the commit and workflow that built it.
- **Permissions:** the release workflow is the only one with `id-token: write`.

## Alternatives considered

- **Local verification only:** gives no independent, reproducible record that a change passed. A forgotten local run, or one on an unusual machine, goes unnoticed.
- **CI only:** feedback arrives minutes after pushing, so broken work reaches the remote, and secrets committed by mistake become public immediately.
- **Changesets:** a good fit for monorepos, but it duplicates information that Conventional Commits already carry.
- **Publishing from a developer machine:** not reproducible, has no provenance, and depends on a long-lived token.

## Consequences

- Every repository is verified the same way: locally for fast feedback, and in CI as the gate that can't be skipped.
- Every pull request shows a visible check result, and releases can be traced to the commit and workflow that built them.
- CI runs the browser suite on three engines, so a full run takes several minutes. That's acceptable for a merge gate.
