# Testing

Start Vite, then run `npm test`. Suites use fresh browser contexts, generated audio, and ignored test-results or temporary files, never the user's music library.

| Command                     | Coverage                                                                                                               |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `npm run build`             | TypeScript and production bundle                                                                                       |
| `npm run smoke`             | WAV import/play/next, playlist, alias/tags, export, responsive layout                                                  |
| `npm run test:scene`        | Nonblank canvases, mesh motion, semicircle geometry, arc movement, layering, mobile and reduced motion                 |
| `npm run test:persistence`  | Entrance gesture/audio, skip/replay, Blob+cover reload, JSON, clear, migration, quota and unavailable-storage fallback |
| `npm run test:architecture` | Store, sources, PKCE, offline protocol, experiment panels, per-song deletion/reload                                    |

Windows prefers installed Edge/Chrome, otherwise Playwright Chromium. CI uses Linux Chromium. APP_URL can change the origin; source assertions require the root Vite development server. Production base-path resource loading is separately checked in release QA.

`npm run test:production` builds into an isolated output directory with `/portable/` as the base path, starts and stops its own preview server, checks the exact PNG hash and canvas rendering, and rejects unexpected private media in output. It does not deploy anything.

No live Spotify or room tests are possible yet. Generated WAV is verified; real MP3/OGG/FLAC decoding remains browser-dependent and needs authorized fixture checks before release. Passing tests do not prove licensing or platform approval.
