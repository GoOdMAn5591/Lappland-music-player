# Architecture

```text
src/
  app/             controller, drink recipes (glass shape / palette per track), glass profiles
  scene3d/         the WebGL tavern: TavernScene, bar, bottle wall, room, glasses, Lappland, post FX
  components/      BarScene bridge + glass hotspots, dialogs; hud/ = top bar, plaque, lip progress, transport, menu drawer
  entrance/        TavernEntrance and Three.js doors
  character/       bundled portrait URL, composition settings (size / position / motion)
  player/          Player Store, source adapters and the local Web Audio graph (analyser)
  storage/         IndexedDB blobs, metadata and JSON validation
  assets/fonts/    vendored, unicode-range sliced OFL fonts
  integrations/spotify/  PKCE sign-in, Web API calls, Web Playback SDK device (see spotify.md)
  integrations/youtube/  IFrame Player engine, link parsing, playlist reading (see youtube.md)
  multiplayer/     同席 room client (room.ts) and the useRoom hook (host + guest sync)
server/            tavern-server.mjs: serves dist/, hosts the room, runs the cloudflared quick tunnel
```

`App` composes views; `useTavernController` coordinates local playback, library operations and scene intent. `useLocalVisualizer` owns the local audio graph and exposes the analyser. Views consume a typed controller without opening databases or sockets.

## 3D scene

`TavernScene` (lazy-loaded) owns one WebGLRenderer, a perspective camera framed per aspect ratio, a procedural HDR light probe (PMREM for physical materials, sharp equirect for glass/liquid shaders) and `PostFX` (MSAA HDR target → depth-of-field gather → UnrealBloom → ACES + grade + vignette + grain). World units are metres; Lappland stands just inside the semicircular counter (`scene3d/layout.ts`).

- `GlassCarousel` keeps one `Glass` per visible track keyed by id. Each glass has a spring-driven ring offset `s` (θ = s·step on the glass ring), so every move stays on the arc. Wrapping glasses fade out at one end and in at the other. Liquid tilt is a damped spring driven by the glass's own acceleration; surface waves/ripples follow the analyser bands.
- Liquids are lathe volumes cut by an analytic surface in the fragment shader; back faces are shaded as the surface (ray–plane intersection in glass space).
- `LapplandCharacter` is a 157×198 mesh with per-vertex deformer weights computed on the CPU (head, ear, ponytail chain, two ribbons, fringe, both arms), Gaussian-smoothed on the grid so neighbouring regions never shear. The body only moves rigidly (a breath that lifts the upper body and a slow lean about the hips); head and arms rotate as rigid parts and only hair and ribbons bend. The character image is the bundled cut-out; portrait import and the Live2D hook were removed.
- The scene publishes `FrameInfo` (projected glasses, bar lip, plaque anchor) every frame. React lays invisible, focusable buttons over the glasses (hover, click, keyboard, drag-to-reorder) and the HUD draws the progress scale along the projected lip, without re-rendering React per frame.
- `?manual` disables the render loop and exposes `window.__tavern` for deterministic tests; `?quality=low|medium|high` pins the quality.

`PlayerState` contains currentTrack (catalog ID), sourceType, isPlaying, position, duration, volume, queue, repeatMode and shuffle. `useSyncExternalStore` is the React boundary. Legacy library repeat modes map to these fields. Metadata stays in the catalog.

`AudioSource` defines load/play/pause/seek/setVolume/dispose and capabilities. `LocalAudioSource` accepts only object URLs or the room's relayed audio. Spotify songs are played by `spotifyEngine` (Web Playback SDK) under the listener's own account, YouTube videos by `youtubeEngine` in the visible `YouTubeScreen`. The controller switches by `track.source`: it stops the other sources first, so they never overlap.

## Storage

`lappland-tavern-player` v2 has `library` (v1 JSON metadata) and `audio` (audio + cover Blobs indexed by filename/size/modified-time fingerprint). This identity hint is not a content hash. Startup restores object URLs; cleanup revokes them. Legacy metadata-only libraries migrate without losing edits and show missing audio.

Single-track deletion and clearing use transactions spanning Blob and metadata stores. Failed deletion preserves current state. Blob failure allows session-only playback, metadata can fall back to localStorage. Config import replaces the visible catalog; unmatched old Blobs may remain until the cellar is cleared and count toward storage usage.

The character composition (zoom, position, motion strength) is kept in `localStorage` under `tavern-character-rig`. On first start it is carried over from the older `tavern-character` IndexedDB record when that record held Lappland's own picture; the stored picture itself is no longer used. No machine-specific asset path is used.

## Extension Rules

- Keep credentials and providers outside visual components.
- Do not route Spotify into the local Blob store or FFT visualizer.
- New sources report real capabilities and failures, not simulated connected state.
- A real room adapter needs authentication, host authorization, schema validation, revisions and time correction.
- Preserve keyboard/dialog behavior, reduced motion, mobile composition and deterministic fixtures.

## 同席 (listen together)

The launcher serves the production build with `server/tavern-server.mjs` on `127.0.0.1:5173` (same origin as before, so IndexedDB is unchanged). The server has no dependencies and listens on loopback only.

- **Host.** The page on the host's own computer opens the room (`POST /room/open`, loopback-only, needs the `x-tavern` header and a matching Origin). The server creates a random room key and starts `cloudflared tunnel --url http://127.0.0.1:5173`, downloading Cloudflare's release binary into `tools/` on first use. The invite link is the trycloudflare URL plus `?room=<key>`. Requests that arrive through the tunnel always carry `Cf-Connecting-Ip`, so they are never treated as the host, and every guest request must present the key.
- **State.** The host's player stays the only source of truth. It posts snapshots `{trackId, isPlaying, position, mode}` on every change, on `seeked`/`playing` and every 4 s; the server stamps them with its own clock. It also posts library metadata (titles, playlists, glass/tint — no file names) and uploads the current and next track's audio (`PUT /room/audio/:id`) plus covers. Audio is kept in memory, at most 4 tracks, and served with HTTP Range support. A guest request for a track that is still uploading waits for the upload.
- **Events.** Server-Sent Events (`/room/events`) deliver hello / snapshot / library / members / notices to guests, and commands to the host. Guests send `play | toggle | next | prev | seek | mode` with `POST /room/command`; the server forwards them to the host page, which applies them through the normal controller functions and publishes the result.
- **Sync.** Guests estimate the server clock offset (NTP-style over `/room/time`). They project the playhead from the last snapshot, seek when more than 0.5 s off (leading by the measured seek latency) and otherwise nudge `playbackRate` (±8 %, pitch preserved) until within 30 ms.
- **Lifetime.** A guest page never touches its own IndexedDB library. If the host page disconnects, the room survives for 90 s, so a refresh keeps everyone seated. "打烊" or closing the server ends the room, stops the tunnel and drops the relayed audio.

