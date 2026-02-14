import { assertEquals } from "@std/assert";

import { parse } from "./parse.ts";
import { validateAst } from "./validate_ast.ts";

Deno.test("validateAst: reserved label name => E0505", () => {
  const input = [
    "{{# label: start }}",
    "{{ end }}",
    "",
    "{{# label: constructor }}",
    "{{ end }}",
  ].join("\n");

  const parsed = parse(input);
  // Parse should succeed; AST validate catches reserved.
  assertEquals(parsed.errors.length, 0);

  const errors = validateAst(parsed.ast);
  assertEquals(errors.some((e) => e.code === "E0505"), true);
});

Deno.test("validateAst: duplicate plugin allowlist => E0321", () => {
  const input = [
    "{{# plugin: ui.render }}",
    "{{# plugin: ui.render }}",
    "{{# label: start }}",
    "{{ end }}",
  ].join("\n");

  const parsed = parse(input);
  assertEquals(parsed.errors.length, 0);

  const errors = validateAst(parsed.ast);
  assertEquals(errors.some((e) => e.code === "E0321"), true);
});

Deno.test("validateAst: plugin usage not in allowlist => E0322", () => {
  const input = [
    "{{# plugin: debug.log }}",
    "{{# label: start }}",
    "{{ plugin: ui.render text=\"Hello\" }}",
    "{{ end }}",
  ].join("\n");

  const parsed = parse(input);
  assertEquals(parsed.errors.length, 0);

  const errors = validateAst(parsed.ast);
  assertEquals(errors.some((e) => e.code === "E0322"), true);
});
