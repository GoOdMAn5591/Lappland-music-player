import { useSyncExternalStore } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { PlaybackMode } from "../storage";
import type { PlayerState } from "./types";

const initial: PlayerState = {
  sourceType: "local",
  isPlaying: false,
  position: 0,
  duration: 0,
  volume: 0.76,
  queue: [],
  repeatMode: "off",
  shuffle: false,
};
export function createPlayerStore(seed: Partial<PlayerState> = {}) {
  let state: PlayerState = { ...initial, ...seed };
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    patch: (patch: Partial<PlayerState>) => {
      if (
        !Object.entries(patch).some(
          ([key, value]) => state[key as keyof PlayerState] !== value,
        )
      )
        return;
      state = { ...state, ...patch };
      listeners.forEach((listener) => listener());
    },
  };
}
export const playerStore = createPlayerStore();
const setter =
  <K extends keyof PlayerState>(
    key: K,
  ): Dispatch<SetStateAction<PlayerState[K]>> =>
  (value) => {
    const next =
      typeof value === "function"
        ? (value as (v: PlayerState[K]) => PlayerState[K])(
            playerStore.getSnapshot()[key],
          )
        : value;
    playerStore.patch({ [key]: next });
  };
const actions = {
  setCurrentTrackId: setter("currentTrack"),
  setIsPlaying: setter("isPlaying"),
  setProgress: setter("position"),
  setDuration: setter("duration"),
  setVolume: setter("volume"),
};
export const setPlaybackMode = (mode: PlaybackMode) =>
  playerStore.patch({
    shuffle: mode === "shuffle",
    repeatMode:
      mode === "repeat-one" ? "one" : mode === "repeat-all" ? "all" : "off",
  });
export function usePlayerStore() {
  const state = useSyncExternalStore(
    playerStore.subscribe,
    playerStore.getSnapshot,
  );
  const playbackMode: PlaybackMode = state.shuffle
    ? "shuffle"
    : state.repeatMode === "one"
      ? "repeat-one"
      : state.repeatMode === "all"
        ? "repeat-all"
        : "sequence";
  return {
    ...state,
    ...actions,
    currentTrackId: state.currentTrack,
    progress: state.position,
    playbackMode,
    setPlaybackMode,
  };
}
