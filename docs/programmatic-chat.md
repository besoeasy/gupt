# Programmatic Chat Guide (Gupt API & Protocol)

Gupt is a serverless, end-to-end encrypted messaging system built on the Rabta relay protocol. There are no central servers, user accounts, phone numbers, or proprietary gateway tokens. 

Any script, bot, daemon, or external service can send and receive messages programmatically simply by generating an Ed25519 cryptographic keypair and communicating directly with Rabta relays via standard HTTP REST endpoints.

---

## 1. Core Architecture

```
┌─────────────────────────────────┐                    ┌─────────────────────────────────┐
│     Sender (Script or Bot)      │                    │     Recipient (Gupt Client)     │
│                                 │                    │                                 │
│ 1. Derive X25519 from Ed25519   │                    │ 5. Poll relay for labelled events│
│ 2. AES-256-GCM encrypt payload  │                    │ 6. Derive X25519 shared secret  │
│ 3. Sign canonical envelope      │                    │ 7. AES-256-GCM decrypt payload  │
└────────────────┬────────────────┘                    └────────────────▲────────────────┘
                 │                                                      │
                 │ POST /api/v1/events               GET /api/v1/events │
                 │                                   (labels=[recipient])
                 ▼                                                      │
         ┌──────────────────────────────────────────────────────────────┴┐
         │                      Rabta Relay Node                         │
         │             (Stores & forwards ciphertext only)               │
         └───────────────────────────────────────────────────────────────┘
```

* **Zero-Knowledge Relays:** Relays only see authenticated ciphertext envelopes and routing labels. They cannot read message content, attachments, or contact identities.
* **Dual-Key Model:**
  * **Signing & Identity:** Ed25519 keypair. Your 32-byte public key (64 hex characters) is your public address.
  * **Encryption:** Derived X25519 keypair (via Montgomery curve conversion) for Diffie-Hellman key exchange (ECDH).
* **Wire Format:** Standard Nostr-compatible events with Rabta extensions (`collection`, `data`, `blobs`, `owner`).

---

## 2. Relay Endpoints

Relays are standard HTTP/WebSocket nodes (e.g. `https://rabta.gupt.app`, `https://1.rabta.space`, or your self-hosted instance):

| Endpoint | Method | Purpose |
| :--- | :--- | :--- |
| `/api/v1/health` | `GET` | Lightweight keepalive & live count probe |
| `/api/v1/node` | `GET` | Full node telemetry, limits, sync peers & storage budget |
| `/api/v1/events` | `POST` | Publish a signed event envelope |
| `/api/v1/events` | `GET` | Query/stream events by `collection`, `owner`, `labels`, `cursor`, `since` |
| `/api/v1/blobs` | `PUT` | Upload a content-addressed encrypted blob |
| `/api/v1/blobs/:hash` | `GET` | Download blob bytes (supports HTTP `Range` for resumable transfers) |

### Health Probe Example
Routine background keepalives should query `/api/v1/health` rather than the heavy `/api/v1/node`:

```bash
curl -s https://rabta.gupt.app/api/v1/health
# {"ok":true,"node_id":"...","live_events":1420,"live_blobs":310}
```

---

## 3. Cryptographic Identity

Install standard Noble crypto libraries (the same dependencies used by Gupt):

```bash
npm install @noble/curves @noble/hashes @noble/ciphers
```

### Key Generation & X25519 Derivation

```javascript
import { ed25519, x25519 } from "@noble/curves/ed25519.js";
import { sha256, sha512 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

// 1. Generate or load an Ed25519 identity keypair
const privkeyHex = "your_64_char_hex_private_key"; // or bytesToHex(ed25519.keygen().secretKey)
const pubkeyHex = bytesToHex(ed25519.getPublicKey(hexToBytes(privkeyHex)));

// 2. Convert Ed25519 private key to X25519 scalar
function ed25519PrivToX25519(edPrivHex) {
  const hash = sha512(hexToBytes(edPrivHex));
  const scalar = new Uint8Array(hash.subarray(0, 32));
  scalar[0] &= 248;
  scalar[31] &= 127;
  scalar[31] |= 64;
  return scalar;
}

// 3. Convert Ed25519 public key to X25519 public point
function ed25519PubToX25519(edPubHex) {
  const point = ed25519.Point.fromHex(edPubHex.replace(/^ed25519:/i, ""));
  const Fp = ed25519.Point.Fp;
  return Fp.toBytes(Fp.mul(Fp.add(1n, point.y), Fp.inv(Fp.sub(1n, point.y))));
}

// 4. Compute symmetric shared encryption key (ECDH + SHA-256)
function getSharedKey(myPrivHex, recipientPubHex) {
  const sharedPoint = x25519.getSharedSecret(
    ed25519PrivToX25519(myPrivHex),
    ed25519PubToX25519(recipientPubHex),
  );
  return sha256(sharedPoint); // 32-byte AES-256 key
}
```

---

## 4. Setting Your Username (Public Profile)

When a script sends messages, Gupt will display a generated animal petname (e.g. *"Azure Falcon"*) unless a profile event is published for your key.

To set your bot or agent's display name, publish a **NIP-01 Kind 0 (`gupt/profiles`)** event. Gupt clients automatically query and cache peer profiles for **12 hours**:

```javascript
import { gcm } from "@noble/ciphers/aes.js";

async function publishProfile(privkeyHex, { name, about = "", website = "", status = "" }, relayUrl) {
  const privBytes = hexToBytes(privkeyHex);
  const pubkeyHex = bytesToHex(ed25519.getPublicKey(privBytes));
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + 90 * 24 * 60 * 60; // 90 days

  const profileData = {
    name: name.slice(0, 100),
    about: about.slice(0, 500),
    website: website.slice(0, 500),
    status: status.slice(0, 150),
  };

  const envelope = {
    blobs: [],
    collection: "gupt/profiles",
    created_at: now,
    data: profileData,
    expires_at: expiresAt,
    labels: [],
    owner: `ed25519:${pubkeyHex}`,
  };

  // Deterministic canonical JSON serialization
  const canonicalJson = (val) =>
    val === null || typeof val !== "object"
      ? JSON.stringify(val)
      : Array.isArray(val)
        ? `[${val.map(canonicalJson).join(",")}]`
        : `{${Object.keys(val).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(val[k])}`).join(",")}}`;

  const digest = sha256(new TextEncoder().encode(canonicalJson(envelope)));
  const sig = bytesToHex(ed25519.sign(digest, privBytes));

  const event = {
    ...envelope,
    id: bytesToHex(digest),
    sig,
    pubkey: pubkeyHex,
    content: JSON.stringify(profileData),
    kind: 0,
    tags: [["expiration", String(expiresAt)]],
  };

  const res = await fetch(`${relayUrl}/api/v1/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });

  return res.ok;
}
```

---

## 5. Sending Direct Messages (DMs)

### Step 1: Build the Plaintext Payload
```json
{
  "type": "text",
  "text": "Hello from automation script!\n\n{{button \"View Status\" https://example.com}}",
  "ts": 1731713600000,
  "source": "ci-runner",
  "template": true
}
```
* `type`: `"text"` (or `"media"` for attachments).
* `text`: The message text.
* `ts`: Timestamp in milliseconds (`Date.now()`).
* `template`: Optional formatting flag:
  * `true`: Forces Markdown/template rendering.
  * `false`: Forces plain text.
  * Omitted / `null`: Auto-detects strong Markdown constructs (`**bold**`, `[link](...)`, `{{button ...}}`).

### Step 2: Encrypt Payload
Encrypt with AES-256-GCM using a 12-byte cryptographically secure random nonce:

```javascript
const sharedKey = getSharedKey(myPrivHex, recipientPubHex);
const nonce = crypto.getRandomValues(new Uint8Array(12));
const ciphertext = gcm(sharedKey, nonce).encrypt(new TextEncoder().encode(JSON.stringify(payload)));

const nonceB64 = Buffer.from(nonce).toString("base64");
const cipherB64 = Buffer.from(ciphertext).toString("base64");
```

### Step 3: Create & Sign Envelope
```javascript
const now = Math.floor(Date.now() / 1000);
const expiresAt = now + 30 * 24 * 60 * 60; // 30 days retention

const envelope = {
  blobs: [],
  collection: "gupt/chat/dm",
  created_at: now,
  data: { v: 1, nonce: nonceB64, ciphertext: cipherB64 },
  expires_at: expiresAt,
  labels: ["gupt-dm", recipientPubHex],
  owner: `ed25519:${myPubHex}`,
};

const digest = sha256(new TextEncoder().encode(canonicalJson(envelope)));
const sig = bytesToHex(ed25519.sign(digest, hexToBytes(myPrivHex)));

const event = {
  ...envelope,
  id: bytesToHex(digest),
  sig,
  pubkey: myPubHex,
  content: `v1:${nonceB64}:${cipherB64}`,
  kind: 4,
  tags: [
    ["p", recipientPubHex],
    ["t", "gupt-dm"],
    ["expiration", String(expiresAt)],
  ],
};
```

### Step 4: Publish to Relays
```javascript
const res = await fetch(`${relayUrl}/api/v1/events`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(event),
});
```

---

## 6. Receiving & Replying to Messages (Two-Way Communication)

To receive messages, poll or subscribe to events in `collection=gupt/chat/dm` with `labels=[myPubkey]`:

```javascript
async function pollInbox(myPrivHex, relayUrl, sinceTimestampSec = null) {
  const myPubHex = bytesToHex(ed25519.getPublicKey(hexToBytes(myPrivHex)));
  const params = new URLSearchParams({
    collection: "gupt/chat/dm",
    labels: myPubHex,
    limit: "50",
  });
  if (sinceTimestampSec) {
    params.set("since", String(sinceTimestampSec));
  }

  const res = await fetch(`${relayUrl}/api/v1/events?${params}`);
  if (!res.ok) return [];

  const data = await res.json();
  const messages = [];

  for (const event of data.events || []) {
    try {
      const senderPubHex = event.owner.replace(/^ed25519:/i, "");
      if (senderPubHex === myPubHex) continue; // Skip own outgoing messages

      // Compute shared key with sender
      const sharedKey = getSharedKey(myPrivHex, senderPubHex);

      // Extract nonce and ciphertext
      let nonce, ciphertext;
      if (event.data?.nonce && event.data?.ciphertext) {
        nonce = Buffer.from(event.data.nonce, "base64");
        ciphertext = Buffer.from(event.data.ciphertext, "base64");
      } else if (event.content?.startsWith("v1:")) {
        const parts = event.content.split(":");
        nonce = Buffer.from(parts[1], "base64");
        ciphertext = Buffer.from(parts[2], "base64");
      }

      const decryptedBytes = gcm(sharedKey, nonce).decrypt(ciphertext);
      const payload = JSON.parse(new TextDecoder().decode(decryptedBytes));

      messages.push({
        eventId: event.id,
        sender: senderPubHex,
        created_at: event.created_at,
        payload,
      });
    } catch (e) {
      // Failed decrypt (tampered or wrong recipient key)
    }
  }

  return messages;
}
```

---

## 7. Media Attachments & Chunking

Gupt supports end-to-end encrypted file attachments of any type (PDFs, images, audio, video, archives).

### Large File Splitting (2 MB Threshold)
* Files $\le 2\text{ MB}$ are sealed as a single blob.
* Files $> 2\text{ MB}$ are split into up to 8 equal parts (`Math.ceil(size / 8)`).

### Container Specification: `RABTA1`
Each part is encrypted into a `RABTA1` container format:
```
┌──────────────┬──────────────┬──────────────┬───────────────────────────┐
│ "RABTA1"     │ Version 0x01 │ Salt         │ AES-256-GCM Ciphertext    │
│ (6 bytes)    │ (1 byte)     │ (16 bytes)   │ + 16-byte Auth Tag        │
└──────────────┴──────────────┴──────────────┴───────────────────────────┘
```
1. Plaintext parts under 25 bytes are zero-padded to 25 bytes.
2. A unique 16-byte `salt` is generated for each part.
3. Key material is derived using `HKDF-SHA256`:
   ```javascript
   const keyMaterial = hkdf(sha256, mediaKey, salt, "rabta/blob/v1", 44);
   const partKey = keyMaterial.subarray(0, 32);
   const partNonce = keyMaterial.subarray(32, 44);
   ```
4. Encrypt with AES-GCM and prefix `"RABTA1" || 0x01 || salt`.

### Uploading Blobs
```bash
PUT /api/v1/blobs
Content-Type: application/octet-stream
[Raw RABTA1 Container Bytes]
```
The relay responds with `{ "hash": "<sha256_hex>", "size": ... }`.

### Referencing Blobs in the DM Payload
```json
{
  "type": "media",
  "text": "sample.pdf",
  "ts": 1731713600000,
  "media": {
    "key": "<base64_mediaKey>",
    "nonce": "<base64_mediaNonce>",
    "mime": "application/pdf",
    "name": "sample.pdf",
    "size": 1284500,
    "parts": ["<part_1_hash>", "<part_2_hash>"]
  }
}
```
In the event envelope, set `blobs: ["<part_1_hash>", "<part_2_hash>"]`.

### Resumable Range Downloads & Exponential Backoff
Gupt clients fetch blobs with:
1. HTTP `Range: bytes=start-end` support for resuming interrupted transfers.
2. **16 retry attempts** with exponential backoff starting from 2 seconds ($2\text{s}, 4\text{s}, 8\text{s}, 16\text{s}, 32\text{s}, 60\text{s}, \dots$) before failing, allowing blob replication to catch up smoothly.

---

## 8. CLI Notification Tool (`docs/gupt-notify.mjs`)

This repository ships with a turnkey, zero-dependency Node.js script for automated alerts and CI/CD pipelines:

```bash
# Basic notification
node docs/gupt-notify.mjs \
  --relay "https://rabta.gupt.app,https://1.rabta.space" \
  --key "<recipient_64_hex_pubkey>" \
  --name "Deploy Bot" \
  "[production] Release v6.0.0 deployed successfully"

# With file attachment
node docs/gupt-notify.mjs \
  --relay "https://rabta.gupt.app" \
  --key "<recipient_64_hex_pubkey>" \
  --name "Backup Bot" \
  --attach "./database-backup.tar.gz" \
  "Nightly backup archive attached"

# Piping logs from stdin
tail -n 20 /var/log/app.log | node docs/gupt-notify.mjs \
  --relay "https://rabta.gupt.app" \
  --key "<recipient_64_hex_pubkey>" \
  --name "Log Monitor"
```
Device keys are automatically generated and preserved in `~/.gupt/notify/device-key` so that messages arrive consistently from the same contact.
