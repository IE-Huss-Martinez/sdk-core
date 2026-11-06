# 0016. Git hooks and merge guards

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

Problems are cheapest to fix the moment they are created:

- **Formatting and naming slips:** caught in seconds by a hook, but minutes later by CI.
- **Leaked secrets:** a secret committed in a public repository is exposed as soon as it is pushed. Rewriting history afterwards doesn't help, because forks and caches keep it. An API token leaked this way in an earlier private project of this family.
- **Commit messages:** release-please builds versions and changelogs from them, so a malformed message becomes a wrong release note.

Hooks also have a well-known failure mode. When they are slow, people and agents bypass them with `--no-verify`, and they stop protecting anything.

The squash commit on `main` takes its message from the pull request title, which no local hook can see.

## Decision

### Hooks, tiered by speed

| Hook | Runs | Budget |
|---|---|---|
| `pre-commit` | Biome and stylelint on staged files only (lint-staged), and a secret scan of the staged changes (secretlint) | ≤ 5 s |
| `commit-msg` | commitlint with the Conventional Commits preset | instant |
| `pre-push` | `pnpm verify:fast`: TypeScript, unit tests, dependency rules, API report check ([0015](0015-verification-and-releases.md)) | ≤ 60 s |

The full `pnpm verify` is not a hook. It runs before a pull request is marked ready, and again in CI.

### Implementation

- **Husky** manages hooks, installed through `"prepare": "husky"`, so every clone and worktree gets them on `pnpm install`.
- **Hook files are one line,** such as `pnpm verify:fast`. The rules live in package scripts and in `@hussmartinez/sdk-config` presets for lint-staged, commitlint and secretlint, so changing a rule means updating one shared package, not every repository's hooks.
- **Budgets are enforced.** If a hook outgrows its budget, checks move to a later tier rather than slowing every commit.
- **`--no-verify` is forbidden** for people and agents, as stated in every repository's `AGENTS.md`. A hook that fails on something wrong gets fixed in its own pull request.

### Merge guard for pull request titles

- **Title check:** a `pr-title` workflow validates every pull request title against the same Conventional Commits rules used by commitlint, and it is a required status check.
- **Fast and safe:** it runs on the `pull_request` event with read-only permissions and no checkout, so it finishes in seconds and can't be abused by pull requests from forks.

## Alternatives considered

- **No hooks, CI only:** slow feedback, and secrets reach the public remote before anything can stop them.
- **The full `pnpm verify` in `pre-push`:** several minutes per push, which leads straight to `--no-verify`.
- **lefthook instead of Husky:** faster, with parallel hooks. Husky was kept for consistency with the maintainer's existing repositories. Revisit with a new ADR if hook time becomes a problem.
- **gitleaks instead of secretlint:** a stronger scanner, but it is a separate binary that every machine must install. secretlint installs with the other dependencies.

## Consequences

- Formatting, naming rules, secrets and commit messages are checked before anything leaves the machine.
- Commits take a few seconds longer, and pushes up to a minute.
- Hooks can still be bypassed technically. CI remains the gate that can't be skipped.
