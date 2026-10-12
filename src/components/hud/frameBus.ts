import type { FrameInfo } from "../../scene3d/TavernScene";

export type FrameListener = (info: FrameInfo) => void;

/**
 * The 3D scene reports projected positions every frame (bar lip, glasses).
 * HUD pieces subscribe and update their DOM imperatively so React does not
 * re-render 60 times a second.
 */
export function createFrameBus() {
  const listeners = new Set<FrameListener>();
  let last: FrameInfo | undefined;
  return {
    emit(info: FrameInfo) {
      last = info;
      listeners.forEach((listener) => listener(info));
    },
    subscribe(listener: FrameListener) {
      listeners.add(listener);
      if (last) listener(last);
      return () => {
        listeners.delete(listener);
      };
    },
    get last() {
      return last;
    },
  };
}

export type FrameBus = ReturnType<typeof createFrameBus>;
