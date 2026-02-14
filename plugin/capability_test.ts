import { assertEquals } from "@std/assert";
import {
  type PluginManifest,
  validateManifest,
  validatePrimitiveAccess,
} from "./capability.ts";

Deno.test("capability: undeclared primitive => denied", () => {
  const manifest: PluginManifest = { capabilities: ["ui"], primitives: [] };
  const result = validatePrimitiveAccess(manifest, "ui.print", { "ui.print": "ui" });
  assertEquals(result.ok, false);
});

Deno.test("capability: missing capability => denied", () => {
  const manifest: PluginManifest = { capabilities: [], primitives: ["ui.print"] };
  const result = validatePrimitiveAccess(manifest, "ui.print", { "ui.print": "ui" });
  assertEquals(result.ok, false);
});

Deno.test("capability: declared primitive + capability => allowed", () => {
  const manifest: PluginManifest = { capabilities: ["ui"], primitives: ["ui.print"] };
  const result = validatePrimitiveAccess(manifest, "ui.print", { "ui.print": "ui" });
  assertEquals(result.ok, true);
});

Deno.test("manifest: unknown capability/primitive => denied", () => {
  const manifest: PluginManifest = { capabilities: ["ui", "fs:write"], primitives: ["ui.print", "x.y"] };
  const result = validateManifest(manifest, { "ui.print": "ui" });
  assertEquals(result.ok, false);
});

Deno.test("manifest: duplicates => denied", () => {
  const manifest: PluginManifest = { capabilities: ["ui", "ui"], primitives: ["ui.print", "ui.print"] };
  const result = validateManifest(manifest, { "ui.print": "ui" });
  assertEquals(result.ok, false);
});

Deno.test("manifest: missing capability for primitive => denied", () => {
  const manifest: PluginManifest = { capabilities: [], primitives: ["ui.print"] };
  const result = validateManifest(manifest, { "ui.print": "ui" });
  assertEquals(result.ok, false);
});
