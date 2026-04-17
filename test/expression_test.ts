import { assertEquals, assertThrows } from "jsr:@std/assert";
import { evaluateExpression } from "../src/expression.ts";

Deno.test("evaluateExpression: allows only ^ operators", () => {
  const vars = { val: 5 };
  assertEquals(evaluateExpression("val ^+ 10", vars), 15);
  assertEquals(evaluateExpression("val ^- 2", vars), 3);

  assertThrows(() => evaluateExpression("val + 10", vars), Error, "raw operator");
  assertThrows(
    () => evaluateExpression("val plus 10", vars),
    Error,
    "operator must start with ^",
  );
});

Deno.test("evaluateExpression: protects division by zero", () => {
  const vars = { hp: 10 };
  assertThrows(() => evaluateExpression("hp ^/ 0", vars), Error, "division by zero");
});

Deno.test("evaluateExpression: supports safe comparisons", () => {
  const vars = { flag: 1, hp: 10 };
  assertEquals(evaluateExpression("flag ^= 1", vars), true);
  assertEquals(evaluateExpression("hp ^> 5", vars), true);
});

Deno.test("evaluateExpression: supports quoted string literals", () => {
  assertEquals(evaluateExpression('"こんにちは" ^+ "世界"', {}), "こんにちは世界");
  assertEquals(evaluateExpression("'a b' ^+ ' c'", {}), "a b c");
});

Deno.test("evaluateExpression: does not resolve inherited properties", () => {
  const vars = Object.create({ hp: 10 }) as Record<string, number>;
  vars.self = 5;
  assertThrows(() => evaluateExpression("hp ^+ 1", vars), Error, "unknown token");
  assertEquals(evaluateExpression("self ^+ 1", vars), 6);
});
