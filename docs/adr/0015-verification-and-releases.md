# 0015. Verification, releases and trusted publishing

- **Status:** Accepted; release tooling superseded by [0021](0021-version-and-release-with-changesets.md)
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

### Releasing and publishing

One `release` workflow runs on every push to `main` and has two jobs.

1. **`release-please`** (permissions: `contents: write`, `pull-requests: write`):
   - keeps a release pull request open with the next version and changelog;
   - when that pull request is merged, creates the version tag and a **GitHub Release** whose notes are the changelog for that version.
2. **`publish`** runs only when the first job has just created a release. Its permissions are `contents: write`, `id-token: write` and `attestations: write`. It:
   1. runs `pnpm verify`;
   2. publishes to npm with trusted publishing (OpenID Connect) and provenance, with no npm token stored anywhere;
   3. attaches the npm tarball, each SDK's standalone script and a `SHA256SUMS` file to the GitHub Release;
   4. creates GitHub artifact attestations for those files, so anyone can check a download with `gh attestation verify`.

Publishing is a job in the same workflow rather than a separate workflow triggered by the tag. Tags and releases created with the workflow's own `GITHUB_TOKEN` don't trigger other workflows, so a separate publish workflow would never run.

Each repository's README links to its Releases page and npm package. npm shows the provenance of every version.

## Alternatives considered

- **Local verification only:** gives no independent, reproducible record that a change passed. A forgotten local run, or one on an unusual machine, goes unnoticed.
- **CI only:** feedback arrives minutes after pushing, so broken work reaches the remote, and secrets committed by mistake become public immediately.
- **Changesets:** a good fit for monorepos, but it duplicates information that Conventional Commits already carry.
- **Publishing from a developer machine:** not reproducible, has no provenance, and depends on a long-lived token.
- **A separate publish workflow triggered by the release tag:** doesn't run, because events created with `GITHUB_TOKEN` don't start other workflows. The workaround, a personal access token or GitHub App token for release-please, adds a long-lived credential for no benefit.

## Consequences

- Every repository is verified the same way: locally for fast feedback, and in CI as the gate that can't be skipped.
- Every pull request shows a visible check result.
- Every version appears on the repository's Releases page with its notes and verifiable files, and can be traced on npm to the commit and workflow that built it.
- CI runs the browser suite on three engines, so a full run takes several minutes. That's acceptable for a merge gate.
