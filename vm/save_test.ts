import { assertEquals } from "@std/assert";

import { parseSave, serializeSave } from "./save.ts";

Deno.test("save: serialize/parse roundtrip", () => {
  const json = serializeSave({
    schemaVersion: 1,
    engineVersion: "0.1.0",
    vars: { flag: true, score: 10, name: "alice" },
  });

  const parsed = parseSave(json);
  assertEquals(parsed.ok, true);
  if (parsed.ok) {
    assertEquals(parsed.value.schemaVersion, 1);
    assertEquals(parsed.value.vars.flag, true);
    assertEquals(parsed.value.vars.score, 10);
    assertEquals(parsed.value.vars.name, "alice");
  }
});

Deno.test("save: reject invalid value", () => {
  const json = JSON.stringify({
    schemaVersion: 1,
    engineVersion: "0.1.0",
    vars: { bad: { x: 1 } },
  });

  const parsed = parseSave(json);
  assertEquals(parsed.ok, false);
});

Deno.test("save: reject reserved key", () => {
  const json = JSON.stringify({
    schemaVersion: 1,
    engineVersion: "0.1.0",
    vars: { constructor: true },
  });

  const parsed = parseSave(json);
  assertEquals(parsed.ok, false);
});

Deno.test("save: reject reserved var name", () => {
  const vars = Object.create(null) as Record<string, unknown>;
  vars.__proto__ = true;
  const json = JSON.stringify({
    schemaVersion: 1,
    engineVersion: "0.1.0",
    vars,
  });

  const parsed = parseSave(json);
  assertEquals(parsed.ok, false);
});
