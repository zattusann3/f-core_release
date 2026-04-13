import { sha256Hex, signManifest } from "../src/manifest_crypto.ts";
import { PLUGIN_ALLOWLIST } from "../src/plugin_allowlist.ts";
import type { PluginManifest } from "../src/plugin_manifest.ts";

const PRIVATE_KEY_ENV = "FCORE_MANIFEST_PRIVATE_KEY_PKCS8_BASE64";
const MANIFEST_PATH = new URL("../src/plugin_manifest.ts", import.meta.url);
const PLUGIN_DIR = new URL("../src/plugins/", import.meta.url);

const privateKey = Deno.env.get(PRIVATE_KEY_ENV);
if (!privateKey) {
  throw new Error(`missing env: ${PRIVATE_KEY_ENV}`);
}

const manifest = await buildManifestFromPlugins();
const signature = await signManifest(manifest, privateKey);
const content = renderManifestTs({
  signatureBase64: signature,
  manifest,
});

await Deno.writeTextFile(MANIFEST_PATH, content);
console.log("manifest updated and signed");

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

function renderManifestTs(input: {
  signatureBase64: string;
  manifest: PluginManifest;
}): string {
  const manifestEntries = Object.entries(input.manifest)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([opName, entry]) => `  ${opName}: {\n    sha256: "${entry.sha256}",\n  },`)
    .join("\n");

  return `export interface PluginManifestEntry {
  sha256: string;
}

export type PluginManifest = Record<string, PluginManifestEntry>;

// Signature over canonical JSON of PLUGIN_MANIFEST
export const PLUGIN_MANIFEST_SIGNATURE_BASE64 =
  "${input.signatureBase64}";

// SHA-256 values are for raw plugin source text under ./src/plugins/*.ts
export const PLUGIN_MANIFEST: PluginManifest = {
${manifestEntries}
};
`;
}
