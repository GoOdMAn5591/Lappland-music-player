import type { TavernTrack } from "../storage";
import { t } from "../i18n";

export const GLASS_SHAPES = [
  "goblet",
  "coupe",
  "martini",
  "rocks",
  "highball",
  "snifter",
  "flute",
  "nicknora",
  "hurricane",
] as const;
export type GlassShape = (typeof GLASS_SHAPES)[number];

export const GLASS_LABELS: Record<GlassShape, string> = {
  goblet: "高脚杯",
  coupe: "碟形杯",
  martini: "马天尼杯",
  rocks: "古典杯",
  highball: "高球杯",
  snifter: "白兰地杯",
  flute: "香槟杯",
  nicknora: "尼克诺拉杯",
  hurricane: "飓风杯",
};

export interface DrinkPalette {
  key: string;
  label: string;
  top: string;
  deep: string;
  foam: string;
}

// Seven house pours. Tags steer the colour; otherwise it is derived from the track id.
export const DRINK_PALETTES: DrinkPalette[] = [
  {
    key: "blood",
    label: "深红",
    top: "#d0283c",
    deep: "#3a0610",
    foam: "#ffb3a8",
  },
  {
    key: "amber",
    label: "琥珀",
    top: "#f0a440",
    deep: "#5a2306",
    foam: "#ffe0a8",
  },
  {
    key: "midnight",
    label: "紫黑",
    top: "#9a4ad8",
    deep: "#16051f",
    foam: "#e2c2ff",
  },
  {
    key: "gold",
    label: "金黄",
    top: "#ffd25e",
    deep: "#7a4a08",
    foam: "#fff3c4",
  },
  {
    key: "azure",
    label: "透蓝",
    top: "#6fd0f0",
    deep: "#0b3448",
    foam: "#e2fbff",
  },
  {
    key: "smoke",
    label: "烟灰",
    top: "#c8b8a2",
    deep: "#2a2420",
    foam: "#f2ebe0",
  },
  {
    key: "absinthe",
    label: "苦艾绿",
    top: "#9ee06a",
    deep: "#12300c",
    foam: "#eaffd2",
  },
];

export interface DrinkRecipe {
  id: string;
  shape: GlassShape;
  palette: DrinkPalette;
  /** 0..1 portion of the bowl that is filled. */
  level: number;
  sparkling: boolean;
  flakes: boolean;
  ice: boolean;
  /** Short line used by tooltips, e.g. "高脚杯 · 深红 · 烈". */
  description: string;
}

export const hashText = (value: string) => {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const TAG_PALETTES: [RegExp, string][] = [
  [/烈|危险|燃|红|血|blood|rock|metal/i, "blood"],
  [/甜|金|烛|暖|gold|sweet|jazz/i, "gold"],
  [/午夜|低语|夜|暗|紫|night|dark|ambient/i, "midnight"],
  [/柔|清|蓝|透明|雨|blue|chill|soft/i, "azure"],
  [/苦|烟|灰|smoke|blues/i, "smoke"],
  [/琥珀|威士忌|whisk|amber|folk/i, "amber"],
  [/绿|苦艾|green|absinthe/i, "absinthe"],
];

export function recipeFor(track: TavernTrack): DrinkRecipe {
  const seed = track.look ?? hashText(track.id + track.fileName);
  const tags = (Array.isArray(track.tags) ? track.tags : []).join(" ");
  let paletteKey = track.tint;
  if (!paletteKey) {
    for (const [pattern, key] of TAG_PALETTES)
      if (pattern.test(tags)) {
        paletteKey = key;
        break;
      }
  }
  const palette =
    DRINK_PALETTES.find((p) => p.key === paletteKey) ??
    DRINK_PALETTES[seed % DRINK_PALETTES.length];
  const shape: GlassShape =
    track.glass && (GLASS_SHAPES as readonly string[]).includes(track.glass)
      ? (track.glass as GlassShape)
      : GLASS_SHAPES[(seed >>> 5) % GLASS_SHAPES.length];
  const level = 0.52 + (((seed >>> 9) % 1000) / 1000) * 0.3;
  const sparkling =
    shape === "flute" ||
    shape === "highball" ||
    /气泡|sparkl|soda|pop/i.test(tags);
  const ice = shape === "rocks" || shape === "highball";
  const flakes =
    palette.key === "gold" ||
    palette.key === "midnight" ||
    ((seed >>> 13) & 7) === 0;
  const mood = (Array.isArray(track.tags) ? track.tags : []).find((tag) => tag.length <= 4) ?? "今日特调";
  return {
    id: track.id,
    shape,
    palette,
    level,
    sparkling,
    flakes,
    ice,
    description: `${t(GLASS_LABELS[shape])} · ${t(palette.label)} · ${t(mood)}`,
  };
}

/** Placeholder pour shown on an empty bar. */
export const EMPTY_RECIPE: DrinkRecipe = {
  id: "__empty__",
  shape: "goblet",
  palette: DRINK_PALETTES[0],
  level: 0.04,
  sparkling: false,
  flakes: false,
  ice: false,
  description: "空杯",
};
