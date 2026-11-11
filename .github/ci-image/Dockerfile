# The image CI's verify jobs run in (verify.yml, and the release's verify job
# in release.yml): Playwright's, with the browsers and their system libraries
# preinstalled. Nothing builds this file. It holds the pinned reference so that
# Dependabot proposes digest updates, and it can be pulled to reproduce CI
# locally. The tag's Playwright version must equal the one the lockfile
# installs; test/ci-image.test.js checks that, and that both workflows use
# exactly this image.
FROM mcr.microsoft.com/playwright:v1.65.0-noble@sha256:6e3fb709361521eb27161606e6da6d2674e5e89fa16516cb37d6fdd91372273d
