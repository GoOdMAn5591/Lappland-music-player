import type { AudioSource, PlayerTrack } from "./types";

export class LocalAudioSource implements AudioSource {
  readonly type = "local" as const;
  readonly capabilities = {
    playback: true,
    analysis: true,
    persistentAudio: true,
  };
  constructor(private readonly element: () => HTMLAudioElement | null) {}
  async load(track: PlayerTrack) {
    if ("sourceType" in track && track.sourceType === "spotify")
      throw new Error("Spotify audio cannot be loaded as a local file");
    if (!("objectUrl" in track) || !track.objectUrl?.startsWith("blob:"))
      throw new Error("Local audio is missing");
    const audio = this.element();
    if (!audio) throw new Error("Audio element is not mounted");
    if (audio.src !== track.objectUrl) {
      audio.src = track.objectUrl;
      audio.load();
    }
  }
  async play() {
    const audio = this.element();
    if (!audio?.getAttribute("src")) throw new Error("No local track loaded");
    await audio.play();
  }
  async pause() {
    this.element()?.pause();
  }
  async seek(seconds: number) {
    const audio = this.element();
    if (audio && Number.isFinite(seconds))
      audio.currentTime = Math.max(
        0,
        Math.min(seconds, Number.isFinite(audio.duration) ? audio.duration : 0),
      );
  }
  async setVolume(volume: number) {
    const audio = this.element();
    if (audio && Number.isFinite(volume))
      audio.volume = Math.min(1, Math.max(0, volume));
  }
  dispose() {
    const audio = this.element();
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
  }
}
