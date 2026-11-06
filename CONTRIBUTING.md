# Contributing

Thank you for helping. This repository is the shared foundation of the `@hussmartinez` SDK family, so changes here affect every SDK. That's why the process below is a little more formal than usual.

By taking part, you agree to follow the [code of conduct](CODE_OF_CONDUCT.md). To report a vulnerability, follow the [security policy](SECURITY.md) instead of opening an issue.

## Before you start

- **Open an issue first** for anything bigger than a small fix, so we can agree on the approach before you spend time on it.
- **Read [`STANDARDS.md`](STANDARDS.md).** It's binding for every repository in the family. The reasoning behind each rule is in the [architecture decision records](docs/adr).
- **Coding agents** also start with [`AGENTS.md`](AGENTS.md).

## Set up

You need Node 24 (see [`.node-version`](.node-version)) and pnpm. pnpm switches to the version pinned in `package.json` automatically.

```sh
pnpm install       # also installs the git hooks
pnpm verify        # everything CI runs
pnpm verify:fast   # the subset the pre-push hook runs
```

The git hooks run on their own: a secret scan and lint of staged files on commit, a Conventional Commits check of each message, and `pnpm verify:fast` on push. Don't bypass them with `--no-verify`. If a hook is wrong or too slow, fix it in its own pull request.

## Make a change

- **One focused change per pull request,** on a branch from an up-to-date `main`. Small pull requests get reviewed quickly; large ones get split.
- **Commits** follow [Conventional Commits](https://www.conventionalcommits.org/), with a lowercase subject and a header of at most 72 characters:
  - **types:** `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `chore` and `revert`;
  - **scopes:** `sdk-core` and `sdk-config`, for changes to one package, such as `fix(sdk-core): keep error codes across workers`;
  - **`feat`** for any new public capability in either package. It drives the version number and the changelog;
  - **breaking changes** take a `!`, as in `feat(sdk-core)!: …`, and explain the migration in the body.
- **Signed commits** are preferred.
- **Tests:** unit tests sit next to the code as `*.test.ts`. Test behaviour, not lines of code.
- **Public API:** fully typed, with TSDoc on every export.
- **Dependencies:** add one only when it's clearly worth it, and justify it in the pull request.
- **Docs:** keep the READMEs accurate.
- **Decisions:** anything that affects public API, consistency across packages or security, or that is hard to reverse, gets an ADR in `docs/adr` in the same pull request. To change a decision, add a new ADR that supersedes the old one.

## Open a pull request

- **Title:** a Conventional Commit of at most 65 characters, because it becomes the commit title on `main`, followed by ` (#NNN)`, and that must fit in 72. Put explanations in the description. The `pr-title` check enforces both.
- **Description:** fill in the template: what changed, why, and how you tested it, including the result of `pnpm verify`. Be as detailed as is useful; the description doesn't go into git history.
- **Checks:** `verify` and `pr-title` must pass, and the branch must be up to date with `main`.

Mark the pull request ready once `pnpm verify` passes locally. CI is the final gate, not a substitute for running it yourself.

## How pull requests are merged

Pull requests are squash-merged into a linear `main`, and the maintainer writes the squash commit message:

- **Title:** the pull request title, followed by the pull request number, such as `feat(sdk-core): add typed worker messaging (#12)`.
- **Body:** 2–6 lines of plain prose, wrapped at 72 characters, saying what changed and why.
- **Never in the body:** Markdown headings, checklists or test logs. Those belong in the pull request description.

For example:

```text
feat(sdk-core): add typed worker messaging (#12)

Adds createWorkerClient and exposeWorker, a small versioned RPC layer
for SDK workers. Calls can be cancelled with an AbortSignal, report
progress, and keep SdkError codes across the boundary, so every SDK
gets the same worker behaviour from one tested implementation.
```

## Licence

By contributing, you agree that your contributions are licensed under the [Apache License 2.0](LICENSE), like the rest of the project.
