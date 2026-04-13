export const PLUGIN_ALLOWLIST = [
  "choice",
  "conflict",
  "hang",
  "say",
  "set",
] as const;

export type AllowlistedPluginOp = (typeof PLUGIN_ALLOWLIST)[number];
