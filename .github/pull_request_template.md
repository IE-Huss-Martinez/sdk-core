<!--
The title must be a Conventional Commit with a lowercase subject, such as
"fix(sdk-core): keep error codes across workers". It becomes the commit title
on main. See CONTRIBUTING.md for how pull requests are merged.
-->

## What

<!-- What changed, in a few bullet points. -->

## Why

<!-- The problem this solves, with links to issues or ADRs. -->

## How it was tested

<!-- Include the result of `pnpm verify`, and anything you checked by hand. -->

## Checklist

- [ ] `pnpm verify` passes locally, and its result is above.
- [ ] Tests cover the change, next to the code.
- [ ] Exported APIs are typed and have TSDoc, and the API report is updated where the package has one.
- [ ] New dependencies are justified above.
- [ ] READMEs and docs are accurate.
- [ ] Significant decisions are recorded as an ADR in `docs/adr`.
