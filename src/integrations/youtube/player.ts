import { useSyncExternalStore } from "react";

/**
 * The tavern's YouTube screen (IFrame Player API).
 *
 * Every listener plays the video in their own browser, in a player that is
 * always visible while it plays (YouTube forbids hidden / background players,
 * overlays on the player and anything below 200 × 200 px). The tavern only
 * tells it which video and where; ads, controls and branding are YouTube's.
 */

interface YTPlayer {
  loadVideoById(options: { videoId: string; startSeconds?: number }): void;
  cueVideoById(options: { videoId: string; startSeconds?: number }): void;
  cuePlaylist(options: { list: string; listType?: string; index?: number }): void;
  getPlaylist(): string[] | null;
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setVolume(volume: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  getVideoData?(): { video_id?: string; title?: string; author?: string };
  destroy(): void;
}
interface YTPlayerOptions {
  width?: number | string;
  height?: number | string;
  videoId?: string;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: (event: { target: YTPlayer }) => void;
    onStateChange?: (event: { data: number; target: YTPlayer }) => void;
    onError?: (event: { data: number; target: YTPlayer }) => void;
  };
}
declare global {
  interface Window {
    YT?: { Player: new (element: HTMLElement, options: YTPlayerOptions) => YTPlayer };
    onYouTubeIframeAPIReady?: () => void;
  }
}
export type { YTPlayer };

export const YT_API_URL = "https://www.youtube.com/iframe_api";
const STATE = { unstarted: -1, ended: 0, playing: 1, paused: 2, buffering: 3, cued: 5 } as const;

let api: Promise<void> | undefined;
/** Load YouTube's player API once (only when a YouTube song is wanted). */
export function loadYouTubeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  api ??= new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      api = undefined;
      reject(new Error("youtube api"));
    }, 25_000);
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      window.clearTimeout(timer);
      previous?.();
      resolve();
    };
    const script = document.createElement("script");
    script.src = YT_API_URL;
    script.async = true;
    script.onerror = () => {
      window.clearTimeout(timer);
      script.remove();
      api = undefined;
      reject(new Error("youtube api"));
    };
    document.head.appendChild(script);
  });
  return api;
}

/** Shared player settings: YouTube's own controls stay on, no related videos from other channels. */
export const PLAYER_VARS = {
  playsinline: 1,
  rel: 0,
  modestbranding: 1,
  enablejsapi: 1,
  origin: typeof location !== "undefined" ? location.origin : "",
};

export type YouTubeProblem = "api" | "blocked" | "missing" | "playback";
type EngineEvent = "started" | "seeked" | "ended" | "error" | "user";
export type YouTubeUserAction = { action: "play" | "pause" | "seek"; position: number };
type EventInfo = {
  id: string;
  latency?: number;
  code?: number;
  user?: YouTubeUserAction;
};

class YouTubeEngine {
  status: "off" | "loading" | "ready" | "error" = "off";
  problem?: YouTubeProblem;
  /** The video the tavern asked for (empty when the screen is idle). */
  videoId = "";
  playing = false;
  /** The browser blocked sound until the listener clicks the screen. */
  needsGesture = false;
  durationS = 0;
  /** When the listener last used YouTube's own controls (ms, performance clock). */
  userAt = -Infinity;
  title = "";
  author = "";
  version = 0;

  private host?: HTMLElement;
  private player?: YTPlayer;
  private booting?: Promise<boolean>;
  private playId = 0;
  private startedFor = -1;
  private endedFor = -1;
  private failedFor = -1;
  private requestedAt = 0;
  private wantPlaying = false;
  private wantChangedAt = 0;
  private lastT = 0;
  private lastStamp = 0;
  private seekAt = -Infinity;
  private seekTo = 0;
  private volume = 76;
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
    if (event === "user") this.userAt = performance.now();
    this.handlers.get(event)?.forEach((handler) => handler(info));
  }

  /** The screen hands over the element the player lives in. */
  attach(element: HTMLElement | null) {
    if (!element || element === this.host) return;
    this.host = element;
  }

  isOn(id: string) {
    return Boolean(id) && this.videoId === id;
  }
  get starting() {
    return (
      Boolean(this.videoId) &&
      this.startedFor !== this.playId &&
      this.failedFor !== this.playId &&
      this.status !== "error" &&
      // a pre-roll ad can hold the video back for a while
      performance.now() - this.requestedAt < 45_000
    );
  }
  get finished() {
    return Boolean(this.videoId) && this.endedFor === this.playId;
  }
  /** Started and meant to be playing (a moment of buffering after a jump still counts). */
  get rolling() {
    return (
      Boolean(this.videoId) &&
      this.startedFor === this.playId &&
      this.endedFor !== this.playId &&
      this.failedFor !== this.playId &&
      this.wantPlaying
    );
  }

  /** Seconds into the video, moving smoothly between the player's own updates. */
  position() {
    const player = this.player;
    if (!player || !this.videoId) return 0;
    let t = 0;
    try {
      t = player.getCurrentTime() || 0;
    } catch {
      return this.lastT;
    }
    const now = performance.now();
    if (t !== this.lastT) {
      this.lastT = t;
      this.lastStamp = now;
    }
    if (!this.playing) return t;
    const ahead = Math.min(1, (now - this.lastStamp) / 1000);
    const end = this.durationS > 0 ? this.durationS : Infinity;
    return Math.min(end, t + ahead);
  }

  // ---------------------------------------------------------------- set-up
  ensure(): Promise<boolean> {
    if (this.player && this.status === "ready") return Promise.resolve(true);
    this.booting ??= this.boot().finally(() => {
      this.booting = undefined;
    });
    return this.booting;
  }

  private async boot() {
    this.status = "loading";
    this.problem = undefined;
    this.emit();
    try {
      await loadYouTubeApi();
    } catch {
      this.status = "error";
      this.problem = "api";
      this.emit();
      return false;
    }
    if (!this.host) {
      // the screen isn't on the page yet: give React a moment to draw it
      for (let i = 0; i < 20 && !this.host; i++) await new Promise((r) => window.setTimeout(r, 50));
      if (!this.host) return false;
    }
    const mount = document.createElement("div");
    this.host.replaceChildren(mount);
    return new Promise<boolean>((resolve) => {
      const timer = window.setTimeout(() => {
        this.status = "error";
        this.problem = "api";
        this.emit();
        resolve(false);
      }, 20_000);
      this.player = new window.YT!.Player(mount, {
        width: "100%",
        height: "100%",
        playerVars: PLAYER_VARS,
        events: {
          onReady: () => {
            window.clearTimeout(timer);
            this.status = "ready";
            this.player?.setVolume(this.volume);
            this.emit();
            resolve(true);
          },
          onStateChange: ({ data }) => this.onState(data),
          onError: ({ data }) => this.onError(data),
        },
      });
    });
  }

  // -------------------------------------------------------------- playback
  /** Start a video here. `from` is in seconds, or asked at the last moment. */
  async play(id: string, from: number | (() => number) = 0): Promise<boolean> {
    const playId = ++this.playId;
    this.videoId = id;
    this.playing = false;
    this.needsGesture = false;
    this.durationS = 0;
    this.title = "";
    this.author = "";
    this.want(true);
    this.requestedAt = performance.now();
    this.emit();
    if (!(await this.ensure()) || playId !== this.playId) {
      if (playId === this.playId) this.failedFor = playId;
      return false;
    }
    const start = Math.max(0, typeof from === "function" ? from() : from);
    this.requestedAt = performance.now();
    this.lastT = start;
    this.lastStamp = this.requestedAt;
    this.player!.loadVideoById({ videoId: id, startSeconds: start });
    this.startWatch();
    return true;
  }

  pause() {
    if (!this.videoId || !this.player) return;
    this.want(false);
    this.position();
    this.playing = false;
    this.emit();
    this.player.pauseVideo();
  }

  resume() {
    if (!this.videoId || !this.player) return;
    this.want(true);
    this.needsGesture = false;
    this.player.playVideo();
  }

  /** Stop and forget the video (the bar moved on to another source). */
  stop() {
    if (!this.videoId) return;
    this.videoId = "";
    this.playing = false;
    this.playId++;
    this.want(false);
    window.clearInterval(this.watch);
    try {
      this.player?.stopVideo();
    } catch {
      /* the player was already gone */
    }
    this.emit();
  }

  seek(seconds: number) {
    if (!this.player || !this.videoId || !Number.isFinite(seconds)) return;
    const target = Math.max(0, seconds);
    this.seekAt = performance.now();
    this.seekTo = target;
    this.lastT = target;
    this.lastStamp = this.seekAt;
    this.player.seekTo(target, true);
    this.emit();
    this.fire("seeked", { id: this.videoId });
  }

  setVolume(volume: number) {
    if (!Number.isFinite(volume)) return;
    this.volume = Math.round(Math.min(1, Math.max(0, volume)) * 100);
    try {
      this.player?.setVolume(this.volume);
    } catch {
      /* not ready yet; applied on ready */
    }
  }

  private want(playing: boolean) {
    this.wantPlaying = playing;
    this.wantChangedAt = performance.now();
  }

  // ----------------------------------------------------------- what plays
  private onState(state: number) {
    const id = this.playId;
    if (!this.videoId) return;
    const now = performance.now();
    const settled = now - this.wantChangedAt > 700;
    if (state === STATE.playing) {
      this.playing = true;
      this.needsGesture = false;
      this.readMeta();
      if (this.startedFor === id) this.poll();
      if (this.startedFor !== id) {
        this.startedFor = id;
        this.fire("started", { id: this.videoId, latency: (now - this.requestedAt) / 1000 });
      } else if (!this.wantPlaying && settled) {
        // the listener pressed play on YouTube's own controls
        this.wantPlaying = true;
        this.fire("user", { id: this.videoId, user: { action: "play", position: this.position() } });
      }
      if (!this.wantPlaying && !settled) {
        // asked to pause while it was still starting: hold it there
        this.player?.pauseVideo();
      }
    } else if (state === STATE.paused) {
      this.playing = false;
      if (this.wantPlaying && settled && this.startedFor === id) {
        // the listener pressed pause on YouTube's own controls
        this.wantPlaying = false;
        this.fire("user", { id: this.videoId, user: { action: "pause", position: this.position() } });
      }
    } else if (state === STATE.ended) {
      this.playing = false;
      if (this.endedFor !== id && this.startedFor === id) {
        this.endedFor = id;
        this.emit();
        this.fire("ended", { id: this.videoId });
        return;
      }
    } else if (state === STATE.buffering) {
      this.playing = false;
    } else if (state === STATE.cued || state === STATE.unstarted) {
      this.playing = false;
    }
    this.emit();
  }

  private readMeta() {
    try {
      const duration = this.player?.getDuration() ?? 0;
      if (duration > 0) this.durationS = duration;
      const data = this.player?.getVideoData?.();
      if (data?.video_id === this.videoId) {
        this.title = data.title ?? "";
        this.author = data.author ?? "";
      }
    } catch {
      /* metadata is optional */
    }
  }

  private onError(code: number) {
    const id = this.videoId;
    if (!id) return;
    this.failedFor = this.playId;
    this.playing = false;
    this.emit();
    this.fire("error", { id, code });
  }

  /** The player only reports changes; watch for jumps made on YouTube's own seek bar. */
  private startWatch() {
    window.clearInterval(this.watch);
    this.jumpPos = -1;
    this.watch = window.setInterval(() => this.poll(), 500);
  }

  private jumpPos = -1;
  private jumpAt = 0;

  /**
   * Look at the player now: notice the listener's own jumps on YouTube's seek
   * bar, and a start the browser blocked. Also called by the room's sync loop
   * right before it corrects anything, so it never undoes the listener's jump.
   */
  poll() {
    const player = this.player;
    if (!player || !this.videoId) return;
    let state = -1;
    try {
      state = player.getPlayerState();
    } catch {
      return;
    }
    const now = performance.now();
    const pos = this.position();
    if (state === STATE.playing && this.startedFor === this.playId) {
      this.readMeta();
      // between two looks the video can move forward by at most the time passed
      const jumped =
        this.jumpPos >= 0 &&
        (pos > this.jumpPos + (now - this.jumpAt) / 1000 + 2 || pos < this.jumpPos - 2);
      // a jump that lands where the tavern itself asked to go is ours
      const ours =
        now - this.seekAt < 4000 && Math.abs(pos - this.seekTo - (now - this.seekAt) / 1000) < 1.5;
      this.jumpPos = pos;
      this.jumpAt = now;
      if (jumped && !ours) {
        this.fire("user", { id: this.videoId, user: { action: "seek", position: pos } });
        this.fire("seeked", { id: this.videoId });
      }
      return;
    }
    // the browser wouldn't start it without a click on the screen
    const stuck =
      this.wantPlaying &&
      this.startedFor !== this.playId &&
      (state === STATE.cued || state === STATE.unstarted) &&
      now - this.requestedAt > 4000;
    if (stuck !== this.needsGesture) {
      this.needsGesture = stuck;
      this.emit();
    }
  }
}

export const youtubeEngine = new YouTubeEngine();
export type { YouTubeEngine };

export function useYouTubeEngine() {
  useSyncExternalStore(youtubeEngine.subscribe, youtubeEngine.getVersion);
  return youtubeEngine;
}
