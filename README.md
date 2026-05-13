# GUPT

Self-hosted, end-to-end encrypted messenger. A privacy-first alternative to Telegram, Signal, WhatsApp & Discord — built on Nostr relays with WebRTC calls.

## How to Use

**Web** — easiest, no install, works everywhere → [gupt.app](https://gupt.app)

**Docker** — self-host on your own server → `docker run -p 8000:8000 ghcr.io/besoeasy/gupt:latest`

**Linux** — native desktop app → [Flathub](https://flathub.org/en/apps/com.besoeasy.gupt)

### Local Flatpak Build

For local packaging, you can build the web assets first and then package the existing `dist/` output without downloading npm sources inside `flatpak-builder`:

```bash
npm run icons
npm run flatpak:local
```

This uses [flatpak/com.besoeasy.gupt.prebuilt.yaml](flatpak/com.besoeasy.gupt.prebuilt.yaml) and is intended for local builds only. The Flathub manifest remains source-based.

**Windows** — not supported. We disagree with Windows' privacy practices and will not build or endorse it.

**Mobile (Android / iOS)** — no native app, by design. App stores require developer identity verification (KYC) and reserve the right to remove apps at any time. This means a privacy tool distributed through Google Play or the App Store can be delisted, geo-blocked, or pulled under government pressure — precisely in the countries where it is needed most. The web app and PWA work on mobile browsers without any store involvement.

## Features

**Privacy & Identity**
- Anonymous — no phone number, no email, no account
- Keypair-based identity; optionally password + PIN protected (Argon2id KDF)
- Deterministic avatars — no profile photo required
- Zero server-side user accounts or metadata

**Messaging**
- End-to-end encrypted direct messages (NIP-04 / NIP-59 gift-wrap)
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

## License

[CC BY-NC 4.0](./LICENSE) — Attribution required, commercial use prohibited.
