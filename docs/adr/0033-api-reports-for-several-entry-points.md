# 0033. API reports for packages with several entry points

- **Status:** Accepted
- **Date:** 2026-11-12

## Context

[ADR 0015](0015-verification-and-releases.md) commits every package's public API to an api-extractor report, and [ADR 0004](0004-entry-points-and-module-format.md) gives SDKs separate entry points, such as `.`, `./react` and `./element`.

api-extractor analyses and rolls up one entry point per run. It treats every declaration that resolves inside the package as the package's own, even when it's imported by the package's own name. So a secondary entry point's report and declaration rollup carry **copies** of the package's types its API uses, and flag each one as a forgotten export (`ae-forgotten-export`):

- **pdf-sdk:** `./react` and `./element` copy `PdfSession`, `PdfEngine`, `PdfError` and others. [pdf-sdk#19](https://github.com/ie-huss-martinez/pdf-sdk/pull/19) turned `ae-forgotten-export` off for those two reports.
- **ui:** it met the same problem, with fewer types.

Turning the message off has two costs:

1. **It hides real mistakes.** A secondary entry point that uses a type the package never exports passes silently, and users can't name that type.
2. **It hides incompatible copies.** Copies are separate declarations. TypeScript compares interfaces and most classes by structure, so copies of them are interchangeable. A class with `private`, `protected` or `#private` members is compared by declaration instead: its copy is a different type, and a value typed with one can't be assigned to the other. If an error class such as `PdfError` or `AudioError` gained such a member, an `AudioError` from `./react` would stop type-checking where the core's `AudioError` is expected. Code that tells errors apart with `isSdkError` and `code`, rather than `instanceof`, would break at compile time with nothing wrong at run time.

## Decision

- **A shared preset:** `@hussmartinez/sdk-config/api-extractor/base.json` holds the family's message settings, and every entry point's configuration extends it and sets only its paths. It keeps every message an error, except `ae-forgotten-export`, which is written into the report (`logLevel: "none"`, `addToApiReportFile: true`). Every copied symbol is listed in the committed report, so a new one appears in review as a diff.
- **A check, `hm-check-api-reports`,** in `@hussmartinez/sdk-config`, runs after api-extractor in packages with more than one entry point. For every symbol another entry point's report lists as copied, it fails unless:
  - **the main entry point's report exports it,** and
  - **it isn't a class with `private`, `protected` or `#private` members** (constructors aside). API reports leave those members out, so it reads the main entry point's declaration rollup.
- **This check is what keeps copies interchangeable.** Today's error classes, such as `PdfError`, have only public members, so their copies are compatible. The check keeps it that way for `PdfError`, `AudioError` and any later class, at the moment a member would change it.
- **Adoption:** `sdk-core`'s own configuration extends the preset now; with one entry point, it has no copies to check. `ui` and `pdf-sdk` adopt it in their own pull requests, once a release of `@hussmartinez/sdk-config` with it has passed their `minimumReleaseAge`, and remove their per-repository exceptions.
- **The main entry point's own forgotten exports aren't checked.** They're internal helper types, such as `sdk-core`'s `TemplateParams`, listed in its report. Whether to make them public is a separate decision.

## Alternatives considered

- **Turn `ae-forgotten-export` off in each repository:** what pdf-sdk does today. It hides both costs above.
- **Import the core's types by the package's own name:** api-extractor still resolves them inside the package, and copies them anyway.
- **Re-export the copied types from each secondary entry point,** as `ui` does: each re-export pulls in the types it uses in turn (21 more in pdf-sdk's `./react`), and it widens every entry point's public API for no user benefit.
- **Skip the rollup for secondary entry points and publish `tsc`'s declaration files:** no copies, but internal module paths become part of the published types, where users can import them.

## Consequences

- Secondary entry points' reports list their copied types. That's more lines in the reports, but each is a reviewed fact rather than a hidden one.
- A secondary entry point can't expose a type the package forgot to export, or a class whose copy would be incompatible.
- Repositories maintain their api-extractor message settings in one place.
- `@hussmartinez/sdk-config` gains an optional peer dependency on `@microsoft/api-extractor`.
