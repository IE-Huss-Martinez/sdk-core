# sdk-core

Shared foundation for the `@hussmartinez` SDK family: client-side SDKs for working with PDFs, images, video and audio, where files never leave the user's device.

This repository is a pnpm workspace with two packages:

- **[`@hussmartinez/sdk-core`](packages/sdk-core):** headless runtime code shared by every SDK, with no UI framework.
- **[`@hussmartinez/sdk-config`](packages/sdk-config):** shared development configuration: TypeScript, Biome, stylelint, dependency-cruiser, commitlint, lint-staged and secretlint presets.

The standards every SDK follows live in [`STANDARDS.md`](STANDARDS.md). The reasoning behind them is recorded as architecture decision records in [`docs/adr`](docs/adr).

> Status: being bootstrapped. No packages are published yet.

Contributors, including coding agents, start with [`AGENTS.md`](AGENTS.md).

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
| Layer rules | `lint:deps` | dependency-cruiser |
| Build | `build` | per package |
| Unit tests | `test` | Vitest |
| Browser tests | `test:browser` | per package |
| Bundle budgets | `check:size` | per package |
| API report | `check:api` | per package |
| Package checks | `check:package` | per package |

Steps marked "per package" run each package's script of the same name, and pass while no package defines one yet.

The git hooks ([ADR 0016](docs/adr/0016-git-hooks-and-merge-guards.md)) run automatically: a secret scan and lint of staged files on commit, a Conventional Commits check of the message, and `pnpm verify:fast` on push.

## License

[Apache-2.0](LICENSE)
