<p align="center">
  <img src="https://gupt.app/social-banner.svg" alt="GUPT — Anonymous Privacy Suite" width="800" />
</p>

<h1 align="center">GUPT</h1>

<p align="center">
  <strong>Your complete anonymous digital life.</strong><br />
  Encrypted chat, secure vault, and ephemeral sharing — with no phone number, no email, no account, and no central server.
</p>

<p align="center">
  <a href="https://gupt.app"><img src="https://img.shields.io/badge/Try%20GUPT-gupt.app-facc15?style=for-the-badge" alt="Try GUPT" /></a>
  <a href="https://flathub.org/en/apps/com.besoeasy.gupt"><img src="https://img.shields.io/flathub/votes/com.besoeasy.gupt?color=4a90d9&label=Flathub&logo=flathub&logoColor=white&style=for-the-badge" alt="Flathub" /></a>
  <a href="https://apps.umbrel.com/app/gupt"><img src="https://img.shields.io/badge/Umbrel-App%20Store-5b21b6?style=for-the-badge" alt="Umbrel App Store" /></a>
  <a href="https://vercel.com/new/clone?repository-url=https://github.com/besoeasy/gupt&project-name=gupt&repository-name=gupt"><img src="https://img.shields.io/badge/Deploy-Vercel-000000?style=for-the-badge&logo=vercel" alt="Deploy to Vercel" /></a>
  <a href="https://app.netlify.com/start/deploy?repository=https://github.com/besoeasy/gupt"><img src="https://img.shields.io/badge/Deploy-Netlify-00C7B7?style=for-the-badge&logo=netlify&logoColor=white" alt="Deploy to Netlify" /></a>
</p>

<p align="center">
  <a href="https://gupt.app">Website</a> ·
  <a href="https://github.com/besoeasy/gupt/issues">Issues</a> ·
  <a href="https://github.com/besoeasy/gupt/pkgs/container/gupt">Docker</a> ·
  <a href="./docs/README.md">Docs</a> ·
  <a href="./LICENSE">License</a>
</p>

---

## Why GUPT?

Most messengers ask you to trade privacy for convenience — a phone number, an email, a central server that logs who you talk to. **GUPT is fundamentally different.** It is not just another UI clone of WhatsApp or Telegram; it is a **100% browser-native, serverless, decentralized privacy suite**.

Built on a decentralized relay network, everything is **end-to-end encrypted on your device** before it ever leaves your browser. Relays only store and forward ciphertext. Your identity is a cryptographic keypair you control — not an account someone else can log, suspend, or subpoena.

### How GUPT is Different

| Feature / Architecture | WhatsApp & Telegram | Signal | GUPT |
|---|---|---|---|
| **Phone number / Email required** | Yes | Yes | **No** (Cryptographic keypairs only) |
| **Central servers & user databases** | Yes | Yes | **No** (100% Decentralized relay network) |
| **Metadata & social graph protection** | No (Servers log contacts) | Partial | **Yes** (Client-side encryption before relay submission) |
| **In-browser execution & zero install** | No | No | **Yes** (Runs entirely in any web browser) |
| **P2P WebRTC Voice/Video & Screen Share** | No (Centralized calls) | No (Centralized calls) | **Yes** (Direct P2P WebRTC with relay signaling) |
| **Trustless In-Browser IPFS Verification** | No | No | **Yes** (`@helia/verified-fetch` in browser) |
| **Encrypted Media Storage** | AWS / Central Cloud | AWS / Central Cloud | **Stateless Originless IPFS Pinning** |
| **Self-Hostable Infrastructure** | No | No | **Yes** (Docker, npx, static web, VPS) |
| **Built-in Encrypted Password Vault** | No | No | **Yes** (Locally encrypted vault) |

---

### What Makes GUPT Unique

1. ⚡ **100% In-Browser Engine**: Runs completely inside your web browser. Local storage uses IndexedDB (`idb.js`), local encryption uses WebCrypto & Noble crypto, and media hash verification uses `@helia/verified-fetch`.
2. 🔑 **Zero Server Accounts & Censorship Resistance**: No sign-up, no phone numbers, no email addresses. Accounts cannot be blocked, banned, or shut down because there is no central server.
3. 📞 **P2P Audio/Video & Screen Sharing**: WebRTC calls and screen sharing connect directly peer-to-peer between browsers, protected by a built-in trusted contact threshold (`sentCount >= 7`).
4. 🌐 **Stateless Originless Media & Redundancy**: Media attachments are encrypted client-side before being pinned onto IPFS across redundant Originless nodes with automatic multi-server failover.

---

## See it in action

<p align="center">
  <img src="https://raw.githubusercontent.com/besoeasy/gupt/main/flatpak/screenshots/main.png" alt="GUPT main chat view" width="45%" />
  &nbsp;
  <img src="https://raw.githubusercontent.com/besoeasy/gupt/main/flatpak/screenshots/group.png" alt="GUPT group conversation" width="45%" />
</p>

---

## Three pillars — one suite

GUPT isn't just a messenger. It's an all-in-one privacy toolkit that lives in your browser or on your desktop.

| | **Chat** | **Vault** | **Share** |
|---|---|---|---|
| **What** | Encrypted DMs, groups, voice & video calls | Passwords, 2FA secrets, private notes | Ephemeral encrypted file & text links |
| **Where stored** | Decentralized relays (encrypted) | Decentralized relays (encrypted) | Link-only — no account needed to open |
| **Best for** | Day-to-day conversations | Secrets you'd put in a password manager | One-off handoffs without exposing your identity |

---

## Quick start

| I want to… | Use |
|---|---|
| Just try it | 👉 [gupt.app](https://gupt.app) |
| Run it locally | `npx github:besoeasy/gupt` |
| Self-host with Docker | `docker run -p 8000:8000 ghcr.io/besoeasy/gupt:latest` |
| Deploy my own public URL | [Vercel](#-vercel--netlify) · [Netlify](#-vercel--netlify) |
| Native Linux app | `flatpak install flathub com.besoeasy.gupt` |

→ **[See all deployment options](#-deploy-gupt)**

---

## Features

### Privacy & identity
- **Truly anonymous** — no phone number, no email, no signup flow
- Keypair-based identity with optional password + PIN protection (Argon2id)
- Deterministic avatars — no profile photo required
- **Temporary invites** — share a short-lived link instead of your permanent public key ([details below](#temporary-invites))
- **Domain contact** — add a `gupt.` TXT record so people can message you by domain ([details below](#domain-contact))
- Zero server-side user accounts or contact graphs

### Messaging
- End-to-end encrypted DMs
- Group chats with member management and admin roles
- Replies, edits, reactions, emoji, and @mentions
- In-chat search with paginated history

### Voice & video
- WebRTC peer-to-peer voice and video calls
- **In-Call Screen Sharing** — share desktop / browser tabs live during WebRTC calls
- Trusted contact call protection threshold (`sentCount >= 7`)
- Voice message recording and playback with speed controls
- Incoming call notifications with customizable ringtone

### Media
- Encrypted image, video, and audio sharing (AES-GCM before upload)
- **Multi-Server Originless Upload** — parallel uploads with automatic failover and IPFS pinning
- Trustless in-browser IPFS CID verification via `@helia/verified-fetch`
- Multi-mirror download with SHA-256 integrity verification

### Secure tools
- **Gupt Vault** — encrypted notes, passwords, and 2FA secrets with optional auto-expiry
- **Bookmarks** — encrypted page bookmarks with gupt-mark bookmarklet and auto-renewal
- **Passwords** — encrypted logins with URLs, TOTP secrets, tags, and auto-renewal
- **Secure Share** — ephemeral encrypted links anyone can decrypt, no account required

### Network & storage
- Runs on public decentralized relays — no single point of failure
- Configurable relay list with automatic primary relay selection
- Full offline cache in IndexedDB; auto-purge after 100 days or 10 GB
- Installable PWA plus native Linux app; dark and light themes

---

## How it works

```mermaid
flowchart LR
    A[Your device] -->|E2E encrypt| B[Decentralized relays]
    B -->|Ciphertext only| C[Recipient device]
    A -.->|WebRTC direct| C
    D[No central server] -.-> A
    D -.-> B
    D -.-> C
```

1. **You** generate a keypair locally — that's your identity.
2. **Messages** are encrypted on your device, then published to decentralized relays.
3. **Relays** store and forward ciphertext — they never see plaintext.
4. **Calls** go peer-to-peer over WebRTC, not through a central server.
5. **Vault & Share** use the same encryption model — your keys, your data.

### Data Structures

GUPT uses a strict subset of event kinds for relay communication:

| Feature | Event Kind | Description |
|---|---|---|
| **Public Profiles** | `0` | Metadata (display name, avatar hash, about text). |
| **Secure Share** | `1` | A public note advertising GUPT. The actual files/notes are encrypted and hidden inside a custom event tag. |
| **Temporary Invites**| `1` | An auto-expiring public ghost event. The encrypted public key payload is hidden inside a custom `gupt_invite` tag. |
| **Direct Messages** | `4` | Standard end-to-end encrypted direct messages. |
| **Gupt Vault** | `1` | Self-addressed encrypted notes — readable marker in `content`, encrypted payload in a `gupt_vault` tag. |
| **WebRTC Calls & Files** | `20004` | Ephemeral encrypted DMs for high-frequency WebRTC signaling (offers, answers, candidates, etc) that bypass relay rate-limiting. |
| **Typing Indicators** | `21004` | Ephemeral encrypted typing indicators for 1-on-1 chats. |

---

## Temporary invites

GUPT identities are public keys. To start a chat, two people need to exchange them — but dropping your permanent profile link in WhatsApp or Telegram leaves your public key in that chat history forever.

**Temporary invites** fix that. On **New chat**, generate a link you can safely share anywhere:

- **No plaintext public key** — the URL carries AES-GCM ciphertext, not your hex key
- **Expires automatically** — 1 hour, 24 hours, or 7 days
- **Single-use** — revoked after the first open
- **Works without trusting the chat app** — old messages don't permanently advertise your identity

| | Permanent profile link | Temporary invite |
|---|---|---|
| URL contains public key | Yes | No (encrypted token) |
| Stays valid | Forever | Until TTL or first use |
| Best for | Website, long-term contact | WhatsApp, SMS, one-off intros |

For day-to-day sharing in apps with persistent history, prefer a temporary invite.

---

## Domain contact

Let people start an encrypted chat using just your domain — no public key to copy, no account required. Perfect for **anonymous website support**: visitors stay private, you only expose a support key.

### For website owners

Add one TXT record to your DNS:

```
gupt.yourdomain.com.  TXT  "<your-64-char-hex-pubkey>"
```

You can also use your full public key as the TXT value.

In GUPT, open **Me → Identity** to copy the ready-made TXT record and a support link for your site.

**Subdomains work too** — publish TXT on `gupt.<subdomain>` and visitors enter the subdomain as-is:

| Visitor enters | TXT record |
|---|---|
| `besoeasy.com` | `gupt.besoeasy.com` |
| `support.besoeasy.com` | `gupt.support.besoeasy.com` |

```
gupt.support.besoeasy.com.  TXT  "<your-64-char-hex-pubkey>"
```

```html
<a href="https://gupt.app/#/new/start?domain=support.besoeasy.com">Anonymous support</a>
```

Each subdomain needs its own record. There is no wildcard or apex fallback — `support.besoeasy.com` will not read `gupt.besoeasy.com`.

### For visitors

On **[Start chat](https://gupt.app/#/new/start)**, enter a domain instead of a public key:

```
besoeasy.com
```

GUPT looks up `gupt.besoeasy.com`, reads the TXT record, and opens an end-to-end encrypted DM.

**Website button example:**

```html
<a href="https://gupt.app/#/new/start?domain=besoeasy.com">Anonymous support chat</a>
```

| | Temporary invite | Domain contact |
|---|---|---|
| Setup | Generate in app | One DNS TXT record |
| Visitor enters | Invite link | `yourdomain.com` |
| Best for | One-off intros in chat apps | Permanent support / contact page |
| Stays valid | Until TTL or first use | Until you update DNS |

---

## Offline notifications (PING)

No central server means no built-in push infrastructure. GUPT uses [ntfy.sh](https://ntfy.sh) for decentralized, anonymous wake-up pings.

When a contact is offline, tap **PING** in chat. They get a notification like:

> *"Hey its swift-fox-042 — come online on gupt.app"*

**To receive PINGs:**

1. Install the free [ntfy app](https://ntfy.sh) ([iOS](https://apps.apple.com/us/app/ntfy/id1625396347) · [Android](https://play.google.com/store/apps/details?id=io.heckel.ntfy))
2. Subscribe to a topic named **your public key** (hex format)

No phone number or email required — just your pubkey as the topic name.

---

## gupt-mark
<img width="475" height="258" alt="Screenshot From 2026-08-08 22-51-33" src="https://github.com/user-attachments/assets/0c05718b-5394-4e26-84de-579041daadfd" />

Save any page to your encrypted **Bookmarks** without leaving the site you're on — no copy-paste, no forms.

GUPT ships a **bookmarklet**: a tiny bookmark that, when clicked on any page, captures the **page URL** and **title**, then opens the gupt web app at [`#/hotlink/bookmark`](https://gupt.app/#/hotlink/bookmark) with that data. A preview card shows what was captured, counts down **3 → 0**, then **auto-saves** an encrypted bookmark (Kind 1, `gupt_bookmark` tag, 3-year expiry) to your relays. You can also hit **Save now** to skip the countdown or **Cancel** to discard.

### Install

1. Open the **Bookmarks** tab in gupt.
2. Drag the **gupt-mark** button onto your browser's bookmarks bar.

That's it — the button is now a click-anywhere-to-save shortcut.

### How it works

The bookmarklet builds a deep link into the web app (no server involved — capture, encryption, and save all happen in your browser):

```text
https://gupt.app/#/hotlink/bookmark?url=…&title=…
```

| Step | What happens |
|---|---|
| 1 · Click bookmarklet | Captures `location.href` and page title |
| 2 · Open deep link | The gupt app opens the `/hotlink/bookmark` route with that data |
| 3 · Preview + countdown | Shows the captured page and a 3-second auto-save countdown |
| 4 · Auto-save | Encrypts locally and publishes a Kind 1 bookmark event |
| 5 · Done | Redirects to Bookmarks where the new item appears |

> **Note:** saving requires a signed-in **account** (not an ephemeral guest session). If you're not signed in, the hotlink shows a *Sign in to save* screen linking to your account page.

### Self-hosting on a different domain

The bookmarklet deep-links to the **current origin** — whatever domain you're running the app on. So a self-hosted instance at `https://vault.example.com` generates a bookmarklet that opens `https://vault.example.com/#/hotlink/bookmark` automatically; no configuration needed.

---

## 🚀 Deploy GUPT

Every method runs the exact same app — choose what fits your comfort level and use case.

| Method | Who it's for | Effort | Cost |
|---|---|---|---|
| [gupt.app](#-web--guptapp) | Everyone | Zero | Free |
| [npx](#-npx--local-private-instance) | Developers & privacy-first users | One command | Free |
| [Docker](#-docker--vps--homelab) | Self-hosters, VPS users | One command | Server cost |
| [Vercel / Netlify](#-vercel--netlify--static-hosting) | Devs wanting their own public URL | One click | Free tier available |
| [Railway / Render](#-railway--render--container-hosting) | Devs preferring managed containers | One click | Free tier available |
| [Flatpak](#-flatpak--linux-desktop) | Linux desktop users | One command | Free |
| [Umbrel](#-umbrel--home-server) | Home server / self-sovereignty users | One click | Hardware only |
| [Build from source](#-build-from-source) | Contributors & power users | Dev setup | Free |

---

### 🌐 Web — gupt.app

**Target user:** Anyone. No setup, no install, works on every device including mobile.

Just open your browser and go:

👉 **[gupt.app](https://gupt.app)**

Your keys are generated locally and never leave your device. If you want zero trust in the hosting provider, run one of the options below instead.

---

### ⚡ npx — Local private instance

**Target user:** Developers and privacy-conscious users who want a fully local copy — no cloud, no third party, no network dependency beyond decentralized relays.

```bash
npx github:besoeasy/gupt
```

On first run npm clones the repo, builds the app, and starts a local server. Your browser opens automatically.

- ✅ Runs entirely on your machine
- ✅ No account, no signup
- ✅ Always the latest version from `main`
- ✅ Zero permanent install — cache is cleaned by npm automatically

---

### 🐳 Docker — VPS / homelab

**Target user:** Homelab enthusiasts, VPS owners, and teams who want a persistent private instance reachable from any of their devices.

```bash
# Run
docker run -d -p 8000:8000 --name gupt ghcr.io/besoeasy/gupt:latest

# Update to latest
docker pull ghcr.io/besoeasy/gupt:latest && docker restart gupt
```

Serves on `http://your-server:8000`. Put it behind a reverse proxy (Caddy, nginx, Traefik) for HTTPS.

- ✅ Always-on, accessible from any device on your network
- ✅ Multi-arch: `linux/amd64` and `linux/arm64` (Raspberry Pi, Apple Silicon servers)
- ✅ Trivial to update
- ℹ️ Requires a VPS, home server, or NAS

---

### ▲ Vercel / Netlify — Static hosting

**Target user:** Developers who want their own public-facing URL (e.g. `chat.yourdomain.com`) with global CDN performance, and zero server management.

| | |
|---|---|
| [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/besoeasy/gupt&project-name=gupt&repository-name=gupt) | Auto-detects Vite — no config needed |
| [![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/besoeasy/gupt) | Auto-detects Vite — no config needed |

- ✅ Free tier covers most personal use
- ✅ Global CDN, automatic HTTPS, custom domains
- ✅ Auto-deploys on every push to `main`
- ✅ No server to manage
- ℹ️ Best for sharing GUPT with friends/team on a custom domain

---

### 🚂 Railway / Render — Container hosting

**Target user:** Developers who prefer Docker-based managed infrastructure with auto-scaling, easy env vars, and one-click rollbacks.

| | |
|---|---|
| [![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template?template=https://github.com/besoeasy/gupt) | Uses the existing Dockerfile |
| [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/besoeasy/gupt) | Uses the existing Dockerfile |

- ✅ Managed infrastructure — no sysadmin work
- ✅ Free tier available on both platforms
- ✅ Auto-deploy on git push
- ℹ️ Slightly more overhead than Vercel/Netlify for a static app, but gives you full container control

---

### 🐧 Flatpak — Linux desktop

**Target user:** Linux desktop users who want GUPT as a proper native app — system tray, OS notifications, window management — without a browser tab.

```bash
flatpak install flathub com.besoeasy.gupt
gupt
```

Or install from the [Flathub store](https://flathub.org/en/apps/com.besoeasy.gupt) with one click.

- ✅ Native GTK4 / WebKit window
- ✅ Sandboxed with Flatpak permissions
- ✅ Updates via `flatpak update`
- ℹ️ Linux only (GNOME, KDE, etc.)

---

### 🏠 Umbrel — Home server

**Target user:** Users running [Umbrel OS](https://umbrel.com) on a home server or Raspberry Pi who want GUPT alongside their other self-hosted apps (Nextcloud, Vaultwarden, etc.).

Install from the [Umbrel App Store](https://apps.umbrel.com/app/gupt) — one click, no terminal needed.

- ✅ Runs on your local network, fully private
- ✅ Managed by Umbrel's update & backup system
- ✅ No command line required
- ℹ️ Requires an Umbrel home server

---

### 🔧 Build from source

**Target user:** Contributors, developers who want to run unreleased code, or anyone who wants to audit and modify every line before running it.

```bash
git clone https://github.com/besoeasy/gupt.git
cd gupt
npm install
npm run dev      # dev server with hot reload → http://localhost:5173
npm run build    # production build → dist/
npm run preview  # preview production build → http://localhost:4173
```

- ✅ Full control over the code
- ✅ Hot reload for development
- ✅ Can run your own fork with custom relays or features
- ℹ️ Requires Node.js ≥ 20

---

## Tech stack

Vue 3 · Pinia · Vite · Tailwind CSS · Dexie (IndexedDB) · Noble crypto · Helia IPFS · WebRTC

---

## License

[CC BY-NC 4.0](./LICENSE) — Attribution required, commercial use prohibited.
