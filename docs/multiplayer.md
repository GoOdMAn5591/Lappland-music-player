# Multiplayer Roadmap

Offline only: no backend, socket connection, room-code service, accounts or audio upload. The room buttons are disabled. The feature flag does not create a server.

`MultiplayerAdapter` defines create/join/leave/publish/subscribe plus room/host/member capability state. `OfflineAdapter` rejects network actions. `WebSocketAdapter` validates a WSS endpoint but intentionally opens no socket.

`PlaybackSnapshot` contains revision, track reference, play state, position/duration in seconds and server-adjusted UTC timestamp in milliseconds. `projectedPosition` is a clamped coarse estimate, not a synchronization engine.

## Backend Phase

1. Authenticate members and authorize host commands server-side. Add unpredictable room IDs, access control, rate limits, schema validation and room cleanup. Do not trust client host flags.
2. Assign monotonic server revisions. Reject stale/replayed commands and echo origin IDs to prevent loops. Send a full snapshot on join/reconnect.
3. Estimate clock offset with round-trip pings. Seek for large drift, tolerate small drift, throttle corrections, and handle buffering/suspended tabs.
4. Expose per-member unavailable/Premium-required/missing-file states. Define host departure and transfer behavior.
5. Test a mock transport, then an authenticated WSS service; keep provider code out of UI.

Local audio stays local. A first experiment could match independently imported files, with explicit consent for shared identifiers. Filenames can contain private information; do not broadcast by default. Any file transfer requires a separate copyright/privacy explanation and opt-in.

Spotify proposals synchronize URI/state/timestamps with each member's own account and playback. This is not permission for synchronized listening or broadcasting; [policy review](spotify.md) remains a release gate.
