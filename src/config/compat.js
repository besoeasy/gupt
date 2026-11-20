import { RETENTION_DAYS } from "./retention.js";

/**
 * Release compatibility policy, in one place.
 *
 * Relays — and this app's own cache — drop events after `RETENTION_DAYS`, so
 * that number is the floor a support promise can never go below. Everything
 * else here is derived from it. The README promise ("one year of support") and
 * the release rule in AGENTS.md both read these numbers: change them here, and
 * nowhere else.
 */

export { RETENTION_DAYS };

/**
 * Headroom a window needs to ship a deprecation. Dual-reading a format takes a
 * release, announcing it takes another, and the oldest supported client keeps
 * working the whole time; anything less than a month of slack means the removal
 * lands while builds inside the window still need the old reader.
 */
export const COMPAT_MIN_SLACK_DAYS = 30;

/** The shortest window the policy allows: retention plus the slack floor. */
export const MIN_SUPPORTED_DAYS = RETENTION_DAYS + COMPAT_MIN_SLACK_DAYS;

/**
 * How long a build keeps working: with any client built in the last 400 days,
 * and against any relay that old. 400 = 366 days of retention + 34 days of
 * headroom, so a client at the edge of the window still finds everything that
 * was ever going to survive.
 */
export const COMPAT_WINDOW_DAYS = 400;
