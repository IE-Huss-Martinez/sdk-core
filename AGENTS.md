# Working in this repository

This repository is part of the `@hussmartinez` SDK family and is public. Treat it as a showcase: code, commits and pull requests should read as professional work.

## Before changing anything

- Read [`STANDARDS.md`](STANDARDS.md). It is binding for every repository in the family.
- Check [`docs/adr`](docs/adr) before changing anything a decision record covers. To change a decision, write a new ADR that supersedes the old one, in the same pull request as the change.

## Making changes

- **Pull requests:** work on a branch and open one focused pull request per change. Never push to `main`; it is protected.
- **Pull request descriptions:** cover what changed, why, and how it was tested.
- **Commits:** follow Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `build:`, `ci:`, `chore:`). The pull request title becomes the squash commit, so write it as a Conventional Commit too.
- **Signing:** commits are signed; don't disable signing.
- **No attribution:** don't add AI or tool attribution to commits or pull requests.
- **ADRs:** add one for any significant decision, meaning anything affecting public API, cross-package consistency or security, or that is hard to reverse.

## Verifying changes

- **Run `pnpm verify` locally before pushing,** and report its results in the pull request. GitHub Actions only runs for releases; it is not a substitute for local verification.
- **Never weaken a check to make it pass.** That includes lint rules, size budgets, the API report, accessibility checks and the no-network assertion. Fix the cause, or propose the change in its own pull request with an ADR if the rule itself is wrong.
