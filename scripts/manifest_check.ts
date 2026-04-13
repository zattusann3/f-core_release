import {
  canonicalizeManifest,
  sha256Hex,
  verifyManifestSignature,
} from "../src/manifest_crypto.ts";
import {
  PLUGIN_MANIFEST,
  PLUGIN_MANIFEST_SIGNATURE_BASE64,
  type PluginManifest,
} from "../src/plugin_manifest.ts";
import { PLUGIN_ALLOWLIST } from "../src/plugin_allowlist.ts";
import { MANIFEST_VERIFY_KEY_RAW_BASE64 } from "../src/manifest_trust_anchor.ts";

const PLUGIN_DIR = new URL("../src/plugins/", import.meta.url);

const expectedManifest = await buildManifestFromPlugins();
const expectedCanonical = canonicalizeManifest(expectedManifest);
const actualCanonical = canonicalizeManifest(PLUGIN_MANIFEST);

if (expectedCanonical !== actualCanonical) {
  throw new Error("manifest mismatch: run deno task manifest:update");
}

const signatureOk = await verifyManifestSignature(
  PLUGIN_MANIFEST,
  PLUGIN_MANIFEST_SIGNATURE_BASE64,
  MANIFEST_VERIFY_KEY_RAW_BASE64,
);
if (!signatureOk) {
  throw new Error("manifest signature invalid");
}

console.log("manifest check passed");

async function buildManifestFromPlugins(): Promise<PluginManifest> {
  const discoveredHashes = new Map<string, string>();
  for await (const entry of Deno.readDir(PLUGIN_DIR)) {
    if (!entry.isFile || !entry.name.endsWith(".ts")) continue;
    const opName = entry.name.slice(0, -3);
    const source = await Deno.readTextFile(new URL(entry.name, PLUGIN_DIR));
    discoveredHashes.set(opName, await sha256Hex(source));
  }

  const manifest: PluginManifest = {};
  for (const opName of PLUGIN_ALLOWLIST) {
    const hash = discoveredHashes.get(opName);
    if (!hash) {
      throw new Error(`allowlisted plugin not found: ${opName}`);
    }
    manifest[opName] = { sha256: hash };
  }
  return manifest;
}
