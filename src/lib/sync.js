
import { messenger, setCallSignalHandler as _setCallSignalHandler } from "@/stores/messenger";

export function setCallSignalHandler(fn) {
  _setCallSignalHandler(fn);
}

export function startAppSync(identity) {
  return messenger.start(identity);
}

export async function reconcileFromRelays(identity) {
  return messenger.reconcile(identity);
}
