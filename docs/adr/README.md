# Architecture decision records

Each record captures one significant decision: the context that forced it, what we chose, the alternatives we rejected and the consequences we accept. Records are numbered and immutable. To change a decision, write a new record that supersedes the old one and link the two.

Use [`template.md`](template.md) for new records. Name files `NNNN-short-title.md`, taking the next free number.

| # | Decision | Status |
|---|---|---|
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions | Accepted |
| [0002](0002-one-repository-per-sdk.md) | One repository per SDK, with shared `sdk-core` and `ui` | Accepted; repositories moved to an organisation by [0024](0024-github-organisation-for-the-sdk-family.md); `sdk-ci` added by [0026](0026-share-ci-steps-from-sdk-ci.md) |
| [0003](0003-hm-namespace.md) | The `hm` namespace for everything that reaches the page | Accepted |
| [0004](0004-entry-points-and-module-format.md) | Package entry points and module format | Accepted |
| [0005](0005-plain-css-with-cascade-layers.md) | Plain CSS with cascade layers | Accepted |
| [0006](0006-design-tokens-and-theming.md) | Design tokens and full theming | Accepted |
| [0007](0007-server-rendering-and-nextjs.md) | Server rendering and Next.js compatibility | Accepted |
| [0008](0008-ports-adapters-and-session.md) | Ports and adapters with a framework-agnostic session | Accepted; its session primitives are shared through [0029](0029-session-store-and-history.md) |
| [0009](0009-features-as-tools.md) | Features as registered tool modules | Accepted; `defineTool` and the registries defined by [0030](0030-tools-and-keyboard-shortcuts.md) |
| [0010](0010-edits-as-commands.md) | Edits as commands with undo history | Accepted; its history is shared through [0029](0029-session-store-and-history.md) |
| [0011](0011-worker-messaging-and-assets.md) | Typed worker messaging, with inline or self-hosted assets | Accepted; refined for engines' own workers by [0028](0028-third-party-engines.md) |
| [0012](0012-hostile-input-and-no-network.md) | Treat every input file as hostile, and make no network requests | Accepted; its pdf.js `isEvalSupported` rule superseded by [0028](0028-third-party-engines.md); "parse only in workers" refined for page-only decoders by [0031](0031-platform-decoders-on-the-page.md) |
| [0013](0013-browser-and-react-support.md) | Browser and React support | Accepted |
| [0014](0014-accessibility-and-translatable-text.md) | Accessibility and translatable text | Accepted |
| [0015](0015-verification-and-releases.md) | Verification, releases and trusted publishing | Accepted; release tooling superseded by [0021](0021-version-and-release-with-changesets.md) |
| [0016](0016-git-hooks-and-merge-guards.md) | Git hooks and merge guards | Accepted |
| [0017](0017-core-errors-and-shared-runtime-imports.md) | Where `core/errors` and `@hussmartinez/sdk-core` sit in the core layers | Accepted |
| [0018](0018-worker-rpc-protocol.md) | The worker RPC protocol, its errors and its buffer rules | Accepted; its abort-reason rule is superseded by [0020](0020-file-policy.md); refined for engines' own workers by [0028](0028-third-party-engines.md) |
| [0019](0019-message-catalogues.md) | Message catalogues as typed, plain-text data | Accepted |
| [0020](0020-file-policy.md) | File policy: typed limits with warnings, shared by every SDK | Accepted; supersedes [0018](0018-worker-rpc-protocol.md)'s abort-reason rule; refined for page-only decoders by [0031](0031-platform-decoders-on-the-page.md) |
| [0021](0021-version-and-release-with-changesets.md) | Version and release with Changesets | Accepted; supersedes [0015](0015-verification-and-releases.md)'s release tooling; the App credentials' location superseded by [0024](0024-github-organisation-for-the-sdk-family.md); the rule for `package.json` changes narrowed by [0027](0027-dev-only-package-json-changes-need-no-changeset.md) |
| [0022](0022-storybook-for-the-component-catalogue.md) | Storybook for the component catalogue | Accepted |
| [0023](0023-verify-releases-in-an-unprivileged-job.md) | Verify releases in an unprivileged job | Accepted; refines how [0021](0021-version-and-release-with-changesets.md) verifies releases; the image's location superseded by [0025](0025-one-browser-test-image-in-one-place.md) |
| [0024](0024-github-organisation-for-the-sdk-family.md) | A GitHub organisation for the SDK family | Accepted; supersedes where [0021](0021-version-and-release-with-changesets.md) keeps the App's credentials |
| [0025](0025-one-browser-test-image-in-one-place.md) | One browser test image, in one place | Accepted; supersedes where [0023](0023-verify-releases-in-an-unprivileged-job.md) keeps the image |
| [0026](0026-share-ci-steps-from-sdk-ci.md) | Share the family's CI steps from `sdk-ci` | Accepted |
| [0027](0027-dev-only-package-json-changes-need-no-changeset.md) | Dev-only `package.json` changes need no changeset | Accepted; supersedes part of [0021](0021-version-and-release-with-changesets.md) |
| [0028](0028-third-party-engines.md) | Third-party engines: no code from file data, proven offline, and their own workers | Accepted; supersedes [0012](0012-hostile-input-and-no-network.md)'s pdf.js eval rule |
| [0029](0029-session-store-and-history.md) | Shared session primitives: a store, a history and a reducer type | Accepted; refines [0008](0008-ports-adapters-and-session.md) and [0010](0010-edits-as-commands.md) |
| [0030](0030-tools-and-keyboard-shortcuts.md) | Tools and keyboard shortcuts | Accepted; refines [0009](0009-features-as-tools.md) |
| [0031](0031-platform-decoders-on-the-page.md) | Platform decoders that only run on the page | Accepted; refines [0012](0012-hostile-input-and-no-network.md) and [0020](0020-file-policy.md) |
| [0032](0032-duration-format-and-hertz-unit.md) | A duration format for messages and a hertz unit for limits | Accepted; refines [0019](0019-message-catalogues.md) and [0020](0020-file-policy.md) |
| [0033](0033-api-reports-for-several-entry-points.md) | API reports for packages with several entry points | Accepted |
| [0034](0034-shared-error-helpers.md) | Shared helpers that adapt failures to an SDK's error class | Accepted; refines [0018](0018-worker-rpc-protocol.md) and [0020](0020-file-policy.md) |
