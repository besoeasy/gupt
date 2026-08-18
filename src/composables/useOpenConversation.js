import { useRouter } from "vue-router";
import { openDmRoom } from "@/lib/chatUtils";

export function useOpenConversation() {
  const router = useRouter();

  async function openDmWith(identity, peerPubkey, { label = "", redirect = true } = {}) {
    const { roomId } = await openDmRoom(identity, peerPubkey, label);
    if (redirect) router.push(`/room/${roomId}`);
    return roomId;
  }

  return { openDmWith };
}