---
"@hussmartinez/sdk-config": minor
---

The api-extractor preset now fails when a public type references an `@internal` one (`ae-incompatible-release-tags`). api-extractor trims `@internal` declarations from the published declaration rollup, so that public type would reach users broken; api-extractor's own default only notes it in the report. To fix the failure, export the referenced type as `@public`, or leave it unexported without a release tag.
