import type { PluginManifest } from "./plugin_manifest.ts";

const ENCODER = new TextEncoder();

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", ENCODER.encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function canonicalizeManifest(manifest: PluginManifest): string {
  const sortedEntries = Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b));
  const canonicalObject = Object.fromEntries(
    sortedEntries.map(([op, entry]) => [op, { sha256: entry.sha256 }]),
  );
  return JSON.stringify(canonicalObject);
}

export async function verifyManifestSignature(
  manifest: PluginManifest,
  signatureBase64: string,
  publicKeyRawBase64: string,
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    base64ToArrayBuffer(publicKeyRawBase64),
    { name: "Ed25519" },
    false,
    ["verify"],
  );
  const payload = ENCODER.encode(canonicalizeManifest(manifest));
  return await crypto.subtle.verify(
    "Ed25519",
    key,
    base64ToArrayBuffer(signatureBase64),
    payload,
  );
}

export async function signManifest(
  manifest: PluginManifest,
  privateKeyPkcs8Base64: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "pkcs8",
    base64ToArrayBuffer(privateKeyPkcs8Base64),
    { name: "Ed25519" },
    false,
    ["sign"],
  );
  const payload = ENCODER.encode(canonicalizeManifest(manifest));
  const signature = await crypto.subtle.sign("Ed25519", key, payload);
  return bytesToBase64(new Uint8Array(signature));
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const bytes = base64ToBytes(base64);
  const out = new Uint8Array(bytes.length);
  out.set(bytes);
  return out.buffer;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}
