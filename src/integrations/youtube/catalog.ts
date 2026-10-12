import { assetUrl } from "../../config";
import { YOUTUBE_ID, youtubeTrackId, type TavernTrack, type YouTubeItem } from "../../storage";
import type { YTPlayer } from "./player";

/**
 * Reading YouTube without an API key: the player itself lists a playlist's
 * videos, and titles come from YouTube's public oEmbed endpoint (fetched by
 * the tavern's own server, since browsers can't read it directly).
 */

const LIST_ID = /^[A-Za-z0-9_-]{10,64}$/;
const YOUTUBE_HOSTS = /(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be)$/i;
/** The player hands out at most this many videos of a playlist. */
export const MAX_PLAYLIST = 200;

/** A playlist and/or a video from whatever the user pasted (link or bare ID). */
export function parseYouTubeLink(text: string): { list?: string; video?: string } | undefined {
  const value = text.trim();
  if (!value) return undefined;
  if (YOUTUBE_ID.test(value)) return { video: value };
  if (/^(PL|OL|UU|FL|LL|RD)[A-Za-z0-9_-]{8,62}$/.test(value)) return { list: value };
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return undefined;
  }
  if (!YOUTUBE_HOSTS.test(url.hostname)) return undefined;
  const list = url.searchParams.get("list") ?? undefined;
  let video = url.searchParams.get("v") ?? undefined;
  if (!video) {
    const path = url.pathname.split("/").filter(Boolean);
    if (/youtu\.be$/i.test(url.hostname)) video = path[0];
    else if (["shorts", "embed", "live", "v"].includes(path[0])) video = path[1];
  }
  const result = {
    ...(list && LIST_ID.test(list) ? { list } : {}),
    ...(video && YOUTUBE_ID.test(video) ? { video } : {}),
  };
  return result.list || result.video ? result : undefined;
}

export const youtubeWatchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;
export const youtubePlaylistUrl = (list: string) => `https://www.youtube.com/playlist?list=${list}`;
export const youtubeThumb = (id: string) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

/** Cue a playlist in a visible player and read its video IDs (no playback). */
export async function readPlaylistIds(player: YTPlayer, list: string): Promise<string[]> {
  player.cuePlaylist({ list, listType: "playlist" });
  for (let waited = 0; waited < 15_000; waited += 300) {
    await sleep(300);
    const ids = player.getPlaylist();
    if (ids?.length) return [...new Set(ids.filter((id) => YOUTUBE_ID.test(id)))].slice(0, MAX_PLAYLIST);
  }
  return [];
}

interface Meta {
  title: string;
  author: string;
  /** YouTube won't let this video play on other sites. */
  blocked?: boolean;
}
export interface MetaResult {
  videos: Record<string, Meta | null>;
  list?: { title: string; author: string } | null;
}

/** Titles and channels for some videos (and the playlist's name). Missing entries stay untitled. */
export async function fetchYouTubeMeta(ids: string[], list?: string): Promise<MetaResult> {
  const result: MetaResult = { videos: {} };
  for (let i = 0; i < ids.length || (i === 0 && list); i += 50) {
    const batch = ids.slice(i, i + 50);
    const params = new URLSearchParams({ ids: batch.join(",") });
    if (list && i === 0) params.set("list", list);
    try {
      const response = await fetch(`${assetUrl("tavern/youtube-meta")}?${params}`, {
        headers: { "x-tavern": "1" },
      });
      const type = response.headers.get("content-type") ?? "";
      if (!response.ok || !type.includes("json")) break; // dev server: no metadata helper
      const body = (await response.json()) as MetaResult;
      Object.assign(result.videos, body.videos ?? {});
      if (body.list !== undefined) result.list = body.list;
    } catch {
      break;
    }
    if (!ids.length) break;
  }
  return result;
}

/** Turn IDs + metadata into menu items; videos YouTube says are gone are left out. */
export function toItems(ids: string[], meta: MetaResult): YouTubeItem[] {
  const items: YouTubeItem[] = [];
  for (const id of ids) {
    const info = meta.videos[id];
    if (info === null) continue; // removed or private
    items.push({
      id,
      title: info?.title ?? "",
      author: info?.author ?? "",
      duration: 0,
      ...(info?.blocked ? { blocked: true } : {}),
    });
  }
  return items;
}

/** A YouTube video as a glass on the bar. */
export function toYouTubeTrack(item: YouTubeItem): TavernTrack {
  const tags = ["YouTube"];
  if (item.duration > 360) tags.push("长饮");
  else if (item.duration > 0 && item.duration < 130) tags.push("短杯");
  return {
    id: youtubeTrackId(item.id),
    fingerprint: `youtube:${item.id}`,
    fileName: "",
    fileSize: 0,
    lastModified: 0,
    mimeType: "",
    title: item.title || `YouTube · ${item.id}`,
    alias: "",
    artist: item.author || "YouTube",
    album: "",
    duration: item.duration,
    tags,
    addedAt: 0,
    status: item.blocked ? "missing" : "ready",
    stored: false,
    source: "youtube",
    youtubeId: item.id,
    coverUrl: youtubeThumb(item.id),
  };
}
