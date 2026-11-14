# 0049. Local browser tests run in the pinned image

- **Status:** Accepted
- **Date:** 2026-11-14
- **Refines:** [0025](0025-one-browser-test-image-in-one-place.md), by using the browser test image for local runs too, and [0048](0048-visual-regression-for-sdk-editors.md), whose runner becomes the general one

## Context

Local browser tests failed intermittently in every SDK: an iframe that "did not become ready within 60000ms", or a module worker that "failed to load" ([video-sdk#55](https://github.com/ie-huss-martinez/video-sdk/issues/55)). Chromium's net log, recorded with `sdk-config`'s diagnostics, showed the cause. Chromium aborted the dev server's module requests with `ERR_NETWORK_CHANGED`.

- **Why the network changes:** Chromium cancels in-flight requests when the host's network configuration changes, even requests to `localhost`. Docker adds and removes an interface whenever a container or network starts or stops. On a shared machine, that happens all the time: other repositories' verifies, `hm-test-visual`, and the image scripts.
- **CI never sees it:** its verify job runs inside one container ([ADR 0025](0025-one-browser-test-image-in-one-place.md)), whose network namespace the host's changes don't reach.

The evidence, from a harness that loads 150 slow modules in Chromium for 12 rounds, and from `sdk-core`'s own browser tests:

| Run | Result |
|---|---|
| Harness on the host, with no Docker activity of its own | 126 imports lost; 252 `ERR_NETWORK_CHANGED` from other projects' containers |
| Harness on the host, while Docker networks are created and removed | 1,728 imports lost; 3,456 `ERR_NETWORK_CHANGED` |
| Harness in the pinned image, during the same churn | none lost; no `ERR_NETWORK_CHANGED` |
| `sdk-core`'s browser tests on the host, during churn | 3 of 3 runs failed: "did not become ready" |
| The same tests in the pinned image, during churn | 3 of 3 runs passed, all 55 tests |

## Decision

- **Local browser tests run in the pinned browser test image,** like CI's: Vitest's browser mode (`test:browser`, `test:browser:all`), the end-to-end suites (`test:e2e`), and the visual tests ([ADR 0048](0048-visual-regression-for-sdk-editors.md)).
- **`hm-in-image <command>`,** in `sdk-config`, runs them:
  - **outside the image,** it builds an image from `ci/Dockerfile`'s `FROM` line with the integrity-checked pnpm. It installs the locked dependencies into the container's own volumes, so the host's binaries never mix with Linux ones, runs the command through `pnpm exec` in the same folder of the checkout, and hands written files back;
  - **inside the image,** where `HM_VISUAL_CONTAINER=1`, as in CI's verify jobs, it runs the command directly.

  A script becomes `"test:browser": "hm-in-image vitest run --project browser"`, and CI is unchanged apart from setting that variable.
- **One image and one set of volumes per repository,** shared with `hm-test-visual`, which now runs through the same code.
- **Docker is a prerequisite of local `pnpm verify`,** as [ADR 0048](0048-visual-regression-for-sdk-editors.md) already made it. Without it, the command fails with a one-line message saying how to fix it; it never skips.
- **Git hooks don't change:** `pre-push` runs `verify:fast`, which has no browser tests.

## Alternatives considered

- **A Chromium flag that ignores network changes:** none exists. Chromium's switches and features include nothing that stops its network-change notifier, nor anything that ignores particular interfaces such as Docker's bridges.
- **The browser in its own network namespace (`unshare -rn`),** without Docker: lighter, but Ubuntu 24.04 blocks unprivileged user namespaces by default (`kernel.apparmor_restrict_unprivileged_userns=1`), and it doesn't exist on macOS.
- **Retrying a failed load or test:** a module graph that fails to load can't be retried inside the page. Retrying whole tests would also hide real failures, and slow every run that hits one.
- **The host's `node_modules` mounted into the image,** as video-sdk's `test:browser:image` script does: faster, but only while the host is Linux on the same architecture, because native packages such as rolldown and esbuild are built for the host.
- **Accepting the flake:** every SDK's local verify fails at random while other projects use Docker, and the failures say nothing about the change under test.

## Consequences

- Local browser tests behave like CI's: the same browsers, codecs and fonts, and no host network changes. That also makes Firefox and WebKit locally (`test:browser:all`) match CI.
- Each browser step pays for starting a container: about 3 seconds per package once the image and volumes are warm. The first run builds the image and installs the dependencies into the volumes.
- Every repository's CI verify jobs set `HM_VISUAL_CONTAINER: "1"`, an environment variable that `check-workflows` allows as an addition. Its name predates this decision; it marks the browser test image for every command.
- SDKs adopt it in their own pull requests, by changing their browser scripts and their workflows' environment, and drop scripts such as video-sdk's `test:browser:image`.
