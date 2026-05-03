/**
 * Generic opaque command envelope.
 * The core can forward this envelope without understanding its payload shape.
 */
export type OpaqueCommandEnvelope = {
  namespace: string;
  action: string;
  payload: unknown;
  requestId?: string;
};

/**
 * Audio-specific envelope alias.
 * Kept as an alias so other domains (image/video/live2d) can reuse OpaqueCommandEnvelope.
 */
export type AudioCommandEnvelope = OpaqueCommandEnvelope;

/**
 * Adapter-owned audio state for save/load.
 * This is treated as an opaque blob by the core.
 */
export type AdapterAudioState = {
  adapterId: string;
  adapterVersion: string;
  stateSchemaVersion: number;
  state: unknown;
};

/**
 * Minimal core-owned audio state.
 * Keep this small and stable across adapters.
 */
export type CoreAudioState = {
  masterVolume: number;
  muted: boolean;
  activeAdapterId: string;
  adapterState: AdapterAudioState;
};

/**
 * Audio runtime boundary between core and adapter.
 */
export interface AudioPort {
  dispatch(envelope: AudioCommandEnvelope): Promise<void>;
  snapshot(): AdapterAudioState;
  restore(snapshot: AdapterAudioState): Promise<void>;
  unlock(): Promise<void>;
}

export type AudioErrorCode =
  | "ERR_AUDIO_UNLOCK_REQUIRED"
  | "ERR_AUDIO_LOAD_FAILED"
  | "ERR_AUDIO_ADAPTER_MISMATCH"
  | "ERR_AUDIO_INVALID_PAYLOAD"
  | "ERR_AUDIO_UNKNOWN";

export class AudioError extends Error {
  readonly code: AudioErrorCode;

  constructor(code: AudioErrorCode, message: string, options?: { cause?: unknown }) {
    super(`[${code}] ${message}`, { cause: options?.cause });
    this.name = "AudioError";
    this.code = code;
  }
}

export function isAudioError(value: unknown): value is AudioError {
  return value instanceof AudioError;
}
