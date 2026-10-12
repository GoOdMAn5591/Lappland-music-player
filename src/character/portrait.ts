import { useEffect, useState } from "react";
import { openDB } from "idb";
import { lapplandRig } from "./lapplandRig";
import { assetUrl } from "../config";

/** Placement and motion strength of the bundled character; the image itself is fixed. */
export interface PortraitRig {
  version?: number;
  zoom: number;
  x: number;
  y: number;
  motion: number;
}

/** The character is always the bundled cut-out; swapping images was removed. */
export const portraitUrl = assetUrl(
  "assets/lappland/lappland-cutout-transparent.png",
);

export const defaultRig = (): PortraitRig => ({ ...lapplandRig });

const RIG_KEY = "tavern-character-rig";
const LAPPLAND_NAMES = [
  "lappland-cutout-transparent-recommended.png",
  "lappland-transparent.png",
  "lappland-original.jpg",
  "136884763_p0_master1200.jpg",
];

function sanitize(value: unknown): PortraitRig | undefined {
  if (!value || typeof value !== "object") return undefined;
  const v = value as Record<string, unknown>;
  const num = (key: string, min: number, max: number) =>
    typeof v[key] === "number" && Number.isFinite(v[key])
      ? Math.max(min, Math.min(max, v[key] as number))
      : undefined;
  const zoom = num("zoom", 0.5, 3);
  const x = num("x", -60, 60);
  const y = num("y", -60, 60);
  const motion = num("motion", 0, 1);
  if (zoom === undefined || x === undefined || y === undefined) return undefined;
  // the very first release stored this placement as its default
  if (zoom === 1.06 && x === -6 && y === 3) return defaultRig();
  return { version: 3, zoom, x, y, motion: motion ?? lapplandRig.motion };
}

function readStoredRig() {
  try {
    const raw = localStorage.getItem(RIG_KEY);
    return raw ? sanitize(JSON.parse(raw)) : undefined;
  } catch {
    return undefined;
  }
}

export function usePortrait() {
  const [stored] = useState(readStoredRig);
  const [rig, setRig] = useState<PortraitRig>(() => stored ?? defaultRig());
  useEffect(() => {
    // Keep the composition chosen in the old version, which kept it next to
    // the picture in IndexedDB (only if that picture was Lappland herself).
    if (stored) return;
    let alive = true;
    void (async () => {
      try {
        const database = await openDB("tavern-character", 1, {
          upgrade(db) {
            db.createObjectStore("portrait");
          },
        });
        try {
          const saved = (await database.get("portrait", "lappland")) as
            | { name?: string; rig?: unknown }
            | undefined;
          const migrated =
            saved?.name && LAPPLAND_NAMES.includes(saved.name)
              ? sanitize(saved.rig)
              : undefined;
          if (alive && migrated) setRig(migrated);
        } finally {
          database.close();
        }
      } catch {
        /* no earlier settings */
      }
    })();
    return () => {
      alive = false;
    };
  }, [stored]);
  useEffect(() => {
    try {
      localStorage.setItem(RIG_KEY, JSON.stringify(rig));
    } catch {
      /* the composition only lasts this session */
    }
  }, [rig]);
  return { url: portraitUrl, rig, updateRig: setRig };
}
