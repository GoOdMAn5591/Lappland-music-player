# YouTube Integration

Implemented 2026-10. Checked against the YouTube API Services Developer Policies and the Required Minimum Functionality page.

## Pieces

| File | Role |
| --- | --- |
| `src/integrations/youtube/player.ts` | `youtubeEngine`: loads the IFrame Player API on first use, one player inside `YouTubeScreen`; play / pause / seek / volume, interpolated position, end, errors (100 removed/private, 101/150 embedding refused), and actions taken on YouTube's own controls (`user` events: play, pause, seek). |
| `src/integrations/youtube/catalog.ts` | Link parsing (`watch?v=`, `youtu.be/`, `shorts/`, `embed/`, `list=`), playlist reading through a visible player (`cuePlaylist` + `getPlaylist`, up to 200 IDs), titles through the local server, `toYouTubeTrack`. |
| `src/components/YouTubeScreen.tsx` | The screen in the corner of the bar (356×200, or 480×270 enlarged; top of the screen on tablets / phones). Hidden and stopped whenever another source plays. |
| `src/components/YouTubePanel.tsx` | Paste a playlist or video; list / refresh YouTube pages; terms and privacy links. |
| `server/tavern-server.mjs` | `GET /tavern/youtube-meta?ids=…&list=…`: local-only (loopback, no tunnel headers, `x-tavern` header) oEmbed lookups with a cache. 404 → removed, 401/403 → can't be embedded. `TAVERN_YT_OEMBED` overrides the endpoint (tests). |

No API key and no Google account are used.

## Data

A YouTube page is a `TavernPlaylist` with `youtube: { list?, url, items[], fetchedAt }`; `trackIds` are `youtube-<videoId>`. Items keep id, title, channel, length (learned the first time a video plays) and `blocked`. YouTube allows stored API data for at most 30 days: `expireYouTube` empties a page past that (on load, on save, on import), and the page asks to be read again. The picks page (single videos, no `list`) can be reordered and trimmed; playlist pages follow YouTube's order.

## Policy points this follows

- Player visible while it plays, ≥ 200 × 200 px, nothing drawn over it, YouTube's controls, branding and ads untouched; no hidden or background player (the screen stops and hides when another source plays).
- Only one player autoplays at a time (the reading player in the panel only cues).
- The source is shown ("YouTube" label, link to the video), with links to YouTube's Terms of Service and Google's Privacy Policy in the panel.
- Stored data expires after 30 days.
- Personal, non-commercial use; this reading of the policies is not legal advice.

## Sources

- [YouTube API Services – Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
- [Required Minimum Functionality](https://developers.google.com/youtube/terms/required-minimum-functionality)
- [IFrame Player API](https://developers.google.com/youtube/iframe_api_reference)
