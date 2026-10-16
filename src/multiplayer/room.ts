import { assetUrl } from "../config";
import { hashText } from "../app/recipes";
import {
  BILIBILI_BVID,
  YOUTUBE_ID,
  isBilibiliTrack,
  isSpotifyTrack,
  isYouTubeTrack,
  type PlaybackMode,
  type TavernPlaylist,
  type TavernTrack,
} from "../storage";
import { toYouTubeTrack } from "../integrations/youtube/catalog";
import { toBilibiliTrack } from "../integrations/bilibili/catalog";

/**
 * 同席 (listening room) client.
 *
 * The host's own computer runs server/tavern-server.mjs. Guests reach it through a
 * Cloudflare quick tunnel with the room key from the invite link. The server
 * relays the current song's audio, fans out the host's playback snapshots over
 * Server-Sent Events and forwards everyone's commands to the host, whose player
 * stays the single source of truth.
 *
 * Spotify songs, YouTube and Bilibili videos are the exception: they are never
 * relayed. The room only shares which song and where; every friend plays it in
 * their own browser (Spotify with their own account, the videos in their own
 * screen).
 */

export type RoomRole = "host" | "guest";

export interface RoomMember {
  id: string;
  name: string;
  role: RoomRole;
}

export interface RoomSnapshot {
  rev: number;
  trackId?: string;
  isPlaying: boolean;
  /** Seconds into the track at `at`. */
  position: number;
  duration: number;
  mode: PlaybackMode;
  /** Who caused this change (a guest's name for their commands). */
  by?: string;
  byId?: string;
  reason?: string;
  /** Server clock, ms. */
  at: number;
}

/** Track metadata the host shares; no file names or local paths. */
export interface RoomTrack {
  id: string;
  title: string;
  alias: string;
  artist: string;
  album: string;
  duration: number;
  tags: string[];
  glass?: string;
  tint?: string;
  mimeType: string;
  available: boolean;
  hasCover: boolean;
  addedAt: number;
  /** Seed of the glass look, so everyone sees the same drink as the host. */
  look?: number;
  /** A Spotify song: each listener plays it from their own account. */
  spotify?: { uri: string; url: string; cover?: string };
  /** A YouTube video: each listener plays it in their own YouTube screen. */
  youtube?: { id: string; blocked?: boolean };
  /** A Bilibili video part: each listener plays it in their own Bilibili screen. */
  bilibili?: { bvid: string; p: number; cover?: string; blocked?: boolean };
}

export interface RoomLibrary {
  tracks: RoomTrack[];
  playlists: TavernPlaylist[];
  selectedPlaylistId: string;
  /** The host's Spotify app (a public ID, never a secret) for friends to sign in with. */
  spotifyClientId?: string;
}

export type RoomCommand =
  | { type: "play"; trackId: string }
  | { type: "toggle" }
  | { type: "next" }
  | { type: "prev" }
  | { type: "seek"; position: number }
  | { type: "mode"; mode: PlaybackMode };

export type IncomingCommand = RoomCommand & { by: string; byId: string };

export interface TunnelInfo {
  status: "off" | "downloading" | "starting" | "ready" | "missing" | "error";
  url: string;
  error: string;
  progress: number;
  invite?: string;
}

export interface RoomInfo {
  server: "tavern";
  open: boolean;
  local: boolean;
  keyOk: boolean;
  hostName?: string;
  members?: number;
  tunnel?: TunnelInfo;
  invite?: string;
}

export interface RoomNotice {
  text: string;
  name?: string;
  kind: "join" | "leave" | "host" | "info" | "action";
  at: number;
}

export const roomUrl = (path: string) => assetUrl(`room/${path}`);

/** The invite key from `?room=…`, if this page was opened from an invite link. */
export function inviteKeyFromLocation(): string | undefined {
  const key = new URLSearchParams(location.search).get("room") ?? "";
  return /^[A-Za-z0-9_-]{10,64}$/.test(key) ? key : undefined;
}

export function memberId(): string {
  const storageKey = "tavern-room-member";
  try {
    const existing = sessionStorage.getItem(storageKey);
    if (existing && /^[A-Za-z0-9_-]{6,40}$/.test(existing)) return existing;
  } catch {
    /* private mode */
  }
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const id = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  try {
    sessionStorage.setItem(storageKey, id);
  } catch {
    /* identity only lasts this page */
  }
  return id;
}

const NAME_KEY = "tavern-room-name";
export function storedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}
export function rememberName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* not remembered */
  }
}

/** Where the snapshot's playhead is now, in seconds. */
export function projectedPosition(
  snapshot: Pick<RoomSnapshot, "position" | "duration" | "isPlaying" | "at">,
  serverNow: number,
) {
  const elapsed = snapshot.isPlaying
    ? Math.max(0, serverNow - snapshot.at) / 1000
    : 0;
  const end = snapshot.duration > 0 ? snapshot.duration : Infinity;
  return Math.max(0, Math.min(end, snapshot.position + elapsed));
}

export function toRoomTrack(track: TavernTrack): RoomTrack {
  const spotify = isSpotifyTrack(track) && track.spotifyUri;
  const youtube = isYouTubeTrack(track) && track.youtubeId;
  const bilibili = isBilibiliTrack(track) && track.bilibiliId;
  return {
    look: track.look ?? hashText(track.id + track.fileName),
    id: track.id,
    title: track.title,
    alias: track.alias,
    artist: track.artist,
    album: track.album,
    duration: track.duration,
    tags: track.tags,
    glass: track.glass,
    tint: track.tint,
    mimeType: track.mimeType,
    available: spotify
      ? true
      : youtube || bilibili
        ? track.status === "ready"
        : track.status === "ready" && Boolean(track.objectUrl),
    // Spotify / YouTube / Bilibili pictures come straight from them, never through the tavern
    hasCover: spotify || youtube || bilibili ? false : Boolean(track.coverUrl),
    addedAt: track.addedAt,
    ...(spotify
      ? { spotify: { uri: track.spotifyUri!, url: track.spotifyUrl ?? "", cover: track.coverUrl } }
      : {}),
    ...(youtube
      ? { youtube: { id: track.youtubeId!, ...(track.status !== "ready" ? { blocked: true } : {}) } }
      : {}),
    ...(bilibili
      ? {
          bilibili: {
            bvid: track.bilibiliId!,
            p: track.bilibiliPage ?? 1,
            ...(track.coverUrl ? { cover: track.coverUrl } : {}),
            ...(track.status !== "ready" ? { blocked: true } : {}),
          },
        }
      : {}),
  };
}

const SPOTIFY_URI = /^spotify:track:([A-Za-z0-9]{22})$/;
const SPOTIFY_COVER = /^https:\/\/([a-z0-9-]+\.)*(scdn\.co|spotifycdn\.com)\//;

/** Turns the host's shared metadata into tracks the guest's player can use. */
const text = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : value == null ? fallback : String(value);

/** Whatever the host's (possibly old) library contains, hand the player clean fields. */
export function fromRoomTrack(raw: RoomTrack, key: string): TavernTrack {
  const track: RoomTrack = {
    ...raw,
    id: text(raw.id),
    title: text(raw.title, "无名的一杯"),
    alias: text(raw.alias),
    artist: text(raw.artist, "无名调酒师"),
    album: text(raw.album),
    duration: Number.isFinite(raw.duration) ? Number(raw.duration) : 0,
    tags: Array.isArray(raw.tags) ? raw.tags.map((tag) => text(tag)).filter(Boolean) : [],
    mimeType: text(raw.mimeType, "audio/mpeg"),
    addedAt: Number(raw.addedAt) || 0,
  };
  const bvid = raw.bilibili && text(raw.bilibili.bvid);
  const part = raw.bilibili ? Math.floor(Number(raw.bilibili.p)) : 0;
  if (bvid && BILIBILI_BVID.test(bvid) && part >= 1 && part <= 9999) {
    const cover = text(raw.bilibili!.cover);
    return {
      ...toBilibiliTrack({
        bvid,
        p: part,
        title: track.title,
        author: track.artist,
        duration: track.duration,
        ...(/^https:\/\/[a-z0-9.-]*hdslb\.com\//.test(cover) ? { cover } : {}),
        ...(raw.bilibili!.blocked ? { blocked: true } : {}),
      }),
      id: track.id,
      alias: track.alias,
      tags: track.tags,
      glass: track.glass,
      tint: track.tint,
      look: typeof track.look === "number" ? track.look : undefined,
    };
  }
  const youtubeId = raw.youtube && text(raw.youtube.id);
  if (youtubeId && YOUTUBE_ID.test(youtubeId)) {
    return {
      ...toYouTubeTrack({
        id: youtubeId,
        title: track.title,
        author: track.artist,
        duration: track.duration,
        ...(raw.youtube!.blocked ? { blocked: true } : {}),
      }),
      id: track.id,
      alias: track.alias,
      tags: track.tags,
      glass: track.glass,
      tint: track.tint,
      look: typeof track.look === "number" ? track.look : undefined,
    };
  }
  const spotify = raw.spotify && SPOTIFY_URI.exec(text(raw.spotify.uri));
  if (spotify) {
    const url = text(raw.spotify!.url);
    const cover = text(raw.spotify!.cover);
    return {
      id: track.id,
      fingerprint: `spotify:${spotify[1]}`,
      fileName: "",
      fileSize: 0,
      lastModified: 0,
      mimeType: "",
      title: track.title,
      alias: track.alias,
      artist: track.artist,
      album: track.album,
      duration: track.duration,
      tags: track.tags,
      glass: track.glass,
      tint: track.tint,
      look: typeof track.look === "number" ? track.look : undefined,
      addedAt: track.addedAt,
      status: "ready",
      stored: false,
      source: "spotify",
      spotifyUri: spotify[0],
      spotifyUrl: /^https:\/\/open\.spotify\.com\//.test(url)
        ? url
        : `https://open.spotify.com/track/${spotify[1]}`,
      coverUrl: SPOTIFY_COVER.test(cover) ? cover : undefined,
    };
  }
  const q = `?key=${encodeURIComponent(key)}`;
  // absolute, so it compares equal to audio.src
  const abs = (path: string) => new URL(roomUrl(path), location.href).href;
  return {
    id: track.id,
    fingerprint: `room:${track.id}`,
    fileName: track.title,
    fileSize: 0,
    lastModified: 0,
    mimeType: track.mimeType,
    title: track.title,
    alias: track.alias,
    artist: track.artist,
    album: track.album,
    duration: track.duration,
    tags: track.tags,
    glass: track.glass,
    tint: track.tint,
    look: typeof track.look === "number" ? track.look : undefined,
    addedAt: track.addedAt,
    status: track.available ? "ready" : "missing",
    stored: false,
    objectUrl: track.available
      ? abs(`audio/${encodeURIComponent(track.id)}${q}`)
      : undefined,
    coverUrl: track.hasCover
      ? abs(`cover/${encodeURIComponent(track.id)}${q}`)
      : undefined,
  };
}

export async function fetchRoomInfo(key?: string): Promise<RoomInfo | null> {
  try {
    const response = await fetch(
      roomUrl(`info${key ? `?key=${encodeURIComponent(key)}` : ""}`),
      { cache: "no-store" },
    );
    if (!response.ok) return null;
    const type = response.headers.get("content-type") ?? "";
    if (!type.includes("json")) return null;
    const info = (await response.json()) as RoomInfo;
    return info?.server === "tavern" ? info : null;
  } catch {
    return null;
  }
}

type Handlers = {
  hello: (data: {
    you: RoomMember;
    hostName: string;
    serverTime: number;
    members: RoomMember[];
    snapshot: RoomSnapshot | null;
    library: RoomLibrary | null;
    tunnel?: TunnelInfo;
  }) => void;
  members: (members: RoomMember[]) => void;
  snapshot: (snapshot: RoomSnapshot) => void;
  library: (library: RoomLibrary) => void;
  command: (command: IncomingCommand) => void;
  notice: (notice: RoomNotice) => void;
  tunnel: (tunnel: TunnelInfo) => void;
  closed: (data: { reason: string }) => void;
  replaced: () => void;
  connection: (state: "connecting" | "open" | "lost") => void;
};

export class RoomConnection {
  private source?: EventSource;
  private pollAbort?: AbortController;
  private fallbackTimer?: number;
  private gotHello = false;
  private handlers: Partial<Handlers> = {};
  private offset = 0;
  private bestRtt = Infinity;
  private clockTimer?: number;
  readonly id = memberId();
  /**
   * Some tunnels hold an event stream back instead of passing it through, so
   * the guest never hears "hello" although the server already seated them.
   * Once that happened, this page goes straight to long-polling.
   */
  static get preferPolling() {
    try {
      return sessionStorage.getItem("tavern-room-poll") === "1";
    } catch {
      return RoomConnection.pollingFlag;
    }
  }
  static set preferPolling(value: boolean) {
    RoomConnection.pollingFlag = value;
    try {
      sessionStorage.setItem("tavern-room-poll", value ? "1" : "0");
    } catch {
      /* remembered for this page only */
    }
  }
  private static pollingFlag = false;

  constructor(
    readonly role: RoomRole,
    readonly name: string,
    readonly key = "",
  ) {}

  on<K extends keyof Handlers>(event: K, handler: Handlers[K]) {
    this.handlers[event] = handler;
    return this;
  }

  /** Server clock estimate in ms. */
  now() {
    return Date.now() + this.offset;
  }

  async syncClock(samples = 5) {
    for (let i = 0; i < samples; i++) {
      const t0 = Date.now();
      try {
        const response = await fetch(roomUrl("time"), { cache: "no-store" });
        const { now } = (await response.json()) as { now: number };
        const t1 = Date.now();
        const rtt = t1 - t0;
        // keep the sample with the shortest round trip; let old ones age out
        if (rtt <= this.bestRtt * 1.5 || i === 0) {
          this.bestRtt = Math.min(this.bestRtt * 1.2, rtt);
          this.offset = now - (t0 + t1) / 2;
        }
      } catch {
        /* keep the previous estimate */
      }
    }
  }

  private params() {
    const params = new URLSearchParams({
      id: this.id,
      name: this.name,
      role: this.role,
    });
    if (this.key) params.set("key", this.key);
    return params;
  }

  private dispatch(event: string, data: unknown) {
    if (event === "ping") return;
    if (event === "hello") {
      this.gotHello = true;
      window.clearTimeout(this.fallbackTimer);
      const serverTime = (data as { serverTime?: number }).serverTime;
      // coarse first guess until syncClock refines it
      if (typeof serverTime === "number" && this.bestRtt === Infinity)
        this.offset = serverTime - Date.now();
      this.handlers.connection?.("open");
    }
    (this.handlers[event as keyof Handlers] as ((data: unknown) => void) | undefined)?.(
      data,
    );
  }

  connect() {
    this.close();
    this.gotHello = false;
    this.handlers.connection?.("connecting");
    if (this.role === "guest" && RoomConnection.preferPolling) this.startPolling();
    else this.startStream();
    void this.syncClock();
    window.clearInterval(this.clockTimer);
    this.clockTimer = window.setInterval(() => void this.syncClock(3), 30_000);
  }

  private startStream() {
    const source = new EventSource(roomUrl(`events?${this.params()}`));
    this.source = source;
    (
      [
        "hello",
        "members",
        "snapshot",
        "library",
        "command",
        "notice",
        "tunnel",
        "closed",
        "replaced",
      ] as const
    ).forEach((event) =>
      source.addEventListener(event, (message) =>
        this.dispatch(event, JSON.parse((message as MessageEvent).data || "{}")),
      ),
    );
    const fallBack = () => {
      if (this.gotHello || this.source !== source || this.role !== "guest") return;
      RoomConnection.preferPolling = true;
      this.startPolling();
    };
    // nothing arrived in time: the stream is being held back somewhere
    this.fallbackTimer = window.setTimeout(fallBack, 2500);
    source.addEventListener("error", () => {
      if (!this.gotHello) {
        if (source.readyState === EventSource.CLOSED && this.role !== "guest")
          this.handlers.connection?.("lost");
        else if (this.role === "guest") fallBack();
        return;
      }
      this.handlers.connection?.(
        source.readyState === EventSource.CLOSED ? "lost" : "connecting",
      );
    });
  }

  private startPolling() {
    window.clearTimeout(this.fallbackTimer);
    this.source?.close();
    this.source = undefined;
    this.pollAbort?.abort();
    const controller = new AbortController();
    this.pollAbort = controller;
    const base = this.params();
    void (async () => {
      let since = -1;
      let failures = 0;
      while (!controller.signal.aborted) {
        try {
          const response = await fetch(roomUrl(`poll?${base}&since=${since}`), {
            cache: "no-store",
            signal: controller.signal,
          });
          if (response.status === 410 || response.status === 403) {
            this.handlers.connection?.("lost");
            return;
          }
          if (!response.ok) throw new Error(String(response.status));
          const body = (await response.json()) as {
            hello?: unknown;
            events?: { s: number; e: string; d: unknown }[];
            next?: number;
          };
          if (controller.signal.aborted) return;
          if (failures) this.handlers.connection?.("open");
          failures = 0;
          if (body.hello) this.dispatch("hello", body.hello);
          for (const item of body.events ?? []) this.dispatch(item.e, item.d);
          if (typeof body.next === "number") since = body.next;
        } catch {
          if (controller.signal.aborted) return;
          failures++;
          this.handlers.connection?.("connecting");
          await new Promise((resolve) =>
            window.setTimeout(resolve, Math.min(8000, 1000 * failures)),
          );
        }
      }
    })();
  }

  close() {
    window.clearTimeout(this.fallbackTimer);
    this.source?.close();
    this.source = undefined;
    this.pollAbort?.abort();
    this.pollAbort = undefined;
    window.clearInterval(this.clockTimer);
  }

  async post(path: string, body?: unknown, init: RequestInit = {}) {
    const headers: Record<string, string> = {
      "x-tavern": "1",
      "x-member": this.id,
      ...(this.key ? { "x-room-key": this.key } : {}),
      ...((init.headers as Record<string, string>) ?? {}),
    };
    if (body !== undefined && !(body instanceof Blob))
      headers["content-type"] = "application/json";
    const response = await fetch(roomUrl(path), {
      method: "POST",
      ...init,
      headers,
      body:
        body === undefined
          ? undefined
          : body instanceof Blob
            ? body
            : JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`room ${path}: ${response.status}`);
    return response;
  }

  command(command: RoomCommand) {
    return this.post("command", command);
  }
}

/** Host-only calls (the server refuses them from anywhere but this computer). */
export const hostApi = {
  open: (name: string) =>
    fetch(roomUrl("open"), {
      method: "POST",
      headers: { "x-tavern": "1", "content-type": "application/json" },
      body: JSON.stringify({ name }),
    }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))),
  close: () =>
    fetch(roomUrl("close"), {
      method: "POST",
      headers: { "x-tavern": "1" },
    }),
  retryTunnel: () =>
    fetch(roomUrl("tunnel"), {
      method: "POST",
      headers: { "x-tavern": "1" },
    }),
};
