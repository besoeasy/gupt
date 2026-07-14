# Plan: Nostr as Dumb Storage (No nostr-tools, Minimum Kinds)

The goal is to stop adhering to the ever-changing landscape of Nostr Implementation Possibilities (NIPs) and drop `nostr-tools`. We will treat Nostr relays merely as dumb WebSocket databases. We will rely **only** on the three most foundational event kinds:
- **Kind 0**: Metadata (Profile)
- **Kind 1**: Public Text Note
- **Kind 4**: Encrypted Direct Message

## 1. Dropping `nostr-tools`
Instead of relying on a library that dictates how we interact with relays, we will manage the connections natively.

### WebSocket Management
- Use native `WebSocket` API for relay connections.
- Send messages: `ws.send(JSON.stringify(["EVENT", event]))`
- Receive messages: `ws.send(JSON.stringify(["REQ", subId, filter]))`
- Handle basic reconnect logic manually, avoiding the bloat of `SimplePool`.

### Cryptography (Signing & Verification)
We already have `@noble/secp256k1` and `@noble/hashes`. We can implement event signing natively:
- **Event ID**: `sha256(JSON.stringify([0, pubkey, created_at, kind, tags, content]))`
- **Signature**: Schnorr signature over the Event ID using `@noble/secp256k1`.
- **Encryption (Kind 4)**: We already use a custom `v1:` AES-256-GCM scheme, which we can maintain without `nostr-tools/nip04`.

## 2. Feature Mapping (Using only Kinds 0, 1, 4)

### Direct Messages (1-on-1 Chats)
**Current:** Kind 4 / Kind 1059 (Gift Wrap)
**New:** **Kind 4**
- Simple encrypted payloads from `sender` to `recipient`.
- We already have our AES-256-GCM encryption logic, so we will just place the ciphertext directly in the Kind 4 content.
- Relays will store and serve these when querying for `{"kinds": [4], "authors": [myPubkey], "#p": [peerPubkey]}` and vice versa.

### Profiles and Global Identity
**Current:** Kind 0
**New:** **Kind 0**
- We continue using Kind 0 for user profiles (name, avatar, bio).
- The payload remains standard JSON (or custom JSON) stored in `content`.

### Group Chats
**Current:** Kind 35000 (Manifests) + Kind 4096 (Group Events)
**New:** **Kind 4 with Group Keypairs**
Since we cannot use custom kinds or parameterized replaceables, we can simulate private groups using shared keypairs and Kind 4.
1. **Creation**: When a user creates a group, they generate a new, random "Group Keypair".
2. **Membership**: The creator invites members by sending them a **Kind 4** DM containing the Group's Private Key.
3. **Messaging**: To send a message to the group, a member encrypts the message using the Group's Public Key and sends it as a **Kind 4** from *their own* pubkey to the *Group's* pubkey.
4. **Fetching**: Any member holding the Group Private Key can query relays for `{"kinds": [4], "#p": [groupPubKey]}` to fetch the group's messages, and decrypt them using the Group Private Key.
5. **Group Profile**: The group's avatar and name can be published as a **Kind 0** event authored by the Group Keypair itself.

### Public Posts / Social Feed
**Current:** N/A (App is mostly chat focused)
**New:** **Kind 1**
- If we ever need public announcements or a social feed, we just use standard Kind 1 events.

### Vault & App Settings
**Current:** Custom kinds
**New:** **Kind 4 (Self-DM)**
- We can store private app state (like pinned chats or preferences) by sending a Kind 4 message from our own pubkey, to our own pubkey. It acts as an encrypted remote key-value store.

## 3. Advantages of this Architecture
1. **Zero NIP Compliance Burden**: We don't care about NIP-42 (Auth), NIP-59 (Gift Wrap), NIP-29 (Groups), etc. The relay is just a dumb data pipe.
2. **Reduced Bundle Size**: Eliminating `nostr-tools` trims down dependencies.
3. **Extreme Privacy for Groups**: Group chats look indistinguishable from a user receiving a lot of direct messages from different people. The "Group" just looks like another user account.

## 4. Execution Steps
1. **Remove `nostr-tools`**: Strip it from `package.json`.
2. **Build `ws` Pool**: Create a minimal WebSocket pool wrapper in `src/lib/api.js`.
3. **Reimplement Signer**: Add a `signEvent(event, privkey)` function using `@noble/secp256k1` in `src/lib/crypto.js`.
4. **Refactor Groups**: Change `src/lib/groups.js` to generate shared keypairs and use Kind 4 instead of Kind 4096/35000.
5. **Refactor Invites**: Send group private keys via standard Kind 4 DMs.
