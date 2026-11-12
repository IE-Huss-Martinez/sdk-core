declare const process: { readonly env: { readonly NODE_ENV?: string } };

/**
 * Whether development-only checks and warnings are on, as a runtime check.
 *
 * It keeps a forgotten guard from warning in production, but it can't make a
 * bundle smaller: a bundler can't see through a function call, so the
 * message passed to {@link warnInDevelopment} would still ship. Every call
 * site therefore also guards itself inline, with exactly this expression,
 * which bundlers fold away when they replace `process.env.NODE_ENV`:
 *
 * ```ts
 * if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
 *   warnInDevelopment(`…`);
 * }
 * ```
 *
 * `development.test.ts` checks every call site, and `build.test.ts` checks
 * that a production bundle drops the messages. Where nothing defines
 * `process`, such as a page loading the module directly, warnings are off.
 */
export function isDevelopment(): boolean {
  try {
    return process.env.NODE_ENV !== "production";
  } catch {
    return false;
  }
}

/**
 * Logs a development-only warning. Call it only inside the inline guard
 * shown on {@link isDevelopment}.
 *
 * @param message - What's wrong and how to fix it.
 */
export function warnInDevelopment(message: string): void {
  if (isDevelopment()) {
    // biome-ignore lint/suspicious/noConsole: development-only diagnostics are the purpose of this helper.
    console.warn(`[@hussmartinez/sdk-core] ${message}`);
  }
}
