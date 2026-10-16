# Bilibili Integration

Implemented 2026-10. Bilibili videos play in Bilibili's own embedded player (`player.bilibili.com/player.html`), the player Bilibili offers for other websites. No account and no API key are used.

## Pieces

| File | Role |
| --- | --- |
| `server/bilibili.mjs` | Reads what was pasted: link parsing, b23.tv short links, Bilibili's public web API for videos, collections, series and favourites folders. Errors become reasons (`missing`, `private`, `limited`, `offline`, `unsupported`, `unknown`). |
| `server/tavern-server.mjs` | `GET /tavern/bilibili-meta?link=…`: local-only (loopback, no tunnel headers, `x-tavern` header). 10-minute cache. `TAVERN_BILI_API` and `TAVERN_BILI_SHORT` override the endpoints (tests). |
| `src/integrations/bilibili/catalog.ts` | Asks the server (`readBilibili`), builds the embed, watch and collection URLs, `toBilibiliTrack`. |
| `src/integrations/bilibili/player.ts` | `bilibiliEngine`: drives the embedded player by reloading it, estimates the position, ends a video when its length runs out, learns how long the player takes to load on this computer. |
| `src/components/BilibiliScreen.tsx` | The screen in the corner of the bar (the YouTube screen's place; only one of them shows at a time). Shield, lock, "open on Bilibili", size toggle. |
| `src/components/BilibiliPanel.tsx` | Paste a link; offer the whole collection for a video that belongs to one; list and refresh Bilibili pages; limits and the user agreement link. |

## Driving a player that has no remote control

The embedded player has no JavaScript API and posts nothing to its parent page (checked 2026-10: it sends no play, pause or time messages). So:

- Every start, jump and pause is a new load: `player.html?bvid=…&p=…&autoplay=1|0&danmaku=0&t=<seconds>` (`t` takes decimals; `p` picks the part of a many-part video). A nonce (`_`) makes each load fresh, and the screen remounts the iframe on it.
- The position is estimated: `t + (now − (iframe load + 1.7 s))`. Measured against the real player, the sound starts 1.1–2.3 s after the iframe's `load` on a warm connection, now and then much later. How long the page itself takes to load is learned per computer (`loadS`, a moving average).
- The end of a video is its length from Bilibili's API (whole seconds) plus 0.5 s, because the video often runs a little past the rounded figure. A load that hasn't finished after 30 s is an error, and the bar moves on.
- A clear shield lies over the player so a click on the picture is the bar's own play / pause. The listener can unlock it to use Bilibili's controls (for example, to start the sound when the browser blocked autoplay). It locks again after a minute. What happens in the unlocked player isn't seen by the tavern.
- The iframe is sandboxed without `allow-top-navigation`: the player may open Bilibili in a new tab, but can't take the tavern's tab away.

## Quality and signing in

Embedded players are capped at 360P (64 kbps audio), signed in or not (checked with a 大会员 account, 2026-10). Higher quality exists only on bilibili.com, so the screen's 「在 B站打开」 opens the video there at the current second. The tavern doesn't fetch Bilibili's video streams itself (that would mean signing Bilibili's private requests and faking its referrer check), and it never relays them.

## Reading links

The server calls the same public endpoints bilibili.com's own pages call, without signing in:

| Link | Endpoint | Notes |
| --- | --- | --- |
| Video (`/video/BV…`, `av…`, bare BV ID, `?p=`) | `/x/web-interface/wbi/view` | Works unsigned. Gives title, owner, parts and the collection (`ugc_season`) it belongs to. Many parts without `?p=` → a page of parts. |
| Collection 合集 (`/lists/<id>?type=season`, `collectiondetail?sid=`, `favlist?ftype=collect`, `/list/<mid>?sid=`) | `/x/space/fav/season/list` | Sends the whole collection at once, whatever page is asked; duplicates are dropped. |
| Series 系列 (`/lists/<id>?type=series`, `seriesdetail?sid=`) | `/x/series/series`, `/x/series/archives` | 30 per page. |
| Favourites folder (`favlist?fid=`, `/list/ml…`, `/medialist/detail/ml…`, `ml…`) | `/x/v3/fav/resource/list` | Public folders only. A folder that isn't there answers `code 0` with no data. 已失效视频 (`attr` 1 / 9) are left out. |
| Share text or short link (`b23.tv`, `bili2233.cn`) | — | One redirect is followed (`redirect: "manual"`), only to bilibili.com. |

Answers: `-404`, `62002`, `62004`, `62012`, `11010` → missing; `-403`, `11017`, `11015`, `53013` → private; HTTP 412 / 429 and `-412`, `-352`, `-509`, `-799` → limited (try again later); no connection → offline; paid, 充电专属 and anything that isn't a video link → unsupported. A page holds at most 200 videos.

These are Bilibili's website endpoints, not a published API: they can change or refuse requests without notice. The panel then says so instead of failing silently.

## Data

A Bilibili page is a `TavernPlaylist` with `bilibili: { kind, id?, mid?, url, items[], fetchedAt }`. `kind` is `picks` (single videos), `parts`, `season`, `series` or `favorites`. `trackIds` are `bilibili-<bvid>-<p>`. Items keep bvid, part, title, author, length, cover (hdslb.com only, loaded without a referrer) and `blocked`. The picks page can be reordered and trimmed. The other pages follow Bilibili's order, and 刷新 reads them again. Exported JSON keeps the pages like any other playlist.

## 同席

See [multiplayer.md](multiplayer.md#bilibili-videos). Only the video's ID and part travel through the room; every listener plays it in their own screen.

## Limits

- 360P in the embedded player, signed in or not.
- The volume follows the computer's volume keys: the player doesn't let other pages set it.
- The position is an estimate (usually within a second). Each pause, jump or new video reloads the screen, which shows Bilibili's loading picture for a moment.
- Paid videos, 充电专属 videos, 番剧 and films can't be played. Private folders must be made public first.
- `npm run dev` has no tavern server, so links can't be read there; start the tavern with the launcher (or `node server/tavern-server.mjs`).

## Sources

- [哔哩哔哩用户协议](https://www.bilibili.com/protocal/licence.html)
