---
"@hussmartinez/sdk-core": patch
---

`createMessages` accepts overrides typed as `MessageOverrides<Catalogue>`, such as an SDK's `messages` prop, without a cast. Before, a plural typed only as `PluralMessage` made every key look like an unknown placeholder, so SDKs passed `overrides as never`. You can remove that cast. Overrides written as literals are still checked as before, plurals included, and untyped JSON is still checked at runtime.
