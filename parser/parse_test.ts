import { assertEquals } from "@std/assert";

import { parse } from "./parse.ts";

Deno.test("parse: builds AST for label/say/end", () => {
  const input = [
    "{{# label: start }}",
    "Hello.",
    "",
    "World.",
    "{{ end }}",
  ].join("\n");

  const result = parse(input);
  assertEquals(result.errors.length, 0);

  const script = result.ast;
  assertEquals(script.body.length, 1);

  const label = script.body[0];
  assertEquals(label.kind, "Label");
  if (label.kind === "Label") {
    assertEquals(label.name, "start");
    assertEquals(label.body.length, 2);
    assertEquals(label.body[0].kind, "Say");
    assertEquals(label.body[1].kind, "Say");
  }
});

Deno.test("parse: choice options collected", () => {
  const input = [
    "{{# label: start }}",
    "{{# choice}}",
    "- Go -> out",
    "- Stay -> stay",
    "{{ end }}",
    "{{ end }}",
  ].join("\n");

  const result = parse(input);
  assertEquals(result.errors.length, 0);

  const label = result.ast.body[0];
  if (label.kind === "Label") {
    const choice = label.body[0];
    assertEquals(choice.kind, "Choice");
    if (choice.kind === "Choice") {
      assertEquals(choice.options.length, 2);
      assertEquals(choice.options[0].to, "out");
    }
  }
});

Deno.test("parse: text outside label is an error", () => {
  const input = ["Hello.", "{{# label: start }}", "{{ end }}"].join("\n");
  const result = parse(input);
  assertEquals(result.errors.length > 0, true);
});

Deno.test("parse: label missing end reports E0302", () => {
  const input = ["{{# label: start }}", "Hello."].join("\n");
  const result = parse(input);
  assertEquals(result.errors.some((e) => e.code === "E0302"), true);
});

Deno.test("parse: invalid line inside choice is error", () => {
  const input = [
    "{{# label: start }}",
    "{{# choice}}",
    "Hello",
    "{{ end }}",
    "{{ end }}",
  ].join("\n");

  const result = parse(input);
  assertEquals(result.errors.length > 0, true);
});

Deno.test("parse: set/if/jump inside choice is error", () => {
  const input = [
    "{{# label: start }}",
    "{{# choice}}",
    "{{ set: hasKey = true }}",
    "{{ if: hasKey -> opened }}",
    "{{ jump: end_label }}",
    "{{ end }}",
    "{{ end }}",
  ].join("\n");

  const result = parse(input);
  assertEquals(result.errors.length > 0, true);
});

Deno.test("parse: set/if/jump tags in label", () => {
  const input = [
    "{{# label: start }}",
    "{{ set: hasKey = true }}",
    "{{ set: score = 10 }}",
    "{{ set: name = \"alice\" }}",
    "{{ if: hasKey -> opened }}",
    "{{ jump: end_label }}",
    "{{ end }}",
  ].join("\n");

  const result = parse(input);
  assertEquals(result.errors.length, 0);
  const label = result.ast.body[0];
  if (label.kind === "Label") {
    assertEquals(label.body[0].kind, "Set");
    assertEquals(label.body[1].kind, "Set");
    assertEquals(label.body[2].kind, "Set");
    assertEquals(label.body[3].kind, "If");
    assertEquals(label.body[4].kind, "Jump");
  }
});

Deno.test("parse: if with space after ! is not allowed", () => {
  const input = [
    "{{# label: start }}",
    "{{ if: ! hasKey -> locked }}",
    "{{ end }}",
  ].join("\n");

  const result = parse(input);
  assertEquals(result.errors.length > 0, true);
});

Deno.test("parse: if equality literal", () => {
  const input = [
    "{{# label: start }}",
    "{{ if: score == 10 -> high }}",
    "{{ if: name == \"alice\" -> greet }}",
    "{{ end }}",
  ].join("\n");

  const result = parse(input);
  assertEquals(result.errors.length, 0);
  const label = result.ast.body[0];
  if (label.kind === "Label") {
    assertEquals(label.body[0].kind, "If");
    assertEquals(label.body[1].kind, "If");
  }
});

Deno.test("parse: plugin allowlist at top-level and plugin tag in label", () => {
  const input = [
    "{{# plugin: ui.render }}",
    "{{# plugin: debug.log }}",
    "{{# label: start }}",
    "{{ plugin: ui.render text=\"Hello\" }}",
    "{{ plugin: debug.log message=\"state=ready\" }}",
    "{{ end }}",
  ].join("\n");

  const result = parse(input);
  assertEquals(result.errors.length, 0);
  assertEquals(result.ast.body[0].kind, "PluginDecl");
  assertEquals(result.ast.body[1].kind, "PluginDecl");
  const label = result.ast.body[2];
  assertEquals(label.kind, "Label");
  if (label.kind === "Label") {
    assertEquals(label.body[0].kind, "Plugin");
    assertEquals(label.body[1].kind, "Plugin");
  }
});

Deno.test("parse: plugin tag outside label is an error", () => {
  const input = [
    "{{ plugin: ui.render text=\"Hello\" }}",
    "{{# label: start }}",
    "{{ end }}",
  ].join("\n");

  const result = parse(input);
  assertEquals(result.errors.length > 0, true);
});

Deno.test("parse: plugin allowlist declaration inside label is an error", () => {
  const input = [
    "{{# label: start }}",
    "{{# plugin: ui.render }}",
    "{{ end }}",
  ].join("\n");

  const result = parse(input);
  assertEquals(result.errors.length > 0, true);
});

Deno.test("parse: plugin tag is not allowed inside choice", () => {
  const input = [
    "{{# label: start }}",
    "{{# choice}}",
    "{{ plugin: ui.render text=\"Hello\" }}",
    "{{ end }}",
    "{{ end }}",
  ].join("\n");

  const result = parse(input);
  assertEquals(result.errors.length > 0, true);
});
