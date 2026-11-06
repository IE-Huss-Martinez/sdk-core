# @hussmartinez/sdk-core

Headless runtime shared by the `@hussmartinez` SDK family: worker messaging, errors, session primitives, the tool registry, the custom-element base, file policy and the messages helper.

The package is ESM only, has no dependencies, and does nothing on import, so it's safe to load on a server ([ADR 0004](../../docs/adr/0004-entry-points-and-module-format.md)).

> Status: not published yet. The rest of the API lands in upcoming pull requests.

## Errors

Every SDK throws one subclass of `SdkError`, with a stable `code`, serialisable `details` and a standard `cause` ([ADR 0008](../../docs/adr/0008-ports-adapters-and-session.md)). Codes are `SCREAMING_SNAKE_CASE` and never change once released. User-facing text is looked up by code in the messages catalogue, never taken from `message` ([ADR 0014](../../docs/adr/0014-accessibility-and-translatable-text.md)).

```ts
import { isSdkError, SdkError } from "@hussmartinez/sdk-core";

type PdfErrorCode = "FILE_TOO_LARGE" | "PDF_ENCRYPTED";

export class PdfError extends SdkError<PdfErrorCode> {
  override readonly name = "PdfError";
}

throw new PdfError("FILE_TOO_LARGE", "The file exceeds the size limit.", {
  details: { limit: 52_428_800, size: 73_400_320 },
});
```

- **Subclasses** narrow `code` to their own union and set `name` explicitly, so it survives minification. They keep the base constructor's signature `(code, message, options)`, so errors can be rebuilt after crossing a worker boundary.
- **`details`** accept JSON-compatible values only: strings, finite numbers, booleans, `null`, arrays and plain objects.
- **`isSdkError(value, code?)`** narrows a caught value, optionally to one code. It recognises errors from other realms and from duplicate copies of sdk-core, where `instanceof` fails, through a shared brand. Errors that merely look similar, such as Node errors with a string `code`, aren't accepted.

### Across a worker boundary

`structuredClone` and `postMessage` drop an error's `code` and `details`. Serialise errors explicitly instead:

```ts
// In the worker
port.postMessage({ error: serializeError(error) });

// On the page
const error = deserializeError(message.error, { errorClasses: { PdfError } });
error instanceof PdfError; // true
```

- **`serializeError(error, options?)`** turns any thrown value into plain data and never throws for the value itself. Values that aren't `SdkError`s get the code `UNKNOWN`. Their original name goes in `details.originalName`, or their `typeof` in `details.thrownType`. Stack traces are left out unless you pass `includeStack: true`, so they don't cross the boundary in production.
- **`deserializeError(data, options?)`** rebuilds the error with its registered class, or as `SdkError` keeping its name. It treats the data as untrusted: invalid input becomes an `UNKNOWN` error, details are sanitised again, and class names are only looked up as own keys of `errorClasses`.
- **Both** follow the `cause` chain up to `maxDepth` levels (8 by default) and stop at cycles.

## API report

The public API is recorded in [`api/sdk-core.api.md`](api/sdk-core.api.md) by api-extractor ([ADR 0015](../../docs/adr/0015-verification-and-releases.md)). `pnpm check:api`, part of `verify` and `verify:fast`, fails when the API changes without the report. After an intended change, run `pnpm api:update` and commit the updated report with the change.

## License

[Apache-2.0](../../LICENSE)
