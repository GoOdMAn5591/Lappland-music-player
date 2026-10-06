import type { SpotifyTrack } from "../../player/types";
export interface SpotifyProfile {
  id: string;
  displayName: string;
  product?: string;
}
export interface SpotifyPlaylist {
  id: string;
  name: string;
  externalUrl: string;
  coverUrl?: string;
}
export interface SpotifyCatalog {
  profile(): Promise<SpotifyProfile>;
  playlists(
    cursor?: string,
  ): Promise<{ items: SpotifyPlaylist[]; next?: string }>;
  tracks(
    playlistId: string,
    cursor?: string,
  ): Promise<{ items: SpotifyTrack[]; next?: string }>;
  disconnect(): Promise<void>;
}
