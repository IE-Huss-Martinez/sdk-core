declare const process: { readonly env: { readonly NODE_ENV?: string } };

/**
 * Whether development-only checks and warnings are on.
 *
 * Bundlers replace the exact expression `process.env.NODE_ENV` at build
 * time, so production builds drop the warnings. It must stay written exactly
 * like that, without optional chaining. Where nothing defines `process`, such
 * as a page loading the module directly, reading it throws, and warnings are
 * off.
 */
export function isDevelopment(): boolean {
  try {
    return process.env.NODE_ENV !== "production";
  } catch {
    return false;
  }
}

/**
 * Logs a development-only warning.
 *
 * @param message - What's wrong and how to fix it.
 */
export function warnInDevelopment(message: string): void {
  if (isDevelopment()) {
    // biome-ignore lint/suspicious/noConsole: development-only diagnostics are the purpose of this helper.
    console.warn(`[@hussmartinez/sdk-core] ${message}`);
  }
}
