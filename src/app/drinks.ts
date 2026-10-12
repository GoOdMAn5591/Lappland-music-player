import type { CSSProperties } from "react";
import type { TavernTrack } from "../storage";
export const AUDIO_EXTENSIONS = /\.(mp3|wav|ogg|oga|flac|m4a|aac|opus)$/i;

export const formatTime = (seconds = 0) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  const remainder = String(whole % 60).padStart(2, "0");
  return `${minutes}:${remainder}`;
};

export const stripExtension = (fileName: string) =>
  fileName.replace(/\.[^/.]+$/, "");

export const fileFingerprint = (file: File) =>
  `${file.name}::${file.size}::${file.lastModified}`;

export const isSupportedAudio = (file: File) =>
  file.type.startsWith("audio/") || AUDIO_EXTENSIONS.test(file.name);

export const makeId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

/**
 * Let the browser read the file header before it goes on the bar.
 * Resolves to the duration in seconds, 0 if unknown, or -1 if this browser
 * cannot decode the file at all (corrupt, or an unsupported codec).
 */
export const probeAudio = (url: string) =>
  new Promise<number>((resolve) => {
    const audio = new Audio();
    let done = false;
    const finish = (value: number) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      audio.onloadedmetadata = audio.onerror = null;
      audio.removeAttribute("src");
      audio.load();
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(0), 8000);
    audio.preload = "metadata";
    audio.onloadedmetadata = () =>
      finish(Number.isFinite(audio.duration) ? audio.duration : 0);
    audio.onerror = () => finish(-1);
    audio.src = url;
  });

export const buildTags = (
  file: File,
  artist: string,
  duration: number,
  genres?: string[],
) => {
  const tags = new Set<string>();
  if (genres?.length) genres.slice(0, 2).forEach((genre) => tags.add(genre));
  if (duration > 360) tags.add("长饮");
  if (duration > 0 && duration < 130) tags.add("短杯");
  if (/live|remix|mix/i.test(file.name)) tags.add("烈酒");
  if (/piano|acoustic|soft|夜|moon|silent/i.test(file.name + artist))
    tags.add("低语");
  if (!tags.size) tags.add("今日特调");
  return Array.from(tags).slice(0, 4);
};

export const hashText = (value: string) =>
  Array.from(value).reduce(
    (sum, char, index) => sum + char.charCodeAt(0) * (index + 3),
    0,
  );

export const drinkPalettes = [
  ["#831628", "#ffcc74", "#2a0610"],
  ["#c0772e", "#ffe2a1", "#3a1b0b"],
  ["#5c2a72", "#d9a5ff", "#150819"],
  ["#d6b246", "#fff0b8", "#4b3408"],
  ["#4c9bb5", "#c7f5ff", "#092532"],
  ["#77736f", "#e7dfd2", "#1b1a19"],
  ["#275b3f", "#d4f5b1", "#081811"],
];

export const glassShapes = [
  "goblet",
  "rocks",
  "coupe",
  "tall",
  "bottle",
  "flute",
];

export function getDrinkStyle(track?: TavernTrack): {
  className: string;
  style: CSSProperties;
} {
  if (!track) {
    return {
      className: "glass-shape-goblet",
      style: {
        "--drink-color": "#831628",
        "--drink-accent": "#ffcc74",
        "--drink-deep": "#2a0610",
        "--liquid-level": "52%",
      } as CSSProperties,
    };
  }

  const tags = track.tags.join(" ");
  let palette = drinkPalettes[hashText(track.id) % drinkPalettes.length];
  if (/烈|危险|燃|红/.test(tags)) palette = drinkPalettes[0];
  if (/甜|金|烛|暖/.test(tags)) palette = drinkPalettes[3];
  if (/午夜|低语|夜|暗/.test(tags)) palette = drinkPalettes[2];
  if (/柔|清|蓝|透明/.test(tags)) palette = drinkPalettes[4];
  if (/苦|烟|灰/.test(tags)) palette = drinkPalettes[5];

  const shape = glassShapes[hashText(track.fileName) % glassShapes.length];
  const level = 38 + (hashText(track.title) % 28);
  return {
    className: `glass-shape-${shape}`,
    style: {
      "--drink-color": palette[0],
      "--drink-accent": palette[1],
      "--drink-deep": palette[2],
      "--liquid-level": `${level}%`,
    } as CSSProperties,
  };
}
