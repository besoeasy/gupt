import test from "node:test";
import assert from "node:assert/strict";
import { aesDecrypt, aesEncrypt, generateKeypair } from "../src/lib/crypto.js";
import {
  buildTempInviteString,
  parseInviteInput,
  parseTempInvite,
  TEMP_INVITE_TYPE,
} from "../src/lib/tempInvite.js";

const DUMMY_EVENT_ID = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";
const DUMMY_KEY_HEX = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

test("TEMP_INVITE_TYPE is match:lobby", () => {
  assert.equal(TEMP_INVITE_TYPE, "match:lobby");
});

test("buildTempInviteString formats code as match:lobby:<eventId>:<keyHex>", () => {
  const codeWithoutRelays = buildTempInviteString(DUMMY_EVENT_ID, DUMMY_KEY_HEX);
  assert.equal(codeWithoutRelays, `match:lobby:${DUMMY_EVENT_ID}:${DUMMY_KEY_HEX}`);

  const codeWithRelays = buildTempInviteString(DUMMY_EVENT_ID, DUMMY_KEY_HEX, [
    "https://relay.example.com",
  ]);
  assert.match(codeWithRelays, /^match:lobby:[0-9a-f]{64}:[0-9a-f]{64}:[A-Za-z0-9_-]+$/);
});

test("parseInviteInput parses valid match:lobby codes", () => {
  const parsed = parseInviteInput(`match:lobby:${DUMMY_EVENT_ID}:${DUMMY_KEY_HEX}`);
  assert.ok(parsed);
  assert.equal(parsed.eventId, DUMMY_EVENT_ID);
  assert.equal(parsed.keyHex, DUMMY_KEY_HEX);
  assert.deepEqual(parsed.relays, []);
});

test("parseInviteInput extracts match:lobby code from a full game invite message", () => {
  const fullMessage = `🎮 Join my match lobby!\nRoom ticket: match:lobby:${DUMMY_EVENT_ID}:${DUMMY_KEY_HEX}\n(Valid for 24 hours. Paste in lobby/chat screen)`;
  const parsed = parseInviteInput(fullMessage);
  assert.ok(parsed);
  assert.equal(parsed.eventId, DUMMY_EVENT_ID);
  assert.equal(parsed.keyHex, DUMMY_KEY_HEX);
});

test("parseInviteInput strictly rejects old gupt:invite codes without fallback", () => {
  const oldCode = `gupt:invite:${DUMMY_EVENT_ID}:${DUMMY_KEY_HEX}`;
  const parsed = parseInviteInput(oldCode);
  assert.equal(parsed, null, "gupt:invite must not parse (no backward fallback)");
});

test("parseInviteInput strictly rejects bare hex codes without fallback", () => {
  const bareCode = `${DUMMY_EVENT_ID}:${DUMMY_KEY_HEX}`;
  const parsed = parseInviteInput(bareCode);
  assert.equal(parsed, null, "bare hex codes must not parse (no backward fallback)");
});

test("parseInviteInput returns null for malformed or arbitrary strings", () => {
  assert.equal(parseInviteInput(""), null);
  assert.equal(parseInviteInput("random text"), null);
  assert.equal(parseInviteInput("match:lobby:short:key"), null);
});

test("v2 gaming payload format encrypts and decrypts with obfuscated keys", async () => {
  const kp = generateKeypair();
  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  const payload = {
    v: 2,
    type: TEMP_INVITE_TYPE,
    player_id: kp.pubkeyHex,
    gamertag: "PlayerOne",
    regions: ["https://relay.example.com"],
    createdAt: Date.now(),
    expiresAt: Date.now() + 3600000,
  };
  const encrypted = await aesEncrypt(keyBytes, JSON.stringify(payload));
  const decrypted = JSON.parse(await aesDecrypt(keyBytes, encrypted));

  assert.equal(decrypted.v, 2);
  assert.equal(decrypted.type, "match:lobby");
  assert.equal(decrypted.player_id, kp.pubkeyHex);
  assert.equal(decrypted.gamertag, "PlayerOne");
  assert.deepEqual(decrypted.regions, ["https://relay.example.com"]);
  assert.equal(decrypted.pubkey, undefined, "pubkey key must not exist in payload");
  assert.equal(decrypted.name, undefined, "name key must not exist in payload");
  assert.equal(decrypted.relays, undefined, "relays key must not exist in payload");
});

test("parseTempInvite verifies 64-char hex IDs and keys", () => {
  const res = parseTempInvite(DUMMY_EVENT_ID, DUMMY_KEY_HEX);
  assert.equal(res.eventId, DUMMY_EVENT_ID);
  assert.equal(res.keyHex, DUMMY_KEY_HEX);

  assert.throws(() => parseTempInvite("invalid-id", DUMMY_KEY_HEX), {
    message: "This lobby code is invalid.",
  });
  assert.throws(() => parseTempInvite(DUMMY_EVENT_ID, "short-key"), {
    message: "This lobby code is invalid.",
  });
});
