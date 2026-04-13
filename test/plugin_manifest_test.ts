import { assertEquals, assertNotEquals } from "jsr:@std/assert";
import { PLUGIN_MANIFEST } from "../src/plugin_manifest.ts";

const VERIFIED_OPS = ["choice", "conflict", "hang", "say", "set"] as const;

for (const op of VERIFIED_OPS) {
  Deno.test(`plugin manifest: hash matches plugin source (${op})`, async () => {
    const source = await Deno.readTextFile(new URL(`../src/plugins/${op}.ts`, import.meta.url));
    const actual = await sha256Hex(source);
    assertEquals(actual, PLUGIN_MANIFEST[op].sha256);
  });
}

Deno.test("plugin manifest: badhash entry intentionally mismatches", async () => {
  const source = await Deno.readTextFile(new URL("../src/plugins/badhash.ts", import.meta.url));
  const actual = await sha256Hex(source);
  assertNotEquals(actual, PLUGIN_MANIFEST.badhash.sha256);
});

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
