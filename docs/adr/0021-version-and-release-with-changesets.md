# 0021. Version and release with Changesets

- **Status:** Accepted
- **Date:** 2026-11-07
- **Supersedes:** the release-please parts of [ADR 0015](0015-verification-and-releases.md), which otherwise stays in force

## Context

[ADR 0015](0015-verification-and-releases.md) chose release-please, which derives versions and changelogs from Conventional Commits. Commit subjects are written for maintainers reading the history, not for users deciding whether to upgrade. A changelog built from them lists internal steps and misses what a change means for users. These packages are the foundation of a family of SDKs used by other developers, so their release notes should be written for those developers.

Changesets is the most widely used tool for this in JavaScript and TypeScript. Each pull request that changes a published package adds a small Markdown file, a changeset, stating the bump and a user-facing description. Releasing applies the changesets, bumps the versions and writes the changelogs.

## Decision

### Versioning

- **What a changeset records:** each pull request that changes a published package adds a changeset with `pnpm changeset`. It names the packages, their bump (`patch`, `minor` or `major`) and a note written for users.
- **Versions:** `@hussmartinez/sdk-core` and `@hussmartinez/sdk-config` are versioned independently, starting at `0.1.0`. During `0.x`, a breaking change is a `minor` bump, as ADR 0015 already requires.
- **Changelogs:** generated with `@changesets/changelog-github`, so each entry links its pull request and author.
- **Tags:** the Changesets default, such as `@hussmartinez/sdk-core@0.1.0`.
- **Private packages,** such as the workspace root, are never versioned or tagged.
- **Conventional Commits stay** for git history, the `commit-msg` hook and the `pr-title` check, but no longer drive versions.

### Enforcement

- **A required `changeset` check** in the `verify` workflow runs `changeset status --since=origin/main` on every pull request. It fails when a published package's source or `package.json` changed without a changeset.
- **What counts as a change:** `changedFilePatterns` in `.changeset/config.json` limits this to what's published:
  - `src/` without tests and fixtures;
  - sdk-config's `biome/` and `tsconfig/` presets;
  - `package.json`.

  Tests, fixtures, READMEs, documentation, CI and root tooling need no changeset.
- **The version pull request is exempt,** because it consumes changesets by design.

### Releasing

One `release` workflow runs on every push to `main`, with two jobs. Every action is pinned to a commit SHA, and each job has a timeout and only the permissions it needs.

1. **`version`** (`contents: write`, `pull-requests: write`, environment `release`): `changesets/action` opens or updates the **`chore: version packages`** pull request while changesets are pending, with a GitHub App token (see below). Its title and commit message pass the `pr-title` check. The action pushes the version commit, and later the tags, through the GitHub API, so they're signed by GitHub.
2. **`publish`** (`contents: write`, `id-token: write`, `attestations: write`, environment `npm`) runs when no changesets are pending, which is after the version pull request is merged:
   1. **Plan:** `changeset publish-plan` lists the versions that aren't on npm yet. If there are none, as on most pushes, nothing else runs.
   2. **Install:** a fresh install with no caches, so a poisoned cache can't reach a release.
   3. **Verify:** `pnpm verify`, including the browser tests on all three engines.
   4. **Pack:** `changeset pack` packs each package with pnpm, which rewrites `catalog:` and `workspace:` ranges, and records each tarball's SHA-256 integrity.
   5. **Publish:** `changesets/action` runs `scripts/publish-packages.mjs`. For each tarball, the script checks the integrity, publishes it with **npm** (trusted publishing over OIDC, with provenance and no token), creates its tag, and reports it to the action. The action pushes the tags and creates the GitHub Releases, using the changelog entries as their notes.
   6. **Attach:** the published tarballs and a `SHA256SUMS` per package are attached to each release, with artifact attestations from `actions/attest-build-provenance`.

npm, rather than pnpm or `changeset publish`, publishes the tarballs. It's the client that supports trusted publishing and staged publishing.

### The version pull request uses a GitHub App token

- **Why:** a pull request opened with `GITHUB_TOKEN` doesn't trigger workflows, so `verify`, `changeset` and `pr-title` would never report on the version pull request, and it could never be merged under the required checks.
- **How:** the `version` job mints a token from a GitHub App with `actions/create-github-app-token`, scoped to `contents: write` and `pull-requests: write`, whatever else the App is allowed. The repository setting that lets Actions create pull requests can stay off.
- **Where the key lives:** the App's client ID (`RELEASE_APP_CLIENT_ID`) and private key (`RELEASE_APP_PRIVATE_KEY`) are stored only in the **`release` environment**, which is restricted to `main`. A repository secret would be readable by workflows on any branch in the repository, including `pull_request` runs. Only the `version` job uses the environment.
- **Required:** without the App, the job fails with instructions rather than opening a pull request that can't be merged.

This is a long-lived credential, which ADR 0015 avoided because a separate publish workflow didn't need one. Required checks on the version pull request are the benefit that justifies it.

### Direct publishing

The publish job publishes each version directly with `npm publish`, through trusted publishing. Every release is already gated by review of the version pull request and by the required checks. The `npm` environment can add a required reviewer. `NPM_PUBLISH_COMMAND` remains in the workflow, so moving to staged publishing later is a one-line change.

### Bootstrapping the first publish

npm can only configure a trusted publisher for a package that already exists, so the first version of each package can't be published through OIDC alone.

- **The bootstrap token:** when the `npm` environment has an `NPM_TOKEN` secret, the publish job configures it for that run, and logs a warning. The npm CLI uses trusted publishing when it's configured, and falls back to the token otherwise.
- **Provenance:** it still comes from the job's OIDC token (`id-token: write` with `--provenance`), so the first versions have provenance too.
- **The normal path:** without `NPM_TOKEN`, publishing is pure trusted publishing.

The bootstrap is done once, and then removed:

1. Create a granular npm access token that can publish only the `@hussmartinez/sdk-core` and `@hussmartinez/sdk-config` packages, expiring in a few days, and store it only as `NPM_TOKEN` in the `npm` environment.
2. Merge the first version pull request, which publishes `0.1.0` with the token.
3. Configure the trusted publisher for each package straight away. npm expires a trusted-publisher configuration that hasn't published within two days, which is why it's set up right after the bootstrap rather than before.
4. Delete the `NPM_TOKEN` secret, revoke the token, and turn on "Require two-factor authentication and disallow tokens" for each package.

## Alternatives considered

- **Staged publishing (`npm stage publish`), with each version approved on npm with 2FA:** a strong extra gate. The maintainer chose direct publishing, because review of the version pull request, the required checks and the `npm` environment already gate every release. The switch is kept as a one-line change.
- **`GITHUB_TOKEN` for the version pull request, re-triggering checks by hand:** no stored credential, but it needs a maintainer to close and reopen the pull request before every merge, and it lets every workflow create pull requests.
- **Keeping the App key as a repository secret:** simpler, but readable by workflows on any branch in the repository.

- **Keeping release-please:** no extra file per change, but release notes are only as good as commit subjects. Grouping and rewording them requires overrides in pull request bodies.
- **Hand-written changelogs without tooling:** easy to forget, with no link between a note and the version it ships in.
- **`changeset publish`:** simpler, but for pnpm workspaces it runs `pnpm publish`. It can't stage, and it would make the publishing client differ from the one trusted publishing is configured for.

## Consequences

- Users get release notes written for them, linked to each pull request and its author.
- Every pull request that changes a published package carries one more small file. The `changeset` check makes sure it isn't forgotten.
- Release tags change format, from `<component>-v<version>` (ADR 0015) to `<package>@<version>`, before any release exists.
- The publish job's own script is small but ours to maintain. A local `--dry-run` exercises it without publishing.
