# sdk-core

Shared foundation for the `@hussmartinez` SDK family: client-side SDKs for working with PDFs, images, video and audio, where files never leave the user's device.

This repository is a pnpm workspace with two packages:

- **[`@hussmartinez/sdk-core`](packages/sdk-core):** headless runtime code shared by every SDK, with no UI framework.
- **[`@hussmartinez/sdk-config`](packages/sdk-config):** shared development configuration: TypeScript, Biome, stylelint, dependency-cruiser, commitlint, lint-staged and secretlint presets.

The standards every SDK follows live in [`STANDARDS.md`](STANDARDS.md). The reasoning behind them is recorded as architecture decision records in [`docs/adr`](docs/adr).

> Status: being bootstrapped. No packages are published yet.

## Development

You need Node 24 (see [`.node-version`](.node-version)) and pnpm. The exact pnpm version is pinned in `package.json`, and pnpm switches to it automatically.

```sh
pnpm install       # also installs the git hooks
pnpm verify        # everything CI runs
pnpm verify:fast   # the subset the pre-push hook runs
```

`pnpm verify` runs, in order:

| Step | Script | Tool |
|---|---|---|
| Format and lint | `lint` | Biome |
| CSS rules | `lint:css` | stylelint |
| Types | `typecheck` | TypeScript |
| Layer rules | `lint:deps` | dependency-cruiser, through [`hm-lint-deps`](packages/sdk-config#hm-lint-deps) |
| Build | `build` | per package |
| Unit tests | `test` | Vitest |
| Browser tests | `test:browser` | per package |
| Bundle budgets | `check:size` | per package |
| API report | `check:api` | per package |
| Package checks | `check:package` | per package |

Steps marked "per package" run each package's script of the same name, and pass while no package defines one yet.

The git hooks ([ADR 0016](docs/adr/0016-git-hooks-and-merge-guards.md)) run automatically: a secret scan and lint of staged files on commit, a Conventional Commits check of the message, and `pnpm verify:fast` on push.

## Releases

Each package is versioned and released on its own, from changesets ([ADR 0021](docs/adr/0021-version-and-release-with-changesets.md)). Versions stay at `0.x` until the API settles, and during `0.x` a breaking change bumps the minor version.

- **Changelogs:** each package's `CHANGELOG.md`, written for users. The first release creates them.
- **Release notes and files:** the [Releases page](https://github.com/hussmartinez/sdk-core/releases) has each version's notes, its npm tarball and a `SHA256SUMS` file, tagged like `@hussmartinez/sdk-core@0.1.0`.
- **npm:** [`@hussmartinez/sdk-core`](https://www.npmjs.com/package/@hussmartinez/sdk-core) and [`@hussmartinez/sdk-config`](https://www.npmjs.com/package/@hussmartinez/sdk-config), published from GitHub Actions with provenance.
- **Checking a download:** confirm that a tarball was built by this repository's release workflow:

  ```sh
  gh attestation verify hussmartinez-sdk-core-0.1.0.tgz --repo hussmartinez/sdk-core
  sha256sum --check SHA256SUMS
  ```

## Contributing

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening a pull request. Coding agents also start with [`AGENTS.md`](AGENTS.md). Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md). Report vulnerabilities privately, as described in the [security policy](SECURITY.md).

## License

[Apache-2.0](LICENSE)
