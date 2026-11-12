---
name: gupt-notify
description: >-
  Send end-to-end encrypted messages and file attachments to the user's gupt
  inbox through a Rabta relay. Use for ntfy-style pings, bot-style agents,
  and cron/CI alerts: ask the user for their relay and admin public key,
  persist your device key once, then post signed events to the relay. Each
  message lands in the inbox as a normal DM; attachments render as files in
  the chat.
---

# gupt-notify — how an AI agent reaches the user's gupt inbox

gupt is an end-to-end encrypted messenger with no server that can read
messages. Instead of a bot API, you post signed, encrypted events to a Rabta
relay, and the user's inbox picks them up like any other direct message.
One event = one chat bubble. This skill teaches the whole protocol.

## Step 1 — Ask the user for two values (never guess, never hardcode)

| Value | Meaning | Shape |
|---|---|---|
| `GUPT_RELAY` | Rabta relay base URL(s) the user trusts — one or several, comma-separated | e.g. `https://rabta.t3nk.com,https://1.rabta.space` |
| `GUPT_ADMIN_KEY` | The admin's gupt public key — the inbox your messages are encrypted to | `ed25519` public key, 64 lowercase hex chars |

- Ask in chat when either value is missing; store them in the project's
  `.env` (or the config file the user prefers) and never commit real values.
- If the user hands you a pre-filled block (gupt's Integrations page copies
  one), use those values as-is — no asking, no substitution.
- A public key is safe to ask for — it is the inbox's address, not a secret.

## Step 2 — Send with the script (in this repo)

```bash
node scripts/gupt-notify.mjs \
  --relay "$GUPT_RELAY" \
  --key "$GUPT_ADMIN_KEY" \
  "[myapp] deploy finished in 42s"
```

- Attach a file (it renders in the chat like any gupt attachment):
  `node scripts/gupt-notify.mjs --relay … --key … --attach report.pdf "weekly report"`
- Text can also come from stdin:
  `tail -n 5 deploy.log | node scripts/gupt-notify.mjs --relay … --key …`
- `GUPT_RELAY` may list several relays, comma-separated: the script uploads
  blobs and publishes the event to every one of them and succeeds when any
  relay accepts — like gupt itself does.
- Flags: `--source <tag>` overrides the payload source label (default
  `notify`), `--key-file <path>` moves the device key, `--json` prints a
  machine-readable result.
- Your device key is generated once and persisted at
  `~/.gupt/notify/device-key` (`chmod 600`). It is your identity in the
  user's inbox — every message from this machine arrives from the same
  contact. Never delete or regenerate it silently.
- Exit code `0` = delivered; non-zero = read stderr and retry or report.

## Step 3 — No repo access? Reimplement the wire format

Dependencies (the same crypto stack gupt ships):
`npm i @noble/curves @noble/hashes @noble/ciphers`

1. **Plaintext payload** — canonical JSON:
   `{"source":"notify","text":"<message>","ts":<unix ms>,"type":"text"}`
2. **Encrypt** — AES-256-GCM with a 12-byte random nonce. Key =
   `sha256(x25519_ecdh(ed25519→x25519(your device privkey),
   ed25519→x25519(admin pubkey)))`.
3. **Envelope** — canonical JSON (object keys sorted at every depth):
   `{blobs: [], collection: "gupt/chat/dm", created_at: <unix s>,
   data: {v: 1, nonce: <b64>, ciphertext: <b64>},
   expires_at: <created_at + 30 days>, labels: ["gupt-dm", "<admin pubkey>"],
   owner: "ed25519:<device pubkey>"}`
4. **Sign** — `id = hex(sha256(canonical(envelope)))`,
   `sig = hex(ed25519.sign(id-bytes, device privkey))`.
5. **Publish** — for every relay in `GUPT_RELAY`, `POST {relay}/api/v1/events` with:
   `{…envelope, id, sig, pubkey: "<device pubkey>",
   content: "v1:<nonce b64>:<ciphertext b64>", kind: 4,
   tags: [["p","<admin pubkey>"], ["t","gupt-dm"], ["expiration","<expires_at>"]]}`
   A `2xx` from any relay means delivered.

ed25519 → x25519 private key: take `sha512(edpriv)[0..32]`, then clamp:
`b[0] &= 248; b[31] = (b[31] & 127) | 64`.
ed25519 → x25519 public key: `u = (1 + y) / (1 − y)` over the ed25519 field,
serialized little-endian, 32 bytes.

`scripts/gupt-notify.mjs` is the reference implementation — read it or copy
from it rather than deriving the format again.

## Attachments — files the user can see in the chat

Attachments are not inside the DM. The file travels as its own sealed blob on
the relay, and the DM references it; gupt's sync then pulls the blob,
verifies it against the hash, decrypts it and renders it in the chat.

### 1. Seal the file into a RABTA1 container

Generate a fresh per-file `mediaKey` (32 random bytes) and `mediaNonce`
(12 random bytes). Then produce the container:

- Pad the plaintext: if shorter than 25 bytes, copy it into a zeroed
  25-byte buffer.
- `salt` = 16 random bytes.
- `km = HKDF-SHA256(ikm=mediaKey, salt, info="rabta/blob/v1", L=44)`;
  AES-256-GCM key = `km[0..32]`, nonce = `km[32..44]`.
- `ciphertext = AES-GCM(key, nonce).encrypt(padded)` (includes the 16-byte
  tag).
- Container bytes = `"RABTA1"` (ASCII, 6B) `|| 0x01 || salt(16B) || ciphertext`.
  Minimum container size is 64 bytes.

### 2. Upload the container

```
PUT $GUPT_RELAY/api/v1/blobs
Content-Type: application/octet-stream
<container bytes>
```

Response JSON: `{ "hash": "<sha256 hex of the container>", "url": …,
"size": …, "expires_at": … }`. Blobs are content-addressed, so uploading the
same container to every relay in `GUPT_RELAY` is safe and expected (delivery
survives one relay going down); blobs live ~30 days by default.

### 3. Reference the blob from the DM

Build the DM payload as usual, but with type "media" and a `media` object:

```json
{
  "type": "media",
  "text": "<caption, or the file name>",
  "ts": "<unix ms>",
  "durationMs": 0,
  "media": {
    "key": "<base64 of the 32-byte mediaKey>",
    "nonce": "<base64 of the 12-byte mediaNonce>",
    "mime": "application/pdf",
    "name": "report.pdf",
    "size": "<plaintext byte length>",
    "hash": "<blob hash from the upload>"
  }
}
```

Encrypt and sign this payload exactly like a text DM (step 3 above), with
one difference: `event.blobs = ["<blob hash>"]` (lowercase hex, up to 8 per
event) — that list is what tells gupt's sync to fetch the file.

- `size` is the plaintext length; gupt trims the decryption padding to it.
- Decryption on the user's side: container → HKDF with `media.key`, exactly
  the inverse of step 1.

`scripts/gupt-notify.mjs --attach` implements all of this — read it as the
reference implementation.

## When to message me

Message one short line in these situations:

- A task I gave you finishes with something worth knowing — build, deploy,
  migration, seed, cron run.
- A long-running job (tests, downloads, training) completes.
- A blocking error you cannot resolve alone appears.
- I explicitly asked for it ("ping me when X finishes").

Do not message for mid-task progress chatter, routine tool output, or
questions you can decide yourself. Batch periodic reports into one line.

## Message rules

- Always prefix `[<short-app-name>]` so the user can filter by source.
- One human-readable line per event; summarize instead of dumping logs.
- Never send secrets, tokens, private keys or personal data.
- Fire-and-forget: catch failures and continue — a notification must never
  break the user's task.
- The inbox is a chat, not a log stream: don't poll, batch periodic reports.
- Attachments: only send files the user expects; use the real extension for
  `name`, and keep files small — blobs expire (~30 days), so anything the
  user should keep must land in their own storage.

## Patterns this unlocks

- **ntfy-style ping** — a cron job or systemd timer runs the script with one
  line; the user gets pushed like with ntfy, but E2E-encrypted.
- **Telegram-bot-style agent** — an agent loop reacts to events (git push,
  CI result, error spike) and messages the inbox; the human reads and replies
  in gupt.
- Receiving messages (a fully two-way bot) needs a relay subscription over
  WebSocket — send-only is deliberately enough to reach the user.
