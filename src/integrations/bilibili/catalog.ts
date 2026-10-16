import { assetUrl } from "../../config";
import { bilibiliTrackId, type BilibiliItem, type TavernTrack } from "../../storage";

/**
 * Bilibili on the bar: what was pasted is read by the tavern's own server
 * (server/bilibili.mjs — browsers can't call Bilibili's API from another
 * site), the videos play in Bilibili's own embedded player.
 */

/** A page holds at most this many videos (as for YouTube). */
export const MAX_BILIBILI = 200;

export type BilibiliProblem =
  | "missing"
  | "private"
  | "limited"
  | "offline"
  | "unsupported"
  | "unknown"
  /** The page isn't served by the tavern server (npm run dev), or it's down. */
  | "server";

export interface BilibiliRead {
  kind: "video" | "parts" | "season" | "series" | "favorites";
  id: string;
  mid?: string;
  title: string;
  author: string;
  url: string;
  items: BilibiliItem[];
  /** A single video that belongs to a collection (合集). */
  season?: { id: string; mid: string; title: string; count: number };
}

/** A quick look before asking the server (which does the real reading). */
export const looksLikeBilibili = (text: string) =>
  /bilibili\.com|b23\.tv|bili2233\.cn|BV1[0-9A-Za-z]{9}|\bav\d{1,20}\b|\bml\d{1,20}\b/i.test(text);

export async function readBilibili(
  link: string,
): Promise<{ ok: true; result: BilibiliRead } | { ok: false; problem: BilibiliProblem }> {
  try {
    const response = await fetch(`${assetUrl("tavern/bilibili-meta")}?${new URLSearchParams({ link })}`, {
      headers: { "x-tavern": "1" },
    });
    const type = response.headers.get("content-type") ?? "";
    if (!response.ok || !type.includes("json")) return { ok: false, problem: "server" };
    const body = (await response.json()) as { ok?: boolean; result?: BilibiliRead; error?: BilibiliProblem };
    if (body.ok && body.result) return { ok: true, result: body.result };
    return { ok: false, problem: body.error ?? "unknown" };
  } catch {
    return { ok: false, problem: "server" };
  }
}

export const bilibiliWatchUrl = (bvid: string, p = 1, at = 0) => {
  const params = new URLSearchParams();
  if (p > 1) params.set("p", String(p));
  if (at >= 1) params.set("t", String(Math.floor(at)));
  const query = params.toString();
  return `https://www.bilibili.com/video/${bvid}${query ? `?${query}` : ""}`;
};

/** A collection's page on Bilibili, to read it again. */
export const bilibiliSeasonUrl = (id: string, mid: string) =>
  mid ? `https://space.bilibili.com/${mid}/lists/${id}?type=season` : `https://www.bilibili.com/list/${id}`;

/**
 * Bilibili's embedded player for one part, from `from` seconds. `nonce` makes
 * a fresh load even when nothing else changed (the player has no remote
 * control: every start, jump and pause is a new load).
 */
export function bilibiliEmbedUrl(bvid: string, p: number, from: number, autoplay: boolean, nonce = 0) {
  const params = new URLSearchParams({
    bvid,
    p: String(p),
    autoplay: autoplay ? "1" : "0",
    danmaku: "0",
  });
  if (from >= 0.5) params.set("t", from.toFixed(1));
  if (nonce) params.set("_", String(nonce));
  return `https://player.bilibili.com/player.html?${params}`;
}

/** A Bilibili video (part) as a glass on the bar. */
export function toBilibiliTrack(item: BilibiliItem): TavernTrack {
  const tags = ["B站"];
  if (item.duration > 360) tags.push("长饮");
  else if (item.duration > 0 && item.duration < 130) tags.push("短杯");
  return {
    id: bilibiliTrackId(item.bvid, item.p),
    fingerprint: `bilibili:${item.bvid}:${item.p}`,
    fileName: "",
    fileSize: 0,
    lastModified: 0,
    mimeType: "",
    title: item.title || `B站 · ${item.bvid}`,
    alias: "",
    artist: item.author || "Bilibili",
    album: "",
    duration: item.duration,
    tags,
    addedAt: 0,
    status: item.blocked ? "missing" : "ready",
    stored: false,
    source: "bilibili",
    bilibiliId: item.bvid,
    bilibiliPage: item.p,
    ...(item.cover ? { coverUrl: item.cover } : {}),
  };
}
