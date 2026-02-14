import { assertEquals } from "@std/assert";

import { validateIR } from "./validate.ts";
import type { IR } from "./types.ts";

function baseIR(): IR {
  return {
    schemaVersion: 1,
    engineVersion: "0.1.0",
    entry: "start",
    plugins: [],
    labels: {
      start: [{ op: "end" }],
    },
  };
}

function codes(result: ReturnType<typeof validateIR>): string[] {
  return result.ok ? [] : result.errors.map((e) => e.code);
}

Deno.test("validateIR: missing start label => E0301", () => {
  const ir: IR = {
    ...baseIR(),
    labels: {
      a: [{ op: "end" }],
    },
  };

  const result = validateIR(ir);
  assertEquals(result.ok, false);
  assertEquals(codes(result).includes("E0301"), true);
});

Deno.test("validateIR: schemaVersion must be 1 => E0501", () => {
  const ir = {
    ...baseIR(),
    schemaVersion: 2,
  } as unknown as IR;

  const result = validateIR(ir);
  assertEquals(result.ok, false);
  assertEquals(codes(result).includes("E0501"), true);
});

Deno.test("validateIR: label missing end => E0302", () => {
  const ir: IR = {
    ...baseIR(),
    labels: {
      start: [{ op: "say", text: "Hello" }],
    },
  };

  const result = validateIR(ir);
  assertEquals(result.ok, false);
  assertEquals(codes(result).includes("E0302"), true);
});

Deno.test("validateIR: reserved label name => E0505", () => {
  const labels = Object.create(null) as Record<string, unknown>;
  labels.start = [{ op: "end" }];
  labels.__proto__ = [{ op: "end" }];
  const ir: IR = {
    ...baseIR(),
    labels: labels as IR["labels"],
  };

  const result = validateIR(ir);
  assertEquals(result.ok, false);
  assertEquals(codes(result).includes("E0505"), true);
});

Deno.test("validateIR: undefined label ref => E0401", () => {
  const ir: IR = {
    ...baseIR(),
    labels: {
      start: [
        {
          op: "choice",
          options: [{ text: "Go", to: "missing" }],
        },
        { op: "end" },
      ],
    },
  };

  const result = validateIR(ir);
  assertEquals(result.ok, false);
  assertEquals(codes(result).includes("E0401"), true);
});

Deno.test("validateIR: aggregates multiple errors", () => {
  const ir: IR = {
    ...baseIR(),
    labels: {
      a: [
        {
          op: "choice",
          options: [{ text: "Go", to: "missing" }],
        },
      ],
    },
  };

  const result = validateIR(ir);
  assertEquals(result.ok, false);

  const found = new Set(codes(result));
  assertEquals(found.has("E0301"), true); // missing start
  assertEquals(found.has("E0302"), true); // missing end
  assertEquals(found.has("E0401"), true); // undefined label ref
});

Deno.test("validateIR: invalid var name => E0307", () => {
  const ir: IR = {
    ...baseIR(),
    labels: {
      start: [
        { op: "set", name: "has-key", value: true },
        { op: "end" },
      ],
    },
  };

  const result = validateIR(ir);
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.errors.some((e) => e.code === "E0307"), true);
  }
});

Deno.test("validateIR: set value type => ok for string/number", () => {
  const ir: IR = {
    ...baseIR(),
    labels: {
      start: [
        { op: "set", name: "count", value: 1 },
        { op: "set", name: "name", value: "alice" },
        { op: "end" },
      ],
    },
  };

  const result = validateIR(ir);
  assertEquals(result.ok, true);
});

Deno.test("validateIR: set value invalid => E0312", () => {
  const ir: IR = {
    ...baseIR(),
    labels: {
      start: [
        { op: "set", name: "bad", value: { x: 1 } as unknown as boolean },
        { op: "end" },
      ],
    },
  };

  const result = validateIR(ir);
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.errors.some((e) => e.code === "E0312"), true);
  }
});

Deno.test("validateIR: if/jump label missing => E0401", () => {
  const ir: IR = {
    ...baseIR(),
    labels: {
      start: [
        { op: "if", name: "flag", negated: false, to: "missing" },
        { op: "jump", to: "missing2" },
        { op: "end" },
      ],
    },
  };

  const result = validateIR(ir);
  assertEquals(result.ok, false);
  if (!result.ok) {
    const codes = result.errors.map((e) => e.code);
    assertEquals(codes.includes("E0401"), true);
  }
});

Deno.test("validateIR: if equals with negated => E0313", () => {
  const ir: IR = {
    ...baseIR(),
    labels: {
      start: [
        { op: "if", name: "flag", negated: true, equals: true, to: "start" },
        { op: "end" },
      ],
    },
  };

  const result = validateIR(ir);
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.errors.some((e) => e.code === "E0313"), true);
  }
});

Deno.test("validateIR: if equals invalid type => E0312", () => {
  const ir: IR = {
    ...baseIR(),
    labels: {
      start: [
        {
          op: "if",
          name: "flag",
          negated: false,
          equals: { bad: 1 } as unknown as boolean,
          to: "start",
        },
        { op: "end" },
      ],
    },
  };

  const result = validateIR(ir);
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.errors.some((e) => e.code === "E0312"), true);
  }
});

Deno.test("validateIR: say.meta accepts JSON-compatible object", () => {
  const ir: IR = {
    ...baseIR(),
    labels: {
      start: [
        {
          op: "say",
          text: "Hello",
          meta: {
            mouth: {
              mode: "phoneme",
              mou: "oaou",
              punctPause: true,
            },
          },
        },
        { op: "end" },
      ],
    },
  };

  const result = validateIR(ir);
  assertEquals(result.ok, true);
});

Deno.test("validateIR: say.meta must be an object => E0206", () => {
  const ir = {
    ...baseIR(),
    labels: {
      start: [
        { op: "say", text: "Hello", meta: "bad" },
        { op: "end" },
      ],
    },
  } as unknown as IR;

  const result = validateIR(ir);
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.errors.some((e) => e.code === "E0206" && e.path === "$.labels.start[0].meta"), true);
  }
});

Deno.test("validateIR: say.meta rejects non-finite numbers => E0206", () => {
  const ir = {
    ...baseIR(),
    labels: {
      start: [
        {
          op: "say",
          text: "Hello",
          meta: {
            mouth: { weight: Number.NaN },
          },
        },
        { op: "end" },
      ],
    },
  } as unknown as IR;

  const result = validateIR(ir);
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(
      result.errors.some((e) => e.code === "E0206" && e.path === "$.labels.start[0].meta.mouth.weight"),
      true,
    );
  }
});

Deno.test("validateIR: say.meta rejects non-plain object payloads => E0206", () => {
  const ir = {
    ...baseIR(),
    labels: {
      start: [
        {
          op: "say",
          text: "Hello",
          meta: {
            mouth: new Date("2026-02-13T00:00:00Z"),
          },
        },
        { op: "end" },
      ],
    },
  } as unknown as IR;

  const result = validateIR(ir);
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.errors.some((e) => e.code === "E0206"), true);
  }
});

Deno.test("validateIR: say.meta accepts null-prototype objects", () => {
  const mouth = Object.create(null) as Record<string, unknown>;
  mouth.mode = "phoneme";
  mouth.mou = "oaou";
  const meta = Object.create(null) as Record<string, unknown>;
  meta.mouth = mouth;
  const ir = {
    ...baseIR(),
    labels: {
      start: [
        { op: "say", text: "Hello", meta },
        { op: "end" },
      ],
    },
  } as unknown as IR;

  const result = validateIR(ir);
  assertEquals(result.ok, true);
});

Deno.test("validateIR: say.meta rejects deep array nesting => E0206", () => {
  const deep = [[[[[[["x"]]]]]]];
  const ir = {
    ...baseIR(),
    labels: {
      start: [
        { op: "say", text: "Hello", meta: { a: deep } },
        { op: "end" },
      ],
    },
  } as unknown as IR;

  const result = validateIR(ir);
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.errors.some((e) => e.code === "E0206"), true);
  }
});

Deno.test("validateIR: say.meta rejects oversized arrays => E0206", () => {
  const huge = Array.from({ length: 300 }, (_, i) => i);
  const ir = {
    ...baseIR(),
    labels: {
      start: [
        { op: "say", text: "Hello", meta: { a: huge } },
        { op: "end" },
      ],
    },
  } as unknown as IR;

  const result = validateIR(ir);
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.errors.some((e) => e.code === "E0206"), true);
  }
});

Deno.test("validateIR: undefined label suggestions", () => {
  const ir: IR = {
    ...baseIR(),
    labels: {
      start: [
        {
          op: "choice",
          options: [{ text: "Go", to: "statr" }],
        },
        { op: "end" },
      ],
      start2: [{ op: "end" }],
    },
  };

  const result = validateIR(ir);
  assertEquals(result.ok, false);
  if (!result.ok) {
    const e0401 = result.errors.find((e) => e.code === "E0401");
    assertEquals(!!e0401?.suggestions?.includes("start"), true);
  }
});

Deno.test("validateIR: reserved label name (__proto__) => E0505", () => {
  const labels = Object.create(null) as Record<string, unknown>;
  labels.__proto__ = [{ op: "end" }];
  const ir: IR = {
    ...baseIR(),
    labels: labels as IR["labels"],
  };

  const result = validateIR(ir);
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.errors.some((e) => e.code === "E0505"), true);
  }
});

Deno.test("validateIR: reserved label name => E0505", () => {
  const ir = {
    ...baseIR(),
    labels: {
      start: [{ op: "end" }],
      constructor: [{ op: "end" }],
    },
  } as unknown;

  const result = validateIR(ir);
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.errors.some((e) => e.code === "E0505"), true);
  }
});

Deno.test("validateIR: never-set variable suggestions", () => {
  const ir: IR = {
    ...baseIR(),
    labels: {
      start: [
        { op: "if", name: "hasKye", negated: false, to: "start" },
        { op: "end" },
      ],
      init: [
        { op: "set", name: "hasKey", value: true },
        { op: "end" },
      ],
    },
  };

  const result = validateIR(ir);
  assertEquals(result.ok, true);
  if (result.ok) {
    const w = result.warnings.find((x) => x.code === "W0301");
    assertEquals(!!w?.suggestions?.includes("hasKey"), true);
  }
});

Deno.test("validateIR: never-set variable => warning", () => {
  const ir: IR = {
    ...baseIR(),
    labels: {
      start: [
        { op: "if", name: "flag", negated: false, to: "start" },
        { op: "end" },
      ],
    },
  };

  const result = validateIR(ir);
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.warnings.some((w) => w.code === "W0301"), true);
  }
});

Deno.test("validateIR: normalizes labels into a safe record", () => {
  const ir: IR = {
    ...baseIR(),
    labels: {
      start: [{ op: "end" }],
    },
  };

  const result = validateIR(ir);
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(Object.getPrototypeOf(result.value.labels), null);
  }
});

Deno.test("validateIR: plugin usage must be allowlisted => E0322", () => {
  const ir: IR = {
    ...baseIR(),
    labels: {
      start: [
        { op: "plugin", name: "ui.render", attrs: { text: "Hello" } },
        { op: "end" },
      ],
    },
  };

  const result = validateIR(ir);
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.errors.some((e) => e.code === "E0322"), true);
  }
});

Deno.test("validateIR: duplicate plugin allowlist entry => E0321", () => {
  const ir = {
    ...baseIR(),
    plugins: ["ui.render", "ui.render"],
  } as unknown as IR;

  const result = validateIR(ir);
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.errors.some((e) => e.code === "E0321"), true);
  }
});
