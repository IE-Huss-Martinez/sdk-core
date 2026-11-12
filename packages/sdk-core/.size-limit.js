/**
 * Size budgets per entry point (ADR 0015): the brotli size of each built
 * entry, with the shared chunks it loads. They measure the unminified files in
 * dist, an upper bound: applications ship less, because their bundler minifies
 * and drops what they don't import.
 *
 * Each budget leaves about 20% above the size when it was set. The element
 * entry's is tight on purpose: it ships inside every SDK's standalone script
 * (ADR 0040).
 */
export default [
  {
    name: "Headless runtime (.), with the shared code it loads",
    path: ["dist/index.js", "dist/shared/*.js"],
    brotli: true,
    limit: "25 kB",
  },
  {
    name: "Element base (./element), with the shared code it loads",
    path: ["dist/element.js", "dist/shared/*.js"],
    brotli: true,
    limit: "5 kB",
  },
];
