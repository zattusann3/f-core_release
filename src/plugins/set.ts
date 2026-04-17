import type { PluginArgs, PluginContext, VarValue } from "../types.ts";

type SafeOperator =
  | "^+"
  | "^-"
  | "^*"
  | "^/"
  | "^="
  | "^!="
  | "^>"
  | "^<"
  | "^>="
  | "^<=";

type SafeFn = (left: VarValue, right: VarValue) => VarValue;

const SAFE_FUNCTIONS: Record<SafeOperator, SafeFn> = {
  "^+": (left, right) => {
    if (typeof left === "number" && typeof right === "number") {
      return left + right;
    }
    if (typeof left === "string" && typeof right === "string") {
      return left + right;
    }
    throw new Error("compatible types required for ^+");
  },
  "^-": (left, right) => asNumber(left) - asNumber(right),
  "^*": (left, right) => asNumber(left) * asNumber(right),
  "^/": (left, right) => {
    const divisor = asNumber(right);
    if (divisor === 0) {
      throw new Error("fatal: division by zero");
    }
    return asNumber(left) / divisor;
  },
  "^=": (left, right) => left === right,
  "^!=": (left, right) => left !== right,
  "^>": (left, right) => asNumber(left) > asNumber(right),
  "^<": (left, right) => asNumber(left) < asNumber(right),
  "^>=": (left, right) => asNumber(left) >= asNumber(right),
  "^<=": (left, right) => asNumber(left) <= asNumber(right),
};

export function execute(context: PluginContext, args: PluginArgs): void {
  const target = args["target"];
  const expression = args["expression"];

  if (typeof target !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(target)) {
    throw new Error("set.target must be a valid variable name");
  }
  if (typeof expression !== "string") {
    throw new Error("set.expression must be a string");
  }

  const value = evaluateExpression(expression, context.vars.snapshot());
  context.vars.set(target, value);
  context.next();
}

function evaluateExpression(
  expression: string,
  vars: Readonly<Record<string, VarValue>>,
): VarValue {
  const [leftToken, operatorToken, rightToken] = tokenizeExpression(expression);

  if (!operatorToken.startsWith("^")) {
    throw new Error(`operator must start with ^: ${operatorToken}`);
  }

  if (!isSafeOperator(operatorToken)) {
    throw new Error(`unsupported operator: ${operatorToken}`);
  }

  const left = resolveToken(leftToken, vars);
  const right = resolveToken(rightToken, vars);
  return SAFE_FUNCTIONS[operatorToken](left, right);
}

function isSafeOperator(op: string): op is SafeOperator {
  return op in SAFE_FUNCTIONS;
}

function resolveToken(token: string, vars: Readonly<Record<string, VarValue>>): VarValue {
  if (isQuotedStringToken(token)) {
    return decodeQuotedString(token);
  }

  if (Object.hasOwn(vars, token)) {
    return vars[token];
  }

  if (/^-?\d+(\.\d+)?$/.test(token)) {
    return Number(token);
  }

  if (token === "true") return true;
  if (token === "false") return false;
  if (token === "null") return null;

  throw new Error(`unknown token: ${token}`);
}

function tokenizeExpression(expression: string): [string, string, string] {
  const tokens: string[] = [];
  let i = 0;

  while (i < expression.length) {
    while (i < expression.length && isWhitespace(expression[i])) i++;
    if (i >= expression.length) break;

    const quote = expression[i];
    if (quote === '"' || quote === "'") {
      const start = i;
      i++;
      let escaped = false;
      while (i < expression.length) {
        const ch = expression[i];
        if (escaped) {
          escaped = false;
          i++;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          i++;
          continue;
        }
        if (ch === quote) {
          i++;
          break;
        }
        i++;
      }
      if (i > expression.length || expression[i - 1] !== quote) {
        throw new Error("unterminated string literal");
      }
      tokens.push(expression.slice(start, i));
      continue;
    }

    const start = i;
    while (i < expression.length && !isWhitespace(expression[i])) i++;
    tokens.push(expression.slice(start, i));
  }

  if (tokens.length !== 3) {
    throw new Error(`invalid expression format: ${expression}`);
  }
  return [tokens[0], tokens[1], tokens[2]];
}

function isWhitespace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

function isQuotedStringToken(token: string): boolean {
  if (token.length < 2) return false;
  const start = token[0];
  const end = token[token.length - 1];
  return (start === '"' && end === '"') || (start === "'" && end === "'");
}

function decodeQuotedString(token: string): string {
  const quote = token[0];
  let out = "";

  for (let i = 1; i < token.length - 1; i++) {
    const ch = token[i];
    if (ch !== "\\") {
      out += ch;
      continue;
    }

    i++;
    if (i >= token.length - 1) {
      throw new Error("invalid string escape");
    }
    const esc = token[i];
    if (esc === "n") out += "\n";
    else if (esc === "t") out += "\t";
    else if (esc === "r") out += "\r";
    else if (esc === "\\" || esc === "'" || esc === '"') out += esc;
    else throw new Error("invalid string escape");
  }

  if (quote !== '"' && quote !== "'") {
    throw new Error("invalid string literal");
  }
  return out;
}

function asNumber(value: VarValue): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`numeric value required: ${String(value)}`);
  }
  return value;
}
