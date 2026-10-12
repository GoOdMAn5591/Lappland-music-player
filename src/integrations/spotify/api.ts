import type { SpotifyLink, TavernTrack } from "../../storage";
import { getAccessToken } from "./auth";

/**
 * The few Spotify Web API calls the tavern makes. Written against the
 * February 2026 Development Mode rules: playlist songs come from
 * /playlists/{id}/items (each entry's song is in `item`), and only for
 * playlists the signed-in user owns or collaborates on.
 */

const API = "https://api.spotify.com/v1";
/** Keep the tavern light on Spotify's rate limits. */
const MAX_TRACKS = 1000;

export class SpotifyApiError extends Error {
  constructor(
    readonly status: number,
    readonly reason = "",
    message = "",
  ) {
    super(message || `Spotify ${status}`);
  }
  /** Development Mode: this account isn't on the app's user list. */
  get notRegistered() {
    return this.status === 403 && /regist|allowlist|not.*(added|allowed)/i.test(this.message);
  }
  get premiumRequired() {
    return this.status === 403 && /PREMIUM/i.test(this.reason + this.message);
  }
}

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export async function spotifyFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
  attempt = 0,
): Promise<T | undefined> {
  const access = await getAccessToken();
  const response = await fetch(path.startsWith("http") ? path : `${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${access}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  if (response.status === 401 && attempt === 0) {
    await getAccessToken(true);
    return spotifyFetch<T>(path, init, 1);
  }
  if ((response.status === 429 || response.status === 503) && attempt < 2) {
    const wait = Number(response.headers.get("Retry-After"));
    await sleep(Math.min(8, Number.isFinite(wait) && wait > 0 ? wait : 1.5 * (attempt + 1)) * 1000);
    return spotifyFetch<T>(path, init, attempt + 1);
  }
  if (response.status === 204 || response.status === 202) return undefined;
  if (!response.ok) {
    let reason = "";
    let message = "";
    try {
      const body = (await response.json()) as { error?: { message?: string; reason?: string } };
      message = body?.error?.message ?? "";
      reason = body?.error?.reason ?? "";
    } catch {
      message = await response.text().catch(() => "");
    }
    throw new SpotifyApiError(response.status, reason, message);
  }
  const text = await response.text();
  return text ? (JSON.parse(text) as T) : undefined;
}

// ----------------------------------------------------------------- shapes
interface Image {
  url: string;
  width?: number | null;
  height?: number | null;
}
interface ApiTrack {
  id?: string | null;
  uri?: string;
  type?: string;
  name?: string;
  duration_ms?: number;
  is_local?: boolean;
  is_playable?: boolean;
  artists?: { name?: string }[];
  album?: { name?: string; images?: Image[] };
  external_urls?: { spotify?: string };
}
interface Page<T> {
  items?: T[];
  next?: string | null;
  total?: number;
}
interface ApiPlaylist {
  id: string;
  name?: string;
  collaborative?: boolean;
  owner?: { id?: string; display_name?: string | null };
  images?: Image[] | null;
  external_urls?: { spotify?: string };
  /** 2026 name of the song count… */
  items?: { total?: number };
  /** …and the deprecated one */
  tracks?: { total?: number };
}

export interface SpotifyProfile {
  id: string;
  name: string;
}

export interface SpotifyPlaylistInfo {
  link: SpotifyLink;
  name: string;
  total: number;
  image?: string;
  /** Owned or collaborative: Spotify lets the tavern read its songs. */
  readable: boolean;
}

const TRACK_ID = /^[A-Za-z0-9]{22}$/;
const PLAYLIST_LINK = /(?:open\.spotify\.com\/(?:intl-[a-z-]+\/)?playlist\/|spotify:playlist:)([A-Za-z0-9]{22})/;

/** Accepts a playlist link, a spotify:playlist: URI or a bare ID. */
export function parsePlaylistId(text: string) {
  const value = text.trim();
  if (TRACK_ID.test(value)) return value;
  return PLAYLIST_LINK.exec(value)?.[1];
}

/** A cover of about 300 px — big enough for the plaque, small to download. */
function pickImage(images?: Image[] | null) {
  if (!images?.length) return undefined;
  const sorted = [...images].sort((a, b) => (a.width ?? 640) - (b.width ?? 640));
  return (sorted.find((image) => (image.width ?? 640) >= 240) ?? sorted[sorted.length - 1])?.url;
}

function tagsFor(seconds: number) {
  const tags = ["Spotify"];
  if (seconds > 360) tags.push("长饮");
  else if (seconds > 0 && seconds < 130) tags.push("短杯");
  return tags;
}

export function toTavernTrack(item: ApiTrack | null | undefined): TavernTrack | undefined {
  if (
    !item ||
    (item.type && item.type !== "track") ||
    item.is_local ||
    item.is_playable === false ||
    !item.id ||
    !TRACK_ID.test(item.id) ||
    !/^spotify:track:[A-Za-z0-9]{22}$/.test(item.uri ?? "")
  )
    return undefined;
  const duration = Math.max(0, (item.duration_ms ?? 0) / 1000);
  const url = item.external_urls?.spotify;
  return {
    id: `spotify-${item.id}`,
    fingerprint: `spotify:${item.id}`,
    fileName: "",
    fileSize: 0,
    lastModified: 0,
    mimeType: "",
    title: item.name || "—",
    alias: "",
    artist: (item.artists ?? [])
      .map((artist) => artist.name)
      .filter(Boolean)
      .join(", "),
    album: item.album?.name ?? "",
    duration,
    tags: tagsFor(duration),
    addedAt: 0,
    status: "ready",
    stored: false,
    source: "spotify",
    spotifyUri: item.uri,
    spotifyUrl:
      url && /^https:\/\/open\.spotify\.com\//.test(url)
        ? url
        : `https://open.spotify.com/track/${item.id}`,
    coverUrl: pickImage(item.album?.images),
  };
}

function toPlaylistInfo(playlist: ApiPlaylist, me?: string): SpotifyPlaylistInfo | undefined {
  if (!playlist?.id || !TRACK_ID.test(playlist.id)) return undefined;
  const owner = playlist.owner?.display_name || playlist.owner?.id || "";
  return {
    link: {
      id: playlist.id,
      url:
        playlist.external_urls?.spotify ?? `https://open.spotify.com/playlist/${playlist.id}`,
      owner,
    },
    name: playlist.name || "Spotify",
    total: playlist.items?.total ?? playlist.tracks?.total ?? 0,
    image: pickImage(playlist.images),
    readable: Boolean(playlist.collaborative) || (!!me && playlist.owner?.id === me),
  };
}

// ------------------------------------------------------------------ calls
export async function fetchProfile(): Promise<SpotifyProfile> {
  const me = await spotifyFetch<{ id: string; display_name?: string | null }>("/me");
  if (!me?.id) throw new SpotifyApiError(500, "", "no profile");
  return { id: me.id, name: me.display_name || me.id };
}

export async function fetchMyPlaylists(me: string): Promise<SpotifyPlaylistInfo[]> {
  const found: SpotifyPlaylistInfo[] = [];
  let next: string | null | undefined = "/me/playlists?limit=50";
  for (let page = 0; next && page < 6; page++) {
    const body: Page<ApiPlaylist> | undefined = await spotifyFetch<Page<ApiPlaylist>>(next);
    for (const item of body?.items ?? []) {
      const info = item && toPlaylistInfo(item, me);
      if (info && !found.some((p) => p.link.id === info.link.id)) found.push(info);
    }
    next = body?.next;
  }
  return found;
}

export async function fetchPlaylistInfo(id: string, me: string) {
  const playlist = await spotifyFetch<ApiPlaylist>(`/playlists/${encodeURIComponent(id)}`);
  const info = playlist && toPlaylistInfo(playlist, me);
  if (!info) throw new SpotifyApiError(404, "", "playlist");
  return info;
}

export const LIKED_LINK: SpotifyLink = {
  id: "liked",
  url: "https://open.spotify.com/collection/tracks",
};

async function collect(first: string, pick: (entry: { item?: ApiTrack; track?: ApiTrack }) => ApiTrack | undefined) {
  const tracks: TavernTrack[] = [];
  const seen = new Set<string>();
  let next: string | null | undefined = first;
  while (next && tracks.length < MAX_TRACKS) {
    const body: Page<{ item?: ApiTrack; track?: ApiTrack }> | undefined = await spotifyFetch(next);
    for (const entry of body?.items ?? []) {
      const track = toTavernTrack(entry ? pick(entry) : undefined);
      if (track && !seen.has(track.id)) {
        seen.add(track.id);
        tracks.push(track);
      }
    }
    next = body?.next;
  }
  return tracks.slice(0, MAX_TRACKS);
}

/** The songs of a linked menu page (owned / collaborative playlist, or 「我喜欢的歌曲」). */
export async function fetchLinkedTracks(link: SpotifyLink): Promise<TavernTrack[]> {
  if (link.id === "liked")
    return collect("/me/tracks?limit=50&market=from_token", (entry) => entry.track ?? entry.item);
  const id = encodeURIComponent(link.id);
  try {
    return await collect(
      `/playlists/${id}/items?limit=50&market=from_token&additional_types=track`,
      (entry) => entry.item ?? entry.track,
    );
  } catch (error) {
    // an account still on the pre-2026 API answers on the old path
    if (error instanceof SpotifyApiError && error.status === 404)
      return collect(`/playlists/${id}/tracks?limit=50&market=from_token`, (entry) => entry.track ?? entry.item);
    throw error;
  }
}

export async function startOnDevice(deviceId: string, uri: string, positionMs: number) {
  await spotifyFetch(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
    method: "PUT",
    body: JSON.stringify({ uris: [uri], position_ms: Math.max(0, Math.round(positionMs)) }),
  });
}

/** The tavern decides what plays next, so Spotify mustn't loop or shuffle on its own. */
export async function quietDevice(deviceId: string) {
  const device = `device_id=${encodeURIComponent(deviceId)}`;
  await Promise.allSettled([
    spotifyFetch(`/me/player/repeat?state=off&${device}`, { method: "PUT" }),
    spotifyFetch(`/me/player/shuffle?state=false&${device}`, { method: "PUT" }),
  ]);
}
