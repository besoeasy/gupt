// Keys from retired features and older builds that linger on users' devices.
// Nothing here is written or read by the current build, so we sweep them on
// first app init. Keep this list append-only: when a key is retired, add it
// here instead of leaving it scattered on every device forever.
export const LEGACY_STORAGE_KEYS = [
  // Identity: pre-session-only account state.
  "gupt_privkey", // account key — session-only now
  "gupt_account_mode",
  "gupt_account_pubkey",
  // Profile was once kept in localStorage; now sessionStorage, relay-backed.
  "gupt_profile_name",
  "gupt_profile_about",
  "gupt_profile_picture",
  "gupt_profile_website",
  "gupt_profile_status",
  // Pre-gupt_configured_* server config, including the legacy multi-server
  // array — no compat migration is kept for it, the sweep simply drops it.
  "gupt_configured_originless_servers",
  "gupt_custom_relays",
  "gupt-user-relays",
  "gupt-user-blossom-servers",
  "gupt-user-originless-servers",
  // Removed upload-server scoring.
  "gupt-upload-server-scores",
  // Domain lookup replaced by the gupt_domain_cache:<domain> prefix.
  "gupt_domain_lookup_v1",
  // Old invites lib.
  "gupt_invite_cache_v1",
  "gupt_invite_revoked",
  "gupt-invite-v1",
  // Removed NetworkView / home sidebar leftovers.
  "gupt_last_seen_ts",
  "gupt_net_stats_", // exact key is gupt_net_stats_<timeframe> — prefix below
  "gupt_originless_health_v1",
  // Funding banner: removed with the banner itself.
  "gupt_funding_status",
  "gupt_funding_dismissed",
];

const NET_STATS_PREFIX = "gupt_net_stats_";

export function discardLegacyKeys() {
  if (typeof localStorage === "undefined") return;
  try {
    for (const key of LEGACY_STORAGE_KEYS) {
      if (key !== NET_STATS_PREFIX) localStorage.removeItem(key);
    }
    // Prefix family, exact key = gupt_net_stats_<timeframe>.
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(NET_STATS_PREFIX) && key !== NET_STATS_PREFIX) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // Storage unavailable — nothing to clean up.
  }
}
