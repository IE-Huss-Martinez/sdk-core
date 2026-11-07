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
  - **`feat`** for any new public capability in either package;
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
- **Changeset:** add one if the pull request changes what a package publishes. See [Changesets](#changesets).
- **Checks:** `verify`, `changeset` and `pr-title` must pass, and the branch must be up to date with `main`.

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

## Changesets

Versions and release notes come from changesets ([ADR 0021](docs/adr/0021-version-and-release-with-changesets.md)), not from commit messages. A changeset is a small Markdown file in `.changeset/` that names the packages a pull request changes, the version bump each needs, and a note for the people who use them.

```sh
pnpm changeset
```

It asks which packages changed and how, then writes the file. Commit it with your change.

- **When you need one:** whenever a pull request changes a package's published source or its `package.json`, meaning `src/` outside tests and fixtures, or sdk-config's `biome/` and `tsconfig/` presets. The `changeset` check fails without one.
- **When you don't:** for tests, fixtures, READMEs, documentation, CI and root tooling. If a change touches published files without affecting users, such as a pure refactor, add an empty changeset with `pnpm changeset --empty`.
- **The bump:**
  - `patch` for fixes;
  - `minor` for new capabilities, and during `0.x` for breaking changes too;
  - `major` only after `1.0`, for breaking changes.

**Write the note for users, not reviewers.** It becomes the package's changelog entry and its GitHub Release notes.

- **Say what changed for them, and what to do:** "`createMessages` now accepts plural objects from JSON files" rather than "refactor the message parser".
- **Name the API they'll see:** function, option, error code. Describe the behaviour, not the implementation.
- **Explain the migration** for anything breaking: what to change in their code, with a short example.
- **Keep it short.** One or two sentences is typical, with a list for several related changes. The pull request holds the detail.

## How releases happen

Nobody publishes by hand.

1. **The version pull request.** When changesets reach `main`, the release workflow opens or updates a **`chore: version packages`** pull request. It applies the changesets: it bumps the versions, writes the changelogs and deletes the changeset files.
2. **Merging it.** The version pull request is reviewed and merged like any other.
3. **Publishing.** Once it's merged, the same workflow:
   - runs `pnpm verify`;
   - publishes each new version to npm through trusted publishing, with provenance and no npm token;
   - creates a tag such as `@hussmartinez/sdk-core@0.2.0` and a GitHub Release with the changelog entry;
   - attaches the tarball and `SHA256SUMS`, with artifact attestations.

## Setting up releases

These are one-time steps for the maintainer ([ADR 0021](docs/adr/0021-version-and-release-with-changesets.md)).

### The GitHub App for the version pull request

1. **Create a GitHub App.** It needs repository permissions *Contents: read and write* and *Pull requests: read and write* (*Metadata: read* is implied), and no webhook. Install it on `hussmartinez/sdk-core` only.
2. **Create a `release` environment** under Settings → Environments, and restrict its deployment branches to `main`.
3. **Store the App's credentials in that environment:** its client ID as the variable `RELEASE_APP_CLIENT_ID`, and a private key as the secret `RELEASE_APP_PRIVATE_KEY`. Never store them as repository-level secrets, which workflows on every branch can read.

The `version` job fails with these instructions until both are set.

### npm

1. **Create an `npm` environment,** restricted to `main`. Add yourself as a required reviewer if you want to approve each publish.
2. **Bootstrap the first publish.** npm can only configure a trusted publisher for a package that already exists, so the first version needs a token:
   1. Create a granular access token that can publish only `@hussmartinez/sdk-core` and `@hussmartinez/sdk-config`, with an expiry of a few days. Store it only as the secret `NPM_TOKEN` in the `npm` environment.
   2. Merge the first version pull request. The publish job uses the token, logs a warning that it did, and still attaches provenance.
   3. **Straight away,** configure the trusted publisher for each package: Package settings → Trusted Publisher → GitHub Actions, with organisation or user `hussmartinez`, repository `sdk-core`, workflow `release.yml`, environment `npm`, and direct `npm publish` allowed. npm expires a configuration that hasn't published within two days, which is why this comes right after the bootstrap.
   4. Delete the `NPM_TOKEN` secret, revoke the token on npm, and turn on "Require two-factor authentication and disallow tokens" for each package, under Settings → Publishing access.

From then on, publishing uses trusted publishing only, with no token anywhere.

## Licence

By contributing, you agree that your contributions are licensed under the [Apache License 2.0](LICENSE), like the rest of the project.
