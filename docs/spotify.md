# Spotify Integration Plan

Status checked against official documentation on 2026-10-05. No login, token exchange, playlist fetch, SDK device or Spotify playback is implemented.

## Existing Interfaces

- `pkce.ts`: random state/verifier, SHA-256 S256 request, callback origin/path/state/expiry validation. No token storage or network calls.
- `catalog.ts`: profile, paginated playlists/tracks contracts.
- `SpotifyAudioSource`: injected authenticated playback port; unavailable without a port.
- Spotify track type with URI, artwork, metadata and external link. Local persistence does not yet store Spotify catalog entries.

## Implementation Checklist

1. Create a Developer App. Put its public Client ID in `.env.local` and register an exact Redirect URI. HTTPS is required except explicit loopback IPs such as `http://127.0.0.1:5173/`; `localhost` is not accepted. A callback handler still needs implementation.
2. Use Authorization Code with PKCE, never a frontend Client Secret. Store a one-use transaction in sessionStorage; consume/clear it on success, refusal and error. Validate state, then remove sensitive callback query parameters.
3. Implement code exchange and token refresh, expiry, logout and cancellation. Prefer in-memory access tokens, minimal scopes and no token logging. Do not place tokens in VITE variables.
4. Implement paginated catalog requests, rate limits/Retry-After, account/market availability and API errors. Present artwork/metadata with attribution and Spotify links; transformed cover colors cannot replace required artwork presentation.
5. Load the official SDK only after explicit connection. Handle ready/not_ready, initialization/authentication/account/playback errors, device transfer and capability changes. Premium is required for full streaming.
6. Implement source coordination and a versioned mixed-catalog migration. Persist only permitted metadata/identifiers subject to retention rules, never Spotify audio.

The environment flag changes only experimental readiness text, not functionality.

## Restrictions

- Current development mode requires the app owner to have Premium and allows up to five allowlisted users. Check actual mode and endpoint permissions at implementation time; authorization alone does not prevent API 403 for an unallowlisted user.
- Non-Premium cannot stream full tracks with this SDK. Metadata is also subject to endpoint/app permissions; an external Spotify link may be the only available action.
- No download, rebroadcast, local audio caching, analysis or mixing with local sound. Keep the existing doorbell and local FFT visualizer separate from any Spotify playback.
- Policy restricts synchronizing recordings with visual media and broadcasting. Music-reactive Spotify visuals and coordinated listening require review before implementation. Separate accounts alone are not proof of compliance.
- Future rooms may synchronize URI/state/timestamps only, with each member independently authorized and eligible. Missing Premium, region restrictions or unavailable tracks must be visible, not silently bypassed.

## Official Sources

- [Web Playback SDK](https://developer.spotify.com/documentation/web-playback-sdk/tutorials/getting-started)
- [PKCE](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow)
- [Redirect URIs](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri)
- [Quota modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes)
- [Developer Policy](https://developer.spotify.com/policy)

These are design constraints, not a legal opinion or a guarantee of platform approval. Recheck before shipping.
