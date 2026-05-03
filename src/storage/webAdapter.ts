import { isStorageError, StorageError } from "./errors.ts";
import type { StoragePort } from "./port.ts";

const STORAGE_PREFIX = "fcore_save_";

export class WebStorageAdapter implements StoragePort {
  async save(slotId: number, data: string): Promise<void> {
    const key = buildStorageKey(slotId, "ERR_STORAGE_WRITE");
    try {
      localStorage.setItem(key, data);
    } catch (cause) {
      throw new StorageError(
        "ERR_STORAGE_WRITE",
        "failed to persist save data in web storage",
        { cause },
      );
    }
  }

  async load(slotId: number): Promise<string> {
    const key = buildStorageKey(slotId, "ERR_STORAGE_READ");
    try {
      const value = localStorage.getItem(key);
      if (value === null) {
        throw new StorageError(
          "ERR_STORAGE_NOT_FOUND",
          `save data not found for slot ${slotId}`,
        );
      }
      return value;
    } catch (cause) {
      if (isStorageError(cause)) {
        throw cause;
      }
      throw new StorageError(
        "ERR_STORAGE_READ",
        "failed to read save data from web storage",
        { cause },
      );
    }
  }
}

function buildStorageKey(
  slotId: number,
  code: "ERR_STORAGE_WRITE" | "ERR_STORAGE_READ",
): string {
  if (!Number.isInteger(slotId) || slotId < 0) {
    throw new StorageError(code, "invalid slot id");
  }
  return `${STORAGE_PREFIX}${slotId}`;
}
