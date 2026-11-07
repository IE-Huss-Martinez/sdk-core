# Architecture decision records

Each record captures one significant decision: the context that forced it, what we chose, the alternatives we rejected and the consequences we accept. Records are numbered and immutable. To change a decision, write a new record that supersedes the old one and link the two.

Use [`template.md`](template.md) for new records. Name files `NNNN-short-title.md`, taking the next free number.

| # | Decision | Status |
|---|---|---|
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions | Accepted |
| [0002](0002-one-repository-per-sdk.md) | One repository per SDK, with shared `sdk-core` and `ui` | Accepted |
| [0003](0003-hm-namespace.md) | The `hm` namespace for everything that reaches the page | Accepted |
| [0004](0004-entry-points-and-module-format.md) | Package entry points and module format | Accepted |
| [0005](0005-plain-css-with-cascade-layers.md) | Plain CSS with cascade layers | Accepted |
| [0006](0006-design-tokens-and-theming.md) | Design tokens and full theming | Accepted |
| [0007](0007-server-rendering-and-nextjs.md) | Server rendering and Next.js compatibility | Accepted |
| [0008](0008-ports-adapters-and-session.md) | Ports and adapters with a framework-agnostic session | Accepted |
| [0009](0009-features-as-tools.md) | Features as registered tool modules | Accepted |
| [0010](0010-edits-as-commands.md) | Edits as commands with undo history | Accepted |
| [0011](0011-worker-messaging-and-assets.md) | Typed worker messaging, with inline or self-hosted assets | Accepted |
| [0012](0012-hostile-input-and-no-network.md) | Treat every input file as hostile, and make no network requests | Accepted |
| [0013](0013-browser-and-react-support.md) | Browser and React support | Accepted |
| [0014](0014-accessibility-and-translatable-text.md) | Accessibility and translatable text | Accepted |
| [0015](0015-verification-and-releases.md) | Verification, releases and trusted publishing | Accepted; release tooling superseded by [0021](0021-version-and-release-with-changesets.md) |
| [0016](0016-git-hooks-and-merge-guards.md) | Git hooks and merge guards | Accepted |
| [0017](0017-core-errors-and-shared-runtime-imports.md) | Where `core/errors` and `@hussmartinez/sdk-core` sit in the core layers | Accepted |
| [0018](0018-worker-rpc-protocol.md) | The worker RPC protocol, its errors and its buffer rules | Accepted; its abort-reason rule is superseded by [0020](0020-file-policy.md) |
| [0019](0019-message-catalogues.md) | Message catalogues as typed, plain-text data | Accepted |
| [0020](0020-file-policy.md) | File policy: typed limits with warnings, shared by every SDK | Accepted; supersedes [0018](0018-worker-rpc-protocol.md)'s abort-reason rule |
| [0021](0021-version-and-release-with-changesets.md) | Version and release with Changesets | Accepted; supersedes [0015](0015-verification-and-releases.md)'s release tooling |
