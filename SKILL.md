---
name: gupt-notify
description: >-
  Send end-to-end encrypted notifications to the user's gupt inbox through a
  Rabta relay. Use for ntfy-style pings, bot-style agents, and cron/CI alerts:
  ask the user for their relay and admin public key, persist your device key
  once, then post signed events to the relay. Each message lands in the
  inbox as a normal DM.
---

# gupt-notify — how an AI agent reaches the user's gupt inbox

gupt is an end-to-end encrypted messenger with no server that can read
messages. Instead of a bot API, you post signed, encrypted events to a Rabta
relay, and the user's inbox picks them up like any other direct message.
One event = one chat bubble. This skill teaches the whole protocol.

## Step 1 — Ask the user for two values (never guess, never hardcode)

| Value | Meaning | Shape |
|---|---|---|
| `GUPT_RELAY` | Rabta relay base URL the user trusts | URL, e.g. `https://rabta.t3nk.com` |
| `GUPT_ADMIN_KEY` | The admin's gupt public key — the inbox your messages are encrypted to | `ed25519` public key, 64 lowercase hex chars |

- Ask in chat when either value is missing; store them in the project's
  `.env` (or the config file the user prefers) and never commit real values.
- A public key is safe to ask for — it is the inbox's address, not a secret.

## Step 2 — Send with the script (in this repo)

```bash
node scripts/gupt-notify.mjs \
  --relay "$GUPT_RELAY" \
  --key "$GUPT_ADMIN_KEY" \
  "[myapp] deploy finished in 42s"
```

- Text can also come from stdin:
  `tail -n 5 deploy.log | node scripts/gupt-notify.mjs --relay … --key …`
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
5. **Publish** — `POST $GUPT_RELAY/api/v1/events` with:
   `{…envelope, id, sig, pubkey: "<device pubkey>",
   content: "v1:<nonce b64>:<ciphertext b64>", kind: 4,
   tags: [["p","<admin pubkey>"], ["t","gupt-dm"], ["expiration","<expires_at>"]]}`
   A `2xx` response means delivered.

ed25519 → x25519 private key: take `sha512(edpriv)[0..32]`, then clamp:
`b[0] &= 248; b[31] = (b[31] & 127) | 64`.
ed25519 → x25519 public key: `u = (1 + y) / (1 − y)` over the ed25519 field,
serialized little-endian, 32 bytes.

`scripts/gupt-notify.mjs` is the reference implementation — read it or copy
from it rather than deriving the format again.

## Message rules

- Always prefix `[<short-app-name>]` so the user can filter by source.
- One human-readable line per event; summarize instead of dumping logs.
- Never send secrets, tokens, private keys or personal data.
- Fire-and-forget: catch failures and continue — a notification must never
  break the user's task.
- The inbox is a chat, not a log stream: don't poll, batch periodic reports.

## Patterns this unlocks

- **ntfy-style ping** — a cron job or systemd timer runs the script with one
  line; the user gets pushed like with ntfy, but E2E-encrypted.
- **Telegram-bot-style agent** — an agent loop reacts to events (git push,
  CI result, error spike) and messages the inbox; the human reads and replies
  in gupt.
- Receiving messages (a fully two-way bot) needs a relay subscription over
  WebSocket — send-only is deliberately enough to reach the user.
