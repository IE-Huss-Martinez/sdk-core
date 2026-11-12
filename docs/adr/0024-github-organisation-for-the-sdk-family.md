# 0024. A GitHub organisation for the SDK family

- **Status:** Accepted
- **Date:** 2026-11-12
- **Supersedes:** the rule in [ADR 0021](0021-version-and-release-with-changesets.md) that the release App's credentials live only in each repository's `release` environment
- **Refines:** where [ADR 0002](0002-one-repository-per-sdk.md)'s repositories live; its one-repository-per-SDK decision is unchanged

## Context

[ADR 0002](0002-one-repository-per-sdk.md) gives every SDK its own repository, and the family is expected to grow to twenty or more. The repositories lived under the personal account `hussmartinez`, which made each new SDK a round of manual GitHub work:

- **No account-wide secrets:** a personal account can't share secrets or variables across repositories, so the release App's credentials from [ADR 0021](0021-version-and-release-with-changesets.md) had to be stored again in every repository.
- **The App's reach:** installing the release App on all of a personal account's repositories would also give it write access to that account's private, unrelated repositories. So it had to be installed repository by repository.
- **Settings:** branch protection, required checks, environments and security settings had to be repeated by hand.

## Decision

- **The SDK family lives in the `IE-Huss-Martinez` organisation:** `IE-Huss-Martinez/sdk-core`, `IE-Huss-Martinez/ui` and `IE-Huss-Martinez/<kind>-sdk`.
- **The npm scope stays `@hussmartinez`.** Package names don't change.
- **The release App belongs to the organisation** and is installed on all its repositories, with the same permissions as before: *Contents* and *Pull requests*, read and write.
- **Its credentials are organisation-level:** the variable `RELEASE_APP_CLIENT_ID` and the secret `RELEASE_APP_PRIVATE_KEY`, under the organisation's Actions settings. The release workflow reads them under the same names, so it doesn't change. They replace the per-repository `release` environment copies.
- **Repository settings come from organisation defaults or a script,** so a new SDK needs no manual GitHub steps. The one exception is npm: the first publish of a new package, which npm gates behind a passkey, and configuring its trusted publisher.

## Alternatives considered

- **Stay on the personal account:** rejected. Every new SDK would keep needing manual secret and settings work, and the App could never be installed account-wide.
- **Keep the private key in each repository's `release` environment, set by the setup script,** so it stays restricted to `main`, as ADR 0021 intended: rejected.
  - **The key would have to be kept somewhere.** GitHub never returns a secret's value, so a script that sets the key in each new repository needs the `.pem` file stored long-term on a machine. That's a worse place for it than GitHub's secret store, and rotating it would mean updating every copy.
  - **The organisation secret's extra exposure is small.** It's readable by a workflow on a branch other than `main`, and only people who can push branches can create one. They already hold credentials stronger than the App's key. Pull requests from forks and Dependabot's runs get no Actions secrets. And a job only receives the secrets it references, so a compromised dependency in a job such as `verify` can't read the key.

## Consequences

- **Old URLs redirect.** GitHub redirects `github.com/hussmartinez/<repo>` and git remotes to the organisation. Links in existing changelogs keep working, so they aren't rewritten.
- **Each package's npm trusted publisher must name the new owner,** `IE-Huss-Martinez`. npm provenance also rejects a publish whose `repository.url` doesn't match the repository the workflow runs in. So packages must be released from the new owner, with updated metadata, only after their trusted publishers are updated.
- **The App's key is no longer limited to `main`.** An organisation secret can be limited to selected repositories, but not to a branch, so a workflow on any branch of a repository with access can read it. Why that's accepted is under "Alternatives considered". The mitigations:
  - the secret is shared only with the repositories that release;
  - the App can only write *Contents* and *Pull requests*;
  - the organisation holds only the SDK family;
  - rotating the key is one update, in one place.
- **A future `create-sdk` script** will create a repository with the organisation's settings, so adding an SDK becomes a single command plus npm's first publish.
