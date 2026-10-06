import type { AudioSource, PlayerTrack } from "./types";

/** Supplied by a future SDK bootstrap after PKCE, Premium and policy checks. No audio bytes cross this boundary. */
export interface SpotifyPlaybackPort {
  startTrack(uri: string): Promise<void>;
  resume(): Promise<void>;
  pause(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  setVolume(volume: number): Promise<void>;
  disconnect(): void;
}
export class SpotifyAudioSource implements AudioSource {
  readonly type = "spotify" as const;
  constructor(private readonly port?: SpotifyPlaybackPort) {}
  get capabilities() {
    return { playback: !!this.port, analysis: false, persistentAudio: false };
  }
  private connected() {
    if (!this.port)
      throw new Error("Spotify playback is not connected in this release");
    return this.port;
  }
  async load(track: PlayerTrack) {
    if (!("uri" in track) || !/^spotify:track:[a-zA-Z0-9]{22}$/.test(track.uri))
      throw new Error("Invalid Spotify track URI");
    await this.connected().startTrack(track.uri);
  }
  async play() {
    await this.connected().resume();
  }
  async pause() {
    await this.connected().pause();
  }
  async seek(seconds: number) {
    if (!Number.isFinite(seconds)) throw new Error("Invalid position");
    await this.connected().seek(Math.max(0, seconds) * 1000);
  }
  async setVolume(volume: number) {
    if (!Number.isFinite(volume)) throw new Error("Invalid volume");
    await this.connected().setVolume(Math.min(1, Math.max(0, volume)));
  }
  dispose() {
    this.port?.disconnect();
  }
}
