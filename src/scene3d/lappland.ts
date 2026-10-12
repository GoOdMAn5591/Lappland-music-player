import * as THREE from "three";
import type { PortraitRig } from "../character/portrait";
import { CHARACTER } from "./layout";
import { clamp01, damp, smoothstep } from "./util";

/**
 * Pseudo-Live2D for a single illustration.
 *
 * The portrait is a dense mesh whose vertices carry painted deformer weights
 * (head, ear, ponytail chain, floating ribbons, fringe and both arms). Her body
 * only ever moves as one rigid piece (a slow lean about the hips and a breath
 * that lifts the upper body); nothing ripples across the coat. Head and arms
 * turn as rigid parts, and only hair and ribbons bend. The weight fields are
 * Gaussian-smoothed on the mesh grid so no region boundary can tear or smear.
 * The fragment shader adds blink, lens glint, the pour stream in the current
 * drink's colour, a rim light from the bottle wall and colour grading so the
 * flat artwork sits inside the lit room.
 */

type V2 = [number, number];

interface DetailedRig {
  neck: V2;
  head: { c: V2; r: V2 };
  ear: { base: V2; tip: V2; width: number };
  pony: { chain: V2[]; width: number[] };
  strands: { chain: V2[]; width: number }[];
  fringe: { c: V2; r: V2 }[];
  bottleArm: { poly: V2[]; pivot: V2 };
  glassArm: { c: V2; r: V2; pivot: V2 };
  eye: { c: V2; r: V2 };
  lens: { c: V2; r: V2 };
  pour: { from: V2; to: V2 };
  heldDrink: { c: V2; r: V2 };
  coatEdge: { x0: number; x1: number; y: number };
  /** Rigid zone (her glass arm: sleeve, forearm, hand) that hair and ribbons must not drag along. */
  armGuard?: V2[];
  /** Ponytail motion fades out between these heights so the tail can't tug the sleeve beside it. */
  ponyTaper?: [number, number];
  /**
   * The artwork crops the bottle's base at the left border. The mesh is widened by
   * `extend` (fraction of the width) and the base is redrawn there: px centre of the
   * cut edge, bottle axis angle (deg), half width & cap length (px).
   */
  bottleCap?: { edge: V2; angle: number; halfWidth: number; length: number; extend: number };
}

// Hand-placed for the bundled 910 x 1200 cut-out (image space, v grows downwards).
const LAPPLAND_RIG: DetailedRig = {
  neck: [0.585, 0.37],
  head: { c: [0.585, 0.205], r: [0.18, 0.19] },
  ear: { base: [0.668, 0.118], tip: [0.708, 0.035], width: 0.032 },
  pony: {
    chain: [
      [0.655, 0.075],
      [0.745, 0.105],
      [0.815, 0.17],
      [0.86, 0.27],
      [0.885, 0.38],
      [0.905, 0.5],
      [0.93, 0.64],
      [0.955, 0.8],
      [0.97, 0.92],
    ],
    width: [0.05, 0.065, 0.075, 0.08, 0.08, 0.075, 0.065, 0.06, 0.05],
  },
  strands: [
    {
      chain: [
        [0.3, 0.705],
        [0.21, 0.735],
        [0.13, 0.76],
        [0.06, 0.775],
        [0.0, 0.78],
      ],
      width: 0.03,
    },
    {
      chain: [
        [0.3, 0.79],
        [0.2, 0.81],
        [0.12, 0.84],
        [0.07, 0.87],
        [0.05, 0.905],
      ],
      width: 0.03,
    },
  ],
  fringe: [
    { c: [0.455, 0.29], r: [0.06, 0.1] },
    { c: [0.5, 0.17], r: [0.07, 0.06] },
  ],
  bottleArm: {
    // generous: the whole fist, bottle and bent elbow turn together, so the
    // soft edge of the region lies in empty space instead of across the glove
    poly: [
      [-0.1, 0.4],
      [0.25, 0.4],
      [0.36, 0.49],
      [0.42, 0.56],
      [0.4, 0.64],
      [0.3, 0.7],
      [0.26, 0.73],
      [0.1, 0.73],
      [-0.1, 0.67],
    ],
    pivot: [0.42, 0.57],
  },
  glassArm: { c: [0.36, 0.79], r: [0.12, 0.13], pivot: [0.45, 0.9] },
  eye: { c: [0.588, 0.2545], r: [0.024, 0.0095] },
  lens: { c: [0.555, 0.286], r: [0.028, 0.019] },
  pour: { from: [0.2815, 0.586], to: [0.2832, 0.712] },
  heldDrink: { c: [0.362, 0.795], r: [0.052, 0.036] },
  // only the coat's straight edge (below the elbow); above that are her thumb and sleeve
  coatEdge: { x0: 0.212, x1: 0.252, y: 0.69 },
  armGuard: [
    [0.7033, 0.4667],
    [0.8791, 0.45],
    [0.9341, 0.4667],
    [0.9473, 0.5833],
    [0.9516, 0.75],
    [0.9451, 0.9083],
    [0.7033, 0.9083],
    [0.5165, 0.8833],
    [0.3297, 0.9],
    [0.3187, 0.775],
    [0.5275, 0.7833],
    [0.7033, 0.6667],
  ],
  ponyTaper: [0.4, 0.85],
  bottleCap: { edge: [0, 584.5 / 1200], angle: 23, halfWidth: 27.5, length: 17, extend: 0.045 },
};

function ellipseWeight(
  u: number,
  v: number,
  c: V2,
  r: V2,
  inner = 0.65,
  outer = 1.15,
) {
  if (r[0] <= 0 || r[1] <= 0) return 0;
  const d = Math.hypot((u - c[0]) / r[0], (v - c[1]) / r[1]);
  return 1 - smoothstep(inner, outer, d);
}

function chainParam(u: number, v: number, chain: V2[], aspect: number) {
  // Closest point on a polyline (aspect corrected): returns [s 0..1, distance].
  let best = Infinity,
    bestS = 0,
    total = 0;
  const lengths: number[] = [];
  for (let i = 1; i < chain.length; i++) {
    const l = Math.hypot(
      (chain[i][0] - chain[i - 1][0]) * aspect,
      chain[i][1] - chain[i - 1][1],
    );
    lengths.push(l);
    total += l;
  }
  let acc = 0;
  for (let i = 1; i < chain.length; i++) {
    const ax = chain[i - 1][0] * aspect,
      ay = chain[i - 1][1];
    const bx = chain[i][0] * aspect,
      by = chain[i][1];
    const px = u * aspect,
      py = v;
    const dx = bx - ax,
      dy = by - ay;
    const t = clamp01(
      ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1),
    );
    const d = Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
    if (d < best) {
      best = d;
      bestS = (acc + lengths[i - 1] * t) / total;
    }
    acc += lengths[i - 1];
  }
  return [bestS, best, Math.round(bestS * (chain.length - 1))] as const;
}

function polygonWeight(u: number, v: number, poly: V2[], feather: number) {
  let inside = false;
  let dist = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > v !== yj > v && u < ((xj - xi) * (v - yi)) / (yj - yi) + xi)
      inside = !inside;
    const dx = xi - xj,
      dy = yi - yj;
    const t = clamp01(
      ((u - xj) * dx + (v - yj) * dy) / (dx * dx + dy * dy || 1),
    );
    dist = Math.min(dist, Math.hypot(u - (xj + dx * t), v - (yj + dy * t)));
  }
  return inside ? 1 : 1 - smoothstep(0, feather, dist);
}

/** Separable Gaussian blur of a per-vertex field laid out as rows of `nx`. */
function blurGrid(field: Float32Array, nx: number, ny: number, sigma: number) {
  const r = Math.ceil(sigma * 3);
  const k = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) sum += k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma));
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float32Array(field.length);
  for (let y = 0; y < ny; y++)
    for (let x = 0; x < nx; x++) {
      let acc = 0;
      for (let i = -r; i <= r; i++)
        acc += k[i + r] * field[y * nx + Math.min(nx - 1, Math.max(0, x + i))];
      tmp[y * nx + x] = acc;
    }
  for (let y = 0; y < ny; y++)
    for (let x = 0; x < nx; x++) {
      let acc = 0;
      for (let i = -r; i <= r; i++)
        acc += k[i + r] * tmp[Math.min(ny - 1, Math.max(0, y + i)) * nx + x];
      field[y * nx + x] = acc;
    }
}

/** Width of the weight smoothing, in mesh cells (one cell is about 6 px of artwork). */
const WEIGHT_BLUR = 4.5;

function buildGeometry(rig: DetailedRig, aspect: number, height: number) {
  const width = height * aspect;
  const ext = rig.bottleCap?.extend ?? 0;
  const segX = Math.round(150 * (1 + ext));
  const segY = 198;
  const geometry = new THREE.PlaneGeometry(width * (1 + ext), height, segX, segY);
  // keep the artwork where it was; the extra strip hangs off its left edge (u < 0)
  geometry.translate((-width * ext) / 2, 0, 0);
  const uv = geometry.attributes.uv;
  const count = uv.count;
  if (ext) for (let i = 0; i < count; i++) uv.setX(i, uv.getX(i) * (1 + ext) - ext);
  const field = () => new Float32Array(count);
  const head = field(), ear = field(), fringe = field(), bottle = field(), glassArm = field();
  const ponyS = field(), pony = field();
  const k1 = field(), w1 = field(), k2 = field(), w2 = field();
  const armGuard = field(), glassGuard = field();
  const earLen = Math.hypot(rig.ear.tip[0] - rig.ear.base[0], rig.ear.tip[1] - rig.ear.base[1]);
  for (let i = 0; i < count; i++) {
    const u = uv.getX(i),
      v = 1 - uv.getY(i);
    armGuard[i] = rig.armGuard ? polygonWeight(u, v, rig.armGuard, 0.045) : 0;
    // keep the held glass rigid against hair motion
    glassGuard[i] =
      1 - ellipseWeight(u, v, rig.heldDrink.c, [rig.heldDrink.r[0] * 2, rig.heldDrink.r[1] * 2.6], 0.6, 1);
    head[i] =
      ellipseWeight(u, v, rig.head.c, rig.head.r, 0.55, 1.1) *
      (1 - smoothstep(rig.neck[1] - 0.04, rig.neck[1] + 0.03, v));
    const [es, ed] = chainParam(u, v, [rig.ear.base, rig.ear.tip], aspect);
    ear[i] =
      earLen > 0
        ? (1 - smoothstep(rig.ear.width * 0.7, rig.ear.width * 2.4, ed)) * smoothstep(-0.1, 0.45, es)
        : 0;
    for (const f of rig.fringe) fringe[i] = Math.max(fringe[i], ellipseWeight(u, v, f.c, f.r));
    bottle[i] =
      polygonWeight(u, v, rig.bottleArm.poly, 0.05) *
      (1 - smoothstep(0.3, 0.42, u) * smoothstep(0.5, 0.6, v));
    glassArm[i] = ellipseWeight(u, v, rig.glassArm.c, rig.glassArm.r, 0.45, 1.05) * (1 - bottle[i]);
    const [ps, pd, pk] = chainParam(u, v, rig.pony.chain, aspect);
    const pw = rig.pony.width[Math.min(pk, rig.pony.width.length - 1)] ?? 0.06;
    const taper = rig.ponyTaper ? 1 - 0.8 * smoothstep(rig.ponyTaper[0], rig.ponyTaper[1], v) : 1;
    ponyS[i] = ps;
    pony[i] = (1 - smoothstep(pw * 0.7, pw * 1.35, pd)) * smoothstep(0.02, 0.18, ps) * taper * (1 - armGuard[i]);
    rig.strands.slice(0, 2).forEach((chain, n) => {
      const [ss, sd] = chainParam(u, v, chain.chain, aspect);
      (n ? k2 : k1)[i] = ss;
      (n ? w2 : w1)[i] = (1 - smoothstep(chain.width * 0.8, chain.width * 2.2, sd)) * smoothstep(0.0, 0.2, ss);
    });
  }
  // Smooth every deformer field so neighbouring regions blend over ~27 px
  // instead of shearing against each other; the rigid guards are applied after.
  const nx = segX + 1,
    ny = segY + 1;
  for (const f of [head, ear, fringe, bottle, glassArm, ponyS, pony, k1, w1, k2, w2])
    blurGrid(f, nx, ny, WEIGHT_BLUR);
  const w0 = new Float32Array(count * 4);
  const wA = new Float32Array(count * 4);
  const wB = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const arm = 1 - armGuard[i];
    const ga = glassArm[i] * (1 - bottle[i]);
    const keep = glassGuard[i] * (1 - ga * 0.8) * arm;
    w0.set([head[i], ear[i], fringe[i] * (1 - ear[i]), bottle[i]], i * 4);
    wA.set([ga, ponyS[i], pony[i] * (1 - ear[i]) * arm, 0], i * 4);
    wB.set([k1[i], w1[i] * keep, k2[i], w2[i] * keep], i * 4);
  }
  geometry.setAttribute("aW0", new THREE.BufferAttribute(w0, 4));
  geometry.setAttribute("aW1", new THREE.BufferAttribute(wA, 4));
  geometry.setAttribute("aW2", new THREE.BufferAttribute(wB, 4));
  return geometry;
}

const vertexShader = /* glsl */ `
  attribute vec4 aW0; // head, ear, fringe, bottle arm
  attribute vec4 aW1; // glass arm, ponytail position, ponytail weight, -
  attribute vec4 aW2; // ribbon 1 position, ribbon 1 weight, ribbon 2 position, ribbon 2 weight
  uniform float uTime;
  uniform float uAspect;
  uniform float uHeight;
  uniform float uMotion;
  uniform vec2 uLook;
  uniform vec2 uTrail;
  uniform float uEar;
  uniform float uBeat;
  uniform float uReact;
  uniform vec2 uNeck;
  uniform vec2 uEarBase;
  uniform vec2 uBottlePivot;
  uniform vec2 uGlassPivot;
  varying vec2 vUv;
  varying vec2 vImg;
  varying vec3 vWorld;

  vec2 rotAround(vec2 p, vec2 c, float a) {
    vec2 d = p - c;
    float s = sin(a), co = cos(a);
    return c + vec2(co * d.x - s * d.y, s * d.x + co * d.y) - p;
  }

  void main() {
    vUv = uv;
    vImg = vec2(uv.x, 1.0 - uv.y);
    vec2 P = vec2(vImg.x * uAspect, vImg.y);
    vec2 A = vec2(uAspect, 1.0);
    float t = uTime;
    vec2 d = vec2(0.0);

    // head: turns as one piece about the neck towards the guest, nods on the beat
    float headA = uLook.x * 0.03 + sin(t * 0.47) * 0.006 + uBeat * 0.004;
    d += aW0.x * (rotAround(P, uNeck * A, -headA) + vec2(uLook.x * 0.005, uLook.y * 0.003 + uBeat * 0.0015));
    // ear: small idle flick plus an occasional twitch
    float earA = sin(t * 2.3) * 0.012 + uEar * 0.1 + uLook.x * 0.02;
    d += aW0.y * rotAround(P, uEarBase * A, earA);
    // fringe trails the head a little
    d.x += aW0.z * (sin(t * 1.05) * 0.0012 - uTrail.x * 0.003);
    // the pouring hand tips the bottle, the other hand bobs the glass (both rigid)
    d += aW0.w * rotAround(P, uBottlePivot * A, sin(t * 0.75) * 0.006 + uReact * 0.01);
    d += aW1.x * (rotAround(P, uGlassPivot * A, sin(t * 0.75 + 0.7) * 0.005 - uReact * 0.006) + vec2(0.0, sin(t * 0.75 + 0.3) * 0.0012));
    // ponytail: one slow pendulum swing, the tip lagging slightly behind the root
    float s = aW1.y;
    float sw = pow(s, 1.6);
    d += aW1.z * sw * vec2(sin(t * 0.9 - s * 1.2) * 0.008 - uTrail.x * 0.012, sin(t * 0.9 - s * 1.2 + 1.2) * 0.002);
    // ribbons drift, more towards their free ends
    float k1 = aW2.x, k2 = aW2.z;
    vec2 r1 = pow(k1, 1.5) * vec2(sin(t * 1.1 + k1 * 2.0) * 0.004 - uTrail.x * 0.005, sin(t * 0.95 + k1 * 2.6) * 0.007 + uTrail.y * 0.006);
    vec2 r2 = pow(k2, 1.5) * vec2(sin(t * 1.1 + k2 * 2.0 + 0.5) * 0.004 - uTrail.x * 0.005, sin(t * 0.95 + k2 * 2.6 + 0.5) * 0.007 + uTrail.y * 0.006);
    d += (r1 * aW2.y + r2 * aW2.w) / max(aW2.y + aW2.w, 1.0);
    // breathing lifts the upper body as one piece (no swelling)
    d.y -= (1.0 - smoothstep(0.42, 0.9, vImg.y)) * 0.0022 * (sin(t * 1.3) * 0.5 + 0.5);
    // the whole figure leans slowly about her hips: a rigid rotation, no shear
    d += rotAround(P, vec2(0.55 * uAspect, 1.05), sin(t * 0.42) * 0.0022);

    d *= uMotion;
    vec3 pos = position + vec3(d.x, -d.y, 0.0) * uHeight;
    vec4 world = modelMatrix * vec4(pos, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec2 uTexel;
  uniform float uTime;
  uniform float uDetail;
  uniform vec3 uDrink;
  uniform float uPour;
  uniform float uBlink;
  uniform float uGlint;
  uniform vec2 uLook;
  uniform float uLevel;
  uniform float uReact;
  uniform float uExposure;
  uniform vec2 uEyeC;
  uniform vec2 uEyeR;
  uniform vec2 uLensC;
  uniform vec2 uLensR;
  uniform vec2 uPourA;
  uniform vec2 uPourB;
  uniform vec2 uDrinkC;
  uniform vec2 uDrinkR;
  uniform vec3 uCoat;
  uniform vec4 uCapA; // cut-edge centre (px), bottle axis (cos, sin)
  uniform vec4 uCapB; // half width (px), cap length (px), roundness exponent, enabled
  varying vec2 vUv;
  varying vec2 vImg;
  varying vec3 vWorld;

  float ellipse(vec2 p, vec2 c, vec2 r) {
    vec2 q = (p - c) / max(r, vec2(1e-5));
    return 1.0 - smoothstep(0.7, 1.0, length(q));
  }
  vec2 toUv(vec2 img) { return vec2(img.x, 1.0 - img.y); }
  vec4 tex(vec2 img) { return texture2D(uMap, toUv(img)); }
  float segDist(vec2 p, vec2 a, vec2 b, out float h) {
    vec2 pa = p - a, ba = b - a;
    h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
  }

  // The artwork crops the bottle at its base; redraw the base beyond the left
  // border by carrying the edge column along the bottle axis and rounding it off.
  // zone: 1 around the bottle so the border fade leaves it alone.
  vec4 bottleCap(vec2 q, out float zone) {
    zone = 0.0;
    if (uCapB.w < 0.5) return vec4(0.0);
    vec2 texSize = 1.0 / uTexel;
    vec2 dir = uCapA.zw;
    vec2 nrm = vec2(-dir.y, dir.x);
    vec2 rel = q * texSize - uCapA.xy;
    float a = dot(rel, dir);
    float n = dot(rel, nrm);
    zone = (1.0 - smoothstep(uCapB.x + 6.0, uCapB.x + 16.0, abs(n))) * (1.0 - smoothstep(60.0, 90.0, a));
    if (q.x >= 0.0) return vec4(0.0);
    float shape = pow(abs(n) / uCapB.x, uCapB.z);
    if (a < 0.0) shape += pow(-a / uCapB.y, uCapB.z);
    float cover = 1.0 - smoothstep(0.86, 1.0, shape);
    if (cover <= 0.0) return vec4(0.0);
    vec2 s = uCapA.xy + nrm * clamp(n, -uCapB.x + 4.0, uCapB.x - 4.0);
    s += dir * ((1.5 - s.x) / dir.x);
    vec4 c = texture2D(uMap, toUv(s / texSize));
    c.rgb *= 1.0 - 0.4 * clamp(-a / uCapB.y, 0.0, 1.0);
    float outline = smoothstep(0.62, 0.92, shape);
    c.rgb += (n > 0.0 ? vec3(0.12, 0.2, 0.62) : vec3(0.5, 0.32, 0.14)) * outline * 0.7;
    return vec4(c.rgb, cover);
  }

  void main() {
    vec2 q = vImg;
    // blink: draw the upper lid down over the visible eye
    float eyeMask = ellipse(q, uEyeC, uEyeR) * uDetail;
    if (eyeMask > 0.0 && uBlink > 0.0) {
      float lidTop = uEyeC.y - uEyeR.y;
      q.y = mix(q.y, lidTop - 0.003, eyeMask * uBlink * smoothstep(lidTop - 0.002, uEyeC.y + uEyeR.y, q.y));
    }
    // erase the painted pour stream while she is idle (resample its neighbours)
    float hStream;
    float streamD = segDist(q, uPourA, uPourB, hStream) * uDetail;
    float streamCore = (1.0 - smoothstep(0.0012, 0.0028, streamD)) * uDetail * step(0.001, uPourB.y);
    vec4 color = tex(q);
    float capZone;
    vec4 cap = bottleCap(q, capZone);
    if (q.x < 0.0) color = cap;
    if (streamCore > 0.0) {
      vec4 side = 0.5 * (tex(q + vec2(0.0042, 0.0)) + tex(q - vec2(0.0042, 0.0)));
      color = mix(color, side, streamCore * (1.0 - uPour));
    }
    float alpha = color.a;
    // soften the canvas borders and the straight edge of the coat
    alpha *= mix(smoothstep(0.0, 0.035, vImg.x), 1.0, capZone) * smoothstep(1.0, 0.925, vImg.x) * smoothstep(0.0, 0.01, vImg.y);
    float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    if (uCoat.x > 0.0) {
      float edge = smoothstep(uCoat.x, uCoat.y, vImg.x);
      float below = smoothstep(uCoat.z, uCoat.z + 0.025, vImg.y);
      alpha *= mix(1.0, mix(edge, 1.0, smoothstep(0.18, 0.4, lum)), below);
    }
    if (alpha < 0.01) discard;
    vec3 col = color.rgb;

    // the drink in her glass takes the colour of the current song
    float drink = ellipse(q, uDrinkC, uDrinkR) * uDetail;
    if (drink > 0.0) {
      float mx = max(col.r, max(col.g, col.b)), mn = min(col.r, min(col.g, col.b));
      float sat = (mx - mn) / max(mx, 1e-3);
      float tinted = drink * smoothstep(0.18, 0.4, sat) * step(col.r, col.b + 0.05);
      vec3 recolor = uDrink * (0.35 + 1.5 * mx) * (1.0 + uLevel * 0.8);
      col = mix(col, recolor, tinted * 0.85);
    }

    // sunglasses: a slow glint that follows the guest
    float lens = ellipse(q, uLensC, uLensR) * uDetail * (1.0 - smoothstep(0.18, 0.4, lum));
    if (lens > 0.0) {
      float sweep = fract(uTime * 0.09) * 3.0 - 1.0;
      float band = (q.x - uLensC.x) / uLensR.x * 0.7 + (q.y - uLensC.y) / uLensR.y * 0.5;
      float glintBand = exp(-pow((band - sweep) * 5.0, 2.0)) + exp(-pow((band - sweep - 0.35) * 14.0, 2.0)) * 0.6;
      vec2 hl = uLensC + vec2(-0.35 + uLook.x * 0.18, -0.35 - uLook.y * 0.12) * uLensR;
      float spot = exp(-dot((q - hl) / (uLensR * 0.28), (q - hl) / (uLensR * 0.28)));
      col += vec3(1.0, 0.9, 0.75) * lens * (glintBand * (0.35 + uGlint) + spot * 0.28);
    }
    // eye highlight shimmer
    if (eyeMask > 0.0) col += vec3(0.25, 0.3, 0.32) * eyeMask * (1.0 - uBlink) * (0.1 + 0.1 * sin(uTime * 1.7) + uReact * 0.3) * smoothstep(0.3, 0.7, lum);

    // pour stream in the colour of the current drink
    if (uPour > 0.001 && uDetail > 0.0) {
      float flow = 0.55 + 0.45 * sin(hStream * 90.0 - uTime * 16.0);
      float core = 1.0 - smoothstep(0.0006, 0.0022, streamD);
      float halo = 1.0 - smoothstep(0.0, 0.009, streamD);
      float ends = smoothstep(0.0, 0.05, hStream) * (1.0 - smoothstep(0.92, 1.0, hStream));
      col = mix(col, uDrink * 1.4 + 0.25, core * ends * uPour * 0.9);
      col += uDrink * halo * ends * uPour * flow * (0.25 + uLevel * 0.5);
      alpha = max(alpha, core * ends * uPour);
    }

    // grade into the room: warm key from above, shadow from the counter, golden rim from the bottle wall
    float l2 = dot(col, vec3(0.299, 0.587, 0.114));
    col *= mix(vec3(0.82, 0.74, 0.74), vec3(1.06, 0.98, 0.88), smoothstep(0.05, 0.85, l2));
    float key = 0.86 + 0.22 * smoothstep(0.75, 0.05, vImg.y) + 0.06 * smoothstep(0.3, 0.9, vImg.x);
    float lowShade = mix(1.0, 0.72, smoothstep(0.7, 1.0, vImg.y));
    col *= key * lowShade;
    vec2 o = uTexel * 5.0;
    float aMin = min(min(tex(vImg + vec2(o.x, 0.0)).a, tex(vImg - vec2(o.x, 0.0)).a),
                     min(tex(vImg + vec2(0.0, o.y)).a, tex(vImg - vec2(0.0, o.y)).a));
    float rim = q.x < 0.0 ? 0.0 : clamp(color.a - aMin, 0.0, 1.0);
    col += vec3(1.0, 0.66, 0.3) * rim * (0.55 + uLevel * 0.6) * smoothstep(0.95, 0.2, vImg.y);
    col *= uExposure;
    gl_FragColor = vec4(col, alpha);
  }
`;

export interface CharacterInput {
  look: { x: number; y: number };
  playing: boolean;
  audio: { bass: number; level: number };
  drink: THREE.Color;
  reduced: boolean;
}

export class LapplandCharacter {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private texture: THREE.Texture;
  private aspect: number;
  private look = new THREE.Vector2();
  private trail = new THREE.Vector2();
  private blinkTimer = 2.5;
  private blink = 0;
  private earTimer = 4;
  private ear = 0;
  private react = 0;
  private pour = 0;
  private drink = new THREE.Color(0.8, 0.2, 0.3);
  private beat = 0;
  private rigConfig: PortraitRig;

  constructor(image: HTMLImageElement, rig: PortraitRig, maxAnisotropy: number) {
    this.aspect = image.naturalWidth / image.naturalHeight;
    this.rigConfig = rig;
    const config = LAPPLAND_RIG;
    this.texture = new THREE.Texture(image);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = maxAnisotropy;
    this.texture.generateMipmaps = true;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.needsUpdate = true;
    const height = CHARACTER.height;
    const geometry = buildGeometry(config, this.aspect, height);
    const v2 = (p: V2) => new THREE.Vector2(p[0], p[1]);
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uMap: { value: this.texture },
        uTexel: {
          value: new THREE.Vector2(
            1 / image.naturalWidth,
            1 / image.naturalHeight,
          ),
        },
        uTime: { value: 0 },
        uAspect: { value: this.aspect },
        uHeight: { value: height },
        uMotion: { value: 1 },
        uLook: { value: new THREE.Vector2() },
        uTrail: { value: new THREE.Vector2() },
        uEar: { value: 0 },
        uBeat: { value: 0 },
        uReact: { value: 0 },
        uNeck: { value: v2(config.neck) },
        uEarBase: { value: v2(config.ear.base) },
        uBottlePivot: { value: v2(config.bottleArm.pivot) },
        uGlassPivot: { value: v2(config.glassArm.pivot) },
        uDetail: { value: 1 },
        uDrink: { value: this.drink },
        uPour: { value: 0 },
        uBlink: { value: 0 },
        uGlint: { value: 0 },
        uLevel: { value: 0 },
        uExposure: { value: 0.86 },
        uEyeC: { value: v2(config.eye.c) },
        uEyeR: { value: v2(config.eye.r) },
        uLensC: { value: v2(config.lens.c) },
        uLensR: { value: v2(config.lens.r) },
        uPourA: { value: v2(config.pour.from) },
        uPourB: { value: v2(config.pour.to) },
        uDrinkC: { value: v2(config.heldDrink.c) },
        uDrinkR: { value: v2(config.heldDrink.r) },
        uCoat: {
          value: new THREE.Vector3(
            config.coatEdge.x0,
            config.coatEdge.x1,
            config.coatEdge.y,
          ),
        },
        uCapA: {
          value: config.bottleCap
            ? new THREE.Vector4(
                config.bottleCap.edge[0] * image.naturalWidth,
                config.bottleCap.edge[1] * image.naturalHeight,
                Math.cos((config.bottleCap.angle * Math.PI) / 180),
                Math.sin((config.bottleCap.angle * Math.PI) / 180),
              )
            : new THREE.Vector4(),
        },
        uCapB: {
          value: config.bottleCap
            ? new THREE.Vector4(
                config.bottleCap.halfWidth,
                config.bottleCap.length,
                2.4,
                1,
              )
            : new THREE.Vector4(),
        },
      },
      transparent: true,
      depthWrite: true,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.renderOrder = 1;
    this.mesh.frustumCulled = false;
    this.applyPlacement(rig);
  }

  applyPlacement(rig: PortraitRig) {
    this.rigConfig = rig;
    const zoom = rig.zoom || 1;
    // The bundled rig was authored with zoom 1.02 / x -8 / y -2; treat that as the neutral placement.
    const dz = zoom / 1.02;
    this.mesh.scale.setScalar(dz);
    this.mesh.position.set(
      CHARACTER.x + (rig.x + 8) * 0.012,
      CHARACTER.y - (rig.y + 2) * 0.012 + (dz - 1) * 0.3,
      CHARACTER.z,
    );
    this.mesh.material.uniforms.uMotion.value = (rig.motion ?? 0.65) / 0.65;
  }

  /** Brief reaction when a song starts or the guest points at a glass. */
  poke(strength = 1) {
    this.react = Math.max(this.react, strength);
  }

  update(dt: number, time: number, input: CharacterInput) {
    const u = this.mesh.material.uniforms;
    const motion = input.reduced ? 0 : 1;
    this.look.x = damp(this.look.x, input.look.x, 3.2, dt);
    this.look.y = damp(this.look.y, input.look.y, 3.2, dt);
    this.trail.x = damp(this.trail.x, this.look.x, 1.1, dt);
    this.trail.y = damp(this.trail.y, this.look.y, 1.1, dt);
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blink = 1;
      this.blinkTimer = 2.2 + Math.random() * 4.5;
      if (Math.random() < 0.2) this.blinkTimer = 0.28; // double blink
    }
    this.blink = Math.max(0, this.blink - dt * 7.5);
    const blinkShape = this.blink > 0 ? Math.sin(this.blink * Math.PI) : 0;
    this.earTimer -= dt;
    if (this.earTimer <= 0) {
      this.ear = 1;
      this.earTimer = 3.5 + Math.random() * 6;
    }
    this.ear = Math.max(0, this.ear - dt * 4);
    const earShape =
      this.ear > 0 ? Math.sin(this.ear * Math.PI * 2) * this.ear : 0;
    this.react = Math.max(0, this.react - dt * 1.4);
    this.pour = damp(this.pour, input.playing ? 1 : 0, 2.5, dt);
    this.drink.lerp(input.drink, 1 - Math.exp(-dt * 3));
    this.beat = damp(this.beat, input.playing ? input.audio.bass : 0, 12, dt);

    u.uTime.value = time * motion;
    u.uLook.value.copy(this.look).multiplyScalar(motion);
    u.uTrail.value.copy(this.trail).multiplyScalar(motion);
    u.uEar.value = earShape * motion;
    u.uBeat.value = this.beat * motion * 0.7;
    u.uReact.value = this.react;
    u.uBlink.value = blinkShape;
    u.uGlint.value = this.react * 0.8;
    u.uPour.value = this.pour;
    u.uLevel.value = input.playing ? input.audio.level : 0;
    u.uMotion.value = ((this.rigConfig.motion ?? 0.65) / 0.65) * motion;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.texture.dispose();
  }
}
