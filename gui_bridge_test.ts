import { assertEquals } from "@std/assert";

import { GUI_BRIDGE_MAX_MESSAGE_BYTES, parseUiCommandLine } from "./gui_bridge.ts";

Deno.test("gui bridge: schema mismatch is rejected", () => {
  const line = JSON.stringify({
    schemaVersion: 2,
    command: "choice.select",
    requestId: "req-1",
    index: 0,
  });
  const parsed = parseUiCommandLine(line);
  assertEquals(parsed.ok, false);
});

Deno.test("gui bridge: unknown top-level field is rejected", () => {
  const line = JSON.stringify({
    schemaVersion: 1,
    command: "choice.select",
    requestId: "req-1",
    index: 0,
    unknown: true,
  });
  const parsed = parseUiCommandLine(line);
  assertEquals(parsed.ok, false);
  if (!parsed.ok) {
    assertEquals(parsed.requestId, "req-1");
  }
});

Deno.test("gui bridge: oversize message is rejected", () => {
  const long = "x".repeat(GUI_BRIDGE_MAX_MESSAGE_BYTES + 10);
  const parsed = parseUiCommandLine(long);
  assertEquals(parsed.ok, false);
});

Deno.test("gui bridge: unknown extensions key is accepted", () => {
  const line = JSON.stringify({
    schemaVersion: 1,
    command: "choice.select",
    requestId: "req-1",
    index: 0,
    extensions: {
      "electron.window": { foo: "bar" },
    },
  });
  const parsed = parseUiCommandLine(line);
  assertEquals(parsed.ok, true);
  if (parsed.ok) {
    assertEquals(parsed.value.command, "choice.select");
    assertEquals(parsed.value.index, 0);
    assertEquals(Object.getPrototypeOf(parsed.value.extensions ?? null), null);
  }
});

Deno.test("gui bridge: reserved extension key in array object is rejected", () => {
  const line =
    '{"schemaVersion":1,"command":"choice.select","requestId":"req-1","index":0,"extensions":{"list":[{"__proto__":"x"}]}}';
  const parsed = parseUiCommandLine(line);
  assertEquals(parsed.ok, false);
});

Deno.test("gui bridge: nested extension depth is enforced through arrays", () => {
  const line = JSON.stringify({
    schemaVersion: 1,
    command: "choice.select",
    requestId: "req-1",
    index: 0,
    extensions: {
      list: [[[[["x"]]]]],
    },
  });
  const parsed = parseUiCommandLine(line);
  assertEquals(parsed.ok, false);
});
