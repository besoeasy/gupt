import { useRoute, useRouter } from "vue-router";
import { dmRoomId, normalizePubkey } from "@/lib/crypto";
import { useIdentityStore } from "@/stores/identity";

export function callPathForPubkey(pubkey) {
  const normalized = normalizePubkey(pubkey);
  return normalized ? `/call/${normalized}` : "/";
}

export function useCallNavigation() {
  const router = useRouter();
  const route = useRoute();
  const identity = useIdentityStore();

  async function openCallSurface(pubkey, { mode, requesting } = {}) {
    const path = callPathForPubkey(pubkey);
    if (!path || path === "/") return;

    const query = requesting
      ? { requesting }
      : mode === "audio" || mode === "video"
        ? { start: mode }
        : {};
    const samePath = route.path === path;
    const currentKey = route.query.requesting ? "requesting" : "start";
    const currentVal = route.query.requesting || route.query.start || "";
    const newKey = requesting ? "requesting" : "start";
    const newVal = requesting || mode || "";
    if (samePath && currentKey === newKey && currentVal === newVal) return;

    await router.push({ path, query });
  }

  async function returnToConversation(pubkey) {
    const peerPubkey = normalizePubkey(pubkey);
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
