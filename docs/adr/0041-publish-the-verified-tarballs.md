# 0041. Publish the tarballs the verify job built and checked

- **Status:** Accepted
- **Date:** 2026-11-12
- **Amends:** [ADR 0023](0023-verify-releases-in-an-unprivileged-job.md), on which job builds and packs what's published

## Context

`@hussmartinez/sdk-core` 0.1.3 and 0.2.0, and `@hussmartinez/ui` 0.1.0, 0.1.1 and 0.2.0, were published without `dist/`: their tarballs hold only `LICENSE`, `package.json` and `README.md`, and importing them fails.

No release workflow ever had a build step. Until [ADR 0023](0023-verify-releases-in-an-unprivileged-job.md), `pnpm verify` ran in the publish job, and its build happened to leave `dist/` behind for `changeset pack`. ADR 0023 moved verification into its own unprivileged job, rightly, but the publish job went on packing a checkout it never built. `sdk-ci`'s `publish` action inherited that. Nothing checked what was packed, so the first release after the split, sdk-core 0.1.3, shipped empty, and so did every `ui` release. `sdk-config` was unaffected, because it publishes its sources.

Building in the publish job would fix the symptom, but it would run every package's build, and its devDependencies, where the OIDC token is, which is what ADR 0023 removed.

## Decision

- **The verify job builds, packs and checks; the publish job only publishes.** After `pnpm verify` has built and verified the packages, the release's verify job packs the versions to publish from that build, checks the tarballs, and uploads them with their publish plan, which records each tarball's integrity. Its output is the plan's SHA-256. The publish job downloads them and publishes exactly those files. It never builds or packs.
- **Every published byte chains back to the verify job.** The publish job requires the downloaded plan's SHA-256 to equal the verify job's output, passed between the jobs by GitHub, and each tarball to match the plan's integrity. It also requires the plan to list the same versions as its own plan, so a version that became publishable in between isn't published unverified.
- **Tarballs are checked before anything is published:**
  - **every file a package points to is in its tarball:** everything that `main`, `module`, `types`, `typings`, `bin` and `exports` reference, with `*` patterns matching at least one file. A dependency-free check in `sdk-ci` runs in both jobs, and fails naming each missing path;
  - **`publint --strict` passes on the tarball itself,** in the verify job only, from `sdk-ci`'s own lockfile. publint is third-party code, so it doesn't run where the OIDC token is, and the hash chain guarantees that the publish job publishes the bytes it checked.
- **After publishing,** the publish job reads each version's `dist.integrity` back from the registry and fails if it doesn't match the tarball, as it already did.
- **`sdk-ci` 2.0.0 implements this** ([sdk-ci#11](https://github.com/ie-huss-martinez/sdk-ci/pull/11)). Its release skeleton changes: the verify job packs and outputs `packs`, and the publish job takes it. So every repository's `release.yml` changes when it adopts 2.0.0.

## Alternatives considered

- **Build in the publish job:** the smallest change, but it runs every package's build and devDependencies with `id-token: write`, undoing ADR 0023. It would also publish a build other than the one the tests ran against.
- **Rebuild in the publish job and compare with the verify job's tarballs:** it catches a non-reproducible build, but it still runs build code in the privileged job, for a comparison that the hash chain already makes unnecessary.
- **Only add the file check to the existing publish job:** it would have stopped the empty releases, but then nothing could be released at all, because the publish job has nothing built to pack.

## Consequences

- No release can publish a tarball that lacks a file its `package.json` points to, or that fails publint, and the error names what's missing.
- What's published is byte for byte what the verify job built and tested, and the publish job still runs no build or test code.
- The broken versions stay on npm. Each repository's next release replaces them as `latest`. Deprecating them needs the npm account's owner, and is decided outside this record.
- Every repository's `release.yml` changes with its `sdk-ci` 2.0.0 pin bump, and `check-workflows` enforces the new skeleton.
