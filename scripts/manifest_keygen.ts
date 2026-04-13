import { bytesToBase64 } from "../src/manifest_crypto.ts";

const keyPair = await crypto.subtle.generateKey(
  { name: "Ed25519" },
  true,
  ["sign", "verify"],
);

const publicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));
const privatePkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", keyPair.privateKey));

console.log("FCORE_MANIFEST_PUBLIC_KEY_RAW_BASE64=");
console.log(bytesToBase64(publicRaw));
console.log("");
console.log("FCORE_MANIFEST_PRIVATE_KEY_PKCS8_BASE64=");
console.log(bytesToBase64(privatePkcs8));
