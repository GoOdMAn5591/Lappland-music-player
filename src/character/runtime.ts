import type { PointerPosition } from "./portrait";

export interface CharacterRuntime {
  mount(options: {
    host: HTMLElement;
    files: File[];
    model: File;
    pointer: { current: PointerPosition };
    signal: AbortSignal;
    onError: (error: Error) => void;
  }): Promise<{ dispose(): void }>;
}

// A future Cubism adapter can register here. The portrait stays mounted until
// the adapter has successfully rendered; no model or SDK is fetched implicitly.
let runtime: CharacterRuntime | undefined;
export function registerCharacterRuntime(adapter: CharacterRuntime) {
  runtime = adapter;
}
export function getCharacterRuntime() {
  return runtime;
}
