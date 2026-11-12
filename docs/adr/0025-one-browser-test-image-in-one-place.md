# 0025. One browser test image, in one place

- **Status:** Accepted
- **Date:** 2026-11-12
- **Supersedes:** where [ADR 0023](0023-verify-releases-in-an-unprivileged-job.md) keeps the image, `.github/ci-image/Dockerfile` with a copy in each workflow; the rest of 0023 stands

## Context

[ADR 0023](0023-verify-releases-in-an-unprivileged-job.md) runs CI's verify jobs, in `verify.yml` and in the release workflow, in Microsoft's Playwright image, pinned by tag and digest. The image was written three times: in `.github/ci-image/Dockerfile` for Dependabot, and in each workflow's `container.image`. A test kept them equal.

`ui` found the cost with its first Dependabot update of the same image (`ui`'s ADR 0004). Dependabot updates the Dockerfile but not a workflow's `container.image`, so its pull request failed until someone edited the workflows by hand. Its title was also over the 65-character limit of the `pr-title` check, because Dependabot always appends `in /<directory>`.

## Decision

- **One place:** `ci/Dockerfile` holds the browser test image, and nothing else does.
- **The workflows read it:** a reusable workflow, `.github/workflows/ci-image.yml`, reads the Dockerfile's `FROM` line with read-only permissions. It requires exactly one, checks it against `mcr.microsoft.com/playwright:v<version>-noble@sha256:<digest>`, and outputs it. In both `verify.yml` and the release workflow, an `image` job calls it, and the verify job uses its output as `container.image`. A workflow can't read a file for `container.image` directly, which is why the job exists.
- **A failure can't pass silently:** a job whose dependency failed is skipped, and a skipped required check counts as passing. So both verify jobs run unless the run was cancelled, and fall back to an image name that can't be pulled, which fails them. In a release, the publish job then refuses to publish, as ADR 0023 requires.
- **Short Dependabot titles:** the Dockerfile sits in the short top-level directory `ci/`, and its Dependabot entry uses the prefix `ci`.
- **Tests keep the rest in step.** The image's Playwright version must equal the lockfile's, and it must be pinned by tag and digest. Neither workflow may contain an image of its own, and both verify jobs must take theirs from the `image` job, falling back on failure. The validation step itself is run against valid and invalid Dockerfiles.

## Alternatives considered

- **The copies kept equal by a test:** every Dependabot update fails until someone edits both workflows by hand.
- **The same reading step written in each workflow,** as `ui` has it with one workflow: two copies of the validation. A reusable workflow keeps one.

## Consequences

- One Dependabot pull request updates the image for pull requests and releases together, and passes on its own when the new image passes `pnpm verify`.
- Each workflow has a tiny extra job, which adds a few seconds before verifying starts. In a release, it runs only when there's something to publish.
- `sdk-core` and `ui` keep the image the same way, at the same path.
