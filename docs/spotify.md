# Spotify Integration

Implemented 2026-10. Checked against Spotify's documentation and the February 2026 Development Mode changes (owner must have Premium, 5 users per app, playlist items only for owned / collaborative playlists, `/playlists/{id}/items` with `item` entries).

## Pieces

| File | Role |
| --- | --- |
| `src/integrations/spotify/pkce.ts` | State / verifier, S256 challenge, callback validation (origin, path, state, 10-minute expiry). |
| `src/integrations/spotify/auth.ts` | Client ID (env, pasted in the UI, or the host's via the room), PKCE transaction, code exchange, refresh with rotation, sign-out. Tokens live in `localStorage` of the page's own origin so a reload stays signed in; signing out deletes them. |
| `src/integrations/spotify/callback.ts` | Runs before the app on `/callback`: finishes a sign-in started on this origin (popup closes itself; full-page sign-in returns to `/`), or shows the address to copy when the sign-in belongs to another origin. |
| `src/integrations/spotify/api.ts` | `GET /me`, `/me/playlists`, `/playlists/{id}`, `/playlists/{id}/items` (fallback `/tracks` on 404), `/me/tracks`, `PUT /me/player/play` with `device_id`, repeat/shuffle off. 401 → refresh once; 429/503 → `Retry-After`. Max 1000 songs per page. |
| `src/integrations/spotify/player.ts` | The Web Playback SDK device: load on first play, ready / not_ready / account / authentication / initialization errors, interpolated position, end-of-song detection (back at 0, autoplay moved on, or overdue), outside pause / device transfer (`held`). |
| `src/integrations/spotify/session.ts` | Account check (`GET /me`; 403 = not on the app's user list), sign-in popup / paste flow, problem texts. |
| `src/components/SpotifyPanel.tsx` | Setup guide (create app, Redirect URI, Client ID, User Management), playlist picker, guest sign-in. |

`src/player/SpotifyAudioSource.ts` remains the older injected-port contract used by the architecture test; the controller drives `spotifyEngine` directly.

## Data

- A linked playlist is a `TavernPlaylist` with `spotify: { id, url, owner }`. Saved / exported menus keep only that link (`persistablePlaylists` empties `trackIds`); songs are fetched again each session.
- A Spotify song is a `TavernTrack` with `source: "spotify"`, `spotifyUri`, `spotifyUrl`, `coverUrl` (Spotify CDN). It never gets an `objectUrl`, is never stored in IndexedDB and never enters the Web Audio analyser.
- Spotify pages are read-only in the tavern (order follows Spotify, no local editing).

## Sign-in

Redirect URI: `http://127.0.0.1:5173/callback` (overridable with `VITE_SPOTIFY_REDIRECT_URI`). `localhost` is not accepted by Spotify.

- Host (page on 127.0.0.1:5173): a popup goes to Spotify and comes back to `/callback` on the same origin, which shares `localStorage` with the bar; the bar picks up the token through the `storage` event. If the popup is blocked, the whole page goes and comes back.
- Friend at a shared table (page on a changing `trycloudflare.com` address that can't be registered): the same Redirect URI lands on their own 127.0.0.1, which doesn't load. They paste that address back; the verifier never left their page, so the code is useless to anyone else. The Client ID comes from the host through the room (`spotifyClientId` in the library; the server only accepts 32 hex characters).

No Client Secret exists anywhere in the project.

## Playback and 同席

- Local and Spotify never overlap: switching source stops the other first (Developer Policy III.7).
- The host's Spotify device is the clock. A Spotify snapshot only says "playing" once the host's song really started (`audible()`); `started` / `seeked` events publish fresh positions.
- Guests: the room's sync loop starts the song on the guest's own device at `target + lead` (lead learned from start latency), pauses with the host, and jumps when more than 0.75 s off (jump lead learned from where the last jump landed). Spotify has no playback-rate control, so there's no gentle drift correction as with relayed local audio.
- No Spotify audio, cover or file passes through the tavern server.

## Policy notes

- Playback requires Premium (SDK, Developer Policy IV.1); non-Premium shows a clear message.
- Cover art, metadata, "supplied by Spotify" and a link back are shown while a Spotify song plays (Policy II.4, II.5).
- Spotify songs don't drive the bar's music-reactive visuals (Policy III.6); the analyser only ever sees local audio.
- 同席 does not stream one source to several listeners (Policy III.4): every listener streams from their own account in their own browser. Personal, non-commercial use in Development Mode only. This is a design reading, not a legal opinion or platform approval — recheck the policy before sharing more widely.

## Sources

- [February 2026 Development Mode migration guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide)
- [Web Playback SDK](https://developer.spotify.com/documentation/web-playback-sdk)
- [PKCE](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow)
- [Redirect URIs](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri)
- [Get Playlist Items](https://developer.spotify.com/documentation/web-api/reference/get-playlists-items)
- [Developer Policy](https://developer.spotify.com/policy)
