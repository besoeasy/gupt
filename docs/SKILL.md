---
name: gupt-agent
description: >-
  Build on the Gupt protocol or send end-to-end encrypted messages and file
  attachments to the user's gupt inbox through a Rabta relay. Use for two-way
  conversational bots, interactive agents, custom decentralized apps, and
  cron/CI alerts: interact with Rabta REST endpoints, persist an Ed25519 keypair,
  encrypt with X25519/AES-GCM, and exchange signed event envelopes.
---

# gupt-agent — how an AI agent builds and communicates on Gupt

gupt is a serverless, end-to-end encrypted messaging and decentralized data
system built on the Rabta relay protocol. Instead of a proprietary, gatekept
bot API, you generate cryptographic keys and exchange signed, encrypted
events directly with Rabta relays.
One event = one chat bubble. This skill teaches the whole protocol: two-way
bots, directory beacons, interactive buttons, encrypted file attachments,
and push alerts.

## Step 1 — Ask the user for two values (never guess, never hardcode)

| Value | Meaning | Shape |
|---|---|---|
| `GUPT_RELAY` | Rabta relay base URL(s) the user trusts — one or several, comma-separated | e.g. `https://rabta.gupt.app,https://1.rabta.space` |
| `GUPT_ADMIN_KEY` | The admin's gupt public key — the inbox your messages are encrypted to | `ed25519` public key, 64 lowercase hex chars |

- Ask in chat when either value is missing; store them in the project's
  `.env` (or the config file the user prefers) and never commit real values.
- If the user hands you a pre-filled block (gupt's Integrations page copies
  one), use those values as-is — no asking, no substitution.
- A public key is safe to ask for — it is the inbox's address, not a secret.

## Step 2 — Send with the script (in this repo)

```bash
node docs/gupt-notify.mjs \
  --relay "$GUPT_RELAY" \
  --key "$GUPT_ADMIN_KEY" \
  --name "Deploy Bot" \
  "[myapp] deploy finished in 42s"
```

- Set a display name: `--name "Deploy Bot"` (or `$GUPT_NOTIFY_NAME`) publishes a
  `gupt/profiles` (Kind 0) event so the user's inbox displays your name instead
  of a generated animal petname. Gupt clients automatically cache peer profiles
  for 12 hours.
- Attach a file (it renders in the chat like any gupt attachment):
  `node docs/gupt-notify.mjs --relay … --key … --attach report.pdf "weekly report"`
- Text can also come from stdin:
  `tail -n 5 deploy.log | node docs/gupt-notify.mjs --relay … --key …`
- `GUPT_RELAY` may list several relays, comma-separated: the script uploads
  blobs and publishes the event to every one of them and succeeds when any
  relay accepts — like gupt itself does.
- Flags: `--name <name>` sets the sender's display profile name,
  `--source <tag>` overrides the payload source label (default `notify`),
  `--key-file <path>` moves the device key, `--json` prints a
  machine-readable result.
- Your device key is generated once and persisted at
  `~/.gupt/notify/device-key` (`chmod 600`). It is your identity in the
  user's inbox — every message from this machine arrives from the same
  contact. Never delete or regenerate it silently.
- Exit code `0` = delivered; non-zero = read stderr and retry or report.

> **Full Programmatic API Guide:** See [docs/programmatic-chat.md](./programmatic-chat.md)
> for complete end-to-end instructions on building two-way bots, listening to
> inboxes, handling file attachments with exponential backoff retries, and relay
> endpoints.

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

`docs/gupt-notify.mjs` is the reference implementation — read it or copy
from it rather than deriving the format again.

## Attachments — files the user can see in the chat

Attachments are not inside the DM. The file travels as its own sealed blob on
the relay, and the DM references it; gupt's sync then pulls the blob,
verifies it against the hash, decrypts it and renders it in the chat.

### 1. Seal the file into RABTA1 containers

Generate a fresh per-file `mediaKey` (32 random bytes) and `mediaNonce`
(12 random bytes). Files larger than 2 MB are split into 8 equal parts
(ceil(size/8) per part, the last one carries the remainder) so no blob
outgrows a relay's blob size limit; smaller files are a single part. Each
part is sealed as its own container with the SAME `mediaKey` — every
container carries its own random salt, so HKDF derives a distinct per-part
key. Then produce each container:

- Pad the plaintext part: if shorter than 25 bytes, copy it into a zeroed
  25-byte buffer.
- `salt` = 16 random bytes.
- `km = HKDF-SHA256(ikm=mediaKey, salt, info="rabta/blob/v1", L=44)`;
  AES-256-GCM key = `km[0..32]`, nonce = `km[32..44]`.
- `ciphertext = AES-GCM(key, nonce).encrypt(padded)` (includes the 16-byte
  tag).
- Container bytes = `"RABTA1"` (ASCII, 6B) `|| 0x01 || salt(16B) || ciphertext`.
  Minimum container size is 64 bytes.

### 2. Upload the containers

```
PUT $GUPT_RELAY/api/v1/blobs
Content-Type: application/octet-stream
<container bytes>
```

Upload every part container. Response JSON:
`{ "hash": "<sha256 hex of the container>", "url": …, "size": …,
"expires_at": … }`. Blobs are content-addressed, so uploading the same
container to every relay in `GUPT_RELAY` is safe and expected (delivery
survives one relay going down); blobs live ~30 days by default.

### 3. Reference the blobs from the DM

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
    "parts": ["<part 0 blob hash>", "<part 1 blob hash>", "…"]
  }
}
```

`parts` lists every part container's upload hash in order (one entry for
small files, 8 for split ones). Encrypt and sign this payload exactly like
a text DM (step 3 above), with one difference:
`event.blobs = <all part hashes>` (lowercase hex, up to 8 per event) — that
list is what tells gupt's sync to fetch the file.

- `size` is the plaintext length; gupt concatenates the decrypted parts in
  order and trims the padding to it.
- Decryption on the user's side: each container → HKDF with `media.key`,
  exactly the inverse of step 1, then concatenate the parts.

`docs/gupt-notify.mjs --attach` implements all of this — read it or copy
from it rather than deriving the format again.

## Formatting a message (optional)

Messages are plain text unless the payload carries `template`:

| `template` | Behaviour |
|---|---|
| absent or `null` | Auto-detect |
| `true` | Always render |
| `false` | Always show plain text |

Auto-detect needs at least one strong construct: `**bold**`, `~~strike~~`,
`` `code` ``, `[label](https://…)`, a list, a quote, a code block or
`{{button "Label" https://…}}`. Italic alone is not enough, so `*hugs*`
stays literal chat text.

Add `template: true` when a message must render even without a strong
construct. For example:

```json
{
  "source": "notify",
  "text": "Build **passed**\n\n{{button \"Open logs\" https://ci.example.com}}",
  "template": true,
  "ts": 1760000000000,
  "type": "text"
}
```

The helper script sends text without `template`, so auto-detect handles the
strong constructs. Add the field when you build the payload directly
(Step 3) and need to force rendering, or set it to `false` to suppress it.

Only `http:`, `https:` and `mailto:` destinations render. Buttons are links,
never app actions, and links show their hostname. The full grammar, payload
examples and safety rules live in `docs/message-format.md`. Clients that do
not know `template` still show the source text unchanged.

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
- **Listed bot** — publish a `gupt/bot/beacon` so the bot appears in `/bots`;
  see [bots.md](https://github.com/besoeasy/gupt/blob/main/docs/bots.md) and
  [gupt-bot-beacon.mjs](https://github.com/besoeasy/gupt/blob/main/docs/gupt-bot-beacon.mjs).
- **Two-way bot** — read and decrypt the bot's own `gupt/chat/dm` inbox and
  reply with the same wire format.
  [bots.md](https://github.com/besoeasy/gupt/blob/main/docs/bots.md#a-bot-that-replies)
  covers the loop, and [programmatic-chat.md](./programmatic-chat.md) provides
  full reference code for building standalone listeners and responders.
  [`rabta-protocol/gupt-bots`](https://github.com/rabta-protocol/gupt-bots)
  is a working example. Send-only remains enough for most integrations.
