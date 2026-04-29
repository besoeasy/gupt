# GUPT

Self-hosted, end-to-end encrypted messenger. A privacy-first alternative to Telegram, Signal, WhatsApp & Discord — built on Nostr relays with WebRTC calls.

## How to Use

**Web** — easiest, no install, works everywhere → [gupt.app](https://gupt.app)

**Docker** — self-host on your own server → `docker run -p 8000:8000 ghcr.io/besoeasy/gupt:latest`

**Linux / macOS** — native desktop app → [Releases](https://github.com/besoeasy/gupt/releases/latest)

**Windows** — not supported. We disagree with Windows' privacy practices and will not build or endorse it.

**Mobile (Android / iOS)** — no native app, by design. App stores require developer identity verification (KYC) and reserve the right to remove apps at any time. This means a privacy tool distributed through Google Play or the App Store can be delisted, geo-blocked, or pulled under government pressure — precisely in the countries where it is needed most. The web app and PWA work on mobile browsers without any store involvement.

## Features

- Anonymous — no phone number, no email, no account
- End-to-end encrypted direct messages
- WebRTC voice & video calls
- Encrypted media uploads
- Group rooms via Nostr relays
- Local-first with offline cache (IndexedDB)
- Installable PWA

## Credits

- [Originless](https://github.com/besoeasy/Originless) — powers decentralised encrypted file uploads

## License

[CC BY-NC 4.0](./LICENSE) — Attribution required, commercial use prohibited.
