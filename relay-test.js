import * as secp from "@noble/secp256k1";
import { sha256 as nobleSha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { DEFAULT_RELAYS } from "./src/config/servers.js";

// secp256k1 v3 requires these set explicitly
secp.hashes.sha256 = nobleSha256;

// Use native WebSocket or fallback to ws package if running in older Node
let WS;
if (typeof globalThis.WebSocket !== "undefined") {
  WS = globalThis.WebSocket;
} else {
  try {
    WS = (await import("ws")).default;
  } catch (err) {
    console.error("Native WebSocket not found and 'ws' package is not installed.");
    console.error("Please run with Node >= 22 or install 'ws' (npm install ws).");
    process.exit(1);
  }
}

const RELAY_URLS = process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_RELAYS;
const MESSAGE_COUNT = 10; // per account

// Helpers
function serializeEvent(evt) {
  return JSON.stringify([0, evt.pubkey, evt.created_at, evt.kind, evt.tags, evt.content]);
}

function hashEvent(evt) {
  const json = serializeEvent(evt);
  const hash = nobleSha256(new TextEncoder().encode(json));
  return bytesToHex(hash);
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return bytes;
}

function signEvent(evt, privkeyHex) {
  const sigBytes = secp.schnorr.sign(hexToBytes(evt.id), hexToBytes(privkeyHex));
  evt.sig = bytesToHex(sigBytes);
  return evt;
}

function createMessage(sender, content, tags = []) {
  const evt = {
    pubkey: sender.pubkey,
    created_at: Math.floor(Date.now() / 1000),
    kind: 1,
    tags,
    content,
  };
  evt.id = hashEvent(evt);
  return signEvent(evt, sender.privkey);
}

async function connectAccount(account, relayUrl) {
  return new Promise((resolve, reject) => {
    console.log(`  [${account.name}] Connecting...`);
    const ws = new WS(relayUrl);

    ws.onopen = () => {
      console.log(`  [${account.name}] Connected.`);
      account.ws = ws;
      
      // Subscribe to all messages from the 3 accounts
      const subId = `sub-${account.pubkey.slice(0, 8)}`;
      const req = ["REQ", subId, {
        kinds: [1],
        authors: account.allPubkeys
      }];
      ws.send(JSON.stringify(req));
      
      resolve();
    };

    ws.onmessage = (msg) => {
      let data = msg.data;
      if (typeof data !== "string") data = data.toString();
      try {
        const parsed = JSON.parse(data);
        if (parsed[0] === "EVENT" && parsed[2]) {
          const evt = parsed[2];
          account.received.add(evt.id);
        } else if (parsed[0] === "OK") {
          if (!parsed[2]) console.warn(`  [${account.name}] Relay rejected event ${parsed[1]}: ${parsed[3]}`);
        } else if (parsed[0] === "NOTICE") {
          console.warn(`  [${account.name}] Relay NOTICE:`, parsed[1]);
        }
      } catch (e) {
        // Ignore parse errors
      }
    };

    ws.onerror = (err) => {
      // Don't clutter logs if connection fails entirely, let onclose handle it or reject
      reject(err);
    };
    
    ws.onclose = () => {
      console.log(`  [${account.name}] Disconnected.`);
    };
  });
}

async function runTestForRelay(relayUrl) {
  console.log(`\n======================================================`);
  console.log(`Testing Relay: ${relayUrl}`);
  console.log(`======================================================`);
  
  // Generate random accounts for this test
  const accounts = Array.from({ length: 3 }).map((_, i) => {
    const privkeyBytes = secp.utils.randomSecretKey();
    const pubkeyBytes = secp.schnorr.getPublicKey(privkeyBytes);
    return {
      name: `Account ${i + 1}`,
      privkey: bytesToHex(privkeyBytes),
      pubkey: bytesToHex(pubkeyBytes),
      received: new Set(),
      ws: null,
      allPubkeys: []
    };
  });
  
  const allPubkeys = accounts.map(a => a.pubkey);
  accounts.forEach(a => a.allPubkeys = allPubkeys);

  try {
    // Connect all accounts
    await Promise.all(accounts.map(acc => connectAccount(acc, relayUrl)));
    console.log(`\n  All accounts connected and subscribed. Waiting a bit for subscriptions to register...`);
    await new Promise(r => setTimeout(r, 1000));
    
    const sentEventIds = new Set();

    console.log(`\n  Sending ${MESSAGE_COUNT} messages per account...`);
    for (let i = 0; i < MESSAGE_COUNT; i++) {
      for (const account of accounts) {
        // Create a message mentioning other accounts randomly
        const others = accounts.filter(a => a.pubkey !== account.pubkey);
        const tags = others.map(a => ["p", a.pubkey]);
        const evt = createMessage(account, `Hello ${i} from ${account.name} on ${relayUrl}!`, tags);
        sentEventIds.add(evt.id);
        
        account.ws.send(JSON.stringify(["EVENT", evt]));
      }
    }

    console.log(`\n  Sent ${sentEventIds.size} total messages. Waiting for deliveries...`);
    
    // Wait for delivery
    await new Promise(r => setTimeout(r, 5000));
    
    console.log(`\n  --- Results for ${relayUrl} ---`);
    let allPassed = true;
    for (const account of accounts) {
      let missing = 0;
      for (const id of sentEventIds) {
        if (!account.received.has(id)) {
          missing++;
        }
      }
      
      if (missing > 0) {
        console.error(`  ❌ [${account.name}] Missing ${missing} / ${sentEventIds.size} messages!`);
        allPassed = false;
      } else {
        console.log(`  ✅ [${account.name}] Received all ${sentEventIds.size} messages.`);
      }
      
      // Cleanup
      if (account.ws) {
        account.ws.onerror = null; // Suppress errors on close
        account.ws.close();
      }
    }
    
    return allPassed;
  } catch (err) {
    console.error(`  Test error for ${relayUrl}:`, err.message || err);
    // Cleanup any open sockets
    accounts.forEach(a => { if (a.ws) { a.ws.onerror = null; a.ws.close(); } });
    return false;
  }
}

async function runAllTests() {
  console.log(`Starting Relay Tests against ${RELAY_URLS.length} relays...\n`);
  
  let anyFailed = false;
  for (const relayUrl of RELAY_URLS) {
    try {
      const passed = await runTestForRelay(relayUrl);
      if (!passed) anyFailed = true;
    } catch (err) {
      console.error(`Error executing test for ${relayUrl}:`, err);
      anyFailed = true;
    }
  }

  console.log(`\n======================================================`);
  if (anyFailed) {
    console.error(`💥 TEST RUN COMPLETED WITH FAILURES. Some relays dropped messages.`);
    process.exit(1);
  } else {
    console.log(`🎉 TEST RUN PASSED! All ${RELAY_URLS.length} relays delivered all messages successfully.`);
    process.exit(0);
  }
}

runAllTests();
