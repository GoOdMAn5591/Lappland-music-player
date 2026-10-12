/** Small deterministic helpers shared by the procedural scene. */

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(value: string) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Tileable 2D value noise. `px`/`py` are the lattice periods. */
export function createNoise(seed: number) {
  const rand = mulberry32(seed);
  const size = 256;
  const table = new Float32Array(size * size);
  for (let i = 0; i < table.length; i++) table[i] = rand();
  const lattice = (x: number, y: number) =>
    table[(((y % size) + size) % size) * size + (((x % size) + size) % size)];
  const fade = (t: number) => t * t * (3 - 2 * t);
  const noise = (x: number, y: number, px = size, py = size) => {
    const xi = Math.floor(x),
      yi = Math.floor(y);
    const xf = x - xi,
      yf = y - yi;
    const x0 = ((xi % px) + px) % px,
      x1 = (x0 + 1) % px;
    const y0 = ((yi % py) + py) % py,
      y1 = (y0 + 1) % py;
    const u = fade(xf),
      v = fade(yf);
    const a = lattice(x0, y0),
      b = lattice(x1, y0),
      c = lattice(x0, y1),
      d = lattice(x1, y1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const fbm = (x: number, y: number, octaves = 4, px = size, py = size) => {
    let sum = 0,
      amp = 0.5,
      norm = 0,
      fx = 1;
    for (let o = 0; o < octaves; o++) {
      sum += noise(x * fx, y * fx, px * fx, py * fx) * amp;
      norm += amp;
      amp *= 0.5;
      fx *= 2;
    }
    return sum / norm;
  };
  return { noise, fbm };
}

export function makeCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: false })!;
  return { canvas, ctx };
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Frame-rate independent exponential approach. */
export const damp = (
  current: number,
  target: number,
  rate: number,
  dt: number,
) => current + (target - current) * (1 - Math.exp(-rate * dt));

export function hexToRgb01(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;
  const n = parseInt(full, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export const prefersReducedMotion = () =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;
