---
"@hussmartinez/sdk-core": patch
---

The built JavaScript no longer carries TSDoc comments: the `.` entry is about a third smaller before your bundler minifies it, and `./element` is about 40% smaller. The documentation is unchanged in the `.d.ts` files and the source maps, and `@__PURE__` annotations stay, so tree-shaking works as before.
