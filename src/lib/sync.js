/**
 * Sync facade — boots the messenger store and exposes a stable API for callers.
 *
 * The heavy lifting (subscriptions, hydration, ingestion, write-through to
 * Dexie) lives in `@/stores/messenger`. This module exists to:
 *   - register the call-signal handler with the messenger
 *   - keep `startAppSync` / `syncDirectMessages` / `syncGroups` as named imports
 *     so existing call-sites in views don't need to change.
 *
 * There are NO polling timers anymore. Live relay subscriptions push every
 * event into the messenger store, and the store writes through to Dexie.
 * On window focus we ask the messenger to reconcile from relays once.
 */

import { messenger, setCallSignalHandler as _setCallSignalHandler } from "@/stores/messenger";

export function setCallSignalHandler(fn) {
  _setCallSignalHandler(fn);
}

export function startAppSync(identity) {
  return messenger.start(identity);
}

/** Reconcile inbox + throttled relay backfill (focus / visibility). */
export async function reconcileFromRelays(identity) {
  return messenger.reconcile(identity);
}

/** Backwards-compat shim for HomeSidebar. */
export async function syncGroups(identity) {
  return messenger.reconcile(identity);
}
