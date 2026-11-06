# @hussmartinez/sdk-core

Headless runtime shared by the `@hussmartinez` SDK family: worker messaging, errors, session primitives, the tool registry, the custom-element base, file policy and the messages helper.

> Status: not published yet. The public API lands in upcoming pull requests.

## API report

The public API is recorded in [`api/sdk-core.api.md`](api/sdk-core.api.md) by api-extractor ([ADR 0015](../../docs/adr/0015-verification-and-releases.md)). `pnpm check:api`, part of `verify` and `verify:fast`, fails when the API changes without the report. After an intended change, run `pnpm api:update` and commit the updated report with the change.

## License

[Apache-2.0](../../LICENSE)
