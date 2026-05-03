import { invoke } from "@tauri-apps/api/core";
import { isStorageError, StorageError, type StorageErrorCode } from "./errors.ts";
import type { StoragePort } from "./port.ts";

type TauriInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

let tauriInvoke: TauriInvoke = (command, args) => invoke(command, args);

export function setTauriInvokeForTest(fn: TauriInvoke): void {
  tauriInvoke = fn;
}

export function resetTauriInvokeForTest(): void {
  tauriInvoke = (command, args) => invoke(command, args);
}

export class TauriStorageAdapter implements StoragePort {
  async save(slotId: number, data: string): Promise<void> {
    assertSlotId(slotId, "ERR_STORAGE_WRITE");
    try {
      await tauriInvoke("save_game", { slotId, payload: data });
    } catch (cause) {
      throw mapTauriError(cause, "ERR_STORAGE_WRITE");
    }
  }

  async load(slotId: number): Promise<string> {
    assertSlotId(slotId, "ERR_STORAGE_READ");
    try {
      const value = await tauriInvoke("load_game", { slotId }) as string;
      return value;
    } catch (cause) {
      const code = extractErrorCode(cause);
      if (code === "ERR_STORAGE_NOT_FOUND") {
        throw new StorageError("ERR_STORAGE_NOT_FOUND", `save data not found for slot ${slotId}`, {
          cause,
        });
      }
      throw mapTauriError(cause, "ERR_STORAGE_READ");
    }
  }
}

function assertSlotId(slotId: number, code: "ERR_STORAGE_WRITE" | "ERR_STORAGE_READ"): void {
  if (!Number.isInteger(slotId) || slotId < 0) {
    throw new StorageError(code, "invalid slot id");
  }
}

function mapTauriError(
  cause: unknown,
  fallbackCode: "ERR_STORAGE_WRITE" | "ERR_STORAGE_READ",
): StorageError {
  if (isStorageError(cause)) {
    return cause;
  }

  const code = extractErrorCode(cause);
  if (code !== null) {
    return new StorageError(code, extractErrorMessage(cause) ?? code, { cause });
  }

  const fallbackMessage = extractErrorMessage(cause);
  return new StorageError(
    fallbackCode,
    fallbackMessage ? `${fallbackCode}: ${fallbackMessage}` : fallbackCode,
    { cause },
  );
}

function extractErrorCode(value: unknown): StorageErrorCode | null {
  if (typeof value === "string") {
    return asStorageErrorCode(value);
  }
  return null;
}

function asStorageErrorCode(value: string): StorageErrorCode | null {
  if (
    value === "ERR_STORAGE_NOT_FOUND" ||
    value === "ERR_STORAGE_READ" ||
    value === "ERR_STORAGE_WRITE"
  ) {
    return value;
  }
  return null;
}

function extractErrorMessage(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "object" && value !== null) {
    const maybeMessage = (value as { message?: unknown }).message;
    if (typeof maybeMessage === "string") {
      return maybeMessage;
    }
  }
  return null;
}
