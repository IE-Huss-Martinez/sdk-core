const ADR_BASE_URL = "https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/";

/**
 * Builds the documentation link shown next to a rule's warnings.
 *
 * @param {string} file ADR file name, such as `0003-hm-namespace.md`.
 * @returns {string}
 */
export function adrUrl(file) {
  return `${ADR_BASE_URL}${file}`;
}
