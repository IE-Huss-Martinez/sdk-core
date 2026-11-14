---
"@hussmartinez/sdk-config": minor
---

Add `hm-in-image`, which runs a command in the browser test image that `ci/Dockerfile` pins, locally as CI does (sdk-core ADR 0049). On a host, Chromium aborts dev-server requests with `ERR_NETWORK_CHANGED` whenever Docker adds or removes a network interface, so browser tests failed at random with "did not become ready" or "failed to load". Inside the image, the host's network changes don't reach the browser.

To adopt it, run every browser step through it, such as `"test:browser": "hm-in-image vitest run --project browser"`, and `"test:e2e": "hm-in-image playwright test"`. Also set `HM_VISUAL_CONTAINER: "1"` in your CI verify jobs' `env`, so that it runs the commands directly there. It needs Docker locally.

`hm-test-visual` now runs through the same code, and shares its image and volumes, named `hm-browser-<workspace>`. Volumes named `hm-visual-*` from earlier versions are no longer used, and can be removed with `docker volume rm`.
