import * as secp from "@noble/secp256k1";
import { sha256 } from "@noble/hashes/sha2.js";
import { getPublicKey as getNostrPublicKey } from "nostr-tools/pure";

secp.hashes.sha256 = sha256;

const privkey = secp.utils.randomSecretKey();

const pub1 = getNostrPublicKey(privkey);
const pub2 = secp.etc.bytesToHex(secp.schnorr.getPublicKey(privkey));

console.log("nostr-tools:", pub1);
console.log("noble-secp :", pub2);
console.log("match      :", pub1 === pub2);
