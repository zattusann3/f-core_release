import { assert, assertEquals, assertFalse } from "jsr:@std/assert";
import { sha256Hex, verifyManifestSignature } from "../src/manifest_crypto.ts";
import { PLUGIN_ALLOWLIST } from "../src/plugin_allowlist.ts";
import { PLUGIN_MANIFEST, PLUGIN_MANIFEST_SIGNATURE_BASE64 } from "../src/plugin_manifest.ts";
import { MANIFEST_VERIFY_KEY_RAW_BASE64 } from "../src/manifest_trust_anchor.ts";

for (const op of PLUGIN_ALLOWLIST) {
  Deno.test(`plugin manifest: hash matches plugin source (${op})`, async () => {
    const source = await Deno.readTextFile(new URL(`../src/plugins/${op}.ts`, import.meta.url));
    const actual = await sha256Hex(source);
    assertEquals(actual, PLUGIN_MANIFEST[op].sha256);
  });
}

Deno.test("plugin manifest: signature is valid", async () => {
  const ok = await verifyManifestSignature(
    PLUGIN_MANIFEST,
    PLUGIN_MANIFEST_SIGNATURE_BASE64,
    MANIFEST_VERIFY_KEY_RAW_BASE64,
  );
  assert(ok);
});

Deno.test("plugin manifest: tampered manifest is rejected by signature check", async () => {
  const tamperedManifest = {
    ...PLUGIN_MANIFEST,
    say: { sha256: "0".repeat(64) },
  };
  const ok = await verifyManifestSignature(
    tamperedManifest,
    PLUGIN_MANIFEST_SIGNATURE_BASE64,
    MANIFEST_VERIFY_KEY_RAW_BASE64,
  );
  assertFalse(ok);
});

Deno.test("plugin manifest: test-only plugins are not allowlisted", () => {
  assertFalse("conflict" in PLUGIN_MANIFEST);
  assertFalse("hang" in PLUGIN_MANIFEST);
  assertFalse("badhash" in PLUGIN_MANIFEST);
  assertFalse("unlisted" in PLUGIN_MANIFEST);
});
