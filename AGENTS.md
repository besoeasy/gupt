# GUPT — Agent Guidelines

## Nostr event kinds (restricted)

Only these kinds may be used. Do not introduce any other kind.

- `0` — profile metadata
- `1` — notes, passwords, bookmarks, feed, share links
- `4` — encrypted DMs (NIP-04); groups are tagged kind-4
- `20004` — ephemeral DM / call signaling
- `21004` — typing indicators

Rules: reuse an allowed kind + a distinguishing tag for new features; keep query `kinds:` arrays to these values only.