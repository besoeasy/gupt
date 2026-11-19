import {
  DEFAULT_RELAYS,
  normalizeRelayUrl,
  readConfiguredRelays,
  saveConfiguredRelays,
} from "../../config/servers.js";

export function normalizeRelay(relay) {
  return normalizeRelayUrl(relay);
}

export function dedupeRelays(relays) {
  return [...new Set(relays.map(normalizeRelay).filter(Boolean))];
}

export function getKnownRelays() {
  const configured = readConfiguredRelays();
  return dedupeRelays(configured.length ? configured : DEFAULT_RELAYS);
}

export function getCustomRelays() {
  return readConfiguredRelays();
}

export function addCustomRelay(url) {
  const normalized = normalizeRelay(url);
  if (!normalized) return null;

  const current = readConfiguredRelays();
  if (current.includes(normalized)) return null;

  current.push(normalized);
  saveConfiguredRelays(current);
  return normalized;
}

export function removeCustomRelay(url) {
  const normalized = normalizeRelay(url);
  if (!normalized) return false;

  const current = readConfiguredRelays();
  const idx = current.indexOf(normalized);
  if (idx === -1) return false;

  current.splice(idx, 1);
  saveConfiguredRelays(current);
  return true;
}
