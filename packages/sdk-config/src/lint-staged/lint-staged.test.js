import picomatch from "picomatch";
import { describe, expect, it } from "vitest";
import config from "./index.js";

/**
 * Lists the globs that match a staged file, with the options lint-staged
 * itself uses (`lib/matchFiles.js` in lint-staged 17), minus `posixSlashes`,
 * which only affects Windows paths.
 *
 * @param {string} file
 * @returns {string[]}
 */
function globsFor(file) {
  return Object.keys(config).filter((pattern) =>
    picomatch(pattern, {
      dot: true,
      matchBase: !pattern.includes("/"),
      strictBrackets: true,
    })(file),
  );
}

describe("lint-staged preset", () => {
  it.each([
    "packages/sdk-core/src/index.ts",
    "packages/ui/src/button/button.css",
    "styles.css",
    ".husky/pre-commit",
    ".github/workflows/verify.yml",
    "README.md",
    "LICENSE",
  ])("runs exactly one task list for %s", (file) => {
    expect(globsFor(file)).toHaveLength(1);
  });

  it("runs stylelint on CSS only", () => {
    const [css] = globsFor("src/a.css");
    const [ts] = globsFor("src/a.ts");
    expect(config[css ?? ""]?.some((command) => command.startsWith("stylelint"))).toBe(true);
    expect(config[ts ?? ""]?.some((command) => command.startsWith("stylelint"))).toBe(false);
  });

  it("scans for secrets before any tool rewrites the file", () => {
    for (const commands of Object.values(config)) {
      expect(commands[0]).toBe("secretlint --maskSecrets");
    }
  });
});
