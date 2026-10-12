import { useSyncExternalStore } from "react";

/**
 * 性能模式 / performance mode: for weak PCs, or leaving the bar running while
 * gaming. The 3D bar renders at low quality and ~20 fps, and goes fully to
 * sleep (no frames at all) whenever the browser window isn't focused. Music
 * and Listen Together keep running.
 */
const KEY = "tavern-power";
const listeners = new Set<() => void>();

let saver = (() => {
  try {
    return localStorage.getItem(KEY) === "saver";
  } catch {
    return false;
  }
})();

export const isPowerSaver = () => saver;

export function setPowerSaver(on: boolean) {
  if (on === saver) return;
  saver = on;
  try {
    localStorage.setItem(KEY, on ? "saver" : "normal");
  } catch {
    /* lasts this session */
  }
  listeners.forEach((listener) => listener());
}

export function usePowerSaver() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    isPowerSaver,
    isPowerSaver,
  );
}
