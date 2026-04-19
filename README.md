# GUPT

Self-hosted, end-to-end encrypted messenger. A privacy-first alternative to Telegram, Signal, WhatsApp & Discord — built on Nostr relays with WebRTC calls.

Live at [gupt.app](https://gupt.app)

## Features

- Anonymous — no phone number, no email, no account
- End-to-end encrypted direct messages
- WebRTC voice & video calls
- Encrypted media uploads
- Group rooms via Nostr relays
- Local-first with offline cache (IndexedDB)
- Installable PWA

## Getting Started

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
```

## Self Hosting

Point any static file server at the `dist/` folder after running `npm run build`. No backend required — the app connects directly to public or private Nostr relays.

## Credits

- [Originless](https://github.com/besoeasy/Originless) — powers decentralised encrypted file uploads

## License

[CC BY-NC 4.0](./LICENSE) — Attribution required, commercial use prohibited.
