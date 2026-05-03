import { assertEquals, assertRejects } from "jsr:@std/assert";
import { StorageError } from "../src/storage/errors.ts";
import {
  resetTauriInvokeForTest,
  setTauriInvokeForTest,
  TauriStorageAdapter,
} from "../src/storage/tauriAdapter.ts";

Deno.test("TauriStorageAdapter.load: maps exact ERR_STORAGE_NOT_FOUND string", async () => {
  const adapter = new TauriStorageAdapter();
  setTauriInvokeForTest(() => Promise.reject("ERR_STORAGE_NOT_FOUND"));

  try {
    const error = await assertRejects(() => adapter.load(1), StorageError);
    assertEquals(error.code, "ERR_STORAGE_NOT_FOUND");
    assertEquals(error.message, "save data not found for slot 1");
  } finally {
    resetTauriInvokeForTest();
  }
});

Deno.test("TauriStorageAdapter.load: falls back on unexpected object error shape", async () => {
  const adapter = new TauriStorageAdapter();
  setTauriInvokeForTest(() => Promise.reject({ message: "ERR_STORAGE_NOT_FOUND" }));

  try {
    const error = await assertRejects(() => adapter.load(1), StorageError);
    assertEquals(error.code, "ERR_STORAGE_READ");
    assertEquals(error.message, "ERR_STORAGE_READ: ERR_STORAGE_NOT_FOUND");
  } finally {
    resetTauriInvokeForTest();
  }
});

Deno.test("TauriStorageAdapter: falls back for unknown string and Error object", async () => {
  const adapter = new TauriStorageAdapter();

  setTauriInvokeForTest(() => Promise.reject("SOMETHING_ELSE"));
  try {
    const loadError = await assertRejects(() => adapter.load(1), StorageError);
    assertEquals(loadError.code, "ERR_STORAGE_READ");
    assertEquals(loadError.message, "ERR_STORAGE_READ: SOMETHING_ELSE");
  } finally {
    resetTauriInvokeForTest();
  }

  setTauriInvokeForTest(() => Promise.reject(new Error("disk full")));
  try {
    const saveError = await assertRejects(() => adapter.save(1, "{}"), StorageError);
    assertEquals(saveError.code, "ERR_STORAGE_WRITE");
    assertEquals(saveError.message, "ERR_STORAGE_WRITE: disk full");
  } finally {
    resetTauriInvokeForTest();
  }
});
