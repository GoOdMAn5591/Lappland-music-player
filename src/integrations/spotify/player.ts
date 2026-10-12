import { useSyncExternalStore } from "react";
import { getAccessToken, isSignedIn } from "./auth";
import { quietDevice, SpotifyApiError, startOnDevice } from "./api";

/**
 * The tavern's own Spotify Connect device (Web Playback SDK).
 *
 * Spotify streams straight to this browser tab under the listener's own
 * Premium account; the tavern never sees or keeps the audio. It only says
 * which song to play and where, and watches the player's state to know where
 * the song is and when it has finished.
 */

interface SdkTrack {
  uri: string;
  id?: string | null;
  linked_from?: { uri?: string | null } | null;
}
interface SdkState {
  paused: boolean;
  position: number;
  duration: number;
  loading?: boolean;
  track_window: {
    current_track: SdkTrack | null;
    previous_tracks?: SdkTrack[];
  };
}
interface SdkPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  addListener(event: string, callback: (data: never) => void): boolean;
  getCurrentState(): Promise<SdkState | null>;
  setVolume(volume: number): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  activateElement?(): Promise<void>;
}
declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void;
    Spotify?: {
      Player: new (options: {
        name: string;
        getOAuthToken: (callback: (token: string) => void) => void;
        volume?: number;
      }) => SdkPlayer;
    };
  }
}

export const SDK_URL = "https://sdk.scdn.co/spotify-player.js";

let sdk: Promise<void> | undefined;
function loadSdk() {
  if (window.Spotify?.Player) return Promise.resolve();
  sdk ??= new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => fail(), 25_000);
    const fail = () => {
      window.clearTimeout(timer);
      sdk = undefined;
      reject(new Error("sdk"));
    };
    window.onSpotifyWebPlaybackSDKReady = () => {
      window.clearTimeout(timer);
      resolve();
    };
    const script = document.createElement("script");
    script.src = SDK_URL;
    script.async = true;
    script.onerror = () => {
      script.remove();
      fail();
    };
    document.head.appendChild(script);
  });
  return sdk;
}

export type EngineStatus = "off" | "loading" | "ready" | "error";
/**
 * premium: not a Premium account · not-registered: not on the app's user
 * list · auth: sign-in no longer valid · unsupported: this browser can't play
 * protected audio · sdk: Spotify's player didn't load (offline, blocked by an
 * extension) · device: Spotify couldn't find this tab's player.
 */
export type EngineProblem = "premium" | "not-registered" | "auth" | "unsupported" | "sdk" | "device";
type EngineEvent = "started" | "seeked" | "ended" | "lost";
type EventInfo = { uri: string; latency?: number };

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

class SpotifyEngine {
  status: EngineStatus = "off";
  problem?: EngineProblem;
  deviceId = "";
  /** The browser wants a click before Spotify may make sound. */
  needsGesture = false;
  /** The song the tavern asked for (empty when Spotify is idle). */
  uri = "";
  playing = false;
  /**
   * Spotify was paused or taken away from outside the tavern (the listener's
   * phone, another app on the same account). Don't grab it back on our own.
   */
  held = false;
  durationMs = 0;
  version = 0;

  private player?: SdkPlayer;
  private booting?: Promise<boolean>;
  private waiters: ((ok: boolean) => void)[] = [];
  private positionMs = 0;
  private stamp = 0;
  private playId = 0;
  private startedFor = -1;
  private endedFor = -1;
  private furthestMs = 0;
  private requestedAt = 0;
  private quieted = "";
  private volume = 0.76;
  private watch?: number;
  private lastPoll = 0;
  private pausedByUs = false;
  private failedFor = -1;
  private listeners = new Set<() => void>();
  private handlers = new Map<EngineEvent, Set<(info: EventInfo) => void>>();

  // ------------------------------------------------------------- observers
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

  /** Seconds into the current song, moving with the clock while it plays. */
  position() {
    return this.currentMs() / 1000;
  }
  private currentMs() {
    if (!this.playing) return this.positionMs;
    const now = this.positionMs + (performance.now() - this.stamp);
    return this.durationMs > 0 ? Math.min(this.durationMs, now) : now;
  }
  isOn(uri: string) {
    return Boolean(uri) && this.uri === uri;
  }
  /** A play request is out and the song hasn't started yet. */
  get starting() {
    return (
      Boolean(this.uri) &&
      this.startedFor !== this.playId &&
      this.failedFor !== this.playId &&
      this.status !== "error" &&
      performance.now() - this.requestedAt < 10_000
    );
  }
  /** The current song played to its end. */
  get finished() {
    return Boolean(this.uri) && this.endedFor === this.playId;
  }

  // ---------------------------------------------------------------- set-up
  /** Load Spotify's player and register this tab as a device. */
  ensure(): Promise<boolean> {
    if (this.status === "ready" && this.deviceId) return Promise.resolve(true);
    if (!isSignedIn()) return Promise.resolve(false);
    if (this.status === "error" && this.problem !== "device" && this.problem !== "sdk")
      return Promise.resolve(false);
    this.booting ??= this.boot().finally(() => {
      this.booting = undefined;
    });
    return this.booting;
  }

  private async boot() {
    if (!window.isSecureContext || !("requestMediaKeySystemAccess" in navigator)) {
      this.fail("unsupported");
      return false;
    }
    this.status = "loading";
    this.problem = undefined;
    this.emit();
    try {
      await loadSdk();
    } catch {
      this.fail("sdk");
      return false;
    }
    if (!this.player) this.player = this.createPlayer();
    const ready = new Promise<boolean>((resolve) => {
      this.waiters.push(resolve);
      window.setTimeout(() => resolve(false), 20_000);
    });
    const connected = await this.player.connect().catch(() => false);
    if (!connected) {
      this.fail("sdk");
      return false;
    }
    const ok = await ready;
    const status = this.status as EngineStatus; // may have changed while waiting
    if (!ok && status === "loading") this.fail("sdk");
    return ok && status === "ready";
  }

  private createPlayer() {
    const player = new window.Spotify!.Player({
      name: "无序酒馆 · Lappland Tavern",
      getOAuthToken: (callback) => {
        getAccessToken().then(callback, () => {
          this.fail("auth");
          callback("");
        });
      },
      volume: this.volume,
    });
    const listen = <T>(event: string, callback: (data: T) => void) =>
      player.addListener(event, callback as (data: never) => void);
    listen<{ device_id: string }>("ready", ({ device_id }) => {
      this.deviceId = device_id;
      this.status = "ready";
      this.problem = undefined;
      this.settle(true);
      this.emit();
    });
    listen("not_ready", () => {
      // the SDK reconnects by itself; until then Spotify can't reach this tab
      this.deviceId = "";
      if (this.status === "ready") this.status = "loading";
      this.emit();
    });
    listen("initialization_error", () => this.fail("unsupported"));
    listen("authentication_error", () => this.fail("auth"));
    listen("account_error", () => this.fail("premium"));
    listen("autoplay_failed", () => {
      this.needsGesture = true;
      this.emit();
    });
    listen<SdkState | null>("player_state_changed", (state) => this.onState(state));
    return player;
  }

  private settle(ok: boolean) {
    const waiters = this.waiters;
    this.waiters = [];
    waiters.forEach((resolve) => resolve(ok));
  }

  private fail(problem: EngineProblem) {
    this.status = "error";
    this.problem = problem;
    this.playing = false;
    this.settle(false);
    this.emit();
  }

  /**
   * Take the song back after Spotify moved to another device: forget the
   * current request, so the next play() transfers playback to this tab.
   */
  retake() {
    this.activate();
    this.held = false;
    this.uri = "";
    this.playing = false;
    this.playId++;
    this.emit();
  }

  /** Call from a click: lets the browser start Spotify's sound later. */
  activate() {
    if (this.needsGesture) {
      this.needsGesture = false;
      this.emit();
    }
    void this.player?.activateElement?.().catch(() => {});
  }

  /** Forget the device (sign-out, or "try again"). */
  disconnect() {
    window.clearInterval(this.watch);
    this.player?.disconnect();
    this.player = undefined;
    this.deviceId = "";
    this.status = "off";
    this.problem = undefined;
    this.uri = "";
    this.playing = false;
    this.quieted = "";
    this.settle(false);
    this.emit();
  }

  // -------------------------------------------------------------- playback
  /**
   * Start a song on this tab. `from` is in ms, or a function asked at the
   * last moment (loading the player the first time takes a while).
   */
  async play(uri: string, from: number | (() => number) = 0): Promise<boolean> {
    const ok = await this.request(uri, from);
    if (!ok && this.uri === uri) {
      this.failedFor = this.playId;
      this.emit();
    }
    return ok;
  }

  private async request(uri: string, from: number | (() => number)): Promise<boolean> {
    const id = ++this.playId;
    const at = () => Math.max(0, typeof from === "function" ? from() : from);
    this.uri = uri;
    this.playing = false;
    this.pausedByUs = false;
    this.held = false;
    this.positionMs = at();
    this.stamp = performance.now();
    this.furthestMs = this.positionMs;
    this.durationMs = 0;
    this.requestedAt = performance.now();
    this.emit();
    if (!(await this.ensure()) || id !== this.playId) return false;
    const attempt = () => {
      this.positionMs = at();
      this.stamp = this.requestedAt = performance.now();
      return startOnDevice(this.deviceId, uri, this.positionMs);
    };
    try {
      await attempt();
    } catch (error) {
      if (id !== this.playId) return false;
      if (!(error instanceof SpotifyApiError)) return false;
      if (error.premiumRequired) return this.fail("premium"), false;
      if (error.notRegistered) return this.fail("not-registered"), false;
      if (error.status !== 404) return false;
      // a fresh device can take a moment before Spotify's servers know it
      await sleep(1500);
      if (id !== this.playId) return false;
      try {
        await attempt();
      } catch {
        if (id === this.playId) this.fail("device");
        return false;
      }
    }
    if (id !== this.playId) return false;
    if (this.quieted !== this.deviceId) {
      this.quieted = this.deviceId;
      void quietDevice(this.deviceId);
    }
    this.startWatch();
    return true;
  }

  async pause() {
    if (!this.uri) return;
    this.pausedByUs = true;
    this.positionMs = this.currentMs();
    this.stamp = performance.now();
    this.playing = false;
    this.emit();
    await this.player?.pause().catch(() => {});
  }

  async resume() {
    if (!this.player || !this.uri) return false;
    this.pausedByUs = false;
    this.held = false;
    await this.player.resume().catch(() => {});
    return true;
  }

  /** Stop and forget the song (the bar moved on to a local glass). */
  async stop() {
    if (!this.uri) return;
    const wasPlaying = this.playing;
    this.uri = "";
    this.playing = false;
    this.playId++;
    window.clearInterval(this.watch);
    this.emit();
    if (wasPlaying || this.player) await this.player?.pause().catch(() => {});
  }

  async seek(seconds: number) {
    if (!this.player || !this.uri || !Number.isFinite(seconds)) return;
    const ms = Math.max(0, seconds * 1000);
    this.positionMs = ms;
    this.stamp = performance.now();
    this.furthestMs = ms;
    this.emit();
    await this.player.seek(ms).catch(() => {});
    this.fire("seeked", { uri: this.uri });
  }

  setVolume(volume: number) {
    if (!Number.isFinite(volume)) return;
    this.volume = Math.min(1, Math.max(0, volume));
    void this.player?.setVolume(this.volume).catch(() => {});
  }

  // ----------------------------------------------------------- what plays
  private sameTrack(track?: SdkTrack | null) {
    return Boolean(track && this.uri && (track.uri === this.uri || track.linked_from?.uri === this.uri));
  }

  private onState(state: SdkState | null) {
    const now = performance.now();
    if (!state) {
      // playback moved to another device (the listener's phone, say)
      if (this.playing) {
        this.positionMs = this.currentMs();
        this.stamp = now;
        this.playing = false;
        this.held = true;
        this.fire("lost", { uri: this.uri });
      }
      this.emit();
      return;
    }
    const current = state.track_window?.current_track;
    const matches = this.sameTrack(current);
    const id = this.playId;
    if (this.uri && this.startedFor === id && this.endedFor !== id && !this.pausedByUs) {
      const nearEnd = this.durationMs > 0 && this.furthestMs > this.durationMs - 4000;
      // Spotify's own autoplay picked another song after ours finished
      const movedOn = Boolean(current) && !matches && !state.loading;
      const stopped =
        matches &&
        state.paused &&
        ((state.position === 0 &&
          (nearEnd ||
            Boolean(state.track_window.previous_tracks?.some((t) => this.sameTrack(t))))) ||
          (this.durationMs > 0 && state.position >= this.durationMs - 1200));
      if (movedOn || stopped) {
        this.finish(id, movedOn);
        return;
      }
    }
    if (!matches) {
      this.emit();
      return;
    }
    const wasPlaying = this.playing;
    this.positionMs = state.position;
    this.stamp = now;
    if (state.duration) this.durationMs = state.duration;
    this.playing = !state.paused;
    this.furthestMs = Math.max(this.furthestMs, state.position);
    if (this.playing) this.held = false;
    if (this.playing && this.pausedByUs) {
      // paused while the song was still on its way: hold it there
      this.playing = false;
      void this.player?.pause().catch(() => {});
    }
    if (this.playing && this.startedFor !== id) {
      this.startedFor = id;
      this.needsGesture = false;
      this.fire("started", { uri: this.uri, latency: (now - this.requestedAt) / 1000 });
    }
    if (wasPlaying && !this.playing && !this.pausedByUs && !state.loading && this.startedFor === id) {
      // paused from outside the tavern: confirm it wasn't just a hiccup
      window.setTimeout(() => {
        if (id !== this.playId || this.playing || this.pausedByUs || this.endedFor === id) return;
        this.held = true;
        this.emit();
        this.fire("lost", { uri: this.uri });
      }, 1200);
    }
    this.emit();
  }

  private finish(id: number, silence: boolean) {
    if (this.endedFor === id) return;
    this.endedFor = id;
    this.playing = false;
    this.positionMs = this.durationMs;
    this.stamp = performance.now();
    if (silence) void this.player?.pause().catch(() => {});
    this.emit();
    this.fire("ended", { uri: this.uri });
  }

  /** Spotify only reports changes; poll now and then to stay honest. */
  private startWatch() {
    window.clearInterval(this.watch);
    this.watch = window.setInterval(() => {
      if (!this.uri || !this.player) return;
      const id = this.playId;
      if (this.playing) this.furthestMs = Math.max(this.furthestMs, this.currentMs());
      const now = performance.now();
      const overdue =
        this.playing && this.durationMs > 0 && this.positionMs + (now - this.stamp) > this.durationMs + 2500;
      if (!overdue && now - this.lastPoll < 3000) return;
      this.lastPoll = now;
      void this.player.getCurrentState().then((state) => {
        if (id !== this.playId) return;
        if (overdue && (!state || !this.sameTrack(state.track_window?.current_track) || state.paused)) {
          if (this.startedFor === id) this.finish(id, Boolean(state && !state.paused));
          return;
        }
        if (state) this.onState(state);
      });
    }, 1000);
  }
}

export const spotifyEngine = new SpotifyEngine();
export type { SpotifyEngine };

/** Re-render when the Spotify player changes state. */
export function useSpotifyEngine() {
  useSyncExternalStore(spotifyEngine.subscribe, spotifyEngine.getVersion);
  return spotifyEngine;
}
