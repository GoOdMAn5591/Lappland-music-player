# Architecture

```text
src/
  app/             composition controller and drink helpers
  components/      stage, counter, carousel, glass, information and floating panels
  entrance/        TavernEntrance and Three.js doors
  character/       PNG mesh rig, calibration and future runtime interface
  player/          Player Store, source adapters and local Web Audio visualization
  storage/         IndexedDB blobs, metadata and JSON validation
  integrations/spotify/  PKCE helpers and catalog contracts, no network connector
  multiplayer/     offline/WebSocket placeholder and sync protocol
  scene/           shared arc geometry and bottle wall
```

`App` composes views; `useTavernController` coordinates local playback, library operations and scene intent. `useLocalVisualizer` owns the local audio graph. Views consume a typed controller without opening databases or sockets.

`PlayerState` contains currentTrack (catalog ID), sourceType, isPlaying, position, duration, volume, queue, repeatMode and shuffle. `useSyncExternalStore` is the React boundary. Legacy library repeat modes map to these fields. Metadata stays in the catalog.

`AudioSource` defines load/play/pause/seek/setVolume/dispose and capabilities. `LocalAudioSource` accepts only object URLs. `SpotifyAudioSource` requires a separately implemented playback port; without one it refuses playback. Current controller selects only local. A future source coordinator must pause/dispose the prior source and gate unsupported capabilities before switching.

## Storage

`lappland-tavern-player` v2 has `library` (v1 JSON metadata) and `audio` (audio + cover Blobs indexed by filename/size/modified-time fingerprint). This identity hint is not a content hash. Startup restores object URLs; cleanup revokes them. Legacy metadata-only libraries migrate without losing edits and show missing audio.

Single-track deletion and clearing use transactions spanning Blob and metadata stores. Failed deletion preserves current state. Blob failure allows session-only playback, metadata can fall back to localStorage. Config import replaces the visible catalog; unmatched old Blobs may remain until the cellar is cleared and count toward storage usage.

`tavern-character` v1 stores the image and rig. The former default JPG migrates to the authorized PNG, preserving pose. Custom imports remain unchanged. No machine-specific asset path is used.

## Extension Rules

- Keep credentials and providers outside visual components.
- Do not route Spotify into the local Blob store or FFT visualizer.
- New sources report real capabilities and failures, not simulated connected state.
- A real room adapter needs authentication, host authorization, schema validation, revisions and time correction.
- Preserve keyboard/dialog behavior, reduced motion, mobile composition and deterministic fixtures.
