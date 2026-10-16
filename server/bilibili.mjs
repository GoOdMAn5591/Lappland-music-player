// Reading Bilibili for the host's menu: titles, lengths and the videos of a
// collection (合集), a series, a public favourites folder or a many-part video,
// from Bilibili's public web API (the calls bilibili.com itself makes, without
// signing in). Browsers can't call it from another site (no CORS), so the
// host's page asks the tavern server. The videos themselves are never fetched:
// every listener plays them in Bilibili's own embedded player.

const API = (process.env.TAVERN_BILI_API || "https://api.bilibili.com").replace(/\/$/, "");
/** Test hook: where b23.tv short links are looked up instead. */
const SHORT_BASE = process.env.TAVERN_BILI_SHORT || "";
const HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  referer: "https://www.bilibili.com/",
  accept: "application/json, text/plain, */*",
};
/** A page holds at most this many videos. */
export const MAX_ITEMS = 200;
const BVID = /BV1[0-9A-Za-z]{9}/;
const DIGITS = /^\d{1,20}$/;
const SHORT_HOSTS = /(^|\.)(b23\.tv|bili2233\.cn)$/i;
const BILI_HOSTS = /(^|\.)bilibili\.com$/i;

export class BilibiliError extends Error {
  constructor(reason, code) {
    super(reason);
    /** missing | private | limited | offline | unsupported | unknown */
    this.reason = reason;
    this.code = code;
  }
}

const id = (value) => (value && DIGITS.test(String(value)) ? String(value) : undefined);

/** What the pasted text points at (a link, a bare BV/av/ml ID or a share text). */
export function parseBilibiliLink(input) {
  const text = String(input || "").trim().slice(0, 2000);
  if (!text) return undefined;
  const found = text.match(/https?:\/\/[^\s"'<>，。、）)】]+/i);
  if (found) {
    let url;
    try {
      url = new URL(found[0]);
    } catch {
      url = undefined;
    }
    if (url) {
      const host = url.hostname.toLowerCase();
      if (SHORT_HOSTS.test(host)) return { kind: "short", url: `https://${host}${url.pathname}` };
      if (BILI_HOSTS.test(host)) {
        const parsed = parseBilibiliUrl(url);
        if (parsed) return parsed;
      }
    }
  }
  const short = text.match(/\b(b23\.tv|bili2233\.cn)\/[A-Za-z0-9]+/i);
  if (short) return { kind: "short", url: `https://${short[0]}` };
  const bv = text.match(BVID);
  if (bv) return { kind: "video", bvid: bv[0] };
  const av = text.match(/\bav(\d{1,20})\b/i);
  if (av) return { kind: "video", aid: av[1] };
  const ml = text.match(/\bml(\d{1,20})\b/i);
  if (ml) return { kind: "favorites", id: ml[1] };
  return undefined;
}

function parseBilibiliUrl(url) {
  const path = url.pathname;
  const q = url.searchParams;
  const p = Math.floor(Number(q.get("p")));
  const part = p >= 1 && p <= 9999 ? { p } : {};
  let m;
  if ((m = path.match(/\/video\/(BV1[0-9A-Za-z]{9})/))) return { kind: "video", bvid: m[1], ...part };
  if ((m = path.match(/\/video\/av(\d{1,20})/i))) return { kind: "video", aid: m[1], ...part };
  if (url.hostname.toLowerCase().startsWith("space.")) {
    const mid = id((path.match(/^\/(\d+)/) || [])[1]);
    const sid = id(q.get("sid"));
    if (/\/channel\/collectiondetail/.test(path) && sid) return { kind: "season", id: sid, mid };
    if (/\/channel\/seriesdetail/.test(path) && sid) return { kind: "series", id: sid, mid };
    if ((m = path.match(/\/lists\/(\d{1,20})/)))
      return { kind: q.get("type") === "series" ? "series" : "season", id: m[1], mid };
    if (/\/favlist/.test(path) && id(q.get("fid")))
      return q.get("ftype") === "collect"
        ? { kind: "season", id: q.get("fid") }
        : { kind: "favorites", id: q.get("fid") };
  }
  if ((m = path.match(/\/(?:list|medialist\/detail|medialist\/play)\/ml(\d{1,20})/)))
    return { kind: "favorites", id: m[1] };
  if ((m = path.match(/^\/list\/(\d{1,20})/)) && id(q.get("sid")))
    return { kind: "season", id: q.get("sid"), mid: m[1] };
  const bv = q.get("bvid") || path;
  const named = String(bv).match(BVID);
  if (named) return { kind: "video", bvid: named[0], ...part };
  return undefined;
}

// --------------------------------------------------------------------- API

async function api(path, params) {
  let response;
  try {
    response = await fetch(`${API}${path}?${new URLSearchParams(params)}`, {
      headers: HEADERS,
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new BilibiliError("offline");
  }
  if (response.status === 412 || response.status === 429) throw new BilibiliError("limited", response.status);
  if (!response.ok) throw new BilibiliError("unknown", response.status);
  let body;
  try {
    body = await response.json();
  } catch {
    throw new BilibiliError("limited");
  }
  if (body.code === 0) return body.data ?? {};
  const code = Number(body.code);
  if ([-404, 62002, 62004, 62012, 11010].includes(code)) throw new BilibiliError("missing", code);
  if ([-403, 11017, 11015, 53013].includes(code)) throw new BilibiliError("private", code);
  if ([-412, -352, -509, -799].includes(code)) throw new BilibiliError("limited", code);
  throw new BilibiliError("unknown", code);
}

const clip = (value, max) => String(value ?? "").slice(0, max);
const https = (value) =>
  typeof value === "string" && /^(https?:)?\/\/[a-z0-9.-]*hdslb\.com\//i.test(value)
    ? value.replace(/^(https?:)?\/\//i, "https://").slice(0, 300)
    : "";
const seconds = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.min(86_400, Math.round(n)) : 0;
};
const item = (bvid, p, title, author, duration, cover) => ({
  bvid,
  p,
  title: clip(title, 200),
  author: clip(author, 120),
  duration: seconds(duration),
  ...(https(cover) ? { cover: https(cover) } : {}),
});

async function readVideo({ bvid, aid, p }) {
  const data = await api("/x/web-interface/wbi/view", bvid ? { bvid } : { aid });
  if (!data.bvid) throw new BilibiliError("missing");
  if (data.is_upower_exclusive || data.rights?.pay || data.rights?.ugc_pay) throw new BilibiliError("unsupported");
  const author = data.owner?.name;
  const pages =
    Array.isArray(data.pages) && data.pages.length
      ? data.pages
      : [{ page: 1, part: data.title, duration: data.duration }];
  const many = pages.length > 1;
  const picked = p ? pages.filter((page) => page.page === p) : pages;
  const items = (picked.length ? picked : pages.slice(0, 1))
    .slice(0, MAX_ITEMS)
    .map((page) =>
      item(data.bvid, page.page || 1, many ? page.part || `${data.title} P${page.page}` : data.title, author, page.duration, data.pic),
    );
  const season = data.ugc_season;
  return {
    kind: many && !p ? "parts" : "video",
    id: data.bvid,
    title: clip(data.title, 200),
    author: clip(author, 120),
    url: `https://www.bilibili.com/video/${data.bvid}`,
    items,
    ...(season?.id
      ? {
          season: {
            id: String(season.id),
            mid: String(season.mid || data.owner?.mid || ""),
            title: clip(season.title, 200),
            count: Number(season.ep_count) || 0,
          },
        }
      : {}),
  };
}

async function readSeason({ id: seasonId, mid }) {
  const items = [];
  let title = "";
  let author = "";
  let owner = mid;
  for (let page = 1; page <= 10 && items.length < MAX_ITEMS; page++) {
    const data = await api("/x/space/fav/season/list", { season_id: seasonId, pn: page, ps: 20 });
    if (page === 1 && !data.info) throw new BilibiliError("missing");
    title ||= data.info?.title || "";
    author ||= data.info?.upper?.name || "";
    owner ||= data.info?.upper?.mid ? String(data.info.upper.mid) : undefined;
    // Bilibili often sends the whole collection at once, whatever page was asked
    const medias = Array.isArray(data.medias) ? data.medias : [];
    const before = items.length;
    for (const media of medias)
      if (media?.bvid && BVID.test(media.bvid) && !items.some((had) => had.bvid === media.bvid))
        items.push(item(media.bvid, 1, media.title, media.upper?.name || author, media.duration, media.cover));
    if (items.length === before) break;
    const total = Number(data.info?.media_count) || 0;
    if (medias.length < 20 || (total && items.length >= total)) break;
  }
  return {
    kind: "season",
    id: seasonId,
    ...(owner ? { mid: owner } : {}),
    title: clip(title, 200),
    author: clip(author, 120),
    url: owner
      ? `https://space.bilibili.com/${owner}/lists/${seasonId}?type=season`
      : "https://www.bilibili.com/",
    items: items.slice(0, MAX_ITEMS),
  };
}

async function readSeries({ id: seriesId, mid }) {
  const meta = await api("/x/series/series", { series_id: seriesId });
  if (!meta.meta) throw new BilibiliError("missing");
  const owner = mid || (meta.meta?.mid ? String(meta.meta.mid) : undefined);
  if (!owner) throw new BilibiliError("missing");
  const items = [];
  for (let page = 1; page <= 7 && items.length < MAX_ITEMS; page++) {
    const data = await api("/x/series/archives", {
      mid: owner,
      series_id: seriesId,
      only_normal: "true",
      sort: "asc",
      pn: page,
      ps: 30,
    });
    const archives = Array.isArray(data.archives) ? data.archives : [];
    for (const archive of archives)
      if (archive?.bvid && BVID.test(archive.bvid))
        items.push(item(archive.bvid, 1, archive.title, "", archive.duration, archive.pic));
    const total = Number(data.page?.total) || 0;
    if (archives.length < 30 || (total && items.length >= total)) break;
  }
  let author = "";
  if (items[0]) {
    try {
      author = (await api("/x/web-interface/wbi/view", { bvid: items[0].bvid })).owner?.name || "";
    } catch {
      /* the author's name is optional */
    }
  }
  for (const entry of items) entry.author ||= clip(author, 120);
  return {
    kind: "series",
    id: seriesId,
    mid: owner,
    title: clip(meta.meta?.name, 200),
    author: clip(author, 120),
    url: `https://space.bilibili.com/${owner}/lists/${seriesId}?type=series`,
    items: items.slice(0, MAX_ITEMS),
  };
}

async function readFavorites({ id: folderId }) {
  const items = [];
  let title = "";
  let author = "";
  let owner;
  for (let page = 1; page <= 10 && items.length < MAX_ITEMS; page++) {
    const data = await api("/x/v3/fav/resource/list", { media_id: folderId, pn: page, ps: 20, platform: "web" });
    // a folder that isn't there answers "OK" with nothing in it
    if (page === 1 && !data.info) throw new BilibiliError("missing");
    title ||= data.info?.title || "";
    author ||= data.info?.upper?.name || "";
    owner ||= data.info?.upper?.mid ? String(data.info.upper.mid) : undefined;
    const medias = Array.isArray(data.medias) ? data.medias : [];
    for (const media of medias) {
      // only videos; "已失效视频" are gone from Bilibili
      const gone = media?.attr === 1 || media?.attr === 9 || media?.title === "已失效视频";
      if (media?.type !== 2 || gone || !BVID.test(media.bvid || "")) continue;
      items.push(item(media.bvid, 1, media.title, media.upper?.name, media.duration, media.cover));
    }
    if (!data.has_more || !medias.length) break;
  }
  return {
    kind: "favorites",
    id: folderId,
    ...(owner ? { mid: owner } : {}),
    title: clip(title, 200),
    author: clip(author, 120),
    url: owner
      ? `https://space.bilibili.com/${owner}/favlist?fid=${folderId}`
      : `https://www.bilibili.com/list/ml${folderId}`,
    items: items.slice(0, MAX_ITEMS),
  };
}

/** Follow a b23.tv share link to the page it stands for (only to Bilibili). */
async function expand(short) {
  const target = SHORT_BASE ? `${SHORT_BASE.replace(/\/$/, "")}${new URL(short).pathname}` : short;
  let response;
  try {
    response = await fetch(target, {
      headers: { "user-agent": HEADERS["user-agent"] },
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new BilibiliError("offline");
  }
  const location = response.headers.get("location") || "";
  const parsed = parseBilibiliLink(location);
  if (!parsed || parsed.kind === "short") throw new BilibiliError("missing");
  return parsed;
}

const cache = new Map();
const CACHE_MS = 10 * 60 * 1000;

/** Everything the menu needs for whatever was pasted. */
export async function readBilibili(input) {
  let what = parseBilibiliLink(input);
  if (!what) throw new BilibiliError("unsupported");
  if (what.kind === "short") what = await expand(what.url);
  const key = JSON.stringify(what);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.result;
  const result =
    what.kind === "video"
      ? await readVideo(what)
      : what.kind === "season"
        ? await readSeason(what)
        : what.kind === "series"
          ? await readSeries(what)
          : await readFavorites(what);
  if (cache.size > 300) cache.clear();
  cache.set(key, { at: Date.now(), result });
  return result;
}
