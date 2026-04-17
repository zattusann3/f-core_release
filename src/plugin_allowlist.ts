export const PLUGIN_ALLOWLIST = [
  "asset",
  "choice",
  "effect",
  "menu",
  "say",
  "set",
] as const;

export type AllowlistedPluginOp = (typeof PLUGIN_ALLOWLIST)[number];
