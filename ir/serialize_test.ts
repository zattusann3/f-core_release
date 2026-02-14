
import { assertEquals, assertThrows } from "@std/assert";

import { serializeIR } from "./serialize.ts";
import type { IR } from "./types.ts";

function makeIR(): IR {
  return {
    schemaVersion: 1,
    engineVersion: "0.1.0",
    entry: "start",
    plugins: ["debug.log", "ui.render"],
    labels: {
      // Intentionally out of order to test stable sorting
      zzz: [{ op: "end" }],
      start: [
        {
          op: "say",
          text: "Hello.",
          meta: {
            z: "last",
            mouth: { mou: "aiueo", mode: "phoneme" },
            a: "first",
          },
        },
        {
          op: "choice",
          options: [
            { text: "Go outside", to: "outside" },
            { text: "Stay", to: "stay" },
          ],
        },
        { op: "end" },
      ],
      aaa: [{ op: "end" }],
    },
  };
}

Deno.test("serializeIR is deterministic (same input => same output)", () => {
  const ir = makeIR();
  const a = serializeIR(ir);
  const b = serializeIR(ir);
  assertEquals(a, b);
});

Deno.test("serializeIR uses stable root key order", () => {
  const out = serializeIR(makeIR());

  // Root object should begin with schemaVersion then engineVersion then entry then plugins then labels.
  const schemaIdx = out.indexOf("\"schemaVersion\"");
  const engineIdx = out.indexOf("\"engineVersion\"");
  const entryIdx = out.indexOf("\"entry\"");
  const pluginsIdx = out.indexOf("\"plugins\"");
  const labelsIdx = out.indexOf("\"labels\"");

  // Basic sanity
  assertEquals(schemaIdx >= 0, true);
  assertEquals(engineIdx >= 0, true);
  assertEquals(entryIdx >= 0, true);
  assertEquals(pluginsIdx >= 0, true);
  assertEquals(labelsIdx >= 0, true);

  // Order constraints
  assertEquals(schemaIdx < engineIdx, true);
  assertEquals(engineIdx < entryIdx, true);
  assertEquals(entryIdx < pluginsIdx, true);
  assertEquals(pluginsIdx < labelsIdx, true);
});

Deno.test("serializeIR sorts labels by name", () => {
  const out = serializeIR(makeIR());

  const labelsSectionStart = out.indexOf("\"labels\": {");
  const labelsSectionEnd = out.indexOf("\n  }\n}", labelsSectionStart);
  const labelsSection =
    labelsSectionStart >= 0 && labelsSectionEnd >= 0
      ? out.slice(labelsSectionStart, labelsSectionEnd)
      : out;

  const aaaIdx = labelsSection.indexOf("\"aaa\"");
  const startIdx = labelsSection.indexOf("\"start\"");
  const zzzIdx = labelsSection.indexOf("\"zzz\"");

  assertEquals(aaaIdx < startIdx, true);
  assertEquals(startIdx < zzzIdx, true);
});

Deno.test("serializeIR emits stable instruction field order", () => {
  const out = serializeIR(makeIR());

  // say should be { op, text, meta } when meta exists.
  const sayPattern = /\{\s*"op": "say",\s*"text": "Hello\.",\s*"meta": \{\s*"a": "first",\s*"mouth": \{\s*"mode": "phoneme",\s*"mou": "aiueo"\s*\},\s*"z": "last"\s*\}\s*\}/m;
  assertEquals(sayPattern.test(out), true);

  // choice option should be { text, to }
  const optionPattern = /\{\s*"text": "Go outside",\s*"to": "outside"\s*\}/m;
  assertEquals(optionPattern.test(out), true);
});

Deno.test("serializeIR ends with a newline", () => {
  const out = serializeIR(makeIR());
  assertEquals(out.endsWith("\n"), true);
});

Deno.test("serializeIR: rejects deep say.meta array nesting", () => {
  const deep = [[[[[[["x"]]]]]]];
  const ir: IR = {
    schemaVersion: 1,
    engineVersion: "0.1.0",
    entry: "start",
    plugins: [],
    labels: {
      start: [
        { op: "say", text: "Hello", meta: { a: deep } },
        { op: "end" },
      ],
    },
  };
  assertThrows(() => serializeIR(ir), Error, "say.meta nesting is too deep");
});

Deno.test("serializeIR: rejects oversized say.meta arrays", () => {
  const huge = Array.from({ length: 300 }, (_, i) => i);
  const ir: IR = {
    schemaVersion: 1,
    engineVersion: "0.1.0",
    entry: "start",
    plugins: [],
    labels: {
      start: [
        { op: "say", text: "Hello", meta: { a: huge } },
        { op: "end" },
      ],
    },
  };
  assertThrows(() => serializeIR(ir), Error, "say.meta is too large");
});
