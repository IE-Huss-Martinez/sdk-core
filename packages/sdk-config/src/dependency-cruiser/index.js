/**
 * Matches a layer folder in a single-package repository (`src/core/model/…`)
 * and in a workspace package (`packages/sdk-core/src/core/model/…`).
 *
 * @param {string} folder Path below `src/`, such as `core/model`.
 * @returns {string}
 */
const layer = (folder) => `(?:^|/)src/${folder}/`;

const TEST_FILE = "\\.test\\.[cm]?[jt]sx?$";

/**
 * Paths that aren't source, and are left out of the cruise:
 *
 * - **the repository's own build output and coverage:** `dist/`, `temp/`
 *   (tsc's declarations and api-extractor) and `coverage/`, at the root or in
 *   a workspace package under `packages/` or `apps/`. Anchored, so that a
 *   dependency's `node_modules/<package>/dist/` is still resolved and checked:
 *   most packages, such as `@hussmartinez/ui` and React's builds, live there;
 * - **fixtures,** which break the rules on purpose, in `src/`, `test/` or
 *   `tests/`, at any depth.
 *
 * One simple pattern per case, because dependency-cruiser refuses patterns
 * with nested quantifiers, which could run slowly.
 */
const EXCLUDED = ["", "packages/[^/]+/", "apps/[^/]+/"].flatMap((root) => [
  `^${root}(?:coverage|dist|temp)/`,
  `^${root}(?:src|test|tests)/.*fixtures/`,
]);
/**
 * Matches an npm package, whether dependency-cruiser resolved it into
 * `node_modules`, flat or through pnpm's `.pnpm` store, or left it as a bare
 * name because it isn't installed.
 *
 * @param {string} names Alternation of package names, such as `react|react-dom`.
 * @returns {string}
 */
const npmPackage = (names) => `(?:^|(?:^|/)node_modules/)(?:${names})(?:/|$)`;

const UI_PACKAGES = npmPackage("react|react-dom|@hussmartinez/ui");

/**
 * React, and ui's React entry: `@hussmartinez/ui/react` as written, or
 * `dist/react.*` once resolved into the installed package. ui's root entry
 * isn't included: it's server-safe and has no React (ADR 0036).
 */
const REACT_LAYER = [
  npmPackage("react|react-dom"),
  "(?:^|(?:^|/)node_modules/)@hussmartinez/ui/(?:react(?:/|$)|dist/react\\.)",
];
const SDK_CORE = npmPackage("@hussmartinez/sdk-core");
/** The AI provider layer, which no package using this preset imports (ADR 0035). */
const AI_CORE = npmPackage("@hussmartinez/ai-core");

/**
 * Published source: everything under `src/` except tests. An SDK's examples
 * and test applications, under `examples/`, are left out, as are its tests,
 * so they may show hosts how to pass an `ai-core` provider (ADR 0035).
 */
const PUBLISHED_SOURCE = "(?:^|/)src/";
const NOT_PUBLISHED = [TEST_FILE, "(?:^|/)examples/"];

/**
 * Layers that run without a page, or ship in the headless entry: the core,
 * the adapters and the workers. None of them imports React or ui (ADR 0017,
 * ADR 0036).
 */
const HEADLESS_LAYERS = `(?:^|/)src/(?:core|adapters|workers)/`;

/**
 * The module behind an SDK's `.` entry, in a repository or a workspace
 * package. Everything it reaches ships to headless users.
 */
const ROOT_ENTRY = "(?:^|/)src/index\\.[cm]?[jt]sx?$";

/** Layers outside the core, which the core never imports. */
const OUTER_LAYERS = ["adapters", "features", "react", "element", "workers"];

/**
 * Forbidden edges between the layers of ADR 0008, as clarified by ADR 0017.
 * Each rule names a layer and the layers it must never import; anything not
 * listed is allowed. The inner core rules only cover edges within the core,
 * because `layer-core` already keeps the whole core away from the outer layers.
 *
 * @type {Array<{ name: string, from: string, notTo: string[], comment: string }>}
 */
const LAYER_RULES = [
  {
    name: "layer-model",
    from: layer("core/model"),
    notTo: ["core/operations", "core/ports", "core/session"],
    comment: "core/model holds pure domain types and imports no other layer.",
  },
  {
    name: "layer-operations",
    from: layer("core/operations"),
    notTo: ["core/ports", "core/session"],
    comment: "core/operations may import only core/model and core/errors.",
  },
  {
    name: "layer-ports",
    from: layer("core/ports"),
    notTo: ["core/operations", "core/session"],
    comment: "core/ports may import only core/model and core/errors.",
  },
  {
    name: "layer-core",
    from: layer("core"),
    notTo: OUTER_LAYERS,
    comment: "The core never depends on adapters, features or UI layers.",
  },
  {
    name: "layer-adapters",
    from: layer("adapters"),
    notTo: ["core/operations", "core/session", "features", "react", "element"],
    comment: "Adapters implement ports and may import only ports, model, errors and sdk-core.",
  },
  {
    name: "layer-features",
    from: layer("features"),
    notTo: ["adapters", "element", "workers"],
    comment: "Features build on the core and ui, never on a specific adapter.",
  },
];

/**
 * dependency-cruiser preset for the SDK family. It enforces the layer rules of
 * ADR 0008, as clarified by ADR 0017 and ADR 0036, keeps `@hussmartinez/ai-core` out of
 * published source (ADR 0035), and keeps production code away from
 * tests, cycles and undeclared packages. Paths work both in `<kind>-sdk`
 * repositories and in workspaces.
 *
 * @type {import("dependency-cruiser").IConfiguration}
 */
const config = {
  forbidden: [
    ...LAYER_RULES.map(({ name, from, notTo, comment }) => ({
      name,
      comment,
      severity: /** @type {const} */ ("error"),
      from: { path: from },
      to: { path: notTo.map(layer) },
    })),
    {
      name: "layer-errors",
      comment: "core/errors is a leaf that imports only core/model and sdk-core (ADR 0017).",
      severity: "error",
      // Its tests may import test tools, as not-to-dev-dep allows.
      from: { path: layer("core/errors"), pathNot: TEST_FILE },
      to: {
        pathNot: [
          layer("core/errors"),
          layer("core/model"),
          SDK_CORE,
          // Already reported by layer-core and core-no-ui.
          ...OUTER_LAYERS.map(layer),
          UI_PACKAGES,
        ],
      },
    },
    {
      name: "core-no-ui",
      comment:
        "The core, adapters and workers are headless and server-safe, so no React or ui (ADR 0017, ADR 0036).",
      severity: "error",
      from: { path: HEADLESS_LAYERS },
      to: { path: UI_PACKAGES },
    },
    {
      name: "entry-no-react",
      comment:
        "Nothing the . entry reaches may import React or ui's React entry, even as types: headless users never load React (ADR 0036). ui's root entry may be reached through features/.",
      severity: "error",
      from: { path: ROOT_ENTRY },
      to: { path: REACT_LAYER, reachable: true },
    },
    {
      name: "no-ai-core",
      comment:
        "SDKs, sdk-core and ui never import @hussmartinez/ai-core, not even its types (ADR 0035). Define a provider port in core/ports with only what the SDK needs, plus a fake and contract tests, and let the host pass a provider built with ai-core or its own backend.",
      severity: "error",
      from: { path: PUBLISHED_SOURCE, pathNot: NOT_PUBLISHED },
      to: { path: AI_CORE },
    },
    {
      name: "no-circular",
      comment: "Cycles make load order fragile and layers impossible to separate.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "not-to-unresolvable",
      comment: "Every import must resolve to a file or an installed package.",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: "no-non-package-json",
      comment: "Every package used must be declared in the closest package.json.",
      severity: "error",
      from: {},
      to: { dependencyTypes: ["npm-no-pkg", "npm-unknown"] },
    },
    {
      name: "not-to-dev-dep",
      comment: "Published code must not need a devDependency at runtime.",
      severity: "error",
      from: { path: "(?:^|/)src/", pathNot: TEST_FILE },
      to: {
        dependencyTypes: ["npm-dev"],
        dependencyTypesNot: ["npm-peer", "type-only"],
        pathNot: "(?:^|/)node_modules/@types/",
      },
    },
    {
      name: "not-to-test",
      comment: "Production code must not import tests.",
      severity: "error",
      from: { pathNot: TEST_FILE },
      to: { path: TEST_FILE },
    },
  ],
  options: {
    doNotFollow: { path: "(?:^|/)node_modules/" },
    exclude: { path: EXCLUDED },
    tsPreCompilationDeps: true,
    combinedDependencies: false,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["types", "import", "node", "default"],
      extensions: [".ts", ".tsx", ".mts", ".js", ".jsx", ".mjs", ".json"],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};

export default config;
