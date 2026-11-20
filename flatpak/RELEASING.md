# Releasing to Flathub

## Steps

1. **Bump the release date** — the single source of truth for every artefact
   ```bash
   npm run release:bump   # today's UTC date into package.json + package-lock.json + the AppStream entry
   npm run release:check  # what the release workflow runs first
   ```
   Never type the version anywhere else. The tag, the GHCR image, the flatpak
   bundle name and the AppStream `<release>` all come from `package.json`.

2. **Commit and tag**
   ```bash
   VERSION="$(node -p "require('./package.json').version")"
   git add package.json package-lock.json flatpak/com.besoeasy.gupt.metainfo.xml
   git commit -m "release: $VERSION"
   git tag "$VERSION"
   git push origin main --tags
   ```

3. **Regenerate npm sources**

   > ⚠️ **Run this on Linux/WSL/macOS only — never the native Windows shell.**
   > On Windows, `flatpak-node-generator` emits `\` path separators (e.g.
   > `flatpak-node\setup_sdk_node_headers.sh`). The Flathub Linux builders
   > interpret `\s` as an escape, mangling the path, which fails the build
   > with `exit 127` (`No such file or directory`). On Windows, use WSL:
   > ```bash
   > wsl -d Debian -- bash -c "cd '/mnt/c/path/to/gupt' && flatpak-node-generator npm package-lock.json -o flatpak/generated-sources.json"
   > ```
   > Verify the output uses forward slashes: `grep 'flatpak-node\\\\' flatpak/generated-sources.json` must return nothing.

   ```bash
   uv tool install git+https://github.com/flatpak/flatpak-builder-tools.git#subdirectory=node
   flatpak-node-generator npm package-lock.json -o flatpak/generated-sources.json
   git add flatpak/generated-sources.json
   git commit -m "chore: regenerate flatpak-node sources for $VERSION"
   git push
   ```

4. **Update flathub submodule**
   ```bash
   cd flatpak/flathub
   git fetch origin
   git checkout -b "update-$VERSION" origin/master
   ```

5. **Update manifest in submodule**
   ```bash
   # Edit com.besoeasy.gupt.yaml — bump tag and commit to the new tag
   ```

6. **Copy regenerated sources**
   ```bash
   cp ../generated-sources.json .
   git add -A
   git commit -m "Update to $VERSION"
   git push origin "update-$VERSION"
   ```

7. **Create PR against flathub repo master**
   ```bash
   gh pr create --repo flathub/com.besoeasy.gupt \
     --base master \
     --head "update-$VERSION" \
     --title "Update to $VERSION" \
     --body "Bump manifest to gupt $VERSION"
   ```

8. **Update submodule reference in gupt repo**
   ```bash
   cd ../..
   git add flatpak/flathub
   git commit -m "chore: update flathub submodule to $VERSION"
   git push
   ```

9. **Wait for Flathub CI to go green** — check PR checks on GitHub
