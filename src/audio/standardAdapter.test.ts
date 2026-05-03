/// <reference lib="deno.ns" />

import { assertEquals } from "jsr:@std/assert";
import { StandardAudioAdapter } from "./standardAdapter.ts";
import type { AdapterAudioState } from "./types.ts";

class FakeAudio {
  src = "";
  loop = false;
  volume = 1;
  currentTime = 0;
  paused = true;
  playCalls = 0;
  pauseCalls = 0;

  play(): Promise<void> {
    this.playCalls += 1;
    this.paused = false;
    return Promise.resolve();
  }

  pause(): void {
    this.pauseCalls += 1;
    this.paused = true;
  }
}

Deno.test("StandardAudioAdapter: snapshot/restore roundtrip restores bgm state", async () => {
  const createdAudios: FakeAudio[] = [];
  const audioFactory = () => {
    const audio = new FakeAudio();
    createdAudios.push(audio);
    return audio;
  };

  const first = new StandardAudioAdapter({
    audioFactory,
    audioContextFactory: () => null,
  });

  await first.unlock();
  await first.dispatch({
    namespace: "audio",
    action: "play_bgm",
    payload: { src: "bgm/opening.ogg", volume: 0.45, seekSec: 18, loop: true },
    requestId: "req-1",
  });

  const snapshot = first.snapshot();
  const restored = new StandardAudioAdapter({
    audioFactory,
    audioContextFactory: () => null,
  });
  await restored.restore(snapshot);

  const restoredSnapshot = restored.snapshot();
  const originalState = readSnapshotState(snapshot);
  const restoredState = readSnapshotState(restoredSnapshot);

  assertEquals(restoredSnapshot.adapterId, snapshot.adapterId);
  assertEquals(restoredSnapshot.adapterVersion, snapshot.adapterVersion);
  assertEquals(restoredSnapshot.stateSchemaVersion, snapshot.stateSchemaVersion);
  assertEquals(restoredState.unlocked, originalState.unlocked);
  assertEquals(restoredState.volumes, originalState.volumes);
  assertEquals(restoredState.bgm, originalState.bgm);
  assertEquals(createdAudios.length >= 2, true);
});

function readSnapshotState(snapshot: AdapterAudioState) {
  return snapshot.state as {
    unlocked: boolean;
    volumes: Record<"bgm" | "se" | "voice", number>;
    bgm: {
      src: string;
      currentTime: number;
      volume: number;
      loop: boolean;
      paused: boolean;
    } | null;
  };
}
