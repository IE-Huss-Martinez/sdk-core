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
 * @param assetsUrl - An absolute URL, or one relative to the page, such as
 *   `/assets/audio-sdk/`. The trailing slash is optional.
 * @returns The absolute base URL, ending in `/`.
 * @throws `TypeError` if the URL is relative where there's no page URL to
 *   resolve it against, as during server rendering, or if it has a query or
 *   fragment, which assets resolved against it would lose.
 * @public
 */
export function resolveAssetsBase(assetsUrl: string | URL): string {
  const base = (globalThis as { location?: { href?: string } }).location?.href;
  let url: URL;
  try {
    url = new URL(String(assetsUrl), base);
  } catch (cause) {
    throw new TypeError(
      `assetsUrl must be an absolute URL, or relative to the page, not ${JSON.stringify(String(assetsUrl))}.`,
      { cause },
    );
  }
  if (url.search !== "" || url.hash !== "") {
    throw new TypeError(
      `assetsUrl can't have a query or fragment, because assets resolved against it would lose them: ${JSON.stringify(String(assetsUrl))}.`,
    );
  }
  return url.pathname.endsWith("/") ? url.href : `${url.href}/`;
}
