import { readdir, readFile } from "node:fs/promises";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/** The guard every warning sits in, so bundlers drop it in production. */
const GUARD = 'typeof process !== "undefined" && process.env.NODE_ENV !== "production"';

const SOURCE = new URL("../", import.meta.url);

/** The published source files: TypeScript outside tests. */
async function sourceFiles(): Promise<string[]> {
  const entries = await readdir(SOURCE, { recursive: true });
  return entries.filter((entry) => /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry));
}

/** Whether a node sits in the `then` branch of an `if` on exactly the guard. */
function isGuarded(node: ts.Node, file: ts.SourceFile): boolean {
  for (let child = node, parent = node.parent; parent; child = parent, parent = parent.parent) {
    if (
      ts.isIfStatement(parent) &&
      parent.thenStatement === child &&
      parent.expression.getText(file).replace(/\s+/g, " ") === GUARD
    ) {
      return true;
    }
  }
  return false;
}

describe("development warnings", () => {
  it("are all called inside the inline guard, so production bundles drop them", async () => {
    const unguarded: string[] = [];
    let calls = 0;
    for (const path of await sourceFiles()) {
      const text = await readFile(new URL(path, SOURCE), "utf8");
      const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node): void => {
        if (
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === "warnInDevelopment"
        ) {
          calls += 1;
          if (!isGuarded(node, file)) {
            const { line } = file.getLineAndCharacterOfPosition(node.getStart(file));
            unguarded.push(`${path}:${line + 1}`);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(file);
    }
    // The scan found the calls, so a renamed helper can't make it pass empty.
    expect(calls).toBeGreaterThan(0);
    expect(unguarded).toEqual([]);
  });
});
