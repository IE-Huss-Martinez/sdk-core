// Loaded with `node --import` to simulate an environment without a usable
// TypeScript, as with TypeScript 7: resolving `typescript` fails.
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "typescript" || specifier.startsWith("typescript/")) {
      throw Object.assign(new Error(`Cannot find module '${specifier}'`), {
        code: "MODULE_NOT_FOUND",
      });
    }
    return nextResolve(specifier, context);
  },
});
