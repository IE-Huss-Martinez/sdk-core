# 0026. Share the family's CI steps from `sdk-ci`

- **Status:** Accepted
- **Date:** 2026-11-12
- **Refines:** [ADR 0002](0002-one-repository-per-sdk.md), with one more shared repository; [ADR 0021](0021-version-and-release-with-changesets.md), [ADR 0023](0023-verify-releases-in-an-unprivileged-job.md) and [ADR 0025](0025-one-browser-test-image-in-one-place.md) stand, carried out through shared steps

## Context

`sdk-core`'s release scripts and their tests, `release.yml`, `ci-image.yml` and the changeset-config test are already copied almost verbatim into `ui`, and would be copied into every SDK, twenty or more. Every fix to them, and there have been six so far, would have to be repeated in each repository, and the copies would drift.

Two things constrain how they can be shared:

- **Separate jobs:** [ADR 0023](0023-verify-releases-in-an-unprivileged-job.md) splits a release into jobs with different permissions: `plan`, a read-only `verify release` in the browser test image, and `publish`, which holds `id-token: write` and the `npm` environment.
- **Trusted publishing:** npm binds a package's trusted publisher to the workflow file and environment that publish it. Each package's release has to keep working through any change.

## Decision

- **A new public repository, `ie-huss-martinez/sdk-ci`,** holds the shared CI steps as composite actions, with the release scripts and all their tests. It's versioned with plain `vX.Y.Z` tags and GitHub Releases. It gets the family's repository settings from `create-sdk-repo`, which allows its name, and a change to it is reviewed like any other: it reaches every repository's release.
- **Each repository keeps its job skeleton.** `verify.yml` and `release.yml` stay in each repository with their jobs, which rarely change: `image`, `verify`, `version`, `plan`, `verify release` and `publish`. Their permissions, container, environment and `needs` stay there. Each job's steps become one or two `uses: ie-huss-martinez/sdk-ci/<action>@<full SHA> # vX.Y.Z` calls.
- **Scripts travel with their actions.** They live inside the composite actions and run from `github.action_path`, so a repository always runs the scripts of exactly the commit it pins. There's no second version to keep in step.
- **Skeleton drift is checked on every pull request.** sdk-ci ships the canonical skeleton, and a `check-workflows` action compares a repository's workflows with it: job names, `needs`, `if`, permissions, environments and container. Each repository's `verify` job runs it at the same pinned version, so a skeleton that drifts from its pinned sdk-ci fails CI. An sdk-ci release that changes the skeleton says so, and the Dependabot pull request that adopts it includes the matching edit.
- **Updates come from Dependabot.** Its `github-actions` ecosystem updates SHA pins that carry a version comment to sdk-ci's new tags, in each repository's grouped pull request. Our own organisation's actions are exempt from the 7-day cooldown, so a fix reaches every repository at the next weekly run.

## Alternatives considered

- **Reusable workflows called from each repository:** rejected.
  - **Publishing:** the `npm publish` step would run in a job defined in sdk-ci's workflow, and it isn't certain that npm accepts that for a trusted publisher bound to the calling repository's `release.yml`. Every package's release would depend on it.
  - **Running the scripts at the right commit:** the workflow would have to fetch its own repository at its own commit, through GitHub's new self-repository syntax or the `job_workflow_sha` claim. Neither is proven yet.
  - **Check names:** a job that calls a reusable workflow reports as `<caller job> / <called job>`, so every repository's branch protection would need a migration.
  - **Visibility:** a repository's permissions and environments would move out of its own files.
- **The shared workflows in `sdk-core`, with their own `vX` tags:** two tag schemes in one repository, `vX.Y.Z` next to package tags such as `@hussmartinez/sdk-config@0.1.5`. Dependabot could follow the wrong one, and a CI fix would be tied to `sdk-core`'s releases.
- **The release scripts as a `bin` in `sdk-config`:** two pins for one tightly coupled unit, the actions' SHA and `sdk-config`'s version. Two Dependabot ecosystems would update them at different times, so a workflow could run a script version it was never tested with.
- **The organisation's `.github` repository, with workflow templates:** templates are copied once, when a workflow is created, and never updated.

## Consequences

- A fix is made once, in sdk-ci, and reaches each repository through a Dependabot pull request that runs that repository's own CI before it's merged.
- Trusted publishing, the required check names and the permissions model don't change: each repository's `publish` job, environment and OIDC token are its own, as before.
- A bad sdk-ci release could reach every repository, but only through each repository's own pull request and CI. The pins also make rolling back a one-line revert.
- The job skeletons are still copies, but small ones that rarely change, and `check-workflows` keeps them identical to the pinned version.
- The migration takes these steps:
  1. Create `sdk-ci` with `create-sdk-repo`.
  2. Move the actions and their tests across; their history isn't kept.
  3. Release `v1.0.0`.
  4. Switch `sdk-core`, then `ui`, one pull request each.
  5. New SDKs start on sdk-ci.
