import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export type PlaybackMode = "sequence" | "shuffle" | "repeat-one" | "repeat-all";

export type TrackStatus = "ready" | "missing";

export interface TavernTrack {
  id: string;
  fingerprint: string;
  fileName: string;
  fileSize: number;
  lastModified: number;
  mimeType: string;
  title: string;
  alias: string;
  artist: string;
  album: string;
  duration: number;
  tags: string[];
  /** Optional glass silhouette chosen in the drink editor (see app/recipes.ts). */
  glass?: string;
  /** Optional palette key chosen in the drink editor (see app/recipes.ts). */
  tint?: string;
  /** Glass-look seed for a track mirrored from a 同席 host (not persisted). */
  look?: number;
  addedAt: number;
  /**
   * Where the sound comes from: local audio unless "spotify". A Spotify track
   * is played by each listener's own Spotify account and never stored,
   * downloaded or relayed — the tavern only knows its URI and metadata.
   */
  source?: "spotify" | "youtube" | "bilibili";
  /** spotify:track:… */
  spotifyUri?: string;
  /** An 11-character YouTube video ID, played in the tavern's visible YouTube screen. */
  youtubeId?: string;
  /** A Bilibili video (BV…) and part, played in the tavern's Bilibili screen. */
  bilibiliId?: string;
  bilibiliPage?: number;
  /** The track on open.spotify.com (Spotify asks for a link back). */
  spotifyUrl?: string;
  status: TrackStatus;
  stored?: boolean;
  objectUrl?: string;
  coverUrl?: string;
}

/** A menu page that mirrors one of the user's Spotify playlists. */
export interface SpotifyLink {
  /** Spotify playlist ID, or "liked" for the user's saved songs. */
  id: string;
  url: string;
  owner?: string;
}

/** One video on a YouTube menu page, as read from YouTube. */
export interface YouTubeItem {
  id: string;
  title: string;
  author: string;
  /** Seconds; 0 until the video has been played once. */
  duration: number;
  /** YouTube refused to play it outside youtube.com (embedding disabled, removed…). */
  blocked?: boolean;
}

/**
 * A menu page made of YouTube videos: a YouTube playlist, or videos added
 * one by one. YouTube lets apps keep what they read for at most 30 days, so
 * the list carries the time it was read and is dropped after that.
 */
export interface YouTubeLink {
  /** Playlist ID; absent for a page of single videos. */
  list?: string;
  url: string;
  items: YouTubeItem[];
  fetchedAt: number;
}

export const YOUTUBE_KEEP_MS = 30 * 24 * 3600 * 1000;

/** One part of a Bilibili video on a menu page. */
export interface BilibiliItem {
  /** BV… */
  bvid: string;
  /** Part number (分P), from 1. */
  p: number;
  title: string;
  author: string;
  /** Seconds (from Bilibili); 0 if unknown. */
  duration: number;
  /** https://i0.hdslb.com/… picture, if Bilibili gave one. */
  cover?: string;
  /** Bilibili said it's gone (deleted, hidden, under review). */
  blocked?: boolean;
}

export type BilibiliKind = "picks" | "parts" | "season" | "series" | "favorites";

/**
 * A menu page made of Bilibili videos: a collection (合集), a series, a public
 * favourites folder, the parts of one video, or videos added one by one.
 */
export interface BilibiliLink {
  kind: BilibiliKind;
  /** The collection / series / folder / video it was read from (absent for picks). */
  id?: string;
  /** Owner's space ID (collections and series need it to be read again). */
  mid?: string;
  url: string;
  items: BilibiliItem[];
  fetchedAt: number;
}

export interface TavernPlaylist {
  id: string;
  name: string;
  mood: string;
  /** For a Spotify page these are filled in from Spotify each session, never saved. */
  trackIds: string[];
  spotify?: SpotifyLink;
  youtube?: YouTubeLink;
  bilibili?: BilibiliLink;
}

export interface PersistedTrack extends Omit<
  TavernTrack,
  "objectUrl" | "coverUrl" | "status" | "stored"
> {}

export interface TavernLibrary {
  version: 1;
  selectedPlaylistId: string;
  currentTrackId?: string;
  playbackMode: PlaybackMode;
  volume: number;
  tracks: PersistedTrack[];
  playlists: TavernPlaylist[];
}

interface TavernDB extends DBSchema {
  library: {
    key: string;
    value: TavernLibrary;
  };
  audio: { key: string; value: { audio: Blob; cover?: Blob } };
}

const DB_NAME = "lappland-tavern-player";
const STORE = "library";
const STATE_KEY = "state";

const defaultPlaylist: TavernPlaylist = {
  id: "today-menu",
  name: "今日特调",
  mood: "新到的酒先在这里醒一醒。",
  trackIds: [],
};

export const createDefaultLibrary = (): TavernLibrary => ({
  version: 1,
  selectedPlaylistId: defaultPlaylist.id,
  playbackMode: "sequence",
  volume: 0.76,
  tracks: [],
  playlists: [
    defaultPlaylist,
    {
      id: "unmixed",
      name: "未调配",
      mood: "还没有写进菜单的私藏。",
      trackIds: [],
    },
    {
      id: "midnight",
      name: "午夜低语",
      mood: "适合压低声音播放。",
      trackIds: [],
    },
    {
      id: "private-cellar",
      name: "私人珍藏",
      mood: "只给熟客看的那一页。",
      trackIds: [],
    },
  ],
});

const FALLBACK_KEY = "tavern-menu-fallback";
let connection: Promise<IDBPDatabase<TavernDB>> | undefined;
const database = () => {
  if (!connection) {
    connection = openDB<TavernDB>(DB_NAME, 2, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        if (!db.objectStoreNames.contains("audio"))
          db.createObjectStore("audio");
      },
      blocking() {
        void connection?.then((db) => db.close());
        connection = undefined;
      },
      terminated() {
        connection = undefined;
      },
    }).catch((error) => {
      connection = undefined;
      throw error;
    });
  }
  return connection;
};

export async function loadLibrary(): Promise<TavernLibrary> {
  let fallback: TavernLibrary | undefined;
  try {
    fallback =
      JSON.parse(localStorage.getItem(FALLBACK_KEY) || "null") || undefined;
  } catch {
    /* Storage may be disabled. */
  }
  try {
    const db = await database();
    return (
      fallback ?? (await db.get(STORE, STATE_KEY)) ?? createDefaultLibrary()
    );
  } catch (error) {
    if (fallback) return fallback;
    throw error;
  }
}

export async function saveLibrary(input: TavernLibrary): Promise<void> {
  const library = { ...input, playlists: persistablePlaylists(input.playlists) };
  try {
    const db = await database();
    await db.put(STORE, library, STATE_KEY);
    try {
      localStorage.removeItem(FALLBACK_KEY);
    } catch {
      /* IndexedDB already saved. */
    }
  } catch {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(library));
  }
}

export const isSpotifyTrack = (track?: Pick<TavernTrack, "source">) =>
  track?.source === "spotify";
export const isYouTubeTrack = (track?: Pick<TavernTrack, "source">) =>
  track?.source === "youtube";
export const isBilibiliTrack = (track?: Pick<TavernTrack, "source">) =>
  track?.source === "bilibili";
/** Spotify, YouTube and Bilibili songs stream from elsewhere; everything else is a local file. */
export const isStreamTrack = (track?: Pick<TavernTrack, "source">) =>
  Boolean(track?.source);

export const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
export const youtubeTrackId = (videoId: string) => `youtube-${videoId}`;

export const BILIBILI_BVID = /^BV1[0-9A-Za-z]{9}$/;
export const bilibiliTrackId = (bvid: string, p = 1) => `bilibili-${bvid}-${p}`;
const BILIBILI_TRACK_ID = /^bilibili-BV1[0-9A-Za-z]{9}-\d{1,4}$/;
/** Pages that hold their own songs (not local files): Spotify, YouTube and Bilibili pages. */
export const isStreamPage = (playlist?: TavernPlaylist) =>
  Boolean(playlist?.spotify || playlist?.youtube || playlist?.bilibili);

/** A YouTube page past YouTube's 30-day limit keeps its link but forgets its videos. */
export function expireYouTube(playlist: TavernPlaylist, now = Date.now()): TavernPlaylist {
  const link = playlist.youtube;
  if (!link || !link.items.length || now - link.fetchedAt < YOUTUBE_KEEP_MS) return playlist;
  return { ...playlist, trackIds: [], youtube: { ...link, items: [] } };
}

/**
 * What goes into IndexedDB / the exported JSON: local tracks, and Spotify
 * pages as links only (their songs are fetched again from Spotify).
 */
export function persistablePlaylists(playlists: TavernPlaylist[]): TavernPlaylist[] {
  return playlists.map((playlist) =>
    playlist.spotify ? { ...playlist, trackIds: [] } : expireYouTube(playlist),
  );
}

const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.slice(0, max) : "";

const BILIBILI_KINDS: BilibiliKind[] = ["picks", "parts", "season", "series", "favorites"];
const BILIBILI_COVER = /^https:\/\/[a-z0-9.-]*hdslb\.com\//;

/** Whatever a saved menu or the host says about a Bilibili page, keep only clean fields. */
export function cleanBilibiliLink(value: unknown): BilibiliLink | undefined {
  const link = value as BilibiliLink | undefined;
  if (!link || typeof link !== "object" || !Array.isArray(link.items)) return;
  const kind = BILIBILI_KINDS.includes(link.kind) ? link.kind : "picks";
  const id = typeof link.id === "string" && /^[A-Za-z0-9]{1,24}$/.test(link.id) ? link.id : undefined;
  const mid = typeof link.mid === "string" && /^\d{1,20}$/.test(link.mid) ? link.mid : undefined;
  const seen = new Set<string>();
  const items: BilibiliItem[] = [];
  for (const raw of link.items.slice(0, 500)) {
    const item = raw as BilibiliItem;
    const p = Number(item?.p) || 1;
    if (!item || !BILIBILI_BVID.test(String(item.bvid)) || p < 1 || p > 9999) continue;
    const key = `${item.bvid}-${p}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const cover = typeof item.cover === "string" && BILIBILI_COVER.test(item.cover) ? item.cover : "";
    items.push({
      bvid: item.bvid,
      p: Math.floor(p),
      title: text(item.title, 200),
      author: text(item.author, 120),
      duration:
        typeof item.duration === "number" && Number.isFinite(item.duration)
          ? Math.max(0, Math.min(86_400, item.duration))
          : 0,
      ...(cover ? { cover: cover.slice(0, 300) } : {}),
      ...(item.blocked ? { blocked: true } : {}),
    });
  }
  const fetchedAt = Number(link.fetchedAt);
  const url = typeof link.url === "string" && /^https:\/\/([a-z0-9-]+\.)*bilibili\.com\//.test(link.url)
    ? link.url.slice(0, 300)
    : "https://www.bilibili.com/";
  return {
    kind,
    ...(id ? { id } : {}),
    ...(mid ? { mid } : {}),
    url,
    items,
    fetchedAt: Number.isFinite(fetchedAt) && fetchedAt > 0 ? Math.min(fetchedAt, Date.now()) : 0,
  };
}

/** Whatever a saved menu or the host says about a YouTube page, keep only clean fields. */
export function cleanYouTubeLink(value: unknown): YouTubeLink | undefined {
  const link = value as YouTubeLink | undefined;
  if (!link || typeof link !== "object" || !Array.isArray(link.items)) return;
  const list =
    typeof link.list === "string" && /^[A-Za-z0-9_-]{10,64}$/.test(link.list)
      ? link.list
      : undefined;
  const seen = new Set<string>();
  const items: YouTubeItem[] = [];
  for (const raw of link.items.slice(0, 500)) {
    const item = raw as YouTubeItem;
    if (!item || !YOUTUBE_ID.test(String(item.id)) || seen.has(item.id)) continue;
    seen.add(item.id);
    items.push({
      id: item.id,
      title: text(item.title, 200),
      author: text(item.author, 120),
      duration:
        typeof item.duration === "number" && Number.isFinite(item.duration)
          ? Math.max(0, Math.min(86_400, item.duration))
          : 0,
      ...(item.blocked ? { blocked: true } : {}),
    });
  }
  const fetchedAt = Number(link.fetchedAt);
  return {
    ...(list ? { list } : {}),
    url: list
      ? `https://www.youtube.com/playlist?list=${list}`
      : "https://www.youtube.com/",
    items,
    fetchedAt: Number.isFinite(fetchedAt) && fetchedAt > 0 ? Math.min(fetchedAt, Date.now()) : 0,
  };
}

const SPOTIFY_PLAYLIST_ID = /^([A-Za-z0-9]{22}|liked)$/;
function cleanSpotifyLink(value: unknown): SpotifyLink | undefined {
  const link = value as SpotifyLink | undefined;
  if (!link || typeof link.id !== "string" || !SPOTIFY_PLAYLIST_ID.test(link.id)) return;
  const url =
    typeof link.url === "string" && /^https:\/\/open\.spotify\.com\//.test(link.url)
      ? link.url
      : link.id === "liked"
        ? "https://open.spotify.com/collection/tracks"
        : `https://open.spotify.com/playlist/${link.id}`;
  return {
    id: link.id,
    url,
    ...(typeof link.owner === "string" ? { owner: link.owner.slice(0, 80) } : {}),
  };
}

export function toPersistedTrack(track: TavernTrack): PersistedTrack {
  const {
    objectUrl: _objectUrl,
    coverUrl: _coverUrl,
    status: _status,
    stored: _stored,
    ...persisted
  } = track;
  return persisted;
}

export function parseLibraryConfig(text: string): TavernLibrary {
  const value = JSON.parse(text) as TavernLibrary;
  if (!value || !Array.isArray(value.tracks) || !Array.isArray(value.playlists))
    throw new Error("Invalid menu");
  const ids = new Set<string>();
  const fingerprints = new Set<string>();
  // Spotify songs are never saved; an old or hand-edited file may still carry some
  const tracks = value.tracks.filter((track) => !track?.source).map((track) => {
    if (
      !track ||
      [track.id, track.fingerprint, track.fileName, track.title].some(
        (field) => typeof field !== "string" || !field,
      ) ||
      !Array.isArray(track.tags) ||
      track.tags.some((tag) => typeof tag !== "string") ||
      ids.has(track.id) ||
      fingerprints.has(track.fingerprint)
    )
      throw new Error("Invalid track");
    ids.add(track.id);
    fingerprints.add(track.fingerprint);
    const string = (field: unknown) => (typeof field === "string" ? field : "");
    const number = (field: unknown) =>
      typeof field === "number" && Number.isFinite(field)
        ? Math.max(0, field)
        : 0;
    return {
      id: track.id,
      fingerprint: track.fingerprint,
      fileName: track.fileName,
      title: track.title,
      alias: string(track.alias),
      artist: string(track.artist),
      album: string(track.album),
      mimeType: string(track.mimeType),
      fileSize: number(track.fileSize),
      lastModified: number(track.lastModified),
      duration: number(track.duration),
      addedAt: number(track.addedAt),
      tags: track.tags,
      ...(typeof track.glass === "string" && track.glass
        ? { glass: track.glass }
        : {}),
      ...(typeof track.tint === "string" && track.tint
        ? { tint: track.tint }
        : {}),
    };
  });
  const playlistIds = new Set<string>();
  const playlists = value.playlists.map((playlist) => {
    if (
      !playlist ||
      typeof playlist.id !== "string" ||
      typeof playlist.name !== "string" ||
      !Array.isArray(playlist.trackIds) ||
      playlistIds.has(playlist.id)
    )
      throw new Error("Invalid playlist");
    playlistIds.add(playlist.id);
    const spotify = cleanSpotifyLink(playlist.spotify);
    const youtube = spotify ? undefined : cleanYouTubeLink(playlist.youtube);
    const bilibili = spotify || youtube ? undefined : cleanBilibiliLink(playlist.bilibili);
    return expireYouTube({
      id: playlist.id,
      name: playlist.name,
      mood: typeof playlist.mood === "string" ? playlist.mood : "",
      trackIds: spotify
        ? []
        : youtube
          ? youtube.items.map((item) => youtubeTrackId(item.id))
          : bilibili
            ? bilibili.items.map((item) => bilibiliTrackId(item.bvid, item.p))
            : [...new Set(playlist.trackIds.filter((id) => ids.has(id)))],
      ...(spotify ? { spotify } : {}),
      ...(youtube ? { youtube } : {}),
      ...(bilibili ? { bilibili } : {}),
    });
  });
  if (!playlists.length) playlists.push(...createDefaultLibrary().playlists);
  return {
    version: 1,
    tracks,
    playlists,
    selectedPlaylistId: playlists.some((p) => p.id === value.selectedPlaylistId)
      ? value.selectedPlaylistId
      : playlists[0].id,
    currentTrackId:
      value.currentTrackId &&
      (ids.has(value.currentTrackId) ||
        /^(spotify-[A-Za-z0-9]{22}|youtube-[A-Za-z0-9_-]{11})$/.test(value.currentTrackId) ||
        BILIBILI_TRACK_ID.test(value.currentTrackId))
        ? value.currentTrackId
        : undefined,
    playbackMode: ["sequence", "shuffle", "repeat-one", "repeat-all"].includes(
      value.playbackMode,
    )
      ? value.playbackMode
      : "sequence",
    volume:
      typeof value.volume === "number" && Number.isFinite(value.volume)
        ? Math.min(1, Math.max(0, value.volume))
        : 0.76,
  };
}

export async function reviveTrack(track: PersistedTrack): Promise<TavernTrack> {
  try {
    const db = await database();
    const saved = await db.get("audio", track.fingerprint);
    if (saved?.audio instanceof Blob)
      return {
        ...track,
        status: "ready",
        stored: true,
        objectUrl: URL.createObjectURL(saved.audio),
        coverUrl: saved.cover ? URL.createObjectURL(saved.cover) : undefined,
      };
  } catch {
    /* Keep the menu available even when the audio store cannot be read. */
  }
  return { ...track, status: "missing", stored: false };
}

export async function storeAudio(
  fingerprint: string,
  audio: Blob,
  cover?: Blob,
): Promise<void> {
  const db = await database();
  await db.put("audio", { audio, cover }, fingerprint);
}

export function releaseTrack(track: TavernTrack) {
  if (track.objectUrl) URL.revokeObjectURL(track.objectUrl);
  if (track.coverUrl) URL.revokeObjectURL(track.coverUrl);
}

export type Persistence = "persistent" | "best-effort" | "unavailable";
export async function requestPersistence(): Promise<Persistence> {
  try {
    if (!navigator.storage?.persist) return "unavailable";
    return (await navigator.storage.persist()) ? "persistent" : "best-effort";
  } catch {
    return "unavailable";
  }
}

export interface StorageInfo {
  bytes: number;
  files: number;
  available: boolean;
  persistence: Persistence;
  usage?: number;
  quota?: number;
}

export async function inspectStorage(): Promise<StorageInfo> {
  const info: StorageInfo = {
    bytes: 0,
    files: 0,
    available: true,
    persistence: "unavailable",
  };
  try {
    const db = await database();
    let cursor = await db.transaction("audio").store.openCursor();
    while (cursor) {
      info.bytes += cursor.value.audio.size + (cursor.value.cover?.size ?? 0);
      info.files++;
      cursor = await cursor.continue();
    }
  } catch {
    info.available = false;
  }
  try {
    const estimate = await navigator.storage?.estimate?.();
    info.usage = estimate?.usage;
    info.quota = estimate?.quota;
    if (navigator.storage?.persisted) {
      info.persistence = (await navigator.storage.persisted())
        ? "persistent"
        : "best-effort";
    }
  } catch {
    /* Quota estimates are optional. */
  }
  return info;
}

export async function clearLibrary(): Promise<void> {
  const db = await database();
  // Clear blobs and replace metadata in the same transaction to avoid half-cleared libraries.
  const tx = db.transaction(["audio", STORE], "readwrite");
  await tx.objectStore("audio").clear();
  await tx.objectStore(STORE).put(createDefaultLibrary(), STATE_KEY);
  await tx.done;
  try {
    localStorage.removeItem(FALLBACK_KEY);
  } catch {
    /* No fallback in this browser. */
  }
}

export async function deleteStoredTrack(
  fingerprint: string,
  input: TavernLibrary,
): Promise<void> {
  const library = { ...input, playlists: persistablePlaylists(input.playlists) };
  const db = await database();
  const tx = db.transaction(["audio", STORE], "readwrite");
  await tx.objectStore("audio").delete(fingerprint);
  await tx.objectStore(STORE).put(library, STATE_KEY);
  await tx.done;
  try {
    localStorage.removeItem(FALLBACK_KEY);
  } catch {
    /* Metadata is committed in IndexedDB. */
  }
}
