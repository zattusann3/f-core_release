import { assertEquals } from "@std/assert";

import { compileScenario } from "./compile.ts";

const ENGINE_VERSION = "0.1.0";

function buildScenario(body: string): string {
  const prefix = "{{# label: start }}\n";
  const suffix = "\n{{ end }}";
  return `${prefix}${body}${suffix}`;
}

function buildScenarioWithTotalLength(totalChars: number): string {
  const prefix = "{{# label: start }}\n";
  const suffix = "\n{{ end }}";
  const bodyLen = totalChars - prefix.length - suffix.length;
  if (bodyLen < 0) throw new Error("totalChars too small for scenario");
  return buildScenario("a".repeat(bodyLen));
}

Deno.test("compileScenario: input too large => E0101", () => {
  const input = buildScenarioWithTotalLength(1_000_001);
  const result = compileScenario(input, { engineVersion: ENGINE_VERSION });
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.errors.some((e) => e.code === "E0101"), true);
  }
});

Deno.test("compileScenario: too many lines => E0102", () => {
  const lines = new Array(50_001).fill("a").join("\n");
  const input = buildScenario(lines);
  const result = compileScenario(input, { engineVersion: ENGINE_VERSION });
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.errors.some((e) => e.code === "E0102"), true);
  }
});

Deno.test("compileScenario: line too long => E0103", () => {
  const input = buildScenario("a".repeat(10_001));
  const result = compileScenario(input, { engineVersion: ENGINE_VERSION });
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.errors.some((e) => e.code === "E0103"), true);
  }
});

Deno.test("compileScenario: max line length ok", () => {
  const input = buildScenario("a".repeat(10_000));
  const result = compileScenario(input, { engineVersion: ENGINE_VERSION });
  assertEquals(result.ok, true);
});
