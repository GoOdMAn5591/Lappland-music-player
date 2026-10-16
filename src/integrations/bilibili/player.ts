import { useSyncExternalStore } from "react";
import { bilibiliEmbedUrl } from "./catalog";

/**
 * The tavern's Bilibili screen. Bilibili's embedded player (player.bilibili.com)
 * can only be told where to start when it loads: it has no remote control and
 * says nothing back (no position, no "ended"). So:
 *  - every start, jump and pause is a fresh load at the right second;
 *  - where the video is, is worked out from when it loaded (plus the moment
 *    the player takes to begin) and the video's length (from Bilibili's info);
 *  - the end of a video is that length running out.
 * The screen covers the player with a clear shield so the bar's own buttons
 * stay in charge (a pause inside the player would go unnoticed); the
 * listener can lift it to use Bilibili's own controls.
 */

type EngineEvent = "started" | "seeked" | "ended" | "error";
type EventInfo = { key: string; latency?: number };

/**
 * From the iframe's load to the first sound, about (s). Measured against the
 * real player: 1.1–2.3 s on a warm connection, now and then much longer.
 */
const BOOT_S = 1.7;
/**
 * Bilibili gives lengths in whole seconds and the video often runs a little
 * past it: wait this much more before calling it the end (s).
 */
const END_GRACE_S = 0.5;
/** No load after this long: give up on this video (ms). */
const LOAD_TIMEOUT_MS = 30_000;

export const bilibiliKey = (bvid: string, p: number) => `${bvid}-${p}`;

class BilibiliEngine {
  /** The part on the screen (empty when idle). */
  key = "";
  bvid = "";
  p = 1;
  title = "";
  /** Length of the part (s); 0 if Bilibili didn't say. */
  durationS = 0;
  /** What the iframe shows now (changes on every start / jump / pause). */
  src = "";
  /** Bumped with every new load; the screen remounts the iframe on it. */
  nonce = 0;
  /** Meant to be playing. */
  wantPlaying = false;
  /** The screen's shield is lifted: Bilibili's own controls are in use. */
  unlocked = false;
  /** Learned on this computer: how long Bilibili's player page takes to load (s). */
  loadS = 2.5;
  readonly bootS = BOOT_S;
  version = 0;

  private base = 0;
  /** When the video was at `base` and moving (performance clock; 0 = not yet). */
  private clockAt = 0;
  private requestedAt = 0;
  private playId = 0;
  private startedFor = -1;
  private endedFor = -1;
  private failedFor = -1;
  private watch?: number;
  private listeners = new Set<() => void>();
  private handlers = new Map<EngineEvent, Set<(info: EventInfo) => void>>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getVersion = () => this.version;
  private emit() {
    this.version++;
    this.listeners.forEach((listener) => listener());
  }
  on(event: EngineEvent, handler: (info: EventInfo) => void) {
    let set = this.handlers.get(event);
    if (!set) this.handlers.set(event, (set = new Set()));
    set.add(handler);
    return () => {
      set!.delete(handler);
    };
  }
  private fire(event: EngineEvent, info: EventInfo) {
    this.handlers.get(event)?.forEach((handler) => handler(info));
  }

  isOn(key: string) {
    return Boolean(key) && this.key === key;
  }
  /** Loading (or about to begin) after a start / jump. */
  get starting() {
    return Boolean(this.key) && this.wantPlaying && (!this.clockAt || performance.now() < this.clockAt) && this.failedFor !== this.playId;
  }
  get finished() {
    return Boolean(this.key) && this.endedFor === this.playId;
  }
  /** Playing for real now (sound expected). */
  get rolling() {
    return (
      Boolean(this.key) &&
      this.wantPlaying &&
      this.clockAt > 0 &&
      performance.now() >= this.clockAt &&
      this.endedFor !== this.playId &&
      this.failedFor !== this.playId
    );
  }
  get started() {
    return Boolean(this.key) && this.startedFor === this.playId;
  }

  /** Seconds into the part. */
  position() {
    if (!this.key) return 0;
    if (!this.wantPlaying || !this.clockAt) return this.base;
    const moved = Math.max(0, performance.now() - this.clockAt) / 1000;
    const end = this.durationS > 0 ? this.durationS : Infinity;
    return Math.min(end, this.base + moved);
  }

  /** Start a part here. `from` is in seconds, or asked at the last moment. */
  play(bvid: string, p: number, from: number | (() => number), meta: { duration?: number; title?: string } = {}) {
    this.playId++;
    this.key = bilibiliKey(bvid, p);
    this.bvid = bvid;
    this.p = p;
    this.durationS = meta.duration && meta.duration > 0 ? meta.duration : 0;
    this.title = meta.title ?? "";
    this.load(Math.max(0, typeof from === "function" ? from() : from), true);
  }

  /** Begin again from wherever (e.g. after a pause, at the room's second). */
  resume(from?: number | (() => number)) {
    if (!this.key) return;
    const at = from === undefined ? this.base : typeof from === "function" ? from() : from;
    this.endedFor = -1;
    this.load(Math.max(0, at), true);
  }

  pause() {
    if (!this.key || !this.wantPlaying) return;
    this.load(this.position(), false);
  }

  seek(seconds: number) {
    if (!this.key || !Number.isFinite(seconds)) return;
    const end = this.durationS > 0 ? Math.max(0, this.durationS - 1) : Infinity;
    this.endedFor = -1;
    this.load(Math.min(end, Math.max(0, seconds)), this.wantPlaying);
    this.fire("seeked", { key: this.key });
  }

  /** Forget the video (the bar moved on to another source). */
  stop() {
    if (!this.key) return;
    this.key = "";
    this.src = "";
    this.wantPlaying = false;
    this.clockAt = 0;
    this.unlocked = false;
    this.playId++;
    window.clearInterval(this.watch);
    this.emit();
  }

  /** Lift / lower the shield over Bilibili's own controls. */
  setUnlocked(unlocked: boolean) {
    if (this.unlocked === unlocked) return;
    this.unlocked = unlocked;
    this.emit();
  }

  private load(at: number, playing: boolean) {
    this.base = at;
    this.wantPlaying = playing;
    this.clockAt = 0;
    this.requestedAt = performance.now();
    this.nonce++;
    this.src = bilibiliEmbedUrl(this.bvid, this.p, at, playing, this.nonce);
    this.startWatch();
    this.emit();
  }

  /** The screen's iframe finished loading (`nonce` says which load). */
  loaded(nonce: number) {
    if (!this.key || nonce !== this.nonce) return;
    const now = performance.now();
    const took = (now - this.requestedAt) / 1000;
    // what this computer's connection to Bilibili is like (ignore odd ones)
    if (took > 0.2 && took < 15) this.loadS = this.loadS * 0.5 + took * 0.5;
    if (!this.wantPlaying) {
      this.emit();
      return;
    }
    this.clockAt = now + BOOT_S * 1000;
    const id = this.playId;
    window.setTimeout(() => {
      if (id !== this.playId || nonce !== this.nonce || !this.wantPlaying) return;
      const first = this.startedFor !== id;
      this.startedFor = id;
      this.emit();
      this.fire(first ? "started" : "seeked", { key: this.key, latency: took + BOOT_S });
    }, BOOT_S * 1000);
    this.emit();
  }

  private startWatch() {
    window.clearInterval(this.watch);
    const id = this.playId;
    this.watch = window.setInterval(() => {
      if (id !== this.playId || !this.key) return;
      const now = performance.now();
      if (!this.clockAt && this.wantPlaying && now - this.requestedAt > LOAD_TIMEOUT_MS && this.failedFor !== id) {
        this.failedFor = id;
        this.emit();
        this.fire("error", { key: this.key });
        return;
      }
      if (
        this.rolling &&
        this.durationS > 0 &&
        this.base + (now - this.clockAt) / 1000 >= this.durationS + END_GRACE_S &&
        this.endedFor !== id
      ) {
        this.endedFor = id;
        this.wantPlaying = false;
        this.base = this.durationS;
        this.clockAt = 0;
        this.emit();
        this.fire("ended", { key: this.key });
      }
    }, 250);
  }
}

export const bilibiliEngine = new BilibiliEngine();
export type { BilibiliEngine };

export function useBilibiliEngine() {
  useSyncExternalStore(bilibiliEngine.subscribe, bilibiliEngine.getVersion);
  return bilibiliEngine;
}
