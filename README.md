# GUPT — Anonymous Privacy Suite

Your complete anonymous digital life. No phone number. No email. No account. No server.

GUPT is an **all-in-one privacy suite** built on [Nostr](https://nostr.com) — a decentralized, censorship-resistant relay network. Everything is end-to-end encrypted with your keypair before it ever leaves your device.

## Three Pillars

| 💬 Chat | 🔐 Vault | 📤 Share |
|---|---|---|
| Encrypted DMs, group chats, WebRTC calls, voice messages | Passwords, 2FA secrets, notes — encrypted and stored on Nostr | Ephemeral encrypted file & text links anyone can open |

## How to Use

**Web** — easiest, no install, works everywhere → [gupt.app](https://gupt.app)

**Docker** — self-host on your own server → `docker run -p 8000:8000 ghcr.io/besoeasy/gupt:latest`

**Linux** — native desktop app → [Flathub](https://flathub.org/en/apps/com.besoeasy.gupt)

## Showcase

- [Umbrel App Store](https://apps.umbrel.com/app/gupt)
- [Flathub](https://flathub.org/en/apps/com.besoeasy.gupt)
- [GitHub Container Registry](https://github.com/besoeasy/gupt/pkgs/container/gupt)

## Features

**Privacy & Identity**
- Anonymous — no phone number, no email, no account
- Keypair-based identity; optionally password + PIN protected (Argon2id KDF)
- Deterministic avatars — no profile photo required
- Zero server-side user accounts or metadata

**Messaging**
- End-to-end encrypted direct messages (NIP-04 / NIP-59 gift-wrap)
- **Temporary invites** — share a short-lived link instead of your permanent public key (see below)
- Group chats with member management and admin roles
- Message replies, edits, reactions, and emoji
- In-chat search and paginated message history
- @mention support in group rooms

**Voice & Video**
- WebRTC peer-to-peer voice and video calls
- Voice message recording and playback
- Incoming call notifications with ringtone

**Media**
- Encrypted image, video, and audio sharing (AES-GCM before upload)
- Multi-mirror download with SHA-256 integrity verification
- Blossom, Originless, and IPFS storage backend support

**Secure Tools**
- **Gupt Vault**: A built-in personal vault to securely store encrypted private notes, passwords, and 2FA secrets directly on the Nostr network with optional auto-expiring timers.
- **Secure Share**: An end-to-end encrypted sharing system to share files and text notes via ephemeral links that anyone can decrypt, without needing a Nostr account.

**Network & Relays**
- Runs on public Nostr relays — no single point of failure
- Configurable relay list; automatic primary relay selection
- Self-hostable with a single Docker command

**Local-first Storage**
- Full offline cache in IndexedDB (Dexie)
- Auto-purge: messages older than 100 days or beyond 10 GB are pruned
- Profile cache with 24-hour TTL

**Platform**
- Installable PWA — works on any browser including mobile
- Native Linux desktop app on Flathub
- Dark and light theme

## Temporary invites

GUPT identities are public keys. To start a chat, two people need to exchange those keys somehow — paste a key, scan a QR code, or open a link.

A **permanent profile link** (`#/profile/{pubkey}`) works, but it has a privacy downside: if you drop it in WhatsApp, Telegram, or a group chat, your public key stays in that message history forever. Anyone with access to the chat can copy it later, even if you only meant to invite one person once.

**Temporary invites** solve that. On **New chat** (`/new`), generate an invite link you can safely share in messaging apps.

### Why use them

- **No plaintext pubkey in the chat** — the link is an opaque token, not a hex key or `npub`
- **Expires automatically** — choose 1 hour, 24 hours, or 7 days
- **Single-use** — after someone opens the conversation, the invite is revoked (best-effort via Nostr)
- **Works without trusting the chat app** — old messages do not permanently advertise your identity

### How they work

1. You pick a TTL and tap **Generate invite link** on `/new`.
2. GUPT builds a URL like `https://gupt.app/#/invite/{token}`.
3. The token carries your pubkey inside **AES-GCM ciphertext** (key derived from the token). WhatsApp sees gibberish, not your key.
4. Optionally, the same encrypted payload is published to Nostr relays (kind `30520`) with an **expiration** tag (NIP-40) so relays can drop it after the TTL.
5. The recipient opens the link → **Invite** page decrypts the token → **Open conversation** starts an end-to-end encrypted DM.

No phone number, no server account, and no need for the recipient to already know your public key.

### Permanent key vs temporary invite

| | Permanent profile link | Temporary invite |
|---|---|---|
| URL contains pubkey | Yes (hex in path) | No (encrypted token) |
| Stays valid | Forever | Until TTL or first use |
| Best for | Your website, long-term contact | WhatsApp, SMS, one-off intros |
| Where in app | Profile / advanced copy on `/new` | **Generate invite link** on `/new` |

For day-to-day sharing — especially in apps where chat history is stored — prefer a temporary invite. Keep your raw public key for cases where a permanent contact point is intentional.

## Offline Notifications (PING)

GUPT supports out-of-band push notifications to notify offline users to come online. Since GUPT does not use a central server, we utilize [ntfy.sh](https://ntfy.sh) to send decentralized, anonymous push notifications.

When you want to reach an offline contact, use the **PING** button in your chat (or the in-chat reminder when they've been quiet). This sends a push notification to their device with the message:
`"Hey its swift-fox-042 - come online on gupt.app"`

The name is your GUPT display handle — a deterministic username generated from your public key (the same `adjective-noun-###` label shown in the app when you haven't set a custom profile name).

### How to receive PING notifications:

To receive push notifications when someone PINGs you, follow these steps:

1. **Install the ntfy app:** Download the free **ntfy** app from the [App Store (iOS)](https://apps.apple.com/us/app/ntfy/id1625396347), [Google Play (Android)](https://play.google.com/store/apps/details?id=io.heckel.ntfy), or F-Droid.
2. **Open the app and subscribe:** Tap the `+` button (or "Subscribe to topic") to add a new subscription.
3. **Enter your topic:** Your topic is exactly your public key (hex format). Paste your GUPT public key into the topic name field and subscribe.

That's it! Whenever a contact clicks "PING" in your chat, you will instantly receive a push notification on your phone—without GUPT needing your phone number or email.

## License

[CC BY-NC 4.0](./LICENSE) — Attribution required, commercial use prohibited.
