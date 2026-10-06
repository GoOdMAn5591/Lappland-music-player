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
  addedAt: number;
  status: TrackStatus;
  stored?: boolean;
  objectUrl?: string;
  coverUrl?: string;
}

export interface TavernPlaylist {
  id: string;
  name: string;
  mood: string;
  trackIds: string[];
}

export interface PersistedTrack
  extends Omit<TavernTrack, "objectUrl" | "coverUrl" | "status" | "stored"> {}

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

export async function saveLibrary(library: TavernLibrary): Promise<void> {
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
  const tracks = value.tracks.map((track) => {
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
    return {
      id: playlist.id,
      name: playlist.name,
      mood: typeof playlist.mood === "string" ? playlist.mood : "",
      trackIds: [...new Set(playlist.trackIds.filter((id) => ids.has(id)))],
    };
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
      value.currentTrackId && ids.has(value.currentTrackId)
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
  library: TavernLibrary,
): Promise<void> {
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
