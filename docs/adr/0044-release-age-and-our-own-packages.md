# 0044. A one-day release age for third-party packages, but not for our own

- **Status:** Accepted
- **Date:** 2026-11-13
- **Refines:** [ADR 0012](0012-hostile-input-and-no-network.md)'s supply chain section, by recording the release age every repository already uses, and exempting the family's own packages

## Context

Every repository's `pnpm-workspace.yaml` sets `minimumReleaseAge: 1440`: pnpm refuses any version published less than a day ago. Most malicious npm releases come from a hijacked maintainer account or a compromised publish pipeline, and they're usually found and removed within hours. A day's delay means such a version has very likely gone before any of our repositories can install it. No record says so yet; only a comment cites [ADR 0012](0012-hostile-input-and-no-network.md).

The delay also applies to the family's own `@hussmartinez` packages. Every change to `sdk-core`, `sdk-config` or `ui` reaches the SDKs a day after it's published, and work that depends on it waits. For example, the timeline helpers in `sdk-core` 0.4.0 couldn't be adopted for 24 hours after their release.

Our own packages are already protected in other ways:

- **Trusted publishing with provenance,** from the release workflow only, with no npm token ([ADR 0015](0015-verification-and-releases.md), [ADR 0021](0021-version-and-release-with-changesets.md)).
- **`trustPolicy: no-downgrade`** refuses a version whose provenance is weaker than an earlier one's, so a version published from anywhere else is refused.
- **Checked tarballs:** the release publishes only tarballs that its verify job built and checked ([ADR 0041](0041-publish-the-verified-tarballs.md)).
- **A precedent:** [ADR 0026](0026-share-ci-steps-from-sdk-ci.md) already exempts the organisation's own actions from Dependabot's cooldown, for the same reason.

## Decision

- **Third-party packages keep the one-day release age** (`minimumReleaseAge: 1440`), as before.
- **The family's own packages are exempt:** every repository's `pnpm-workspace.yaml` adds `minimumReleaseAgeExclude: ["@hussmartinez/*"]`. A new version of `sdk-core`, `sdk-config` or `ui` can be installed as soon as it's published.
- **The reviewer still checks each release before clearing it:** its file count, `dist/`, its `exports` targets and its provenance. Repositories adopt a new version once the reviewer says it's good, rather than when the day is up.
- **The exemption covers exactly the `@hussmartinez` scope.** Any other package, including one a family package depends on, still waits a day.

## Alternatives considered

- **Keep the delay for everything:** the safest default, but it holds every change in the shared packages for a day, which the protections above make unnecessary for our own scope.
- **Lower the delay for everything,** such as to 12 hours: it weakens the protection for third-party packages, where it matters, and still delays our own.
- **Bypass the check for one install** (`--config.minimum-release-age=0`): it leaves a lockfile entry the policy would refuse, with nothing in the pull request saying so. Like `--no-verify`, it's not allowed.

## Consequences

- Fixes and features in the shared packages reach the SDKs on the day they're published.
- **What we accept:** a compromised `@hussmartinez` release would reach every repository at once. A day's delay would have given time to notice it; the reviewer's check, provenance and `trustPolicy` now carry that alone. If an account or pipeline compromise ever happens, remove the exemption until it's resolved.
- **An empty or broken release** of our own would be installable at once. [ADR 0041](0041-publish-the-verified-tarballs.md)'s checks stop it from being published, and the reviewer's check before clearing it is the second line.
- Each repository adds the exemption in its own pull request.
