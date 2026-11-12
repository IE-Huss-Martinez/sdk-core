# 0027. Dev-only `package.json` changes need no changeset

- **Status:** Accepted
- **Date:** 2026-11-12
- **Supersedes:** the part of [ADR 0021](0021-version-and-release-with-changesets.md) that counts every change to a published package's `package.json` as needing a changeset; the rest of 0021 stands

## Context

[ADR 0021](0021-version-and-release-with-changesets.md) requires a changeset whenever a pull request changes a published package's source or `package.json`, and a required `changeset` check enforces it with `changeset status --since=origin/main`. Changesets decides what changed by file: `package.json` is in every repository's `changedFilePatterns`, because its runtime fields, such as `dependencies` and `exports`, reach users.

But much of `package.json` never reaches users. A Dependabot pull request that bumps a devDependency changes `package.json` and fails the check, although nothing users install has changed. In `pdf-sdk`, whose package is at the repository root, that happens every week. The only ways through are an empty changeset, which adds noise to the changelog and teaches people to add changesets without thinking, or a reviewer overriding a required check. `changedFilePatterns` can't help, because it matches files, not fields.

## Decision

- **A change to a published package's `package.json` needs a changeset only if a field outside the dev-only list changed.** The dev-only fields are exactly:
  - `devDependencies`;
  - `scripts`;
  - `packageManager`;
  - `devEngines`.
- **Everything else counts.** That includes `dependencies`, `peerDependencies`, `optionalDependencies`, `peerDependenciesMeta`, `engines` (which users see as install warnings), `exports`, `files`, `type`, `sideEffects`, `bin`, `publishConfig`, `private` (which decides whether the package is published), and any field not on the list. The list is closed: a field counts until it's added here.
- **A `package.json` that's added, deleted, or can't be read** at either commit counts as changed.
- **sdk-ci's `changeset` action carries this out** ([ADR 0026](0026-share-ci-steps-from-sdk-ci.md)). It compares each changed `package.json` with its merge-base version without the dev-only fields, logs every file it doesn't count and why, and leaves the rest of the decision to `changeset status` and the repository's own `.changeset/config.json`. Every repository gets it with the sdk-ci version that adds it.

## Alternatives considered

- **Skip the check for Dependabot's pull requests:** rejected. Dependabot also bumps `dependencies`, and those reach users and need a changeset.
- **Add an empty changeset to every Dependabot pull request automatically:** rejected. It fills changelogs with entries users can't act on.
- **Remove `package.json` from `changedFilePatterns`:** rejected. A change to `dependencies` or `exports` would then go unnoticed.

## Consequences

- Development dependency updates, script changes and pnpm upgrades pass the `changeset` check without an empty changeset.
- **A devDependency can still change what ships.** A new version of a bundler or compiler can change the built output without any user-facing field changing. This check doesn't flag that, just as it doesn't flag a change to the catalog in `pnpm-workspace.yaml`. The API report, the size budgets, the package checks and the reviewer remain the guard. A reviewer who sees a toolchain update change the build asks for a changeset.
- The dev-only list lives in sdk-ci's `changeset` action and in this record. Changing it needs a new ADR and an sdk-ci release.
