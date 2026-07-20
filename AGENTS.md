# Agents

## Nostr Relay Kinds

ALWAYS use only these Nostr relay kinds. Do NOT use any other kind numbers.

### Standard Kinds
- **0** - Metadata (profile info)
- **1** - Short text note
- **4** - Encrypted direct message

### Ephemeral Kinds
- **20000-29999** - Ephemeral event range (use only when specifically needed)

If you encounter or are asked to use any other kind number, do not proceed. Stick to the kinds listed above.

## Trusted Contacts & Calling

- **Definition**: A contact becomes "trusted" once the user has sent them at least 7 messages (`sentCount >= 7`).
- **Calls**: To prevent spam, calling (audio/video) is only unlocked for trusted contacts. The call UI remains hidden until this threshold is met.
