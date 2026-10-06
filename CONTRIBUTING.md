# Contributing

Use Node 22.12+, `npm ci`, `npm run dev`, then `npm test` in another terminal and `npm run build`. Use `codex/` for agent-created branches.

Keep visuals independent of storage and provider APIs. Preserve IndexedDB/JSON compatibility or ship a tested migration. Never commit audio, credentials, private artwork, library exports, node_modules or generated output. VITE variables are public in compiled JavaScript.

Use isolated browser contexts for deletion tests, never the user's daily profile. Check desktop/mobile canvas pixels, curved movement, hover/press feedback, readable transparent overlays and reduced motion.

Spotify and multiplayer are interface scaffolds. Keep experimental notices until real services and policy reviews are complete. New artwork needs provenance in ASSETS.md; MIT covers code, not character rights.
