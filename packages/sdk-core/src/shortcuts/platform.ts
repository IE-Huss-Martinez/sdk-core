import type { Platform } from "./chord.js";

/**
 * What {@link platformOf} reads from `navigator`, so it can be called with any
 * object of that shape, in tests and outside the browser.
 *
 * @public
 */
export interface NavigatorLike {
  /** `navigator.userAgentData`, where the browser has it. */
  readonly userAgentData?:
    | {
        /** Such as `macOS` or `Windows`. */
        readonly platform?: string;
      }
    | undefined;
  /** `navigator.platform`, such as `MacIntel`. */
  readonly platform?: string;
  /** `navigator.userAgent`, read last. */
  readonly userAgent?: string;
}

/**
 * The platform whose shortcut conventions apply: `"apple"` on macOS, iOS and
 * iPadOS, where `Mod` is `Meta`, and `"other"` elsewhere.
 *
 * @example
 * ```ts
 * const shortcuts = createShortcutRegistry({ platform: platformOf(navigator) });
 * ```
 *
 * @param navigatorLike - `navigator`, or an object of its shape.
 * @public
 */
export function platformOf(navigatorLike: NavigatorLike | undefined): Platform {
  const value =
    navigatorLike?.userAgentData?.platform ||
    navigatorLike?.platform ||
    navigatorLike?.userAgent ||
    "";
  return /mac|iphone|ipad|ipod/i.test(value) ? "apple" : "other";
}
