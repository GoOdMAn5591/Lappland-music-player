import type { TavernTrack } from "../storage";

export type SourceType = "local" | "spotify";
export interface SpotifyTrack {
  id: string;
  sourceType: "spotify";
  uri: `spotify:track:${string}`;
  title: string;
  artist: string;
  album: string;
  coverUrl: string;
  externalUrl: string;
  duration: number;
}
export type PlayerTrack = TavernTrack | SpotifyTrack;
export interface AudioSource {
  readonly type: SourceType;
  readonly capabilities: {
    playback: boolean;
    analysis: boolean;
    persistentAudio: boolean;
  };
  load(track: PlayerTrack): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(seconds: number): Promise<void>;
  setVolume(volume: number): Promise<void>;
  dispose(): void;
}
export interface PlayerState {
  /** Track ID; metadata belongs to the catalog, never to an audio adapter. */
  currentTrack?: string;
  sourceType: SourceType;
  isPlaying: boolean;
  position: number;
  duration: number;
  volume: number;
  queue: string[];
  repeatMode: "off" | "one" | "all";
  shuffle: boolean;
}
