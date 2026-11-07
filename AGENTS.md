# Working in this repository

This repository is part of the `@hussmartinez` SDK family and is public. Treat it as a showcase: code, commits and pull requests should read as professional work.

## Before changing anything

- Read [`STANDARDS.md`](STANDARDS.md). It is binding for every repository in the family.
- Check [`docs/adr`](docs/adr) before changing anything a decision record covers. To change a decision, write a new ADR that supersedes the old one, in the same pull request as the change.

## Making changes

- **Pull requests:** work on a branch and open one focused pull request per change. Never push to `main`; it is protected.
- **Pull request descriptions:** cover what changed, why, and how it was tested. They can be as detailed as useful, because they don't go into git history.
- **Squash commits:** the merger writes the commit message on `main`. Its title is the pull request title plus `(#N)`, and its body is 2–6 lines of plain prose. See [How pull requests are merged](CONTRIBUTING.md#how-pull-requests-are-merged).
- **Commits:** follow Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `build:`, `ci:`, `chore:`). The pull request title becomes the squash commit, so write it as a Conventional Commit too.
- **Changesets:** a pull request that changes a published package's source or `package.json` adds a changeset with `pnpm changeset`. Write its note for the package's users: what changed for them, the API they'll see, and how to migrate if it breaks. Versions and changelogs come from changesets, not commits. See [Changesets](CONTRIBUTING.md#changesets).
- **Signing:** commits are signed; don't disable signing.
- **No attribution:** don't add AI or tool attribution to commits or pull requests.
- **ADRs:** add one for any significant decision, meaning anything affecting public API, cross-package consistency or security, or that is hard to reverse.

## Verifying changes

- **Hooks:** they run automatically: linting and a secret scan on commit, commit message checks, and `pnpm verify:fast` on push. Never use `--no-verify`. If a hook is wrong or too slow, fix it in its own pull request.
- **Before marking a pull request ready,** run the full `pnpm verify` locally and report its results in the description.
- **CI:** it runs `pnpm verify` on Chromium, Firefox and WebKit, and checks the pull request title. Both checks must pass before merging. CI is the final gate, not a substitute for local verification.
- **Never weaken a check to make it pass.** That includes lint rules, size budgets, the API report, accessibility checks and the no-network assertion. Fix the cause, or propose the change in its own pull request with an ADR if the rule itself is wrong.
