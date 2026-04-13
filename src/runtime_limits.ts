const ENCODER = new TextEncoder();

export const MAX_ARGS_BYTES = 8 * 1024;
export const MAX_VARS_ENTRIES = 256;
export const MAX_VARS_BYTES = 64 * 1024;
export const MAX_VARS_PATCH_ENTRIES = 128;
export const MAX_VARS_PATCH_BYTES = 32 * 1024;
export const MAX_JUMP_LABEL_BYTES = 256;

export function jsonByteLength(value: unknown): number {
  return ENCODER.encode(JSON.stringify(value)).length;
}

export function textByteLength(value: string): number {
  return ENCODER.encode(value).length;
}
