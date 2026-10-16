# Testing

Start Vite, then run `npm test`. Suites use fresh browser contexts, generated audio, and ignored test-results or temporary files, never the user's music library.

| Command                     | Coverage                                                                                                               |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `npm run build`             | TypeScript and production bundle                                                                                       |
| `npm run smoke`             | WAV import, glass click/play/next, menu sections, notes (alias/tags/glass), reorder, search, JSON round trip, phone layout |
| `npm run test:scene`        | Lit canvas, ring layout, arc pour with liquid inertia, pour stream, hover card, drag-to-reorder on the bar, quality menu, phone fit, reduced motion (deterministic `?manual` frames) |
| `npm run test:persistence`  | Entrance gesture/audio, skip/replay, Blob+cover reload, JSON, clear, migration, quota and unavailable-storage fallback |
| `npm run test:architecture` | Store, sources, PKCE, offline protocol, experiment panels, per-song deletion/reload                                    |
| `npm run test:platform`     | Mac launchers (bash syntax, LF, executable bit), cloudflared build per system, macOS `.tgz` unpacking, the server downloading + starting cloudflared, launcher plan; on macOS also the real cloudflared download and the real `启动酒馆.command` |
| `npm run test:bilibili`     | Needs `npm run build`; starts its own tavern server with stand-ins for Bilibili's API, b23.tv and the embedded player: short link, video, collection offer, parts, `?p=`, favourites (two pages, dead video left out), missing / private / refused / unrecognised links; the screen's loads for play, pause, resume and jumps, the shield and lock, the next video when the length runs out, open-on-Bilibili link, pages after a reload, and a 同席 guest following and pausing |
| `npm run test:webkit`       | With `TAVERN_BROWSER=webkit`: load, import, play, menu, reload from IndexedDB, panels and Cmd+O in Safari's engine (accepts the 3D bar or its no-WebGL fallback) |

Windows prefers installed Edge/Chrome, otherwise Playwright Chromium. CI uses Linux Chromium; a second workflow (`.github/workflows/mac.yml`) runs the platform checks, the WebKit test and the Bilibili test (in WebKit) on a real macOS machine. APP_URL can change the origin; source assertions require the root Vite development server. Production base-path resource loading is separately checked in release QA.

`npm run test:production` builds into an isolated output directory with `/portable/` as the base path, starts and stops its own preview server, checks the exact PNG hash and canvas rendering, and rejects unexpected private media in output. It does not deploy anything.

No live Spotify tests are possible yet, and the Bilibili test uses stand-ins: the real endpoints and player were checked by hand (2026-10, see bilibili.md). Generated WAV is verified; real MP3/OGG/FLAC decoding remains browser-dependent and needs authorized fixture checks before release. Passing tests do not prove licensing or platform approval.
