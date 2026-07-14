# Plan: Instant P2P Media Delivery for Gupt

## Problem

IPFS is the primary media transport, but it has **propagation latency** — even
though we race originless servers on upload, the recipient must wait for the CID
to be discoverable/pinned on a gateway before `@helia/verified-fetch` can pull
it. Blossom (HTTPS) fixes this with a direct URL, but it's a centralized server
we operate/trust.

We want a **direct peer-to-peer push** so that when both users have the chat
open, the file is delivered *instantly*, before IPFS propagation completes. If
the recipient is offline, IPFS (already propagating) and Blossom cover it.

## Current architecture

```
Sender ──► upload.js
            ├─ originless servers (IPFS pin)  ──► ipfs://<CID>      [primary, trustless]
            └─ Blossom servers (BUD-01/02)    ──► https://...       [fallback, always-on]

Receiver ──► mediaDecrypt.js → resolveMediaSources()
              ├─ source 0: ipfs://<CID>        (helia verified-fetch)
              └─ source 1: https://<blossom>   (plain fetch)
```

Files involved:
- `src/lib/upload.js` — parallel originless + Blossom upload, returns `{ cid, fallback }`
- `src/lib/fallback_upload.js` — Blossom BUD-01/BUD-02 PUT with Nostr auth
- `src/lib/ipfsFetch.js` — `ipfs://` → helia, `https://` → native fetch
- `src/lib/mediaDecrypt.js` — `resolveMediaSources()` builds the source list; fetch race + AES-GCM decrypt
- `src/config/servers.js` — `DEFAULT_ICE_SERVERS` (STUN) already configured
- `src/lib/calls.js` — existing `RTCPeerConnection` + Nostr signaling plumbing

## Decision: WebRTC DataChannel as a new instant tier (NOT WebTorrent)

### Why not WebTorrent

| Concern | WebTorrent | WebRTC DataChannel |
|---|---|---|
| Bundle size | ~200 KB+ (bittorrent-protocol, ut_metadata, …) | **0 KB** — native browser API |
| Signaling | Needs a WS tracker; DHT disabled in browsers | **Nostr relays we already have** |
| Swarm model | Many-seeder public content | 1:1 ephemeral encrypted push (our case) |
| Latency to first byte | High (handshake + metadata + piece selection) | ~1 RTT after ICE |
| NAT traversal | Trackers only | Full ICE/STUN/TURN, already in `servers.js` |
| Offline recipient | Torrent dies — no persistence | Falls through to IPFS ✅ |

WebTorrent is built for public, many-seeder content. Our case is the opposite:
private, ephemeral, 1:1 (or small group), encrypted, single-shot delivery. The
swarm model adds overhead we don't benefit from, and we'd still need a fallback
for the offline case — so we'd be *adding* a layer, not replacing Blossom.

### The chosen design: 3-tier fetch

```
1. WebRTC push   (instant, if peer online & chat open)   ← NEW tier
2. IPFS          (propagating in background, trustless)   ← existing
3. Blossom       (always-available HTTPS URL)             ← existing
```

This matches the requirement exactly: *"if a user is offline, it's fine since
IPFS would have propagated by then."*

### Why it fits Gupt

- The blob is **already encrypted** before upload → DataChannel ships opaque
  ciphertext → E2EE for free, zero extra crypto on the p2p path.
- `RTCPeerConnection` + ICE servers already exist in `src/lib/calls.js`.
- Nostr relays already serve as signaling (call offers/answers are exchanged
  over Nostr today) → a "media-offer" NIP-04 event is all we need, no new infra.
- **Zero new npm dependencies.**

## Implementation plan

### 1. New module: `src/lib/webrtcTransfer.js`
- Reuse ICE config from `src/config/servers.js`.
- Signal over the existing Nostr messenger store (NIP-04 gift-wrap).
- Expose:
  - `sendBlob(peer, blob, { signal })` — open/reuse a DataChannel, stream ciphertext.
  - `onBlob(handler)` — register an incoming-blob handler.
- Chunking: DataChannels have a ~16 KB practical message limit for reliable
  delivery. Use a tiny length-prefixed frame: `{ seq, total, sha256, data }`.
  A typical photo/voice note is a few hundred chunks — trivial.
- Short timeout (e.g. 3 s) so an offline peer fails fast and falls through.

### 2. Sender side: `src/lib/upload.js`
- After encryption, fire the WebRTC push **in parallel** with originless + Blossom.
- The message's `media` object gains a `webrtc` field, e.g.
  `{ from, msgId, sha256 }`, so the receiver knows to listen.

### 3. Receiver side: `src/lib/mediaDecrypt.js`
- In `resolveMediaSources()`, **prepend** a `webrtc` source (id `"0"`) when
  present, ahead of the `ipfs` source (which becomes id `"1"`) and Blossom
  (id `"2"`).
- Short timeout on the webrtc source so offline peers fall through to IPFS fast.

### 4. Message shape change
```js
// before
media: { key, nonce, mime, name, size, cid, fallback }
// after
media: { key, nonce, mime, name, size, cid, fallback, webrtc: { from, msgId, sha256 } }
```
`webrtc` is optional; old clients simply ignore it and use IPFS/Blossom as today.

## Research: Can `jmcorgan/fips` be used?

**Repo:** https://github.com/jmcorgan/fips — "FIPS: Free Internetworking Peering System"

### What FIPS is
- A **Rust** mesh-networking daemon (v0.4.0 shipped, v0.5.0-dev). A machine
  running FIPS becomes a node in a self-organizing mesh with a self-generated
  **Nostr keypair** as its identity.
- Two-layer Noise encryption (IK hop-by-hop, XK end-to-end) with periodic rekey.
- Multi-transport: UDP, TCP, Ethernet, Tor, Nym (mixnet), Bluetooth (BLE L2CAP).
- IPv6 TUN adapter maps each remote npub to `fd00::/8`, so unmodified IPv6
  software reaches peers as `<npub>.fips` with a built-in `.fips` DNS resolver.
- Nostr-mediated discovery + STUN UDP hole-punching for NAT traversal; mDNS for LAN.
- Optional `fips-gateway` folds a whole LAN into the mesh (outbound + inbound).
- MIT licensed, 220 stars, reproducible builds.

### Can Gupt use it? — **Not directly as a browser fallback.**

| Aspect | Verdict |
|---|---|
| Language | Rust daemon — **not** a JS/WASM browser library. Gupt is a browser PWA. |
| Deployment | Runs as a system service (`fips` daemon + `fipsctl`/`fipstop`). Needs TUN, nftables, libclang at build. Not shippable in a web bundle. |
| Transport model | Full mesh routing over IPv6 TUN. Gupt needs a single-shot encrypted blob push over an existing Nostr+WebRTC session, not a routed IPv6 overlay. |
| Identity overlap | ✅ Both use Nostr secp256k1/schnorr keypairs — nice conceptual alignment, but no runtime integration. |
| Browser feasibility | ❌ No browser/WASM target. BLE/TUN/nftables are OS-level. Mobile support is explicitly a *longer-term* roadmap item. |

### Where FIPS *could* matter to Gupt (future, not this task)
- As an **optional native sidecar** for a desktop/Flatpak build: a power user
  running the FIPS daemon could route Gupt's relay traffic over the FIPS mesh
  (the repo even ships a `sidecar-nostr-relay` example). This is an
  infrastructure/transport choice for relays, **not** a media-delivery fallback.
- It does **not** solve the "instant media push between two open chats" problem
  this plan targets. That problem is fundamentally a browser-session-level
  DataChannel concern, which FIPS (a kernel-level IPv6 overlay) doesn't address.

### Conclusion on FIPS
**Out of scope for this media-delivery work.** FIPS is a complementary
infrastructure project (Nostr-native mesh VPN), not a browser p2p transfer
library. Keep it in mind only if Gupt ever ships a native desktop daemon that
wants mesh-routed relays. For the instant-push tier, **WebRTC DataChannel over
existing Nostr signaling** remains the right choice — zero dependencies, full
reuse of current plumbing, and it runs entirely in the browser.

## Summary

- **Keep Blossom** as the durable always-on HTTPS fallback.
- **Add WebRTC DataChannel** as source tier 0 in `resolveMediaSources()` for
  instant delivery when both peers are online.
- **Keep IPFS** as the trustless durable tier (propagating in background).
- **Do not** adopt WebTorrent (wrong model, heavy bundle) or FIPS (native Rust
  daemon, not browser-runnable) for this purpose.
- **Zero new dependencies.** Reuse `RTCPeerConnection`, ICE config, and Nostr
  signaling already present in the codebase.

## Next step

Scaffold `src/lib/webrtcTransfer.js` and wire it into `upload.js` (sender) and
`mediaDecrypt.js` (receiver source tier 0), then test the online-peer fast path.
