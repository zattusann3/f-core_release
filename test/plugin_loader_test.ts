import { assertRejects } from "jsr:@std/assert";
import { loadPlugin } from "../src/plugin_loader.ts";

Deno.test("loadPlugin: loads whitelisted plugin path", async () => {
  const mod = await loadPlugin("say");
  if (typeof mod.execute !== "function") {
    throw new Error("execute was not loaded");
  }
});

Deno.test("loadPlugin: rejects invalid opName characters", async () => {
  await assertRejects(() => loadPlugin("../evil"), Error, "operation denied");
  await assertRejects(() => loadPlugin("say/evil"), Error, "operation denied");
  await assertRejects(() => loadPlugin("Say"), Error, "operation denied");
});

Deno.test("loadPlugin: hides internal import failure details", async () => {
  await assertRejects(() => loadPlugin("missing"), Error, "operation unavailable");
});
