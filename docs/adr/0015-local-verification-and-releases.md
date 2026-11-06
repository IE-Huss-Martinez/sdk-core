# 0015. Local verification, release-please and trusted publishing

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

Changes are made by one maintainer working with coding agents, across many repositories. Quality has to be enforced by tooling that runs the same everywhere. The maintainer verifies changes locally rather than relying on continuous integration for every pull request. Releases, however, must be reproducible and verifiable by users. Accidental breaking changes to the public API are the most likely way to hurt users.

## Decision

### Quality gates, run locally before every push

Each repository exposes one `pnpm verify` script that runs, in order:

1. **Code checks:** Biome (format and lint), stylelint (namespace and token rules), TypeScript, and `dependency-cruiser` (layer rules).
2. **Build.**
3. **Unit tests:** Vitest.
4. **Browser tests:** Playwright end-to-end tests against the Vite, Next.js and plain-HTML test applications, including axe accessibility checks, visual regression and the no-network assertion.
5. **Bundle budgets:** `size-limit`, per entry point.
6. **API report:** `api-extractor` keeps a checked-in report of the public API, so every API change shows up in the diff and is reviewed deliberately.
7. **Package checks:** `publint` and `@arethetypeswrong/cli`.

### Git and pull requests

- **Conventional Commits.**
- **Small, focused pull requests**, each describing what changed, why, and how it was tested.
- **Squash merges only**, with linear history enforced on `main`.
- **Signed commits.**
- **ADRs** for significant decisions ([0001](0001-record-architecture-decisions.md)).

### Versioning

- **Semver:** packages stay at `0.x` until their API settles. During `0.x`, a minor version may break, and the changelog says so.
- **Deprecations:** after `1.0`, deprecated APIs remain for at least one minor release before removal in the next major.
- **release-please** reads the Conventional Commits on `main`, proposes the next version and changelog in a release pull request, and tags the release when it's merged.

### Publishing

- **Trigger:** a GitHub Actions workflow runs when a release tag is pushed.
- **Verification:** it runs `pnpm verify`, then publishes with npm trusted publishing (OpenID Connect).
- **No stored token:** there is no npm token in the repository settings.
- **Provenance:** every published version carries a provenance statement linking it to the commit and workflow that built it.
- **Pinned actions:** actions are pinned to full commit SHAs, and the workflow's permissions are limited to `contents: read` and `id-token: write`.

## Alternatives considered

- **Continuous integration on every pull request:** useful, but the maintainer has chosen local verification, and running private-repository CI has had real cost.
- **Changesets:** a good fit for monorepos, but it duplicates information that Conventional Commits already carry.
- **Publishing from a developer machine:** not reproducible, has no provenance, and depends on a long-lived token.

## Consequences

- Every repository is verified the same way, with one command.
- Releases are automated and auditable, and users can verify where each version came from.
- Local verification depends on discipline. `AGENTS.md` in every repository makes `pnpm verify` a hard requirement before pushing.
