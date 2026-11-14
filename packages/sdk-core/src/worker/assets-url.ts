/**
 * Where a relative `assetsUrl` is parsed when there's no page URL, as during
 * server rendering, only to check its syntax. It's never used as a result.
 */
const SYNTAX_ONLY_BASE = "https://assets-url.invalid/";

/** The page's URL, or the worker's own URL inside a worker; `undefined` on a server. */
function pageUrl(): string | undefined {
  return (globalThis as { location?: { href?: string } }).location?.href;
}

/**
 * Parses `assetsUrl` against `base`, and rejects a URL with a query or
 * fragment, which assets resolved against it would lose.
 */
function parseAssetsUrl(assetsUrl: string | URL, base: string | undefined): URL {
  let url: URL;
  try {
    url = new URL(String(assetsUrl), base);
  } catch (cause) {
    throw new TypeError(
      base === undefined
        ? `assetsUrl must be absolute where there's no page to resolve it against, as during server rendering, not ${JSON.stringify(String(assetsUrl))}. Use createAssetsResolver, which resolves it when a worker starts.`
        : `assetsUrl must be an absolute URL, or relative to the page, not ${JSON.stringify(String(assetsUrl))}.`,
      { cause },
    );
  }
  if (url.search !== "" || url.hash !== "") {
    throw new TypeError(
      `assetsUrl can't have a query or fragment, because assets resolved against it would lose them: ${JSON.stringify(String(assetsUrl))}.`,
    );
  }
  return url;
}

/**
 * Resolves an SDK's `assetsUrl` option, where the application serves the
 * package's `dist/assets/` directory, to an absolute base URL that ends in a
 * slash (ADR 0038). A relative URL resolves against the page, or against the
 * worker's own URL inside a worker. Resolve each asset against the result:
 *
 * @example
 * ```ts
 * const base = resolveAssetsBase(options.assetsUrl);
 * const workerUrl = new URL("audio/audio.worker.js", base).href;
 * ```
 *
 * Code that can run during server rendering, such as an engine created while
 * a React tree renders, uses {@link createAssetsResolver} instead, which
 * accepts a URL relative to the page there.
 *
 * @param assetsUrl - An absolute URL, or one relative to the page, such as
 *   `/assets/audio-sdk/`. The trailing slash is optional.
 * @returns The absolute base URL, ending in `/`.
 * @throws `TypeError` if the URL is relative where there's no page URL to
 *   resolve it against, as during server rendering, or if it has a query or
 *   fragment, which assets resolved against it would lose.
 * @public
 */
export function resolveAssetsBase(assetsUrl: string | URL): string {
  const url = parseAssetsUrl(assetsUrl, pageUrl());
  return url.pathname.endsWith("/") ? url.href : `${url.href}/`;
}

/**
 * Returns the absolute URL of a file under `assetsUrl`, such as
 * `audio/audio.worker.js`.
 *
 * @public
 */
export type AssetsResolver = (path: string) => string;

/**
 * Checks an SDK's `assetsUrl` option now, and resolves it when it's first
 * used (ADR 0038). Use it where the SDK is set up, such as when an engine is
 * created, and call the result where a file is needed, such as when a worker
 * starts.
 *
 * - **Mistakes still fail at setup,** on a server too: a URL that can't be
 *   parsed, or one with a query or fragment.
 * - **A URL relative to the page** is resolved against the page on the first
 *   call, once. During server rendering there's no page, so the URL is only
 *   checked; a worker never starts there, so it's never resolved there.
 *
 * @example
 * ```ts
 * const asset = options.assetsUrl === undefined ? undefined : createAssetsResolver(options.assetsUrl);
 * // Later, when a worker starts:
 * new Worker(asset("audio/audio.worker.js"), { type: "module" });
 * ```
 *
 * @param assetsUrl - An absolute URL, or one relative to the page, such as
 *   `/assets/audio-sdk/`. The trailing slash is optional.
 * @returns A function from a file's path under `assetsUrl` to its absolute
 *   URL.
 * @throws `TypeError` at once if the URL can't be parsed, or has a query or
 *   fragment. The returned function throws `TypeError` if it's called where
 *   there's still no page to resolve a relative URL against.
 * @public
 */
export function createAssetsResolver(assetsUrl: string | URL): AssetsResolver {
  const text = String(assetsUrl);
  parseAssetsUrl(text, pageUrl() ?? SYNTAX_ONLY_BASE);
  let base: string | undefined;
  return (path) => {
    base ??= resolveAssetsBase(text);
    return new URL(path, base).href;
  };
}
