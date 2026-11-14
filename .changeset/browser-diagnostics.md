---
"@hussmartinez/sdk-config": minor
---

Add opt-in diagnostics for browser tests that fail without a reason, such as an iframe that "did not become ready" or a module worker that "failed to load".

- `@hussmartinez/sdk-config/testing/browser-instances` exports `browserInstances(browsers)`, Vitest's `browser.instances` with Playwright. Adopt it by replacing `instances: browsers.map((browser) => ({ browser }))` with `instances: browserInstances(browsers)`. By default nothing changes. With `HM_BROWSER_DIAGNOSTICS=<folder>`, Chromium records every request and its network error in a net log in that folder, and writes its console to stderr, which `DEBUG=pw:browser` shows. Firefox and WebKit are never changed.
- `hm-netlog-errors <netlog>...` lists the failed requests in those logs: Chromium's error and the URL.
