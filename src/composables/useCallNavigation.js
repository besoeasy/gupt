import { useRoute, useRouter } from "vue-router";
import { dmRoomId, normalizeNostrPubkey } from "@/lib/crypto";
import { useIdentityStore } from "@/stores/identity";

export function callPathForPubkey(pubkey) {
  const normalized = normalizeNostrPubkey(pubkey);
  return normalized ? `/call/${normalized}` : "/";
}

export function useCallNavigation() {
  const router = useRouter();
  const route = useRoute();
  const identity = useIdentityStore();

  async function openCallSurface(pubkey, { mode } = {}) {
    const path = callPathForPubkey(pubkey);
    if (!path || path === "/") return;

    const query = mode === "audio" || mode === "video" ? { start: mode } : {};
    const samePath = route.path === path;
    const sameQuery = String(route.query.start || "") === String(query.start || "");
    if (samePath && sameQuery) return;

    await router.push({ path, query });
  }

  async function returnToConversation(pubkey) {
    const peerPubkey = normalizeNostrPubkey(pubkey);
    await identity.init();
    if (peerPubkey && identity.pubkeyHex) {
      const roomId = await dmRoomId(identity.pubkeyHex, peerPubkey);
      await router.push(`/room/${roomId}`);
      return;
    }
    await router.push("/");
  }

  return { openCallSurface, returnToConversation, callPathForPubkey };
}
