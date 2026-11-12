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

## How pull requests are reviewed

**The author of a pull request never merges it.** A separate reviewer does, after reviewing it:

- **The diff:** the reviewer reads the full diff and checks it against `STANDARDS.md` and the ADRs.
- **The checks:** CI must be green. For any change to code, the reviewer also runs `pnpm verify` independently, rather than relying on the author's result.
- **Not "almost right":** if the scope, title or quality isn't right, the pull request is fixed before it's merged.

**Coding agents** open one pull request at a time. After opening it, they stop and report the link, a short summary and their `pnpm verify` result. They start the next change only after the pull request is merged, from an up-to-date `main`. An agent never reviews or merges a pull request it wrote; author and reviewer are always different sessions.

## How pull requests are merged

Pull requests are squash-merged into a linear `main`, and the reviewer writes the squash commit message:

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
- **Dev-only `package.json` changes don't count** ([ADR 0027](docs/adr/0027-dev-only-package-json-changes-need-no-changeset.md)): a change to `devDependencies`, `scripts`, `packageManager` or `devEngines` alone needs no changeset, so Dependabot's development updates pass. Any other field counts, including `dependencies`, `engines` and `exports`. If a toolchain update changes what the build ships, add a changeset anyway.
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

**If a release partly fails,** for example because one package's publish is rejected, the packages that did publish still get their tarball, `SHA256SUMS` and attestation, and the workflow run fails. After fixing the cause, re-run the workflow or push to `main` again. Every run checks each package's current version against npm and its GitHub Release, publishes what's missing, and repairs releases without their files, using tarballs downloaded from npm and verified against the registry's integrity. A complete release is left alone.

**npm can take several minutes** to serve a version it has just accepted. The workflow waits up to 10 minutes from each publish, and logs a "Visible on npm" notice with the time it took. If a version still isn't visible by then, the run fails after finishing the other packages; re-run the failed job once npm shows the version, and it repairs the release from npm.

## Setting up a new repository

`scripts/create-sdk-repo.mjs` gives a repository of the family its GitHub settings ([ADR 0024](docs/adr/0024-github-organisation-for-the-sdk-family.md)), so a new SDK needs no manual GitHub steps:

```sh
pnpm create-sdk-repo pdf-sdk --description "…"          # shows what it would change
pnpm create-sdk-repo pdf-sdk --description "…" --apply  # changes it
```

- **Names:** `<kind>-sdk` in lowercase letters, or one of the shared repositories: `sdk-core`, `ui`, `sdk-ci` and `ai-core` ([ADR 0035](docs/adr/0035-ai-core-and-host-configured-network.md)).
- **What it sets:** it creates the public repository in `ie-huss-martinez` if it's missing, then makes its settings match `sdk-core`'s and `ui`'s:
  - squash merging only, with the pull request title and a blank message, and branches deleted on merge;
  - no wiki or projects;
  - private vulnerability reporting, secret scanning with push protection, Dependabot alerts and Dependabot security updates, all on;
  - a read-only `GITHUB_TOKEN` by default, which can't approve pull requests;
  - the `release` and `npm` environments, limited to `main`, with no secrets: the release App and its credentials are organisation-level. `sdk-ci`, which publishes nothing to npm, gets neither, and no npm steps at the end;
  - protection for `main`: pull requests with no required approvals, admins included, linear history, no force pushes or deletions, and up-to-date required checks from GitHub Actions.
- **Required checks follow the workflows on `main`:** `pr-title` once `pr-title.yml` is there, `verify` once `verify.yml` is, and `changeset` once `release.yml` and `.changeset/` are. **Run the script again after each setup pull request is merged,** so the next check becomes required. It's the one way to keep them in sync.
- **It's safe to run any time.** Without `--apply`, it only reads. With it, it changes only what differs from the family's settings, and reports it. It uses the `gh` CLI with the `repo` scope.
- **Not its job:** the repository's contents, which come from pull requests. Until `main` exists, it skips the protection and says so.

It ends with the steps it can't do: npm's first publish of each new package, with a bootstrap token, and configuring its trusted publisher, as below.

## Setting up releases

These are one-time steps for the maintainer ([ADR 0021](docs/adr/0021-version-and-release-with-changesets.md), [ADR 0024](docs/adr/0024-github-organisation-for-the-sdk-family.md)).

### The GitHub App for the version pull request

The App and its credentials are shared by every repository in the `ie-huss-martinez` organisation, so they're set up once for the organisation:

1. **Create a GitHub App owned by the organisation.** It needs repository permissions *Contents: read and write* and *Pull requests: read and write* (*Metadata: read* is implied), and no webhook. Install it on all the organisation's repositories.
2. **Store its credentials at organisation level,** under Organisation settings → Secrets and variables → Actions: its client ID as the variable `RELEASE_APP_CLIENT_ID`, and a private key as the secret `RELEASE_APP_PRIVATE_KEY`. Give both access only to the repositories that release.

Each repository's **`release` environment**, restricted to `main` so the `version` job only runs there, is created by `pnpm create-sdk-repo` (see above). The `version` job fails with these instructions until the App's credentials are available.

### npm

1. **The `npm` environment,** restricted to `main`, is created by `pnpm create-sdk-repo`. Add yourself as a required reviewer if you want to approve each publish.
2. **Bootstrap the first publish.** npm can only configure a trusted publisher for a package that already exists, so the first version needs a token:
   1. Create a granular access token that can publish only `@hussmartinez/sdk-core` and `@hussmartinez/sdk-config`, with an expiry of a few days. Store it only as the secret `NPM_TOKEN` in the `npm` environment.
   2. Merge the first version pull request. The publish job uses the token, logs a warning that it did, and still attaches provenance.
   3. **Straight away,** configure the trusted publisher for each package: Package settings → Trusted Publisher → GitHub Actions, with organisation or user `ie-huss-martinez`, repository `sdk-core`, workflow `release.yml`, environment `npm`, and direct `npm publish` allowed. npm expires a configuration that hasn't published within two days, which is why this comes right after the bootstrap.
   4. Delete the `NPM_TOKEN` secret, revoke the token on npm, and turn on "Require two-factor authentication and disallow tokens" for each package, under Settings → Publishing access.

From then on, publishing uses trusted publishing only, with no token anywhere.

**If the repository moves to another owner,** update each package's trusted publisher to the new owner before the next release. npm rejects a publish from an owner its trusted publisher doesn't name, and provenance rejects one whose `repository.url` doesn't match the repository the workflow runs in.

## Licence

By contributing, you agree that your contributions are licensed under the [Apache License 2.0](LICENSE), like the rest of the project.
