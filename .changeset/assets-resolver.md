---
"@hussmartinez/sdk-core": minor
---

Add `createAssetsResolver(assetsUrl)`, so an SDK's `assetsUrl` can be relative to the page, such as `"/video-sdk/"`, when its editor renders on the server. It checks the URL at once, and throws a `TypeError` on a server too, for a URL that can't be parsed or that has a query or fragment. It returns `(path) => string`, which resolves the URL against the page on its first call, once. Create engines with it, and call it where a worker starts:

```ts
const asset = createAssetsResolver(options.assetsUrl);
new Worker(asset("audio/audio.worker.js"), { type: "module" });
```

`resolveAssetsBase` is unchanged, except that its error for a relative URL during server rendering now suggests `createAssetsResolver`.
