export interface RoomMember {
  id: string;
  name: string;
  capability:
    | "ready"
    | "premium-required"
    | "unavailable"
    | "missing-local-file";
}
export interface RoomState {
  status: "offline" | "connected";
  code?: string;
  hostId?: string;
  members: RoomMember[];
}
export interface PlaybackSnapshot {
  revision: number;
  track:
    | { sourceType: "spotify"; uri: string }
    | { sourceType: "local"; fingerprint: string };
  isPlaying: boolean;
  position: number;
  duration: number;
  /** Server-adjusted UTC milliseconds, not a client's performance.now(). */
  timestamp: number;
}
export interface MultiplayerAdapter {
  readonly state: RoomState;
  create(): Promise<RoomState>;
  join(code: string): Promise<RoomState>;
  leave(): Promise<void>;
  publish(snapshot: PlaybackSnapshot): Promise<void>;
  subscribe(listener: (snapshot: PlaybackSnapshot) => void): () => void;
}
export class OfflineAdapter implements MultiplayerAdapter {
  readonly state: RoomState = { status: "offline", members: [] };
  async create(): Promise<RoomState> {
    throw new Error("Room service is not connected");
  }
  async join(_code: string): Promise<RoomState> {
    throw new Error("Room service is not connected");
  }
  async leave() {}
  async publish(_snapshot: PlaybackSnapshot) {
    throw new Error("Offline adapter cannot broadcast");
  }
  subscribe(_listener: (snapshot: PlaybackSnapshot) => void) {
    return () => {};
  }
}
/** Intentionally opens no socket until an authenticated server protocol is implemented. */
export class WebSocketAdapter extends OfflineAdapter {
  constructor(readonly endpoint: string) {
    super();
    if (!/^wss:\/\//.test(endpoint))
      throw new Error("Use a secure WebSocket endpoint");
  }
}
export function projectedPosition(
  snapshot: PlaybackSnapshot,
  serverNow: number,
) {
  const elapsed = snapshot.isPlaying
    ? Math.max(0, serverNow - snapshot.timestamp) / 1000
    : 0;
  return Math.max(0, Math.min(snapshot.duration, snapshot.position + elapsed));
}
