# GUPT Documentation

Index of the GUPT documentation in this repo.

## User-facing docs

| Doc | What it covers |
|---|---|
| [`../README.md`](../README.md) | Main README — features, quick start, deploy options, domain contact, PING, gupt-mark, data structures |

## Packaging & distribution

| Doc | What it covers |
|---|---|
| [`FLATPAK.md`](./FLATPAK.md) | How the native Linux app is packaged — GTK4 + WebKitGTK webview shell, the production & dev manifests, offline npm sources, local testing |
| [`FLATHUB_SUBMISSION.md`](./FLATHUB_SUBMISSION.md) | First-submission playbook: fork `flathub/flathub`, demo video, PR to `new-pr`, post-approval workflow |
| [`../flatpak/RELEASING.md`](../flatpak/RELEASING.md) | The step-by-step release checklist (bump metainfo, tag, regenerate sources, push to the flathub repo) |

> ⚠️ `FLATHUB_SUBMISSION.pdf` is an older snapshot and may be out of date — treat `FLATHUB_SUBMISSION.md` as the live version.

## Notes

- The Flatpak app is **not Electron** — it's a C shell (`flatpak/gupt-webview.c`) that serves the Vite bundle over `localhost` in a WebKitGTK webview.
- License is **CC-BY-NC-4.0** (not MIT) — see `../LICENSE`, `../package.json`, and `../flatpak/com.besoeasy.gupt.metainfo.xml`.
