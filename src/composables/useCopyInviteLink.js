import { ref } from "vue";

import { copyToClipboard } from "@/lib/clipboard";
import { buildRelayInviteUrl, selectTopRelays } from "@/lib/relayInvite";
import { useIdentityStore } from "@/stores/identity";

/**
 * Builds the current identity's relay invite URL on demand and copies it.
 *
 * The relay set is resolved on click rather than up front: it ranks relays
 * from IndexedDB, and the chat inbox should not pay that cost on mount just
 * to render a button.
 *
 * @returns {{ copied: import("vue").Ref<boolean>, busy: import("vue").Ref<boolean>, copyInviteLink: () => Promise<void> }}
 */
export function useCopyInviteLink() {
  const identity = useIdentityStore();
  const copied = ref(false);
  const busy = ref(false);

  async function copyInviteLink() {
    if (busy.value || !identity.pubkeyHex) return;
    busy.value = true;
    try {
      const url = buildRelayInviteUrl(identity.pubkeyHex, await selectTopRelays());
      if (!url) return;
      await copyToClipboard(url);
      copied.value = true;
      setTimeout(() => (copied.value = false), 2000);
    } catch {
      // Clipboard access can be denied (permissions, insecure context); never
      // let that surface as an unhandled error from a click handler.
    } finally {
      busy.value = false;
    }
  }

  return { copied, busy, copyInviteLink };
}
