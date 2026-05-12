export type AssetKind = "bgm" | "bg" | "fg" | "voice" | "se" | "video" | "generic";
export type AssetPriority = "low" | "medium" | "high";

export type AssetTransformContext = {
  id: string;
  kind: AssetKind;
  priority: AssetPriority;
  signal: AbortSignal;
};

export type AssetTransform = (
  data: Uint8Array,
  context: AssetTransformContext,
) => Promise<Uint8Array | ArrayBuffer> | Uint8Array | ArrayBuffer;

export type AssetHandle = {
  id: string;
  kind: AssetKind;
  objectUrl: string;
  mimeType: string;
  byteLength: number;
  points: number;
  touchedAt: number;
};

export type EnsureAssetOptions = {
  kind?: AssetKind;
  priority?: AssetPriority;
  protect?: boolean;
  mimeType?: string;
};

export type AssetManagerOptions = {
  basePath?: string;
  maxPoints?: number;
  maxConcurrentFetches?: number;
  pointsByKind?: Partial<Record<AssetKind, number>>;
  transform?: AssetTransform;
  fetchImpl?: typeof fetch;
};

type LoadingEntry = {
  id: string;
  kind: AssetKind;
  priority: AssetPriority;
  mimeType?: string;
  sequence: number;
  status: "queued" | "running";
  controller: AbortController;
  promise: Promise<AssetHandle>;
  resolve: (asset: AssetHandle) => void;
  reject: (reason: unknown) => void;
};

const PRIORITY_RANK: Record<AssetPriority, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

const DEFAULT_POINTS_BY_KIND: Record<AssetKind, number> = {
  bgm: 15,
  bg: 10,
  fg: 5,
  voice: 1,
  se: 1,
  video: 20,
  generic: 3,
};

const DEFAULT_MAX_POINTS = 1000;
const DEFAULT_MAX_CONCURRENT_FETCHES = 6;

export class AssetManager {
  private readonly basePath: string;
  private readonly maxPoints: number;
  private readonly maxConcurrentFetches: number;
  private readonly pointsByKind: Record<AssetKind, number>;
  private readonly fetchImpl: typeof fetch;
  private transform: AssetTransform;
  private readonly cacheMap = new Map<string, AssetHandle>();
  private readonly loadingMap = new Map<string, LoadingEntry>();
  private readonly protectedSet = new Set<string>();
  private readonly queue: LoadingEntry[] = [];
  private pointsInCache = 0;
  private sequence = 0;
  private runningFetches = 0;

  constructor(options: AssetManagerOptions = {}) {
    this.basePath = normalizeBasePath(options.basePath ?? "/assets");
    this.maxPoints = options.maxPoints ?? DEFAULT_MAX_POINTS;
    this.maxConcurrentFetches = options.maxConcurrentFetches ?? DEFAULT_MAX_CONCURRENT_FETCHES;
    this.pointsByKind = { ...DEFAULT_POINTS_BY_KIND, ...(options.pointsByKind ?? {}) };
    this.fetchImpl = resolveFetchImpl(options.fetchImpl);
    this.transform = options.transform ?? passthroughTransform;
  }

  setTransform(transform: AssetTransform): void {
    this.transform = transform;
  }

  async ensure(rawId: string, options: EnsureAssetOptions = {}): Promise<AssetHandle> {
    const id = sanitizeAssetId(rawId);
    const kind = options.kind ?? guessKindFromPath(id);
    const priority = options.priority ?? "medium";
    const protect = options.protect ?? false;

    if (protect) {
      this.protectedSet.add(id);
    }

    const cached = this.cacheMap.get(id);
    if (cached !== undefined) {
      return this.touchCacheEntry(cached);
    }

    const loading = this.loadingMap.get(id);
    if (loading !== undefined) {
      this.promoteLoadingPriority(loading, priority);
      return loading.promise;
    }

    const deferred = createDeferred<AssetHandle>();
    const entry: LoadingEntry = {
      id,
      kind,
      priority,
      mimeType: options.mimeType,
      sequence: this.sequence++,
      status: "queued",
      controller: new AbortController(),
      promise: deferred.promise,
      resolve: deferred.resolve,
      reject: deferred.reject,
    };

    this.loadingMap.set(id, entry);
    this.queue.push(entry);
    this.sortQueueByPriority();
    this.drainQueue();

    return entry.promise;
  }

  async preload(ids: ReadonlyArray<string>, options: EnsureAssetOptions = {}): Promise<void> {
    const jobs = ids.map((id) => this.ensure(id, { ...options, priority: options.priority ?? "low" }));
    await Promise.allSettled(jobs);
  }

  get(rawId: string): AssetHandle | null {
    const id = sanitizeAssetId(rawId);
    const cached = this.cacheMap.get(id);
    if (cached === undefined) {
      return null;
    }
    return this.touchCacheEntry(cached);
  }

  protect(ids: ReadonlyArray<string>): void {
    for (const id of ids) {
      this.protectedSet.add(sanitizeAssetId(id));
    }
  }

  unprotect(ids: ReadonlyArray<string>): void {
    for (const id of ids) {
      this.protectedSet.delete(sanitizeAssetId(id));
    }
  }

  setProtected(ids: ReadonlyArray<string>): void {
    this.protectedSet.clear();
    this.protect(ids);
  }

  release(rawId: string): boolean {
    const id = sanitizeAssetId(rawId);
    this.protectedSet.delete(id);
    let changed = this.releaseCachedEntry(id);
    changed = this.cancelLoadingEntry(id) || changed;
    return changed;
  }

  releaseMany(ids: ReadonlyArray<string>): number {
    let released = 0;
    for (const id of ids) {
      if (this.release(id)) {
        released += 1;
      }
    }
    return released;
  }

  applyReleaseDirective(raw: string): string[] {
    const parsed = parseReleaseDirective(raw);
    if (parsed.length === 0) {
      return [];
    }
    this.releaseMany(parsed);
    return parsed;
  }

  clear(): void {
    for (const entry of this.loadingMap.values()) {
      entry.controller.abort("asset-manager-clear");
      entry.reject(new Error("asset loading canceled"));
    }
    this.loadingMap.clear();
    this.queue.length = 0;

    for (const id of this.cacheMap.keys()) {
      this.releaseCachedEntry(id);
    }
    this.cacheMap.clear();
    this.protectedSet.clear();
    this.pointsInCache = 0;
  }

  getStats(): {
    cacheSize: number;
    loadingSize: number;
    protectedSize: number;
    pointsInCache: number;
  } {
    return {
      cacheSize: this.cacheMap.size,
      loadingSize: this.loadingMap.size,
      protectedSize: this.protectedSet.size,
      pointsInCache: this.pointsInCache,
    };
  }

  private promoteLoadingPriority(entry: LoadingEntry, nextPriority: AssetPriority): void {
    if (PRIORITY_RANK[nextPriority] <= PRIORITY_RANK[entry.priority]) {
      return;
    }
    entry.priority = nextPriority;
    if (entry.status === "queued") {
      this.sortQueueByPriority();
    }
    // When already running, browsers usually don't allow mutating fetch priority after start.
    // We still store upgraded priority for scheduler/accounting visibility.
  }

  private drainQueue(): void {
    while (this.runningFetches < this.maxConcurrentFetches) {
      const next = this.dequeueNext();
      if (next === null) {
        return;
      }
      void this.startFetch(next);
    }
  }

  private dequeueNext(): LoadingEntry | null {
    if (this.queue.length === 0) {
      return null;
    }
    this.sortQueueByPriority();
    return this.queue.shift() ?? null;
  }

  private sortQueueByPriority(): void {
    this.queue.sort((a, b) => {
      const rankDiff = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
      if (rankDiff !== 0) {
        return rankDiff;
      }
      return a.sequence - b.sequence;
    });
  }

  private async startFetch(entry: LoadingEntry): Promise<void> {
    entry.status = "running";
    this.runningFetches += 1;
    try {
      const asset = await this.fetchAndBuildAsset(entry);
      entry.resolve(asset);
    } catch (error) {
      entry.reject(error);
    } finally {
      this.runningFetches = Math.max(0, this.runningFetches - 1);
      const current = this.loadingMap.get(entry.id);
      if (current === entry) {
        this.loadingMap.delete(entry.id);
      }
      this.drainQueue();
    }
  }

  private async fetchAndBuildAsset(entry: LoadingEntry): Promise<AssetHandle> {
    const points = this.pointsByKind[entry.kind];
    const response = await this.fetchImpl(resolveAssetUrl(this.basePath, entry.id), {
      signal: entry.controller.signal,
      priority: toRequestPriority(entry.priority),
    });
    if (!response.ok) {
      throw new Error(`asset fetch failed: ${entry.id} (${response.status})`);
    }

    const rawBuffer = await response.arrayBuffer();
    const transformed = await this.transform(new Uint8Array(rawBuffer), {
      id: entry.id,
      kind: entry.kind,
      priority: entry.priority,
      signal: entry.controller.signal,
    });
    const bytes = normalizeTransformResult(transformed);
    const mimeType = entry.mimeType ?? response.headers.get("content-type") ?? "application/octet-stream";
    const blob = new Blob([bytes], { type: mimeType });
    const objectUrl = URL.createObjectURL(blob);

    const handle: AssetHandle = {
      id: entry.id,
      kind: entry.kind,
      objectUrl,
      mimeType,
      byteLength: bytes.byteLength,
      points,
      touchedAt: Date.now(),
    };

    this.insertCacheEntry(handle);
    this.evictIfNeeded(handle.id);
    return handle;
  }

  private insertCacheEntry(entry: AssetHandle): void {
    const existing = this.cacheMap.get(entry.id);
    if (existing !== undefined) {
      this.releaseCachedEntry(entry.id);
    }
    this.cacheMap.set(entry.id, entry);
    this.pointsInCache += entry.points;
  }

  private touchCacheEntry(entry: AssetHandle): AssetHandle {
    const next: AssetHandle = { ...entry, touchedAt: Date.now() };
    this.cacheMap.delete(entry.id);
    this.cacheMap.set(entry.id, next);
    return next;
  }

  private evictIfNeeded(excludeId?: string): void {
    if (this.pointsInCache <= this.maxPoints) {
      return;
    }

    for (const [id] of this.cacheMap) {
      if (this.pointsInCache <= this.maxPoints) {
        break;
      }
      if (excludeId !== undefined && id === excludeId) {
        continue;
      }
      if (this.protectedSet.has(id)) {
        continue;
      }
      this.releaseCachedEntry(id);
    }
  }

  private releaseCachedEntry(id: string): boolean {
    const cached = this.cacheMap.get(id);
    if (cached === undefined) {
      return false;
    }
    this.cacheMap.delete(id);
    this.pointsInCache = Math.max(0, this.pointsInCache - cached.points);
    URL.revokeObjectURL(cached.objectUrl);
    return true;
  }

  private cancelLoadingEntry(id: string): boolean {
    const loading = this.loadingMap.get(id);
    if (loading === undefined) {
      return false;
    }
    loading.controller.abort("asset released");
    this.loadingMap.delete(id);
    const queueIndex = this.queue.findIndex((entry) => entry.id === id);
    if (queueIndex >= 0) {
      this.queue.splice(queueIndex, 1);
    }
    loading.reject(new Error(`asset loading canceled: ${id}`));
    return true;
  }
}

function resolveFetchImpl(fetchImpl?: typeof fetch): typeof fetch {
  const candidate = fetchImpl ?? globalThis.fetch;
  if (typeof candidate !== "function") {
    throw new Error("fetch is not available");
  }
  return ((input: RequestInfo | URL, init?: RequestInit) =>
    candidate.call(globalThis, input, init)) as typeof fetch;
}

function passthroughTransform(
  data: Uint8Array,
  _context: AssetTransformContext,
): Uint8Array {
  return data;
}

function toRequestPriority(priority: AssetPriority): RequestPriority {
  switch (priority) {
    case "high":
      return "high";
    case "low":
      return "low";
    default:
      return "auto";
  }
}

function normalizeTransformResult(value: Uint8Array | ArrayBuffer): Uint8Array {
  if (value instanceof Uint8Array) {
    return value;
  }
  return new Uint8Array(value);
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function normalizeBasePath(rawBasePath: string): string {
  const trimmed = rawBasePath.trim();
  if (trimmed.length === 0) {
    return "/assets";
  }
  const withoutTrailing = trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
  return withoutTrailing.startsWith("/") ? withoutTrailing : `/${withoutTrailing}`;
}

function sanitizeAssetId(rawId: string): string {
  const value = rawId.trim();
  if (value.length === 0) {
    throw new Error("invalid asset id");
  }
  if (value.includes("\0")) {
    throw new Error("invalid asset id");
  }
  if (value.includes("..")) {
    throw new Error("invalid asset id");
  }
  if (value.includes("\\")) {
    throw new Error("invalid asset id");
  }
  if (/^[a-zA-Z][a-zA-Z0-9+\-.]*:/.test(value)) {
    throw new Error("invalid asset id");
  }
  if (value.startsWith("//")) {
    throw new Error("invalid asset id");
  }

  const normalized = value.startsWith("/assets/")
    ? value.slice("/assets/".length)
    : value.startsWith("assets/")
    ? value.slice("assets/".length)
    : value.startsWith("/")
    ? value.slice(1)
    : value;

  if (normalized.length === 0) {
    throw new Error("invalid asset id");
  }

  if (!/^[A-Za-z0-9._\-\/]+$/.test(normalized)) {
    throw new Error("invalid asset id");
  }

  return normalized;
}

function resolveAssetUrl(basePath: string, id: string): string {
  const segments = id.split("/").map((segment) => encodeURIComponent(segment));
  return `${basePath}/${segments.join("/")}`;
}

function guessKindFromPath(id: string): AssetKind {
  const lower = id.toLowerCase();
  if (lower.includes("/bgm/")) return "bgm";
  if (lower.includes("/bg/")) return "bg";
  if (lower.includes("/fg/")) return "fg";
  if (lower.includes("/voice/")) return "voice";
  if (lower.includes("/se/")) return "se";
  if (lower.endsWith(".mp4") || lower.endsWith(".webm") || lower.includes("/video/")) {
    return "video";
  }
  return "generic";
}

export function parseReleaseDirective(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed.startsWith("@release")) {
    return [];
  }
  const rest = trimmed.slice("@release".length).trim();
  if (rest.length === 0) {
    return [];
  }
  const tokens = rest.split(/\s+/g).flatMap((token) => token.split(",")).map((token) => token.trim())
    .filter((token) => token.length > 0);
  return tokens.map((token) => sanitizeAssetId(stripTokenWrapper(token)));
}

function stripTokenWrapper(token: string): string {
  const value = token.trim();
  if (
    (value.startsWith("[") && value.endsWith("]")) ||
    (value.startsWith("(") && value.endsWith(")")) ||
    (value.startsWith("{") && value.endsWith("}"))
  ) {
    return value.slice(1, -1).trim();
  }
  return value;
}
