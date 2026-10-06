# Assets and Attribution

- `public/assets/lappland/lappland-cutout-transparent.png` is the user's supplied `lappland-cutout-transparent-recommended.png`, copied unchanged. Its 910 x 1200 canvas has alpha. SHA-256: `72d987207b4f5b4e761f635c5e52da4245bbb6f2ffd7da39df3e7bc1337efe8b`. Old default JPG installations migrate to this PNG while retaining pose adjustments.
- The owner explicitly confirmed permission for public distribution of this PNG on 2026-10-05. This records the owner's declaration, not independent rights verification. Third-party artwork, Lappland / Arknights characters and trademarks are excluded from the MIT code grant. Reusers must confirm their rights and any attribution requirements.
- The earlier JPG and duplicate PNG are retained only in the original developer's ignored `local-artwork/` directory, outside Git and Vite public assets. No other character art is fetched.
- `src/character/lapplandRig.ts` contains hand-positioned landmarks and a contour matte for this exact image. The renderer samples the original artwork and applies subtle breathing, hair deformation, head tracking and eye highlights. It does not generate a Cubism model or replace the character's features.
- Curtains, the 72-bottle backbar, hanging stemware, liquid and lights are implemented locally. The counter is a Three.js semicircular annulus with a procedural wood texture, brass rims, a vertical fascia and stave details. No new artwork is downloaded.
- `src/scene/barGeometry.ts` defines the shared ellipse projection. Counter vertices and each frame of the cup orbit use the same geometry; transitions do not interpolate along straight screen-space chords.
- The portrait rig includes separate ear, shoulder, chest, hair, ribbon, hand and held-glass landmarks. Pointer tracking is damped at different rates for the head, trailing hair and torso. Playing, changing a track, hovering or touching a cup briefly lights the original held glass and eye highlights. This is local mesh deformation, not a generated Cubism model.
- The entrance is an original Three.js double wooden door with procedural grain, inset panels, brass hardware, a swinging bell and dust. The real bar is visible through the opening. Its four-partial synthesized bell only starts after a user gesture; no external sound or music is bundled. A restored local song fades in when available, otherwise the entrance only rings the bell.

# Character extension

`registerCharacterRuntime` in `src/character/runtime.ts` accepts a future local Cubism renderer. The adapter receives the selected files, model JSON, host element, pointer ref and abort signal. It must resolve only when its first frame is ready and return `dispose()` to release all textures, listeners and object URLs. Runtime errors restore the user's portrait. The current distribution does not include Cubism Core or silently download a runtime/model.

Portrait images and rig settings are saved to the browser's `tavern-character` IndexedDB. `lappland-tavern-player` schema v2 stores audio and cover Blobs by file fingerprint separately from the v1-compatible library metadata. Object URLs are recreated on startup and released when replaced or cleared. Quota failures fall back to session playback with reimport status; metadata can fall back to localStorage. JSON exports exclude binary files. Full binary backups are not implemented.

Persistent-storage protection is requested on audio import and can be requested again in the cellar settings. It is browser-controlled, not guaranteed: see [MDN StorageManager.persist](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist). Clearing site data still removes the local library. Use the same origin (`http://127.0.0.1:5173`) and retain original music files.

## Libraries and Publishing

UI icons use lucide-react (ISC); Three.js (MIT) and other dependencies retain their package licenses. Fonts use the local system stack with no remote font request. The music-note icon labels an unconnected Spotify feature; a real integration must follow Spotify branding requirements.

Git ignores audio, private artwork, env files, screenshots and build output. Vite still copies all of public into dist, even ignored files. Keep personal assets outside public and inspect build contents before any future deployment. The authorized PNG is intentionally included in normal builds. No deployment is configured.
