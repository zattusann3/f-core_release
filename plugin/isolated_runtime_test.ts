import { assert, assertEquals } from "@std/assert";

import { createIsolatedPluginRuntime } from "./isolated_runtime.ts";

Deno.test("isolated runtime: timeout returns E0705", async () => {
  const runtime = createIsolatedPluginRuntime();
  const startedAt = Date.now();
  const result = await runtime.invoke(
    "time.sleep",
    { ms: "200" },
    { timeoutMs: 20, isCancelled: () => false },
  );
  const elapsedMs = Date.now() - startedAt;

  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.code, "E0705");
  }
  assert(elapsedMs < 180);
});

Deno.test("isolated runtime: busy loop is hard-stopped by timeout => E0705", async () => {
  const runtime = createIsolatedPluginRuntime();
  const startedAt = Date.now();
  const result = await runtime.invoke(
    "time.sleep",
    { ms: "0", busyMs: "200" },
    { timeoutMs: 20, isCancelled: () => false },
  );
  const elapsedMs = Date.now() - startedAt;

  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.code, "E0705");
  }
  assert(elapsedMs < 180);
});

Deno.test("isolated runtime: cancel returns E0706", async () => {
  const runtime = createIsolatedPluginRuntime();
  const startedAt = Date.now();
  const result = await runtime.invoke(
    "time.sleep",
    { ms: "200" },
    { timeoutMs: 500, isCancelled: () => true },
  );
  const elapsedMs = Date.now() - startedAt;

  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.code, "E0706");
  }
  assert(elapsedMs < 180);
});

Deno.test("isolated runtime: oversize request is rejected", async () => {
  const runtime = createIsolatedPluginRuntime();
  const largeText = "x".repeat(70_000);
  const result = await runtime.invoke(
    "ui.render",
    { text: largeText },
    { timeoutMs: 500, isCancelled: () => false },
  );

  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.code, "E0704");
  }
});

Deno.test("isolated runtime: oversize response is rejected", async () => {
  const runtime = createIsolatedPluginRuntime();
  const largeMessage = "x".repeat(70_000);
  const result = await runtime.invoke(
    "debug.log",
    { message: largeMessage },
    { timeoutMs: 500, isCancelled: () => false },
  );

  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.code, "E0704");
  }
});
