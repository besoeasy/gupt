# Bots — announcing a bot on gupt

gupt has no bot API and no server that knows which bots exist. A bot lists
itself by publishing a signed **beacon** to the relays its users already read,
and the `/bots` route in the app shows what those relays return.

This is the whole discovery protocol: if you can sign a Rabta event and POST
it, you can list a bot. Answering DMs uses the ordinary gupt DM protocol, not a
bot-specific API — see [A bot that replies](#a-bot-that-replies).

---

## The beacon

One event, collection `gupt/bot/beacon`:

```json
{
  "blobs": [],
  "collection": "gupt/bot/beacon",
  "created_at": 1794748827,
  "data": {
    "v": 1,
    "name": "poll-bot",
    "description": "Creates polls in group chats",
    "owner": "Acme",
    "website": "https://example.com/poll-bot"
  },
  "expires_at": 1794856827,
  "labels": [],
  "owner": "ed25519:3358c48905964c146cb651218c71e2a092a0dfca0d51fff69eaf7649040bac0b",
  "id": "8e55b634e28f…",
  "sig": "…"
}
```

| Field | Rule |
| --- | --- |
| `data.v` | Protocol version. `1` today. A client drops beacons with an unknown version. |
| `data.name` | 1–64 characters. Required; a beacon without a name is ignored. |
| `data.description` | 0–280 characters. Plain text — the directory renders no HTML. |
| `data.owner` | 0–80 characters. Free-text attribution. **A claim, not proof.** |
| `data.website` | 0–300 characters. `http(s)` only; a bare host is read as `https`. |
| `expires_at` | 30 hours after `created_at`. Rabta allows 60 seconds to 300 days. |
| `owner` | The bot's own Ed25519 key. Set by signing; this is the bot's identity. |
| `labels` | Empty. The collection is the type. |

Beacons are **public and unencrypted**. Relays see the payload, the key, the
timestamps and the publisher's IP. Do not put secrets, tokens or private
contact details in a beacon.

## Identity

The signing key is the bot. Two beacons from the same key are the same bot,
even if the name changes; two keys that both call themselves `poll-bot` are two
different bots. The directory dedupes by key and shows a short fingerprint on
every card.

`data.owner` is the human or organisation the bot claims to belong to. Anyone
can write anyone's name there, so the UI never turns it into a verified badge
or a profile link.

Keep the key file. Deleting it creates a new bot, which starts again with no
history and no recognisable fingerprint.

## Publishing

[`docs/gupt-bot-beacon.mjs`](./gupt-bot-beacon.mjs) is the reference publisher.
It signs with the bot key, posts to every configured relay, and repeats every
24 hours.

```bash
node docs/gupt-bot-beacon.mjs \
  --relay https://rabta.gupt.app \
  --name poll-bot \
  --description "Creates polls in group chats" \
  --owner "Acme" \
  --website https://example.com/poll-bot \
  --once
```

- The key is generated once at `~/.gupt/bot/key` (`0600`), or `--key-file` /
  `$GUPT_BOT_KEY_FILE`. The printed `ed25519:…` public key is the bot.
- Without `--once` the script loops: a beat every 24 hours ± 5 minutes, with a
  10-minute retry when every relay fails. Run it under systemd, a container, or
  any process supervisor.
- `--relay` accepts a comma-separated list, or `$GUPT_RELAY`. Defaults to the
  public relays `https://rabta.gupt.app` and `https://1.rabta.space`.
- `--json` prints one JSON line per beat for logs and monitoring.
- Success means at least one relay accepted the event; a duplicate counts.

For a cron-style setup, run `--once` daily and add jitter:

```cron
17 4 * * *  node /srv/poll-bot/docs/gupt-bot-beacon.mjs --name poll-bot --once
```

Missed beats are survivable: a beacon lives 30 hours, so one late beat does not
unlist the bot. A bot that stops publishing disappears within 30 hours.

## What the directory shows

`/bots` queries the user's configured relays directly — beacons are never
routed through the account's own event engine — then:

1. verifies each event's signature and collection;
2. clamps `name`, `description`, `owner` and `website` to the limits above;
3. drops a website that is not `http(s)`;
4. keeps the newest beacon per bot key;
5. sorts established bots first, then by name.

The first page asks each relay for 100 live beacons, merges and dedupes them.
With the two public relays that is roughly 100–160 bots, depending on how many
have two unexpired beacons during the 6-hour overlap after a beat. There is no
server-side index to page through.

### Talking to a listed bot

A card is a contact, not an install. Clicking it — or focusing it and pressing
Enter or Space — opens a normal encrypted DM addressed to the key that signed
the beacon. That is the same key the bot reads `gupt/chat/dm` with, so a bot
that answers DMs needs no separate chat address or registration.

The website link on a card opens in a new tab and does not start a chat. A bot
that publishes a beacon but never reads its inbox stays listed and stays silent;
the beacon only makes it discoverable.

## A bot that replies

The beacon key is also the bot's chat address. To answer messages, the bot:

1. queries `gupt/chat/dm` for events labelled with its own public key;
2. decrypts each one with its private key, ignoring its own messages, group
   traffic, receipts, edits, reactions, call signals and other non-text
   payloads;
3. publishes an encrypted `gupt/chat/dm` reply labelled with the sender's
   public key.

[`docs/SKILL.md`](./SKILL.md) documents the sending half in full: canonical
JSON, X25519 + AES-256-GCM, Ed25519 signing, and the relay POST. The reference
two-way bot at
[`rabta-protocol/gupt-bots`](https://github.com/rabta-protocol/gupt-bots)
implements the inbox poll, decryption, reply loop and beacon beat in one small
Node process.

There is no registration, webhook or callback URL. Any key that follows the DM
wire format can be a bot, and any gupt client can message it.

### "Established" is local

A relay deletes a beacon at `expires_at`, and never returns expired events. So
there is no global 30-day history to query. The app keeps a small local ledger
of bot keys it has actually seen, and pins a bot as **30d+** once this device
has known it for 30 days.

That makes the badge a weak but honest signal: a brand-new key cannot buy it,
because only time on this device earns it. A fresh install starts with an empty
ledger, so no bot is established yet — the section fills in as the app is used.
It does not stop a spammer from flooding the list; it keeps bots with a track
record above the flood.

## Discovery is relay-scoped

A bot is visible only if it announces to a relay the viewer has configured.
Two users can see different directories, and a bot that publishes to one relay
is invisible to someone who reads only another. That is a property of the
network, not a bug; the empty state in `/bots` says so.

## Spam and impersonation

Rabta keys are free and there is no moderation layer. Anyone can publish any
number of beacons, and any key can use any name. The directory's defences are
structural, not editorial:

- one card per key, so repeated beats do not stack;
- signature verification, so a relay cannot forge another bot's beacon;
- field limits and plain-text rendering, so a beacon cannot inject markup;
- `http(s)`-only links, opened with `noopener noreferrer nofollow`;
- the local 30-day ledger, which a new key cannot fake.

What it does **not** do: prove that a bot is useful, safe, or the original owner
of a name. Treat the directory as a relay view, not an app store.
