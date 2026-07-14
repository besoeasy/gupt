# Optimization Plan: Proprietary Payload Smuggling

Since the application uses the Nostr network purely as a decentralized transport layer (and does not aim to be a standard interoperable Nostr client), we can drastically optimize the codebase and payload sizes by dropping internal compliance with Nostr DM standards (NIP-04 / NIP-44).

To maintain compatibility with strict relay whitelists, we will use **Payload Smuggling**—wrapping our highly optimized proprietary payloads inside universally accepted Nostr event kinds.

## Phase 1: Unified Smuggled Envelopes
- **Direct Messages:** Continue using `kind: 4`.
- **Group Messages:** Continue using our current group event kinds (e.g., `kind: 14004` or similar).
- **The Change:** We will stop generating or parsing Nostr-specific tags (like `e` or `q` tags for replies/mentions) that are only required for interoperability. The only tag we will strictly enforce is `["p", recipient_pubkey]` to ensure relays correctly route the messages to the user.

## Phase 2: Payload Restructuring
- **Single Source of Truth:** Instead of spreading message metadata (replies, reactions, media pointers) across Nostr envelope tags, we will pack **100% of the message data** into a single, clean JSON object.
  ```json
  {
    "type": "media",
    "text": "Check out this file!",
    "media": { "cid": "Qm...", "key": "..." },
    "replyTo": "msg_id_123"
  }
  ```
- **Serialization (Optional Advanced Step):** Instead of `JSON.stringify`, we can evaluate using **MessagePack** or **Protobuf** to serialize this object into a binary format before encryption, drastically reducing the byte size over the wire.

## Phase 3: Encryption Upgrade (If Applicable)
- Ensure all inner payloads are encrypted using modern, hardware-accelerated **AES-GCM** (or XChaCha20-Poly1305), completely bypassing the legacy AES-CBC requirements of NIP-04.
- Because the relay cannot read the `.content` field, it will unknowingly route our modern encrypted binary/JSON as if it were a standard NIP-04 message.

## Phase 4: Codebase Purge (The Clean Up)
- Delete all parsing adapters that attempt to map standard Nostr tags to our internal Vue models.
- Remove any leftover logic checking for NIP-04/NIP-44 standard compliance.
- The data flow becomes extremely linear and simple:
  - **Outbound:** `Vue Model -> JSON Stringify -> AES-GCM Encrypt -> Wrap in kind: 4 -> Send to Relay`
  - **Inbound:** `Receive kind: 4 -> AES-GCM Decrypt -> JSON Parse -> Vue Model`

## Expected Outcomes
1. **Faster Parsing:** Zero overhead from mapping legacy tags.
2. **Smaller Bundle Size:** Removal of standard Nostr compliance libraries and adapters.
3. **Reduced Bandwidth:** Tighter JSON payloads (or binary) save bytes over the WebSocket.
4. **Enhanced Security:** Guaranteed use of modern AEAD encryption for all data types.
