import { useEffect, useState } from "react";
import { openDB } from "idb";
import { lapplandRig } from "./lapplandRig";
import { assetUrl } from "../config";

export type Point = { x: number; y: number };
export type Anchor =
  | "head"
  | "leftHair"
  | "rightHair"
  | "leftEye"
  | "rightEye"
  | "leftEar"
  | "rightEar"
  | "shoulders"
  | "chest"
  | "ribbon"
  | "leftHand"
  | "rightHand"
  | "heldGlass";
export interface PortraitRig {
  version?: number;
  zoom: number;
  x: number;
  y: number;
  motion: number;
  feather: number;
  anchors: Record<Anchor, Point>;
  outline: Point[];
}
export interface PortraitAsset {
  name: string;
  blob: Blob;
  rig: PortraitRig;
}
export interface PointerPosition {
  x: number;
  y: number;
}

export const transparentPortraitName =
  "lappland-cutout-transparent-recommended.png";
export const transparentRig = (): PortraitRig => ({
  ...lapplandRig,
  outline: [],
  feather: 0,
});

export const defaultRig = (): PortraitRig => ({
  version: 2,
  zoom: 1,
  x: 0,
  y: 0,
  motion: 0.65,
  feather: 0.075,
  anchors: {
    head: { x: 0.5, y: 0.25 },
    leftHair: { x: 0.3, y: 0.46 },
    rightHair: { x: 0.7, y: 0.46 },
    leftEye: { x: 0.455, y: 0.25 },
    rightEye: { x: 0.545, y: 0.25 },
    leftEar: { x: 0.39, y: 0.12 },
    rightEar: { x: 0.61, y: 0.12 },
    shoulders: { x: 0.5, y: 0.43 },
    chest: { x: 0.5, y: 0.56 },
    ribbon: { x: 0.73, y: 0.68 },
    leftHand: { x: 0.29, y: 0.67 },
    rightHand: { x: 0.7, y: 0.69 },
    heldGlass: { x: 0.67, y: 0.6 },
  },
  outline: [],
});

// Portrait blobs are local, separate from the audio-free playlist JSON.
const db = async () =>
  openDB("tavern-character", 1, {
    upgrade(database) {
      database.createObjectStore("portrait");
    },
  });

export function usePortrait(onStatus: (message: string) => void) {
  const [asset, setAsset] = useState<PortraitAsset>();
  const [url, setUrl] = useState<string>();
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    void (async () => {
      let saved: PortraitAsset | undefined;
      try {
        const database = await db();
        try {
          saved = await database.get("portrait", "lappland");
        } finally {
          database.close();
        }
      } catch {
        /* The bundled user portrait remains available without IndexedDB. */
      }
      if (
        !saved ||
        ["136884763_p0_master1200.jpg", "lappland-original.jpg"].includes(
          saved.name,
        )
      ) {
        const response = await fetch(
          assetUrl("assets/lappland/lappland-cutout-transparent.png"),
        );
        if (
          !response.ok ||
          !response.headers.get("content-type")?.startsWith("image/")
        )
          throw new Error("Portrait unavailable");
        saved = {
          name: transparentPortraitName,
          blob: await response.blob(),
          rig: saved
            ? { ...saved.rig, outline: [], feather: 0 }
            : transparentRig(),
        };
      }
      if (saved.rig.version !== 2) {
        const preset =
          saved.name === transparentPortraitName
            ? transparentRig()
            : defaultRig();
        const oldDefault =
          saved.rig.zoom === 1.06 && saved.rig.x === -6 && saved.rig.y === 3;
        saved.rig = {
          ...saved.rig,
          ...(oldDefault
            ? { zoom: preset.zoom, x: preset.x, y: preset.y }
            : {}),
          anchors: { ...preset.anchors, ...saved.rig.anchors },
          version: 2,
        };
      }
      if (alive) {
        setAsset(saved);
        setLoaded(true);
      }
    })().catch(() => {
      if (alive) {
        setLoaded(true);
        onStatus("角色图片暂时无法读取，请重新选择本地图片。");
      }
    });
    return () => {
      alive = false;
    };
  }, [onStatus]);
  useEffect(() => {
    if (!asset) return;
    const nextUrl = URL.createObjectURL(asset.blob);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [asset?.blob]);
  useEffect(() => {
    if (!loaded || !asset) return;
    const timer = window.setTimeout(() => {
      void db()
        .then(async (database) => {
          try {
            await database.put("portrait", asset, "lappland");
          } finally {
            database.close();
          }
        })
        .catch(() =>
          onStatus(
            "图片已在本次会话载入，但本地保存失败；刷新后需要重新选择。",
          ),
        );
    }, 350);
    return () => clearTimeout(timer);
  }, [asset, loaded, onStatus]);

  const importImage = async (file?: File) => {
    if (!file) return false;
    if (
      !/\.(jpe?g|png|webp)$/i.test(file.name) ||
      file.size > 40 * 1024 * 1024
    ) {
      onStatus("请选择不超过 40 MB 的 JPG、PNG 或 WebP 图片。");
      return false;
    }
    const checkUrl = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = checkUrl;
      await image.decode();
      const knownImage =
        ["136884763_p0_master1200.jpg", "lappland-original.jpg"].includes(
          file.name,
        ) && file.size === 1174989;
      setAsset({
        name: file.name,
        blob: file,
        rig: knownImage
          ? lapplandRig
          : [transparentPortraitName, "lappland-transparent.png"].includes(
                file.name,
              )
            ? transparentRig()
            : {
                ...defaultRig(),
                feather: file.type === "image/png" ? 0 : 0.075,
              },
      });
      onStatus(`已载入角色图片：${file.name}`);
      return true;
    } catch {
      onStatus("图片无法解码，原来的角色图片仍然保留。");
      return false;
    } finally {
      URL.revokeObjectURL(checkUrl);
    }
  };
  return {
    asset,
    url,
    importImage,
    updateRig: (rig: PortraitRig) =>
      setAsset((previous) => (previous ? { ...previous, rig } : previous)),
  };
}
