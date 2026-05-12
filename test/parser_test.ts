import { assertEquals, assertThrows } from "jsr:@std/assert";
import { parseScenario } from "../src/parser.ts";

Deno.test("parseScenario: parses label, say, and choice blocks into IR", () => {
  const markdown = `
ここにあるテキストは全て無視される（コメント扱い）

{{# label: start }}
Hello from ui channel.

{{# choice}}
- Go -> end_label
- Stay -> start
{{ end }}

{{ end }}

{{# label: end_label }}
Done.
{{ end }}
`;

  const parsed = parseScenario(markdown);

  assertEquals(parsed, {
    start: [
      { op: "say", args: { text: "Hello from ui channel." } },
      {
        op: "menu",
        args: {
          choices: [
            { text: "Go", to: "end_label" },
            { text: "Stay", to: "start" },
          ],
        },
      },
    ],
    end_label: [
      { op: "say", args: { text: "Done." } },
    ],
  });
});

Deno.test("parseScenario: ignores text outside label blocks", () => {
  const markdown = `
outside A
outside B

{{# label: only }}
inside
{{ end }}

outside C
`;

  const parsed = parseScenario(markdown);

  assertEquals(parsed, {
    only: [
      { op: "say", args: { text: "inside" } },
    ],
  });
});

Deno.test("parseScenario: parses generic inline command tags", () => {
  const markdown = `
{{# label: start }}
{{ @asset type="bg" src="test.jpg" }}
{{ end }}
`;

  const parsed = parseScenario(markdown);

  assertEquals(parsed, {
    start: [
      {
        op: "asset",
        args: {
          type: "bg",
          src: "test.jpg",
        },
      },
    ],
  });
});

Deno.test("parseScenario: parses fcore JSON command block with native value types", () => {
  const markdown = `
{{# label: start }}
\`\`\`fcore:setup_game
{"key1":"value1","key2":123,"key3":[1,2,3],"nested":{"flag":true}}
\`\`\`
{{ end }}
`;

  const parsed = parseScenario(markdown);

  assertEquals(parsed, {
    start: [
      {
        op: "setup_game",
        args: {
          key1: "value1",
          key2: 123,
          key3: [1, 2, 3],
          nested: { flag: true },
        },
      },
    ],
  });
});

Deno.test("parseScenario: rejects malformed fcore JSON block", () => {
  const markdown = `
{{# label: start }}
\`\`\`fcore:setup_game
{"key1":}
\`\`\`
{{ end }}
`;

  assertThrows(() => parseScenario(markdown), Error, "parse error");
});

Deno.test("parseScenario: rejects unterminated fcore JSON block", () => {
  const markdown = `
{{# label: start }}
\`\`\`fcore:setup_game
{"key1":"value1"}
{{ end }}
`;

  assertThrows(() => parseScenario(markdown), Error, "parse error");
});

Deno.test("parseScenario: parses @release directive as system command", () => {
  const markdown = `
{{# label: start }}
@release bg/intro.jpg [fg/hero.png],(se/click.ogg)
{{ end }}
`;

  const parsed = parseScenario(markdown);

  assertEquals(parsed, {
    start: [
      {
        op: "release_assets",
        args: {
          ids: ["bg/intro.jpg", "fg/hero.png", "se/click.ogg"],
        },
      },
    ],
  });
});

Deno.test("parseScenario: rejects @release with too many asset ids", () => {
  const ids = Array.from({ length: 33 }, (_, index) => `bg/${index}.png`).join(" ");
  const markdown = `
{{# label: start }}
@release ${ids}
{{ end }}
`;

  assertThrows(() => parseScenario(markdown), Error, "parse error");
});
