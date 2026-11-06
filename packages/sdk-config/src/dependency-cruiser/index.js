/**
 * Matches a layer folder in a single-package repository (`src/core/model/…`)
 * and in a workspace package (`packages/sdk-core/src/core/model/…`).
 *
 * @param {string} folder Path below `src/`, such as `core/model`.
 * @returns {string}
 */
const layer = (folder) => `(?:^|/)src/${folder}/`;

const TEST_FILE = "\\.test\\.[cm]?[jt]sx?$";
const REACT = "(?:^|/node_modules/)(?:react|react-dom)(?:/|$)";

/**
 * Forbidden edges between the layers of ADR 0008. Each rule names a layer and
 * the layers it must never import; anything not listed is allowed. The inner
 * core rules only cover edges within the core, because `layer-core` already
 * keeps the whole core away from the outer layers.
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
    comment: "core/operations may import only core/model.",
  },
  {
    name: "layer-ports",
    from: layer("core/ports"),
    notTo: ["core/operations", "core/session"],
    comment: "core/ports may import only core/model.",
  },
  {
    name: "layer-core",
    from: layer("core"),
    notTo: ["adapters", "features", "react", "element", "workers"],
    comment: "The core never depends on adapters, features or UI layers.",
  },
  {
    name: "layer-adapters",
    from: layer("adapters"),
    notTo: ["core/operations", "core/session", "features", "react", "element"],
    comment: "Adapters implement ports and may import only ports, model and sdk-core.",
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
 * ADR 0008 and keeps production code away from tests, cycles and undeclared
 * packages. Paths work both in `<kind>-sdk` repositories and in workspaces.
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
      name: "core-no-react",
      comment: "The core entry is headless and server-safe (ADR 0004, ADR 0008).",
      severity: "error",
      from: { path: layer("core") },
      to: { path: REACT },
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
    // Fixtures break the rules on purpose, to test them.
    exclude: { path: "(?:^|/)(?:coverage|dist|fixtures)/" },
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
