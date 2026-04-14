import type {
  WorkerExecuteRequest,
  WorkerExecuteResponse,
  WorkerExecuteSuccess,
} from "./worker_protocol.ts";

interface PendingRequest {
  resolve: (value: WorkerExecuteSuccess) => void;
  reject: (reason: Error) => void;
  timeoutId: number;
}

export class WorkerHost {
  private worker: Worker | null = null;
  private readonly pending = new Map<string, PendingRequest>();
  private closed = false;

  execute(request: WorkerExecuteRequest, timeoutMs: number): Promise<WorkerExecuteSuccess> {
    if (this.closed) {
      return Promise.reject(new Error("worker host closed"));
    }
    if (this.pending.has(request.requestId)) {
      return Promise.reject(new Error("request correlation mismatch"));
    }

    const worker = this.ensureWorker();
    return new Promise<WorkerExecuteSuccess>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.recycleAndRejectAll(new Error("worker timeout"));
      }, timeoutMs) as unknown as number;

      this.pending.set(request.requestId, { resolve, reject, timeoutId });

      try {
        worker.postMessage(request);
      } catch (err) {
        clearTimeout(timeoutId);
        this.pending.delete(request.requestId);
        reject(toError(err, "worker message error"));
      }
    });
  }

  close(): void {
    this.closed = true;
    this.recycleAndRejectAll(new Error("worker host closed"));
  }

  private ensureWorker(): Worker {
    if (this.closed) {
      throw new Error("worker host closed");
    }
    if (this.worker) {
      return this.worker;
    }

    const worker = new Worker(new URL("./worker_runner.ts", import.meta.url).href, {
      type: "module",
      deno: { permissions: "none" },
    });

    worker.onmessage = (event: MessageEvent<WorkerExecuteResponse>) => {
      this.handleMessage(event.data);
    };
    worker.onerror = (event: ErrorEvent) => {
      this.recycleAndRejectAll(new Error(event.message || "worker error"));
    };
    worker.onmessageerror = () => {
      this.recycleAndRejectAll(new Error("worker message error"));
    };

    this.worker = worker;
    return worker;
  }

  private handleMessage(payload: unknown): void {
    if (!isWorkerResponse(payload)) {
      this.recycleAndRejectAll(new Error("invalid worker response"));
      return;
    }

    const pending = this.pending.get(payload.requestId);
    if (!pending) {
      this.recycleAndRejectAll(new Error("request correlation mismatch"));
      return;
    }

    clearTimeout(pending.timeoutId);
    this.pending.delete(payload.requestId);

    if (!payload.ok) {
      pending.reject(new Error(payload.reason || "worker rejected"));
      return;
    }
    if (!isWorkerSuccess(payload)) {
      pending.reject(new Error("invalid worker success payload"));
      return;
    }

    pending.resolve(payload);
  }

  private recycleAndRejectAll(err: Error): void {
    const activeWorker = this.worker;
    if (activeWorker) {
      activeWorker.onmessage = null;
      activeWorker.onerror = null;
      activeWorker.onmessageerror = null;
      activeWorker.terminate();
      this.worker = null;
    }

    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeoutId);
      pending.reject(err);
    }
    this.pending.clear();
  }
}

function isWorkerResponse(value: unknown): value is WorkerExecuteResponse {
  return typeof value === "object" && value !== null && "ok" in value;
}

function isWorkerSuccess(value: unknown): value is WorkerExecuteSuccess {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  if ((value as { ok?: unknown }).ok !== true) return false;
  const candidate = value as WorkerExecuteSuccess;
  if (typeof candidate.requestId !== "string" || candidate.requestId.length === 0) return false;
  if (typeof candidate.requestedNext !== "boolean") return false;
  if (typeof candidate.suspended !== "boolean") return false;
  if (!(candidate.jumpTo === null || typeof candidate.jumpTo === "string")) return false;
  if (!isVarPatch(candidate.varsPatch)) return false;
  if (!Array.isArray(candidate.renderCommands)) return false;
  return true;
}

function isVarPatch(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  for (const v of Object.values(value)) {
    if (!isVarValue(v)) return false;
  }
  return true;
}

function isVarValue(value: unknown): boolean {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function toError(value: unknown, fallback: string): Error {
  if (value instanceof Error) {
    return value;
  }
  return new Error(fallback);
}
