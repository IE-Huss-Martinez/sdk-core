/**
 * @typedef {object} FailedRequest
 * @property {string} url The request's URL.
 * @property {string} error Chromium's network error, such as `ERR_EMPTY_RESPONSE`.
 */

/**
 * Parses a Chromium net log. A browser that was killed leaves the file
 * unfinished, without the end of its `events` array, so that's completed.
 *
 * @param {string} text The file's contents.
 * @returns {{ constants: { netError: Record<string, number> }, events: Array<Record<string, any>> }}
 */
export function parseNetlog(text) {
  try {
    return JSON.parse(text);
  } catch {
    return JSON.parse(`${text.trimEnd().replace(/,$/, "")}]}`);
  }
}

/**
 * Codes Chromium records for requests that didn't fail: ERR_WS_UPGRADE ends
 * the HTTP request that a WebSocket took over, such as Vite's and Vitest's.
 */
const NOT_FAILURES = new Set(["ERR_WS_UPGRADE"]);

/**
 * Lists the requests in a Chromium net log that failed with a network error,
 * once each, in the order they first failed.
 *
 * @param {string} text The net log's contents.
 * @returns {FailedRequest[]}
 */
export function netlogErrors(text) {
  const log = parseNetlog(text);
  const names = new Map(Object.entries(log.constants.netError).map(([name, code]) => [code, name]));
  /** @type {Map<number, string>} */
  const urls = new Map();
  /** @type {FailedRequest[]} */
  const failed = [];
  const seen = new Set();
  for (const event of log.events) {
    const source = event["source"]?.["id"];
    const params = event["params"] ?? {};
    if (typeof params.url === "string") {
      urls.set(source, params.url);
    }
    const url = urls.get(source);
    if (typeof params.net_error === "number" && params.net_error !== 0 && url !== undefined) {
      const error = names.get(params.net_error) ?? String(params.net_error);
      const key = `${error} ${url}`;
      if (!NOT_FAILURES.has(error) && !seen.has(key)) {
        seen.add(key);
        failed.push({ url, error });
      }
    }
  }
  return failed;
}
