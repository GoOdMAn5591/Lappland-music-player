# 同席 (listen together)

Implemented as "the host's computer is the tavern". There are no accounts and no hosted backend. The launcher's local server (`server/tavern-server.mjs`) serves the app and hosts the room. A Cloudflare quick tunnel (trycloudflare.com) makes that room reachable from the internet while the room is open.

## Flow

1. The host opens the room from the 同席 panel. `POST /room/open` is accepted only from this computer. It creates an unpredictable 128-bit room key and starts `cloudflared tunnel --url http://127.0.0.1:5173`. The first time, Cloudflare's release binary is downloaded into `tools/` (`server/cloudflared.mjs`: the Windows/Linux builds are plain programs, the macOS ones — Apple silicon or Intel — come as `.tgz` and are unpacked in Node; a `cloudflared` already on PATH or in Homebrew's folders is used as is).
2. The invite link is `https://<random>.trycloudflare.com/?room=<key>`. Guests open it in any browser, type a name and press 入座. That click is also the gesture that lets their browser play audio.
3. The host's page posts library metadata, playback snapshots and the audio of the current and next track. Guests receive snapshots over Server-Sent Events, stream the relayed audio with HTTP Range requests, and send commands back (`play | toggle | next | prev | seek | mode`). The host page applies those commands with its normal controls, so its player is the single source of truth.

## Security and privacy

- The server binds to 127.0.0.1 only. Anything arriving through the tunnel carries `Cf-Connecting-Ip` and is never treated as the host. Every remote request must present the room key, compared in constant time. Host-only routes also require a local `Host`, the `x-tavern` header and a same-origin `Origin`, so other websites can't drive them.
- Guests see titles, aliases, artists, albums, durations, tags, glass/tint choices, playlists and covers. File names, sizes, fingerprints and local paths are never sent.
- Only the current and next track's audio leaves the computer, kept in server memory (at most 4 tracks) and dropped when the room closes. It is served only to people holding the key. This is meant for private listening among friends; don't post the link publicly.
- Commands are rate-limited (12 per 3 s per member), and bodies are size-limited (JSON 4 MB, audio 400 MB, covers 6 MB).

## Transport

Events go out over Server-Sent Events first. Some tunnels hold an event stream back instead of passing it through: the server seats the guest, but the guest never receives `hello`. If `hello` doesn't arrive within 2.5 s, the guest switches to long-polling `/room/poll?since=<seq>`. Each member has a numbered event queue (last 300 events). A poll returns immediately when there is news, otherwise after 25 s; `since=-1` returns the full state. The choice is remembered for the tab. A guest who still has no `hello` after 25 s sees the "敲不开门" card with a retry button instead of a spinner. Polling members count as present while they keep polling (35 s grace); streaming members, 4 s after their stream closes.

Guests often open the link with the browser's page translation on. Translation replaces text nodes behind React's back, and React's next update would throw `insertBefore`/`removeChild` errors and unmount the app, leaving a black page. `src/translateGuard.ts` installs the usual tolerant `removeChild`/`insertBefore` patch before React mounts. `AppErrorBoundary` shows any remaining error with a reload button instead of a blank page. Library data from the host is normalised on the guest (strings, tags, durations). Each glass's look seed travels with the track, so guests see the same drinks as the host.

## Sync

- Clock offset: NTP-style sampling of `/room/time`, keeping the lowest-RTT sample and refreshing every 30 s.
- Snapshots are stamped with the server clock. A guest projects the playhead and seeks when more than 0.5 s off, aiming ahead by the seek latency it has measured (`seeked` timing). Otherwise it adjusts `playbackRate` within ±8 % (pitch preserved) until within 30 ms.
- In tests: about 20–40 ms on loopback. With a 180 ms / 2 Mbps throttled guest, playback converges to about 0.1 s within a few seconds and recovers from a seek in one jump.

## Limits

- Quick-tunnel URLs change every time a room opens, and Cloudflare offers quick tunnels without uptime guarantees. A named tunnel or a hosted relay would be needed for a permanent address.
- Every listener streams from the host's upload bandwidth. Large FLAC/WAV files take longer to start for guests.
- If the host page disconnects, the room survives for 90 s, so a refresh doesn't end it. Closing the server window ends the room.
- Spotify songs and YouTube videos are never relayed. See below.

## Spotify songs

Spotify audio must not be rebroadcast, so a Spotify song in the room carries only its URI, metadata and the Spotify cover URL (`RoomTrack.spotify`). The host's library also shares the host app's public Client ID. Each guest signs in with their own Spotify Premium account (which must be on the host app's User Management list) and plays the song on their own Web Playback SDK device; the room only tells them which song and which second. Guests jump when more than 0.75 s off; Spotify has no playback-rate control. A guest who isn't signed in still sees the song, cover and progress, plus a prompt to sign in. Details in [spotify.md](spotify.md).

## YouTube videos

A YouTube video carries only its video ID and title (`RoomTrack.youtube`). Every listener, guests included, plays it in their own YouTube screen; no account is needed. The host's player is the clock (`rolling` counts a short re-buffer after a jump as still playing). Guests start at `target + lead` (lead learned from start latency, ignoring waits over 5 s, which are ads) and jump when more than 0.5 s off, or at once when the host's news says someone jumped. Pressing pause or dragging the seek bar inside YouTube's own player becomes a room command (`toggle` / `seek`); the guest's sync loop checks for such a jump first and holds off for 2.5 s, so it never pulls the video back before the host answers. Details in [youtube.md](youtube.md).
