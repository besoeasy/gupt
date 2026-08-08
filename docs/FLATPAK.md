# GUPT on Flatpak & Flathub

GUPT ships as a Vite web app. The **native Linux app** on Flathub is a small GTK4 + WebKitGTK shell (`flatpak/gupt-webview.c`) that serves the built bundle over `localhost` and loads it in a WebKit webview — **not Electron**. This guide documents that packaging and how to publish/update the Flathub listing.

> Related: `flatpak/RELEASING.md` is the step-by-step release checklist; `docs/FLATHUB_SUBMISSION.md` is the first-submission PR playbook.

---

## 0. How the native app works (no Electron)

`flatpak/gupt-webview.c` is a C program that:

- starts a local HTTP server (libsoup3) on `http://localhost:PORT`,
- serves the built Vite bundle from `/app/share/gupt`, and
- opens a WebKitGTK 6.0 `WebKitWebView` pointed at `http://localhost:PORT/index.html`.

`localhost` is treated as a **secure context** by WebKit, which is required for `RTCPeerConnection` / `getUserMedia` (WebRTC calls) and for IndexedDB / localStorage persistence.

WebKit features enabled in the wrapper: media, media-stream, WebAudio, WebGL, WebRTC, HTML5 database & local storage, back/forward gestures, and JS clipboard access. Media and notification permission requests are auto-allowed.

Because the origin is `http://localhost:…` (not `127.0.0.1`), users upgrading from older builds may see a one-time re-key prompt — that's expected (see the comment in `gupt-webview.c`).

---

## 1. Prerequisites

| Requirement | Status / action |
|---|---|
| Reverse-DNS app ID | `com.besoeasy.gupt` ✓ |
| Domain ownership provable if asked | `besoeasy.com` — may be asked for a DNS TXT record or verification file |
| License | `CC-BY-NC-4.0` (see metainfo `<project_license>`) |
| Public repo with a tagged release | `github.com/besoeasy/gupt` — manifest pins `tag:` **and** `commit:` |
| Locked dependencies | `package-lock.json` (Bun's `bun.lock` is **not** supported — see §5) |
| Screenshots over HTTPS | `flatpak/screenshots/*.png` referenced in metainfo |
| Linux host with flatpak tooling | `sudo apt install flatpak flatpak-builder` |

---

## 2. Repo layout

| File | Purpose |
|---|---|
| `flatpak/com.besoeasy.gupt.yaml` | Production build manifest (used by Flathub) |
| `flatpak/com.besoeasy.gupt.dev.yaml` | Local dev manifest (builds from the working tree) |
| `flatpak/gupt-webview.c` | The GTK4/WebKitGTK shell |
| `flatpak/com.besoeasy.gupt.desktop` | Desktop entry |
| `flatpak/com.besoeasy.gupt.metainfo.xml` | AppStream metadata (validated by `appstreamcli`) |
| `flatpak/icons/{16,24,32,48,64,128,256,512}x{…}.png` | Hicolor icons |
| `flatpak/generated-sources.json` | Offline npm sources (see §5) |
| `flatpak/screenshots/` | Screenshots referenced by metainfo |
| `flatpak/flathub/` | Submodule clone of `github.com/flathub/com.besoeasy.gupt` |
| `flatpak/RELEASING.md` | Release checklist |

---

## 3. The production manifest

`flatpak/com.besoeasy.gupt.yaml` — current content:

```yaml
app-id: com.besoeasy.gupt
runtime: org.gnome.Platform
runtime-version: '50'
sdk: org.gnome.Sdk
sdk-extensions:
  - org.freedesktop.Sdk.Extension.node22
command: gupt
separate-locales: false

finish-args:
  - --share=network
  - --share=ipc
  - --socket=wayland
  - --socket=fallback-x11
  - --socket=pulseaudio
  - --device=dri
  - --filesystem=xdg-download

build-options:
  append-path: /usr/lib/sdk/node22/bin
  env:
    npm_config_nodedir: /usr/lib/sdk/node22

modules:
  - name: gupt
    buildsystem: simple
    build-options:
      env:
        npm_config_offline: 'true'
        npm_config_cache: /run/build/gupt/flatpak-node/npm-cache
    build-commands:
      - npm ci --offline --prefer-offline --ignore-scripts
      - npm run build:flatpak
      - cc flatpak/gupt-webview.c -o gupt $(pkg-config --cflags --libs gtk4 webkitgtk-6.0 libsoup-3.0 gio-2.0)
      - install -Dm755 gupt /app/bin/gupt
      - mkdir -p /app/share/gupt
      - cp -r dist/* /app/share/gupt/
      - install -Dm644 flatpak/com.besoeasy.gupt.desktop
          /app/share/applications/com.besoeasy.gupt.desktop
      - install -Dm644 flatpak/com.besoeasy.gupt.metainfo.xml
          /app/share/metainfo/com.besoeasy.gupt.metainfo.xml
      - for size in 16 24 32 48 64 128 256 512; do
          install -Dm644 flatpak/icons/${size}x${size}.png
            /app/share/icons/hicolor/${size}x${size}/apps/com.besoeasy.gupt.png;
        done

    sources:
      - type: git
        url: https://github.com/besoeasy/gupt.git
        tag: v0.1.24
        commit: 5f0eb4b6069c45a87f4f9b99e92f1179b419db61
      - generated-sources.json
```

Notes:

- `npm run build:flatpak` runs `BUILD_TARGET=flatpak vite build` (see `package.json`).
- The `cc` step needs `pkg-config` for `gtk4`, `webkitgtk-6.0`, `libsoup-3.0`, `gio-2.0` — all provided by the GNOME SDK.
- Flathub requires `tag:` **and** `commit:` pinned (prevents retroactive tag edits).

---

## 4. Local dev manifest

`flatpak/com.besoeasy.gupt.dev.yaml` builds from your working tree instead of a git tag:

```yaml
app-id: com.besoeasy.gupt
runtime: org.gnome.Platform
runtime-version: '50'
sdk: org.gnome.Sdk
command: gupt
separate-locales: false

finish-args:
  - --share=network
  - --share=ipc
  - --socket=wayland
  - --socket=fallback-x11
  - --socket=pulseaudio
  - --device=dri
  - --filesystem=xdg-download

modules:
  - name: gupt
    buildsystem: simple
    build-commands:
      - cc flatpak/gupt-webview.c -o gupt $(pkg-config --cflags --libs gtk4 webkitgtk-6.0 libsoup-3.0 gio-2.0)
      - install -Dm755 gupt /app/bin/gupt
      - mkdir -p /app/share/gupt
      - cp -r dist/* /app/share/gupt/
      - install -Dm644 flatpak/com.besoeasy.gupt.desktop /app/share/applications/com.besoeasy.gupt.desktop
      - install -Dm644 flatpak/com.besoeasy.gupt.metainfo.xml /app/share/metainfo/com.besoeasy.gupt.metainfo.xml
      - for size in 16 24 32 48 64 128 256 512; do install -Dm644 flatpak/icons/${size}x${size}.png /app/share/icons/hicolor/${size}x${size}/apps/com.besoeasy.gupt.png; done

    sources:
      - type: dir
        path: ../
        skip:
          - node_modules
          - bundle
          - dev-dist
          - .flatpak-builder
          - build-dir
          - .git
```

> Run `npm run build:flatpak` first so `dist/` exists — the dev manifest copies `dist/*` but does **not** build the bundle itself.

### 4.1 `flatpak/com.besoeasy.gupt.desktop`

```ini
[Desktop Entry]
Name=GUPT
Comment=Self-hosted, end-to-end encrypted messenger built on Nostr relays with WebRTC calls.
Exec=gupt
Terminal=false
Type=Application
Icon=com.besoeasy.gupt
Categories=Network;InstantMessaging;Chat;
StartupWMClass=gupt
```

### 4.2 `flatpak/com.besoeasy.gupt.metainfo.xml` — AppStream metadata

The actual file in the repo is the source of truth (license is `CC-BY-NC-4.0`, screenshots point at `raw.githubusercontent.com/besoeasy/gupt/main/flatpak/screenshots/*.png`, developer name is `besoeasy`). Validate before committing:

```bash
sudo apt install -y appstream    # provides `appstreamcli`
appstreamcli validate flatpak/com.besoeasy.gupt.metainfo.xml
```

Common gotchas:
- `<developer id="…">` is required in AppStream 1.0. Older `<developer_name>` is deprecated.
- Screenshots **must** resolve over HTTPS at submission time.
- `<content_rating type="oars-1.1" />` is mandatory even if everything is "none".
- Keep `<project_license>` in sync with `package.json` `license` (currently `CC-BY-NC-4.0`).

---

---

## 5. Offline npm sources

Flathub's build sandbox has **no network**. All npm packages must be declared in `flatpak/generated-sources.json`, produced by [`flatpak-node-generator`](https://github.com/flatpak/flatpak-builder-tools/tree/master/node):

```bash
uv tool install git+https://github.com/flatpak/flatpak-builder-tools.git#subdirectory=node
flatpak-node-generator npm package-lock.json -o flatpak/generated-sources.json
```

- Only **npm** (`package-lock.json`) is supported — **not** `bun.lock`.
- Regenerate after any dependency change and commit the result (it's large; that's normal).
- On Windows, run inside WSL — the generator emits `\` path separators that break the Linux build (see `flatpak/RELEASING.md` §3).

---

## 6. Test locally (mandatory before submitting)

```bash
flatpak remote-add --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo
flatpak install -y flathub \
  org.gnome.Platform//50 \
  org.gnome.Sdk//50 \
  org.freedesktop.Sdk.Extension.node22//50

cd /path/to/gupt
npm install --package-lock-only        # keep lockfile in sync
flatpak-node-generator npm package-lock.json -o flatpak/generated-sources.json
npm run build:flatpak
flatpak-builder --user --install --force-clean build-dir flatpak/com.besoeasy.gupt.yaml
flatpak run com.besoeasy.gupt
```

**What to verify:**
- Window opens and the app loads from `http://localhost:PORT/index.html`
- Relay connects, messages encrypt/send
- WebRTC call works (secure context present)
- Notifications fire
- `appstreamcli validate flatpak/com.besoeasy.gupt.metainfo.xml` passes

**Iterate until a clean run.** Reviewers will reject anything that doesn't start.

---

## 7. Submission & releases

- **First submission:** follow `docs/FLATHUB_SUBMISSION.md` — fork `flathub/flathub`, PR to the `new-pr` branch, attach the demo video. The PR contains only `com.besoeasy.gupt.yaml` + `generated-sources.json`; the manifest's `git` source pulls everything else (webview, desktop file, metainfo, icons, screenshots) from the tagged upstream repo.
- **Every release:** follow `flatpak/RELEASING.md` — bump the metainfo `<release>`, tag, regenerate sources, update `tag:`/`commit:`, push to `github.com/flathub/com.besoeasy.gupt`, promote `stable` after beta passes.
- **Updates** come from **Flathub** (`flatpak update`) — there is no in-app updater, so there is nothing to gate.

---

## 8. FAQ

**Q: Is this Electron?**
No. The Flathub app is a GTK4 + WebKitGTK webview wrapping the same Vite build.

**Q: Do I need `--share=network`?**
Yes — GUPT talks to Nostr relays over WebSocket. Flathub reviewers will not challenge this for a chat app.

**Q: Why `localhost` and not `127.0.0.1`?**
WebKit treats `localhost` as a secure context — required for WebRTC and storage. Existing Flatpak users on the old `127.0.0.1` origin will be prompted to re-enter their key once.

**Q: Why don't my icons show up?**
Flathub requires PNGs at 16–512px in `flatpak/icons/` matching the `install` loop in the manifest.

**Q: How do users update?**
Via `flatpak update`. There's no in-app updater.

---

## 9. References

- Flathub submission docs: <https://docs.flathub.org/docs/for-app-authors/submission>
- Requirements: <https://docs.flathub.org/docs/for-app-authors/requirements>
- AppStream metainfo spec: <https://www.freedesktop.org/software/appstream/docs/>
- `flatpak-node-generator`: <https://github.com/flatpak/flatpak-builder-tools/tree/master/node>
- WebKitGTK: <https://webkitgtk.org/>
