# Plan: Nostr as Dumb Storage (No nostr-tools, Minimum Kinds)

**HARD RULE:** We will strictly treat Nostr as dumb storage. We will ONLY use Kind 0, Kind 1, and Kind 4 for all app features. Do not introduce any other event kinds unless they offer a functional benefit that is mathematically or technically impossible to achieve with 0, 1, and 4.

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

### Replies & Emoji Reactions
**Current:** Nostr NIP-25 (Kind 7 Reactions) and NIP-10 (Replies) are often used in standard Nostr apps.
**New:** **JSON inside Kind 4**
Because we are treating the relay as a dumb pipe, we do not use Nostr-level tags or Kind 7 for replies/reactions. Instead, we structure our JSON payload *before* encrypting it via AES-GCM:
- **Replies**: We just add a `"replyTo": "<MessageID>"` field to the JSON payload.
- **Reactions**: We send a JSON payload like `{"type": "react", "emoji": "❤️", "replyTo": "<MessageID>"}`. 
We encrypt this JSON, stuff it into a Kind 4 event, and send it. The relay just sees a generic encrypted DM, but the client decrypts it and updates the UI accordingly. This gives us ultimate flexibility without needing relay support for new event kinds!

### Public Posts / Social Feed
**Current:** N/A (App is mostly chat focused)
**New:** **Kind 1**
- If we ever need public announcements or a social feed, we just use standard Kind 1 events.

### Vault & App Settings
**Current:** Custom kinds
**New:** **Kind 4 (Self-DM)**
- We can store private app state (like pinned chats or preferences) by sending a Kind 4 message from our own pubkey, to our own pubkey. It acts as an encrypted remote key-value store.

## 3. Advantages of this Architecture
1. **Zero NIP Compliance Burden**: We will strictly eliminate the following:
   - **NIP-42 (Auth)**: Completely bypassed.
   - **NIP-59 / NIP-17 (Gift Wraps)**: Entirely removed. We will use standard Kind 4.
   - **NIP-19 (Bech32 npub/note)**: Completely removed. The app will use raw 64-character hex strings for keys everywhere.
   - **NIP-05 (DNS Identities)**: Removed. Domain lookups will no longer be supported.
   - **NIP-33 & NIP-09 (Invites/Deletions)**: The current `src/lib/invites.js` uses `Kind 30520` (parameterized replaceable) and NIP-09 deletion for chat invites. This will be dropped. Invite links will simply encode the user's hex pubkey and relay, and the new user will just send a standard Kind 4 DM to start the chat.
   
   *(Note: We **will** retain the NIP-40 `["expiration", "<timestamp>"]` tag on events for basic relay hygiene since it requires no complex parsing and is completely passive).*
2. **Reduced Bundle Size**: Eliminating `nostr-tools` trims down dependencies.
3. **Extreme Privacy for Groups**: Group chats look indistinguishable from a user receiving a lot of direct messages from different people. The "Group" just looks like another user account.

## 4. Execution Steps
1. **Remove `nostr-tools`**: Strip it from `package.json`.
2. **Build `ws` Pool**: Create a minimal WebSocket pool wrapper in `src/lib/api.js`.
3. **Reimplement Signer**: Add a `signEvent(event, privkey)` function using `@noble/secp256k1` in `src/lib/crypto.js`.
4. **Refactor Groups**: Change `src/lib/groups.js` to generate shared keypairs and use Kind 4 instead of Kind 4096/35000.
5. **Refactor Invites**: Send group private keys via standard Kind 4 DMs.

## 5. Architectural Improvements & Deep Benefits

### Unmatched Privacy & Anonymity
- **Traffic Obfuscation**: Currently, querying for custom kinds (like `35000` or `4096`) signals to relay operators that the user is participating in a specific app's group chat feature. By restricting everything to **Kind 4**, all traffic is camouflaged. To an outside observer, sending a group message looks mathematically identical to sending a direct message. 
- **Hidden Group Topologies**: Because the group is essentially just another keypair, relays cannot easily deduce who is in a group or map the social graph. The members simply fetch DMs for the group pubkey.

### Universal Relay Compatibility & Censorship Resistance
- **No NIP-42 Auth Needed**: Many relays aggressively filter or require authentication (NIP-42) to read or write custom event kinds, or even `Kind 4` events if the reader is not in the `#p` tags. By using the shared group keypair, anyone holding the group's private key can legitimately read the group's `Kind 4` events on *any* relay without encountering arbitrary access control blocks.
- **Always Accepted**: Every single Nostr relay implementation in existence accepts and stores Kinds 0, 1, and 4. We instantly achieve 100% network compatibility, immune to future relay rule changes or deprecated NIPs.

### Maximum Performance & Lean Bundle
- **Ditching Dependency Bloat**: We shed the entirety of `nostr-tools`, its polyfills, and extraneous parsers for NIPs we don't care about. The app load time and main-thread execution time will drop significantly.
- **Consolidated Subscriptions**: We can fetch DMs, group messages, and app settings over a single, multiplexed WebSocket subscription instead of tearing down and building complex filter arrays.
- **Bare-Metal WebSockets**: We avoid overhead from `SimplePool`'s internal event debouncing, verification delays, and memory leaks. The app maintains full control over its reconnect strategy.

### Radically Simplified Security Model
- **"The Key IS the Group"**: Forget complex admin hierarchies (NIP-29) or rotating access control lists. If you have the private key, you are in the group. If the group needs to kick someone, the creator simply generates a new keypair and sends it to the remaining members, abandoning the old one. It's conceptually identical to rotating a server password. 
- **Self-Contained Cryptography**: Using `@noble/secp256k1` directly removes middlemen in the cryptographic pipeline, giving us absolute certainty about how payloads are hashed, encrypted, and signed.

### WebRTC Call Signaling (Already Kind 4!)
Our current WebRTC audio/video call implementation actually **already fits this architecture perfectly**. 
When the app sends a `call-offer`, `call-answer`, or `call-ice` payload, it uses `api.postDirectMessage()`, which wraps the SDP and ICE candidates into a JSON object and encrypts it as a standard **Kind 4** DM. 
Because call signaling is just routing these encrypted DMs through relays, WebRTC signaling works flawlessly as "dumb storage" and requires zero architectural changes to survive the removal of `nostr-tools`.
