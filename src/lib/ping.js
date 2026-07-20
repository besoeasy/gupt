import { pubkeyName } from "@/lib/crypto";

export async function sendNtfyPing({ peerPubkey, senderPubkeyHex, senderName }) {
  const peer = String(peerPubkey || "").trim();
  const sender = String(senderPubkeyHex || "").trim();
  if (!peer || !sender) throw new Error("Missing pubkey for ping");

  const label = String(senderName || "").trim();
  const senderLabel = label ? label : pubkeyName(sender);
  const response = await fetch(`https://ntfy.sh/${peer}`, {
    method: "POST",
    body: `Hey its ${senderLabel} - come online on gupt.app`,
  });
  if (!response.ok) {
    throw new Error(`ntfy server returned ${response.status}`);
  }
}
