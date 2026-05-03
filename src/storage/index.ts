import type { StoragePort } from "./port.ts";
import { TauriStorageAdapter } from "./tauriAdapter.ts";
import { WebStorageAdapter } from "./webAdapter.ts";

let storageSingleton: StoragePort | null = null;

export function getStorage(): StoragePort {
  if (storageSingleton !== null) {
    return storageSingleton;
  }

  storageSingleton = isTauriRuntime()
    ? new TauriStorageAdapter()
    : new WebStorageAdapter();

  return storageSingleton;
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
