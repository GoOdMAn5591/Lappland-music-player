import type { GlassShape } from "./recipes";

// Glass silhouettes shared by the 3D bar (lathe geometry) and the menu icons (SVG).
// Profiles are (radius, height) in metres: the outer surface from the base centre to
// the rim, and the bowl cavity from its lowest point up to the rim.
export interface GlassProfile {
  outer: [number, number][];
  cavity: [number, number][];
}

// Profiles in metres before GLASS_SCALE: outer surface from the base centre up to the rim,
// and the bowl cavity from its lowest point (r = 0) up to the rim.
export const GLASS_PROFILES: Record<GlassShape, GlassProfile> = {
  goblet: {
    outer: [
      [0, 0],
      [0.036, 0.001],
      [0.037, 0.004],
      [0.026, 0.008],
      [0.008, 0.015],
      [0.0048, 0.035],
      [0.0046, 0.07],
      [0.007, 0.083],
      [0.018, 0.093],
      [0.033, 0.108],
      [0.041, 0.13],
      [0.04, 0.156],
      [0.035, 0.18],
      [0.0335, 0.19],
    ],
    cavity: [
      [0, 0.09],
      [0.015, 0.095],
      [0.03, 0.109],
      [0.0385, 0.13],
      [0.0375, 0.156],
      [0.0325, 0.18],
      [0.0315, 0.188],
    ],
  },
  coupe: {
    outer: [
      [0, 0],
      [0.035, 0.001],
      [0.036, 0.004],
      [0.025, 0.008],
      [0.007, 0.016],
      [0.0046, 0.04],
      [0.0046, 0.088],
      [0.008, 0.098],
      [0.027, 0.106],
      [0.046, 0.117],
      [0.056, 0.129],
      [0.058, 0.136],
    ],
    cavity: [
      [0, 0.1],
      [0.025, 0.106],
      [0.044, 0.118],
      [0.053, 0.129],
      [0.0555, 0.134],
    ],
  },
  martini: {
    outer: [
      [0, 0],
      [0.036, 0.001],
      [0.037, 0.004],
      [0.025, 0.008],
      [0.006, 0.016],
      [0.0046, 0.04],
      [0.0046, 0.086],
      [0.008, 0.093],
      [0.035, 0.128],
      [0.06, 0.162],
      [0.061, 0.165],
    ],
    cavity: [
      [0, 0.095],
      [0.03, 0.128],
      [0.056, 0.161],
      [0.0575, 0.163],
    ],
  },
  rocks: {
    outer: [
      [0, 0],
      [0.041, 0.0],
      [0.044, 0.003],
      [0.045, 0.02],
      [0.046, 0.06],
      [0.047, 0.094],
      [0.0465, 0.096],
    ],
    cavity: [
      [0, 0.017],
      [0.038, 0.018],
      [0.042, 0.022],
      [0.043, 0.06],
      [0.044, 0.093],
    ],
  },
  highball: {
    outer: [
      [0, 0],
      [0.031, 0],
      [0.0335, 0.003],
      [0.034, 0.08],
      [0.035, 0.158],
      [0.0345, 0.16],
    ],
    cavity: [
      [0, 0.013],
      [0.028, 0.014],
      [0.031, 0.017],
      [0.032, 0.08],
      [0.033, 0.157],
    ],
  },
  snifter: {
    outer: [
      [0, 0],
      [0.034, 0.001],
      [0.035, 0.004],
      [0.024, 0.008],
      [0.006, 0.014],
      [0.0055, 0.03],
      [0.009, 0.038],
      [0.03, 0.048],
      [0.05, 0.07],
      [0.056, 0.095],
      [0.05, 0.125],
      [0.038, 0.145],
      [0.034, 0.15],
    ],
    cavity: [
      [0, 0.042],
      [0.028, 0.05],
      [0.048, 0.071],
      [0.053, 0.095],
      [0.047, 0.124],
      [0.0355, 0.143],
      [0.032, 0.148],
    ],
  },
  flute: {
    outer: [
      [0, 0],
      [0.031, 0.001],
      [0.032, 0.004],
      [0.022, 0.008],
      [0.005, 0.015],
      [0.0042, 0.05],
      [0.0042, 0.088],
      [0.008, 0.097],
      [0.02, 0.116],
      [0.026, 0.15],
      [0.026, 0.2],
      [0.0245, 0.225],
      [0.0245, 0.228],
    ],
    cavity: [
      [0, 0.101],
      [0.017, 0.116],
      [0.0235, 0.15],
      [0.0235, 0.2],
      [0.022, 0.225],
    ],
  },
  nicknora: {
    outer: [
      [0, 0],
      [0.031, 0.001],
      [0.032, 0.004],
      [0.022, 0.008],
      [0.005, 0.015],
      [0.0043, 0.05],
      [0.0043, 0.084],
      [0.008, 0.093],
      [0.026, 0.101],
      [0.04, 0.118],
      [0.039, 0.14],
      [0.033, 0.155],
      [0.032, 0.158],
    ],
    cavity: [
      [0, 0.096],
      [0.022, 0.103],
      [0.037, 0.118],
      [0.036, 0.14],
      [0.0305, 0.154],
      [0.0298, 0.156],
    ],
  },
  hurricane: {
    outer: [
      [0, 0],
      [0.034, 0.001],
      [0.035, 0.004],
      [0.024, 0.008],
      [0.008, 0.015],
      [0.007, 0.03],
      [0.014, 0.04],
      [0.032, 0.06],
      [0.04, 0.09],
      [0.031, 0.14],
      [0.033, 0.18],
      [0.043, 0.225],
      [0.044, 0.23],
    ],
    cavity: [
      [0, 0.037],
      [0.013, 0.041],
      [0.03, 0.061],
      [0.037, 0.09],
      [0.028, 0.14],
      [0.03, 0.18],
      [0.0405, 0.224],
      [0.0412, 0.228],
    ],
  },
};

/** Mirrored SVG outline of a glass, normalised into a 24 x 32 box. */
export function glassIconPath(shape: GlassShape) {
  const { outer } = GLASS_PROFILES[shape];
  const height = outer[outer.length - 1][1];
  const maxR = Math.max(...outer.map(([r]) => r));
  const scale = Math.min(28 / height, 10.5 / maxR);
  const pts = outer.map(([r, y]) => [r * scale, 30 - y * scale]);
  const right = pts.map(([x, y]) => `${(12 + x).toFixed(2)} ${y.toFixed(2)}`);
  const left = [...pts]
    .reverse()
    .map(([x, y]) => `${(12 - x).toFixed(2)} ${y.toFixed(2)}`);
  return `M${right.join(" L")} L${left.join(" L")} Z`;
}

/** The liquid region for the menu icon at a given fill level (0..1). */
export function glassLiquidPath(shape: GlassShape, level: number) {
  const { outer, cavity } = GLASS_PROFILES[shape];
  const height = outer[outer.length - 1][1];
  const maxR = Math.max(...outer.map(([r]) => r));
  const scale = Math.min(28 / height, 10.5 / maxR);
  const bottom = cavity[0][1];
  const rim = cavity[cavity.length - 1][1];
  const fill = bottom + (rim - bottom) * level;
  const pts = cavity.filter(([, y]) => y <= fill);
  const last = cavity.find(([, y]) => y > fill);
  if (last && pts.length) {
    const [r0, y0] = pts[pts.length - 1];
    const [r1, y1] = last;
    pts.push([r0 + ((r1 - r0) * (fill - y0)) / (y1 - y0), fill]);
  }
  const mapped = pts.map(([r, y]) => [r * scale * 0.94, 30 - y * scale]);
  const right = mapped.map(
    ([x, y]) => `${(12 + x).toFixed(2)} ${y.toFixed(2)}`,
  );
  const left = [...mapped]
    .reverse()
    .map(([x, y]) => `${(12 - x).toFixed(2)} ${y.toFixed(2)}`);
  return `M${right.join(" L")} L${left.join(" L")} Z`;
}
