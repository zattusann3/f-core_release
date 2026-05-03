import type {
  AdapterAudioState,
  AudioCommandEnvelope,
  AudioPort,
} from "./types.ts";
import { AudioError } from "./types.ts";

type AudioChannel = "bgm" | "se" | "voice";

type AudioLike = {
  src: string;
  loop: boolean;
  volume: number;
  currentTime: number;
  paused: boolean;
  play(): Promise<void> | void;
  pause(): void;
};

type AudioContextLike = {
  resume(): Promise<void> | void;
};

type StandardAudioAdapterOptions = {
  adapterId?: string;
  adapterVersion?: string;
  audioFactory?: () => AudioLike;
  audioContextFactory?: () => AudioContextLike | null;
};

type PlayPayload = {
  src: string;
  volume?: number;
  loop?: boolean;
  seekSec?: number;
};

type StandardAudioSnapshotState = {
  unlocked: boolean;
  volumes: Record<AudioChannel, number>;
  bgm: {
    src: string;
    currentTime: number;
    volume: number;
    loop: boolean;
    paused: boolean;
  } | null;
};

const STANDARD_ADAPTER_ID = "standard-audio";
const STANDARD_ADAPTER_VERSION = "1.0.0";

export class StandardAudioAdapter implements AudioPort {
  private readonly adapterId: string;
  private readonly adapterVersion: string;
  private readonly audioFactory: () => AudioLike;
  private readonly audioContextFactory: () => AudioContextLike | null;
  private audioContext: AudioContextLike | null | undefined;
  private unlocked = false;
  private bgmAudio: AudioLike | null = null;
  private readonly channelVolumes: Record<AudioChannel, number> = {
    bgm: 1,
    se: 1,
    voice: 1,
  };

  constructor(options: StandardAudioAdapterOptions = {}) {
    this.adapterId = options.adapterId ?? STANDARD_ADAPTER_ID;
    this.adapterVersion = options.adapterVersion ?? STANDARD_ADAPTER_VERSION;
    this.audioFactory = options.audioFactory ?? defaultAudioFactory;
    this.audioContextFactory = options.audioContextFactory ?? defaultAudioContextFactory;
  }

  async unlock(): Promise<void> {
    const context = this.getAudioContext();
    if (context !== null) {
      await context.resume();
    }
    this.unlocked = true;
  }

  async dispatch(envelope: AudioCommandEnvelope): Promise<void> {
    if (envelope.namespace !== "audio") {
      throw new AudioError("ERR_AUDIO_INVALID_PAYLOAD", "unsupported namespace");
    }

    switch (envelope.action) {
      case "play_bgm":
        await this.playBgm(validatePlayPayload(envelope.payload), envelope.requestId);
        return;
      case "play_se":
        await this.playOneShot("se", validatePlayPayload(envelope.payload), envelope.requestId);
        return;
      case "play_voice":
        await this.playOneShot("voice", validatePlayPayload(envelope.payload), envelope.requestId);
        return;
      default:
        throw new AudioError(
          "ERR_AUDIO_INVALID_PAYLOAD",
          `unsupported audio action: ${envelope.action}`,
        );
    }
  }

  snapshot(): AdapterAudioState {
    const bgm = this.bgmAudio === null
      ? null
      : {
        src: this.bgmAudio.src,
        currentTime: this.bgmAudio.currentTime,
        volume: this.bgmAudio.volume,
        loop: this.bgmAudio.loop,
        paused: this.bgmAudio.paused,
      };

    const state: StandardAudioSnapshotState = {
      unlocked: this.unlocked,
      volumes: { ...this.channelVolumes },
      bgm,
    };

    return {
      adapterId: this.adapterId,
      adapterVersion: this.adapterVersion,
      stateSchemaVersion: 1,
      state,
    };
  }

  async restore(snapshot: AdapterAudioState): Promise<void> {
    if (snapshot.adapterId !== this.adapterId) {
      throw new AudioError(
        "ERR_AUDIO_ADAPTER_MISMATCH",
        `adapter mismatch: expected '${this.adapterId}' but got '${snapshot.adapterId}'`,
      );
    }
    if (snapshot.stateSchemaVersion !== 1) {
      throw new AudioError("ERR_AUDIO_INVALID_PAYLOAD", "unsupported audio state schema");
    }

    const state = validateSnapshotState(snapshot.state);

    const nextUnlocked = state.unlocked;
    const nextVolumes = { ...state.volumes };
    let nextBgmAudio: AudioLike | null = null;

    try {
      if (state.bgm !== null) {
        const audio = this.audioFactory();
        audio.src = state.bgm.src;
        audio.loop = state.bgm.loop;
        audio.volume = state.bgm.volume;
        audio.currentTime = state.bgm.currentTime;
        if (!state.bgm.paused) {
          await this.playAudio(audio, "restore_bgm");
        }
        nextBgmAudio = audio;
      }
    } catch (error) {
      if (nextBgmAudio !== null) {
        nextBgmAudio.pause();
      }
      throw error;
    }

    if (this.bgmAudio !== null) {
      this.bgmAudio.pause();
    }

    this.unlocked = nextUnlocked;
    this.channelVolumes.bgm = nextVolumes.bgm;
    this.channelVolumes.se = nextVolumes.se;
    this.channelVolumes.voice = nextVolumes.voice;
    this.bgmAudio = nextBgmAudio;
  }

  private async playBgm(payload: PlayPayload, requestId?: string): Promise<void> {
    if (this.bgmAudio !== null) {
      this.bgmAudio.pause();
      this.bgmAudio = null;
    }

    const audio = this.audioFactory();
    audio.src = payload.src;
    audio.loop = payload.loop ?? true;
    audio.volume = clampVolume(payload.volume ?? this.channelVolumes.bgm);
    audio.currentTime = payload.seekSec ?? 0;
    await this.playAudio(audio, "play_bgm", requestId);
    this.bgmAudio = audio;
  }

  private async playOneShot(
    channel: "se" | "voice",
    payload: PlayPayload,
    requestId?: string,
  ): Promise<void> {
    const audio = this.audioFactory();
    audio.src = payload.src;
    audio.loop = false;
    audio.volume = clampVolume(payload.volume ?? this.channelVolumes[channel]);
    audio.currentTime = payload.seekSec ?? 0;
    await this.playAudio(audio, `play_${channel}`, requestId);
  }

  private async playAudio(audio: AudioLike, action: string, requestId?: string): Promise<void> {
    try {
      await audio.play();
    } catch (cause) {
      if (isUnlockError(cause)) {
        throw new AudioError(
          "ERR_AUDIO_UNLOCK_REQUIRED",
          `${action} blocked by autoplay policy${requestId ? ` (requestId=${requestId})` : ""}`,
          { cause },
        );
      }
      throw new AudioError(
        "ERR_AUDIO_LOAD_FAILED",
        `${action} failed${requestId ? ` (requestId=${requestId})` : ""}`,
        { cause },
      );
    }
  }

  private getAudioContext(): AudioContextLike | null {
    if (this.audioContext !== undefined) {
      return this.audioContext;
    }
    this.audioContext = this.audioContextFactory();
    return this.audioContext;
  }
}

function validatePlayPayload(value: unknown): PlayPayload {
  if (typeof value !== "object" || value === null) {
    throw new AudioError("ERR_AUDIO_INVALID_PAYLOAD", "payload must be an object");
  }

  const src = (value as Record<string, unknown>).src;
  const volume = (value as Record<string, unknown>).volume;
  const loop = (value as Record<string, unknown>).loop;
  const seekSec = (value as Record<string, unknown>).seekSec;

  if (typeof src !== "string" || src.trim().length === 0) {
    throw new AudioError("ERR_AUDIO_INVALID_PAYLOAD", "payload.src must be a non-empty string");
  }
  if (volume !== undefined && (typeof volume !== "number" || !Number.isFinite(volume))) {
    throw new AudioError("ERR_AUDIO_INVALID_PAYLOAD", "payload.volume must be a finite number");
  }
  if (loop !== undefined && typeof loop !== "boolean") {
    throw new AudioError("ERR_AUDIO_INVALID_PAYLOAD", "payload.loop must be a boolean");
  }
  if (seekSec !== undefined && (typeof seekSec !== "number" || !Number.isFinite(seekSec))) {
    throw new AudioError("ERR_AUDIO_INVALID_PAYLOAD", "payload.seekSec must be a finite number");
  }

  return {
    src,
    volume,
    loop,
    seekSec,
  };
}

function validateSnapshotState(value: unknown): StandardAudioSnapshotState {
  if (typeof value !== "object" || value === null) {
    throw new AudioError("ERR_AUDIO_INVALID_PAYLOAD", "audio snapshot state must be an object");
  }
  const record = value as Record<string, unknown>;
  const unlocked = record.unlocked;
  const volumes = record.volumes;
  const bgm = record.bgm;

  if (typeof unlocked !== "boolean") {
    throw new AudioError("ERR_AUDIO_INVALID_PAYLOAD", "audio snapshot unlocked flag is invalid");
  }
  if (typeof volumes !== "object" || volumes === null) {
    throw new AudioError("ERR_AUDIO_INVALID_PAYLOAD", "audio snapshot volumes are invalid");
  }

  const bgmVol = (volumes as Record<string, unknown>).bgm;
  const seVol = (volumes as Record<string, unknown>).se;
  const voiceVol = (volumes as Record<string, unknown>).voice;
  if (
    typeof bgmVol !== "number" || !Number.isFinite(bgmVol) ||
    typeof seVol !== "number" || !Number.isFinite(seVol) ||
    typeof voiceVol !== "number" || !Number.isFinite(voiceVol)
  ) {
    throw new AudioError("ERR_AUDIO_INVALID_PAYLOAD", "audio snapshot channel volume is invalid");
  }

  if (bgm === null) {
    return {
      unlocked,
      volumes: {
        bgm: clampVolume(bgmVol),
        se: clampVolume(seVol),
        voice: clampVolume(voiceVol),
      },
      bgm: null,
    };
  }

  if (typeof bgm !== "object") {
    throw new AudioError("ERR_AUDIO_INVALID_PAYLOAD", "audio snapshot bgm is invalid");
  }

  const bgmRecord = bgm as Record<string, unknown>;
  if (
    typeof bgmRecord.src !== "string" || bgmRecord.src.length === 0 ||
    typeof bgmRecord.currentTime !== "number" || !Number.isFinite(bgmRecord.currentTime) ||
    typeof bgmRecord.volume !== "number" || !Number.isFinite(bgmRecord.volume) ||
    typeof bgmRecord.loop !== "boolean" ||
    typeof bgmRecord.paused !== "boolean"
  ) {
    throw new AudioError("ERR_AUDIO_INVALID_PAYLOAD", "audio snapshot bgm fields are invalid");
  }

  return {
    unlocked,
    volumes: {
      bgm: clampVolume(bgmVol),
      se: clampVolume(seVol),
      voice: clampVolume(voiceVol),
    },
    bgm: {
      src: bgmRecord.src,
      currentTime: bgmRecord.currentTime,
      volume: clampVolume(bgmRecord.volume),
      loop: bgmRecord.loop,
      paused: bgmRecord.paused,
    },
  };
}

function clampVolume(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function isUnlockError(cause: unknown): boolean {
  if (!(cause instanceof Error)) {
    return false;
  }
  return cause.name === "NotAllowedError";
}

function defaultAudioFactory(): AudioLike {
  if (typeof Audio === "undefined") {
    throw new AudioError("ERR_AUDIO_LOAD_FAILED", "Audio API is unavailable in this runtime");
  }
  return new Audio();
}

function defaultAudioContextFactory(): AudioContextLike | null {
  if (typeof globalThis.AudioContext === "function") {
    return new globalThis.AudioContext();
  }

  const webkitAudioContext = (globalThis as unknown as {
    webkitAudioContext?: new () => AudioContextLike;
  }).webkitAudioContext;
  if (typeof webkitAudioContext === "function") {
    return new webkitAudioContext();
  }

  return null;
}
