# 0023. Verify releases in an unprivileged job

- **Status:** Accepted
- **Date:** 2026-11-11
- **Refines:** how [ADR 0021](0021-version-and-release-with-changesets.md)'s release workflow verifies before publishing; none of 0021's decisions change
- **Amended:** 2026-11-12, by [ADR 0041](0041-publish-the-verified-tarballs.md): the verify job also packs and checks the tarballs, and the publish job publishes exactly those, because packing in the publish job shipped tarballs without their build

## Context

[ADR 0021](0021-version-and-release-with-changesets.md) has the release workflow run `pnpm verify`, browser tests included, before it publishes. Until now the publish job did that itself, after installing the browsers and their system libraries with apt. Two problems followed:

- **The apt mirror is unreliable.** Installing the system libraries normally takes about a minute, but took 12 minutes on one run, at 201 kB/s with repeated stalls. The `verify` workflow had the same step.
- **The test suite ran with the release's privileges.** The publish job holds `id-token: write` for npm's trusted publishing and provenance, `contents: write`, `attestations: write` and the `npm` environment. Running every test and devDependency there gave all of that code access to them.

The pinned Playwright image, which `ui` already uses, has the browsers and their system libraries preinstalled. But it lacks `gh` and `jq`, which the publish job needs, so the whole job can't simply move into it.

## Decision

- **CI verifies in the pinned Playwright image.** `verify.yml`'s `verify` job and the release's verify job run in the image referenced by `.github/ci-image/Dockerfile`, pinned by digest, as user 1001. Nothing is installed with apt. Dependabot proposes digest updates. A test fails unless the image's Playwright version equals the lockfile's, and unless both jobs use that image.
- **The release workflow splits verification from publishing:** `version` → `plan` → `verify release` → `publish`.
  - **`plan`** (`contents: read`) lists the versions not yet on npm.
  - **`verify release`** (`contents: read`, in the image) runs `pnpm verify` when the plan has something to publish. Its steps are `verify.yml`'s, apart from pnpm's store cache, which a release doesn't use, and a test enforces that.
  - **`publish`** keeps the privileged permissions and runs no tests. It publishes only if `verify release` succeeded in the same run: a step fails the job before any publishing step otherwise, including when a version became publishable after the plan job ran. Its finishing steps still run, so a failed verification doesn't stop earlier releases from being repaired.
- **The test suite never runs alongside `id-token: write` or write permissions.**

## Alternatives considered

- **Run the whole publish job in the image:** rejected. The image has no `gh` or `jq`, and installing them would bring back package downloads at release time.
- **Keep verifying in the publish job, on the runner:** rejected. It keeps both the mirror's delays and the test suite's access to the release's privileges.

## Consequences

- Verification no longer depends on apt mirrors, and is the same environment in pull requests and releases.
- A compromised test or devDependency can no longer use the release's OIDC token or write permissions.
- The release workflow has two more jobs. Pushes to `main` with nothing to publish skip `verify release`, so they cost only the short `plan` job.
- The image, its digest and the Playwright version have to move together: Dependabot proposes the image, and the test blocks a mismatch.
