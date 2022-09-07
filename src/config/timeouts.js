/**
 * Central timeout configuration for all relay operations.
 *
 * These values are intentionally generous — relay WebSocket handshakes
 * over mobile networks or to geographically distant relays can easily
 * take 3–5 seconds. Short timeouts cause spurious publish failures that
 * the send queue then retries unnecessarily.
 */

/** WebSocket connection handshake timeout per relay (ms). */
export const RELAY_CONNECT_TIMEOUT_MS = 6_000;

/**
 * How long to wait for EOSE after a REQ (query timeout, ms).
 * Used for one-shot queries (queryEvents, queryMany, requestEventsFromRelays).
 */
export const RELAY_QUERY_TIMEOUT_MS = 5_000;

/**
 * How long to wait for a relay to ACK a publish (ms).
 * Relays that are slow to process writes need extra headroom.
 */
export const RELAY_PUBLISH_TIMEOUT_MS = 6_000;

/**
 * EOSE grace period for live subscriptions (ms).
 * After this the subscription stays open but stops waiting for the
 * initial batch of stored events.
 */
export const RELAY_SUBSCRIBE_EOSE_MS = 5_000;
