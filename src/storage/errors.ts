export type StorageErrorCode =
  | "ERR_STORAGE_WRITE"
  | "ERR_STORAGE_READ"
  | "ERR_STORAGE_NOT_FOUND";

export class StorageError extends Error {
  readonly code: StorageErrorCode;

  constructor(code: StorageErrorCode, message?: string, options?: { cause?: unknown }) {
    super(message ?? code, { cause: options?.cause });
    this.name = "StorageError";
    this.code = code;
  }
}

export function isStorageError(value: unknown): value is StorageError {
  return value instanceof StorageError;
}
