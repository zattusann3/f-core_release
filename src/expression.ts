import type { VarValue } from "./types.ts";

export type SafeOperator =
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

const RAW_OPERATOR_RE = /^(\+|-|\*|\/|=|==|!=|>|<|>=|<=)$/;

type SafeFn = (left: VarValue, right: VarValue) => VarValue;

const SAFE_FUNCTIONS: Record<SafeOperator, SafeFn> = {
  "^+": (left, right) => asNumber(left) + asNumber(right),
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

export function evaluateExpression(
  expression: string,
  vars: Readonly<Record<string, VarValue>>,
): VarValue {
  const tokens = expression.trim().split(/\s+/);
  if (tokens.length !== 3) {
    throw new Error(`invalid expression format: ${expression}`);
  }

  const [leftToken, operatorToken, rightToken] = tokens;

  if (RAW_OPERATOR_RE.test(operatorToken)) {
    throw new Error(`raw operator is forbidden: ${operatorToken}`);
  }

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
  if (token in vars) {
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

function asNumber(value: VarValue): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`numeric value required: ${String(value)}`);
  }
  return value;
}
