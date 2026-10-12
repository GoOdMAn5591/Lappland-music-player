import * as THREE from "three";
import {
  clamp01,
  createNoise,
  makeCanvas,
  mulberry32,
  smoothstep,
} from "./util";

const DISPLAY_FONT = "'Tavern Display', 'Cinzel', Georgia, serif";
const SERIF_SC =
  "'Tavern Serif SC', 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'STSong', 'SimSun', serif";

/** Resolve once the faces used on canvas textures are loaded (or after a short timeout). */
let fontsReady: Promise<unknown> | undefined;
function whenFontsReady() {
  if (!fontsReady) {
    const fonts = document.fonts;
    fontsReady = fonts
      ? Promise.race([
          Promise.all([
            fonts.load("700 64px 'Tavern Display'", "NOCTURNE AFTER HOURS 1897"),
            fonts.load("600 26px 'Noto Serif SC'", "无序谦卑"),
          ]).then(() => fonts.ready),
          new Promise((resolve) => setTimeout(resolve, 4000)),
        ])
      : Promise.resolve();
  }
  return fontsReady;
}

function canvasTexture(canvas: HTMLCanvasElement, srgb = true, repeat = false) {
  const texture = new THREE.CanvasTexture(canvas);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  if (repeat) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

/** Lacquered mahogany for the counter top. Grain runs along U (around the arc). */
export function makeBarWoodTexture() {
  const W = 1024,
    H = 256;
  const { canvas, ctx } = makeCanvas(W, H);
  const image = ctx.createImageData(W, H);
  const { fbm, noise } = createNoise(91);
  const rand = mulberry32(17);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W,
        v = y / H;
      const warp = fbm(u * 4, v * 3, 3, 4, 64);
      const t = v * 34 + warp * 7 + fbm(u * 12, v * 2, 2, 12, 64) * 1.6;
      const ring = t - Math.floor(t);
      const lines = smoothstep(0, 0.09, ring) * smoothstep(1, 0.72, ring);
      const fibre = fbm(u * 96, v * 150, 3, 96, 256);
      const figure = fbm(u * 6, v * 5, 4, 6, 64);
      const flame = smoothstep(
        0.42,
        0.7,
        noise(u * 22 + warp * 3, v * 1.4, 22, 64),
      );
      const light = 0.42 + figure * 0.5 + fibre * 0.22 + flame * 0.12;
      let r = 0.13 + 0.2 * light,
        g = 0.045 + 0.08 * light,
        b = 0.03 + 0.045 * light;
      const dark = 1 - (1 - lines) * 0.7;
      r *= dark;
      g *= dark;
      b *= dark;
      const i = (y * W + x) * 4;
      image.data[i] = Math.min(255, r * 255);
      image.data[i + 1] = Math.min(255, g * 255);
      image.data[i + 2] = Math.min(255, b * 255);
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  // Open pores: tiny dark dashes along the grain.
  ctx.globalAlpha = 0.35;
  for (let i = 0; i < 2600; i++) {
    const x = rand() * W,
      y = rand() * H,
      len = 2 + rand() * 9;
    ctx.fillStyle = rand() > 0.5 ? "#1a0905" : "#2a120a";
    ctx.fillRect(x, y, len, 1);
  }
  ctx.globalAlpha = 1;
  return canvasTexture(canvas, true, true);
}

function heightToNormal(
  height: Float32Array,
  W: number,
  H: number,
  strength: number,
) {
  const { canvas, ctx } = makeCanvas(W, H);
  const image = ctx.createImageData(W, H);
  const at = (x: number, y: number) =>
    height[
      Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))
    ];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * W + x) * 4;
      image.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      image.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      image.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      image.data[i + 3] = 255;
    }
  ctx.putImageData(image, 0, 0);
  return canvasTexture(canvas, false, true);
}

/** Frame-and-panel fascia with a gilt inlay, plus matching normal map. */
export function makeFasciaTextures() {
  const W = 384,
    H = 640;
  const { canvas, ctx } = makeCanvas(W, H);
  const height = new Float32Array(W * H);
  const { fbm } = createNoise(44);
  const image = ctx.createImageData(W, H);
  const frame = 26,
    groove = 44,
    bevel = 30;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const edge = Math.min(x, W - 1 - x, y, H - 1 - y);
      let h = 0.55;
      let tone = 0.75;
      if (edge < 3) {
        h = 0.1;
        tone = 0.35;
      } else if (edge < frame) {
        h = 0.6;
      } else if (edge < groove) {
        h = 0.38;
        tone = 0.62;
      } else if (edge < groove + bevel) {
        const t = (edge - groove) / bevel;
        h = 0.38 + t * 0.62;
        tone = 0.7 + t * 0.3;
      } else {
        h = 1;
        tone = 1;
      }
      height[y * W + x] = h;
      const grain = fbm((x / W) * 3, (y / H) * 40, 4, 3, 40);
      const streak = fbm((x / W) * 40, (y / H) * 3, 2, 40, 3);
      const leather = fbm((x / W) * 30, (y / H) * 50, 3, 30, 50);
      const field = edge >= groove + bevel;
      const l =
        (field ? 0.7 + leather * 0.45 : 0.55 + grain * 0.35 + streak * 0.2) *
        tone;
      const i = (y * W + x) * 4;
      // oxblood leather in the raised field, dark wood stiles around it
      image.data[i] = (field ? 78 : 58) * l + 6;
      image.data[i + 1] = (field ? 14 : 24) * l + 3;
      image.data[i + 2] = (field ? 20 : 16) * l + 3;
      image.data[i + 3] = 255;
    }
  ctx.putImageData(image, 0, 0);
  // Gilt inlay line inside the raised field.
  const inset = groove + bevel + 16;
  ctx.strokeStyle = "rgba(205,160,86,0.85)";
  ctx.lineWidth = 2;
  ctx.strokeRect(inset, inset, W - inset * 2, H - inset * 2);
  ctx.strokeStyle = "rgba(120,86,40,0.7)";
  ctx.lineWidth = 1;
  ctx.strokeRect(inset + 6, inset + 6, W - inset * 2 - 12, H - inset * 2 - 12);
  // Small lozenge medallion.
  const cx = W / 2,
    cy = H * 0.42;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI / 4);
  const g = ctx.createLinearGradient(-18, -18, 18, 18);
  g.addColorStop(0, "#f2cf86");
  g.addColorStop(0.5, "#8c6430");
  g.addColorStop(1, "#d6ab62");
  ctx.fillStyle = g;
  ctx.fillRect(-15, -15, 30, 30);
  ctx.fillStyle = "#3a160d";
  ctx.fillRect(-8, -8, 16, 16);
  ctx.restore();
  for (let y = -16; y <= 16; y++)
    for (let x = -16; x <= 16; x++)
      if (Math.abs(x) + Math.abs(y) < 22) {
        const px = Math.round(cx + x),
          py = Math.round(cy + y);
        height[py * W + px] = 1.15 - (Math.abs(x) + Math.abs(y)) / 60;
      }
  const normal = heightToNormal(height, W, H, 3.2);
  return { map: canvasTexture(canvas, true, true), normalMap: normal };
}

/** Polished dark wood floor with long planks. */
export function makeFloorTexture() {
  const W = 512,
    H = 512;
  const { canvas, ctx } = makeCanvas(W, H);
  const image = ctx.createImageData(W, H);
  const { fbm } = createNoise(7);
  const plank = 64;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const row = Math.floor(x / plank);
      const offset = (row * 137) % H;
      const v = ((y + offset) % H) / H;
      const g = fbm((x / W) * 8 + row * 3.1, v * 6, 4, 8, 6);
      const seam = x % plank < 2 || (y + offset) % 256 < 2 ? 0.35 : 1;
      const l = (0.45 + g * 0.6) * seam;
      const i = (y * W + x) * 4;
      image.data[i] = 38 * l;
      image.data[i + 1] = 20 * l;
      image.data[i + 2] = 14 * l;
      image.data[i + 3] = 255;
    }
  ctx.putImageData(image, 0, 0);
  return canvasTexture(canvas, true, true);
}

/** Smoky antique mirror for the back of the bottle wall. */
export function makeMirrorTexture() {
  const W = 256,
    H = 256;
  const { canvas, ctx } = makeCanvas(W, H);
  const image = ctx.createImageData(W, H);
  const { fbm } = createNoise(303);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const n = fbm(x / 40, y / 40, 5, W / 40, H / 40);
      const fox = smoothstep(
        0.62,
        0.8,
        fbm(x / 18 + 9, y / 18, 3, W / 18, H / 18),
      );
      const l = 0.55 + n * 0.5 - fox * 0.45;
      const i = (y * W + x) * 4;
      image.data[i] = 150 * l;
      image.data[i + 1] = 118 * l;
      image.data[i + 2] = 80 * l;
      image.data[i + 3] = 255;
    }
  ctx.putImageData(image, 0, 0);
  return canvasTexture(canvas, true, true);
}

/** Leather coaster with a gilt ring. Drawn again once web fonts are ready. */
export function makeCoasterTexture() {
  const S = 256;
  const { canvas, ctx } = makeCanvas(S, S);
  const texture = canvasTexture(canvas);
  const draw = () => {
    ctx.clearRect(0, 0, S, S);
    const c = S / 2;
    const g = ctx.createRadialGradient(c, c, 10, c, c, c);
    g.addColorStop(0, "#3d0d14");
    g.addColorStop(0.85, "#250709");
    g.addColorStop(1, "#140405");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c, c, c - 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(222,176,98,0.9)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(c, c, c - 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(c, c, c - 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(c, c, c - 44, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(226,184,110,0.92)";
    ctx.font = `600 15px ${DISPLAY_FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const text = "· NOCTURNE · AFTER HOURS · NOCTURNE · AFTER HOURS ";
    const radius = c - 30;
    for (let i = 0; i < text.length; i++) {
      const a = (i / text.length) * Math.PI * 2;
      ctx.save();
      ctx.translate(c + Math.sin(a) * radius, c - Math.cos(a) * radius);
      ctx.rotate(a);
      ctx.fillText(text[i], 0, 0);
      ctx.restore();
    }
    texture.needsUpdate = true;
  };
  draw();
  void whenFontsReady().then(draw);
  return texture;
}

const LABEL_NAMES = [
  ["ORDO", "XII"],
  ["NOX", "RESERVE"],
  ["VELLUM", "AMARO"],
  ["LUPA", "1897"],
  ["ASH & AMBER", "SINGLE CASK"],
  ["CHAOS", "DRY GIN"],
  ["SILENTIUM", "VERMOUTH"],
  ["HUMILITAS", "BRANDY"],
  ["RUBEDO", "ROSSO"],
  ["LUNA", "ABSINTHE"],
  ["FERRUM", "RYE"],
  ["CORVUS", "NOIR"],
  ["AURUM", "LIQUEUR"],
  ["SANGUIS", "PORT"],
  ["NIHIL", "VODKA"],
  ["MMXXVI", "SHERRY"],
];

/** 4x4 atlas of fictional bottle labels. Art sits in the middle third (the front). */
export function makeLabelAtlas() {
  const S = 1024,
    cell = 256;
  const { canvas, ctx } = makeCanvas(S, S);
  const texture = canvasTexture(canvas);
  texture.anisotropy = 4;
  const palettes = [
    ["#efe2c4", "#1d1410", "#9b7333"],
    ["#141010", "#dcb46c", "#7d1b26"],
    ["#d9c9a3", "#5b1420", "#2a2014"],
    ["#1d2a24", "#e7d3a3", "#b38b45"],
    ["#e9dfcf", "#24304a", "#a2803b"],
    ["#3d0d14", "#f0d28e", "#f0d28e"],
  ];
  const draw = () => {
    ctx.clearRect(0, 0, S, S);
    LABEL_NAMES.forEach(([name, sub], index) => {
      const ox = (index % 4) * cell,
        oy = Math.floor(index / 4) * cell;
      const [bg, ink, accent] = palettes[index % palettes.length];
      const x = ox + cell / 3,
        w = cell / 3,
        top = oy + 28,
        h = cell - 56;
      ctx.fillStyle = bg;
      if (index % 3 === 0) {
        ctx.beginPath();
        ctx.moveTo(x, top + 18);
        ctx.quadraticCurveTo(x + w / 2, top - 10, x + w, top + 18);
        ctx.lineTo(x + w, top + h);
        ctx.lineTo(x, top + h);
        ctx.closePath();
        ctx.fill();
      } else ctx.fillRect(x, top, w, h);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 5, top + 8, w - 10, h - 16);
      ctx.fillStyle = ink;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const fontSize = name.length > 7 ? 9 : 13;
      ctx.font = `700 ${fontSize}px ${DISPLAY_FONT}`;
      ctx.save();
      ctx.translate(x + w / 2, top + h * 0.42);
      ctx.fillText(name, 0, 0);
      ctx.font = `500 7px ${DISPLAY_FONT}`;
      ctx.fillStyle = accent;
      ctx.fillText(sub, 0, 22);
      ctx.restore();
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(x + w / 2, top + h * 0.72, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x + 12, top + h * 0.25, w - 24, 1);
    });
    texture.needsUpdate = true;
  };
  draw();
  void whenFontsReady().then(draw);
  return texture;
}

/** Gilt sign above the bottle wall: crossed sabres behind a broken ring. */
export function makeEmblemTexture() {
  const W = 1024,
    H = 512;
  const { canvas, ctx } = makeCanvas(W, H);
  const texture = canvasTexture(canvas);
  const draw = () => {
    ctx.clearRect(0, 0, W, H);
    const gold = ctx.createLinearGradient(0, 40, 0, H - 40);
    gold.addColorStop(0, "#fff0c2");
    gold.addColorStop(0.45, "#e2b261");
    gold.addColorStop(1, "#a9762f");
    ctx.strokeStyle = gold;
    ctx.fillStyle = gold;
    const cx = W / 2,
      cy = 200;
    ctx.lineCap = "round";
    // crossed sabres
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(side * 0.72);
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(0, 150);
      ctx.quadraticCurveTo(side * 16, -20, side * 4, -170);
      ctx.stroke();
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-26, 118);
      ctx.lineTo(26, 118);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 140, 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    // broken ring
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, 96, -Math.PI * 0.42, Math.PI * 1.32);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 110, -Math.PI * 0.35, Math.PI * 1.25);
    ctx.stroke();
    // a crack through the ring
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx + 34, cy - 104);
    ctx.lineTo(cx + 22, cy - 80);
    ctx.lineTo(cx + 36, cy - 64);
    ctx.lineTo(cx + 18, cy - 40);
    ctx.stroke();
    // wolf ears inside the ring
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(cx - 52, cy + 30);
    ctx.lineTo(cx - 34, cy - 52);
    ctx.lineTo(cx - 6, cy - 6);
    ctx.moveTo(cx + 6, cy - 6);
    ctx.lineTo(cx + 34, cy - 52);
    ctx.lineTo(cx + 52, cy + 30);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy + 34, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 64px ${DISPLAY_FONT}`;
    ctx.fillText("NOCTURNE", cx, 386);
    ctx.font = `600 26px ${SERIF_SC}`;
    ctx.fillText("— 无 序 · 谦 卑 —", cx, 448);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 330, 386);
    ctx.lineTo(cx - 200, 386);
    ctx.moveTo(cx + 200, 386);
    ctx.lineTo(cx + 330, 386);
    ctx.stroke();
    texture.needsUpdate = true;
  };
  draw();
  void whenFontsReady().then(draw);
  return texture;
}

/** Soft radial sprite used for flames, bokeh and dust. */
export function makeSoftSprite() {
  const S = 128;
  const { canvas, ctx } = makeCanvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return canvasTexture(canvas, false);
}

/**
 * HDR equirectangular light probe of the room. Sharp enough for glass glints,
 * and the source of the PMREM used by every physically based material.
 */
export function makeEnvironmentTexture() {
  const W = 512,
    H = 256;
  const data = new Float32Array(W * H * 4);
  const { fbm } = createNoise(5);
  const add = (i: number, r: number, g: number, b: number) => {
    data[i] += r;
    data[i + 1] += g;
    data[i + 2] += b;
  };
  for (let y = 0; y < H; y++) {
    const elevation = ((y + 0.5) / H - 0.5) * Math.PI;
    for (let x = 0; x < W; x++) {
      // three.js equirect convention: u = atan(z, x) / 2pi + 0.5
      const azimuth = ((x + 0.5) / W - 0.5) * Math.PI * 2;
      const dx = Math.cos(azimuth) * Math.cos(elevation);
      const dz = Math.sin(azimuth) * Math.cos(elevation);
      const dy = Math.sin(elevation);
      const i = (y * W + x) * 4;
      data[i + 3] = 1;
      // base: warm darkness, slightly brighter around the horizon
      const horizon = Math.exp(-Math.abs(dy) * 4);
      add(
        i,
        0.018 + horizon * 0.03,
        0.011 + horizon * 0.016,
        0.008 + horizon * 0.01,
      );
      // the bottle wall behind the bar (towards -z)
      if (dz < -0.05) {
        const wall =
          smoothstep(-0.05, -0.55, dz) *
          smoothstep(0.62, 0.05, dy) *
          smoothstep(-0.25, 0, dy);
        const n = fbm(x / 9, y / 5, 3, W / 9, H / 5);
        add(
          i,
          wall * (0.35 + n * 0.4),
          wall * (0.17 + n * 0.2),
          wall * (0.05 + n * 0.06),
        );
        // LED shelf strips
        for (const band of [0.04, 0.14, 0.24, 0.34]) {
          const s =
            Math.exp(-((dy - band) ** 2) / 0.00012) *
            smoothstep(-0.2, -0.7, dz);
          add(i, s * 2.4, s * 1.4, s * 0.5);
        }
      }
      // overhead soft boxes
      for (const [ax, az] of [
        [-0.35, 0.25],
        [0.35, 0.25],
        [0, -0.4],
      ]) {
        const d = Math.hypot(dx - ax, dz - az);
        const box = smoothstep(0.24, 0.1, d) * smoothstep(0.55, 0.8, dy);
        add(i, box * 2.8, box * 2.3, box * 1.7);
      }
      // warm lamps behind the guest (towards +z) to give the glasses glints
      for (const [ax, ay] of [
        [-0.55, 0.18],
        [0.62, 0.22],
        [0.1, 0.32],
      ]) {
        const d = Math.hypot(dx - ax, dy - ay) + Math.max(0, -dz) * 3;
        const lamp = Math.exp(-(d * d) / 0.0016) * smoothstep(-0.1, 0.4, dz);
        add(i, lamp * 6, lamp * 4, lamp * 2);
      }
      // crimson drapes on both sides
      const drape =
        smoothstep(0.55, 0.95, Math.abs(dx)) *
        smoothstep(0.7, 0.0, Math.abs(dy));
      const fold = 0.6 + 0.4 * Math.sin(dz * 40 + dy * 3);
      add(i, drape * 0.16 * fold, drape * 0.018 * fold, drape * 0.026 * fold);
      // vertical gold strip lights at the edge of the drapes
      const strip =
        Math.exp(-((Math.abs(dx) - 0.9) ** 2) / 0.0006) *
        smoothstep(0.5, 0.1, Math.abs(dy)) *
        clamp01(dz + 0.6);
      add(i, strip * 2.4, strip * 1.5, strip * 0.55);
      // floor: almost black
      if (dy < -0.1) {
        const f = smoothstep(-0.1, -0.6, dy);
        data[i] *= 1 - f * 0.85;
        data[i + 1] *= 1 - f * 0.85;
        data[i + 2] *= 1 - f * 0.85;
      }
    }
  }
  const half = new Uint16Array(data.length);
  for (let i = 0; i < data.length; i++)
    half[i] = THREE.DataUtils.toHalfFloat(data[i]);
  const texture = new THREE.DataTexture(
    half,
    W,
    H,
    THREE.RGBAFormat,
    THREE.HalfFloatType,
  );
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
