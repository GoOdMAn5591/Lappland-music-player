import * as THREE from "three";
import type { DrinkRecipe, GlassShape } from "../app/recipes";
import { GLASS_PROFILES as SHAPES } from "../app/glassProfiles";
import { arcPoints, smoothProfile, type ProfilePoint } from "./geometry";
import { BAR, CAROUSEL } from "./layout";
import {
  clamp01,
  damp,
  hashString,
  hexToRgb01,
  mulberry32,
  smoothstep,
} from "./util";

/** Visual scale of glassware; the bartender and the props are staged larger than life. */
export const GLASS_SCALE = 1.85;

interface ShapeAssets {
  glass: THREE.BufferGeometry;
  liquid: THREE.BufferGeometry;
  rim: number;
  bowlBottom: number;
  height: number;
  base: number;
  /** Interpolated inner radius at a given local height (unscaled). */
  radiusAt: (y: number) => number;
}

const shapeCache = new Map<GlassShape, ShapeAssets>();

function shapeAssets(shape: GlassShape): ShapeAssets {
  const cached = shapeCache.get(shape);
  if (cached) return cached;
  const def = SHAPES[shape];
  const outer = smoothProfile(def.outer, 4);
  const cavity = smoothProfile(def.cavity, 5);
  const [rOut, rim] = outer[outer.length - 1];
  const rIn = cavity[cavity.length - 1][0];
  const lipR = Math.max(0.0008, (rOut - rIn) / 2);
  const lip = arcPoints((rOut + rIn) / 2, rim, lipR, 0, 180, 6);
  const inner = [...cavity].reverse().map(([r, y]) => [r, y] as ProfilePoint);
  const profile = [...outer, ...lip, ...inner].map(
    ([r, y]) => new THREE.Vector2(r, y),
  );
  const glass = new THREE.LatheGeometry(profile, 56);
  const liquidProfile = cavity.map(
    ([r, y]) => new THREE.Vector2(Math.max(0, r * 0.965), y + 0.0006),
  );
  const liquid = new THREE.LatheGeometry(liquidProfile, 44);
  const radiusAt = (y: number) => {
    for (let i = 1; i < cavity.length; i++) {
      if (cavity[i][1] >= y) {
        const [r0, y0] = cavity[i - 1];
        const [r1, y1] = cavity[i];
        return r0 + ((r1 - r0) * (y - y0)) / Math.max(1e-6, y1 - y0);
      }
    }
    return rIn;
  };
  const assets = {
    glass,
    liquid,
    rim,
    bowlBottom: cavity[0][1],
    height: rim,
    base: def.outer[1][0],
    radiusAt,
  };
  shapeCache.set(shape, assets);
  return assets;
}

const commonVaryings = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying vec3 vLocal;
`;

const glassVertex = /* glsl */ `
  ${commonVaryings}
  void main() {
    vLocal = position;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const glassFragment = /* glsl */ `
  #include <common>
  ${commonVaryings}
  uniform sampler2D uEnv;
  uniform vec3 uSpot;
  uniform vec3 uLiquid;
  uniform float uFill;
  uniform float uRim;
  uniform float uFade;
  uniform float uGlow;
  uniform float uHover;
  uniform float uBack;
  void main() {
    vec3 N = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
    vec3 V = normalize(cameraPosition - vWorld);
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    float fres = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
    vec3 R = reflect(-V, N);
    vec3 env = texture2D(uEnv, equirectUv(R)).rgb;
    vec3 L = normalize(uSpot - vWorld);
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 160.0) * 5.0 + pow(max(dot(N, H), 0.0), 18.0) * 0.12;
    vec3 col = env * fres * 1.5 + spec * vec3(1.0, 0.9, 0.74) * (0.4 + uGlow);
    float edge = smoothstep(0.42, 0.02, ndv);
    col += vec3(0.95, 0.82, 0.62) * edge * 0.09;
    float wet = 1.0 - smoothstep(uFill - 0.002, uFill + 0.003, vLocal.y);
    col += uLiquid * wet * (0.08 + uGlow * 0.25) * (1.0 - ndv);
    float rim = smoothstep(uRim - 0.0035, uRim, vLocal.y);
    col += vec3(1.0, 0.9, 0.76) * rim * (0.35 + spec * 0.4 + uHover * 0.5);
    // the foot catches warm light from the bar top
    float foot = 1.0 - smoothstep(0.0, 0.006, vLocal.y);
    col += vec3(0.9, 0.6, 0.3) * foot * 0.25;
    float alpha = clamp(fres * 0.9 + edge * 0.28 + rim * 0.55 + spec * 0.6, 0.0, 1.0);
    col *= mix(1.0, 0.55, uBack);
    alpha *= mix(1.0, 0.5, uBack);
    gl_FragColor = vec4(col * uFade, alpha * uFade);
  }
`;

const noiseGLSL = /* glsl */ `
  float hash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash13(vec3(i, 1.0)), b = hash13(vec3(i + vec2(1.0, 0.0), 1.0));
    float c = hash13(vec3(i + vec2(0.0, 1.0), 1.0)), d = hash13(vec3(i + vec2(1.0, 1.0), 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
`;

const liquidVertex = /* glsl */ `
  ${commonVaryings}
  void main() {
    vLocal = position;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const liquidFragment = /* glsl */ `
  #include <common>
  ${commonVaryings}
  ${noiseGLSL}
  uniform sampler2D uEnv;
  uniform vec3 uTop;
  uniform vec3 uDeep;
  uniform vec3 uFoam;
  uniform vec3 uSpot;
  uniform vec3 uCamLocal;
  uniform vec2 uTilt;
  uniform float uFill;
  uniform float uBottom;
  uniform float uSurfR;
  uniform float uTime;
  uniform float uWave;
  uniform float uRipple;
  uniform float uGlow;
  uniform float uFlakes;
  uniform float uFoamAmt;
  uniform float uFade;
  uniform float uScale;

  float surfaceHeight(vec2 p) {
    float r = length(p) / uScale;
    float w = sin(p.x / uScale * 150.0 + uTime * 3.3) * 0.5 + sin(p.y / uScale * 130.0 - uTime * 2.9) * 0.5;
    float ring = sin(r * 300.0 - uTime * 11.0) * exp(-r * 25.0);
    return uFill + dot(uTilt, p) + (w * uWave + ring * uRipple) * uScale;
  }
  void main() {
    float h = surfaceHeight(vLocal.xz);
    if (vLocal.y > h) discard;
    vec3 V = normalize(cameraPosition - vWorld);
    float depthBelow = h - vLocal.y;
    float column = max(uFill - uBottom, 0.004);
    float t = clamp(depthBelow / column, 0.0, 1.0);
    vec3 col;
    float alpha;
    if (gl_FrontFacing) {
      vec3 N = normalize(vNormal);
      float ndv = abs(dot(N, V));
      // light passing through: thin edges glow brighter, the thick core stays saturated
      vec3 base = mix(uTop, uDeep, smoothstep(0.0, 1.0, pow(t, 0.7)));
      col = base * (0.5 + 1.1 * pow(1.0 - ndv, 1.5));
      float ang = atan(vLocal.z, vLocal.x);
      vec2 swirl = vec2(ang * 1.3 + vLocal.y * 22.0 - uTime * 0.18, vLocal.y * 26.0 + ang * 0.6 - uTime * 0.35);
      float flow = vnoise(swirl) * 0.65 + vnoise(swirl * 2.3 + 7.0) * 0.35;
      col *= 0.82 + 0.38 * flow;
      // the spotlight wakes the drink up: brighter, with an ember near the surface
      col *= 1.0 + uGlow * 0.32;
      col += uTop * uGlow * (1.0 - t) * flow * 0.26;
      // bright meniscus where the drink meets the air
      col += mix(uTop, vec3(1.0), 0.55) * exp(-depthBelow * 1100.0) * (0.9 + uGlow);
      // a refracted streak of the spotlight on the far side of the drink
      float streak = exp(-pow((dot(normalize(vLocal.xz + 1e-4), normalize(uCamLocal.xz)) + 0.2) * 3.0, 2.0));
      col += uTop * streak * 0.22 * (0.4 + uGlow);
      // gold leaf drifting in the drink
      vec3 cell = floor(vec3(vLocal.x, vLocal.y - uTime * 0.004, vLocal.z) * 420.0);
      float hsh = hash13(cell);
      float sparkle = step(0.9965, hsh) * (0.5 + 0.5 * sin(uTime * 5.0 + hsh * 60.0));
      col += vec3(1.6, 1.15, 0.5) * sparkle * uFlakes * (0.6 + uGlow);
      vec3 L = normalize(uSpot - vWorld);
      col += vec3(1.0, 0.9, 0.75) * pow(max(dot(N, normalize(L + V)), 0.0), 60.0) * 0.5;
      alpha = 0.88;
    } else {
      // Back faces show where the cut plane would be: shade them as the liquid surface.
      vec3 dir = normalize(vLocal - uCamLocal);
      float travel = (uFill - uCamLocal.y) / min(dir.y, -0.001);
      vec2 sp = (uCamLocal + dir * travel).xz;
      float e = 0.0015;
      vec2 grad = vec2(surfaceHeight(sp + vec2(e, 0.0)) - surfaceHeight(sp - vec2(e, 0.0)),
                       surfaceHeight(sp + vec2(0.0, e)) - surfaceHeight(sp - vec2(0.0, e))) / (2.0 * e);
      vec3 n = normalize(vec3(-grad.x, 1.0, -grad.y));
      float ndv = max(dot(n, V), 0.0);
      vec3 R = reflect(-V, n);
      vec3 env = texture2D(uEnv, equirectUv(R)).rgb;
      float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
      vec3 surf = mix(uTop, uDeep, 0.25);
      col = surf * (0.42 + uGlow * 0.75) + env * fres * 1.4;
      vec3 L = normalize(uSpot - vWorld);
      col += vec3(1.0, 0.92, 0.8) * pow(max(dot(n, normalize(L + V)), 0.0), 260.0) * 6.0;
      float rr = length(sp) / max(uSurfR, 0.001);
      float ring = smoothstep(0.8, 0.97, rr);
      col += mix(uTop, vec3(1.0), 0.6) * ring * 0.6;
      float foam = smoothstep(0.7, 0.98, rr) * uFoamAmt;
      foam *= 0.6 + 0.4 * vnoise(sp * 420.0 + uTime * 0.3);
      col = mix(col, uFoam * (0.7 + uGlow * 0.6), foam);
      alpha = 0.95;
    }
    gl_FragColor = vec4(col * uFade, alpha * uFade);
  }
`;

const bubbleVertex = /* glsl */ `
  attribute vec4 aSeed;
  uniform float uTime;
  uniform float uFill;
  uniform float uBottom;
  uniform vec2 uRadius;
  uniform float uSpeed;
  uniform float uPixel;
  varying float vAlive;
  void main() {
    float life = fract(aSeed.w + uTime * uSpeed * (0.6 + aSeed.z * 0.8));
    float y = mix(uBottom, uFill, life);
    float k = clamp((y - uBottom) / max(uFill - uBottom, 0.001), 0.0, 1.0);
    float r = aSeed.y * mix(uRadius.x, uRadius.y, k) * 0.8;
    float a = aSeed.x * 6.2831 + sin(uTime * 2.0 + aSeed.w * 30.0) * 0.12;
    vec3 p = vec3(cos(a) * r, y, sin(a) * r);
    vAlive = smoothstep(0.0, 0.08, life) * (1.0 - smoothstep(0.9, 1.0, life));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = uPixel * (0.6 + aSeed.z) / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const bubbleFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uFade;
  varying float vAlive;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float ring = smoothstep(0.5, 0.35, d) * (0.35 + smoothstep(0.2, 0.42, d));
    gl_FragColor = vec4(uColor * ring * vAlive * uFade, 0.0);
  }
`;

const decalVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const decalFragment = /* glsl */ `
  ${noiseGLSL}
  uniform vec3 uColor;
  uniform float uGlow;
  uniform float uFade;
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    float shadow = smoothstep(0.62, 0.0, r) * 0.6;
    vec2 q = (p - vec2(0.0, 0.32)) * vec2(1.0, 1.35);
    float caustic = smoothstep(0.75, 0.05, length(q));
    caustic *= 0.55 + 0.45 * vnoise(q * 5.0 + vec2(uTime * 0.6, -uTime * 0.4));
    caustic += smoothstep(0.32, 0.0, length(q - vec2(0.0, 0.12))) * 0.6;
    vec3 col = uColor * caustic * (0.1 + uGlow * 1.15);
    gl_FragColor = vec4(col * uFade, shadow * uFade);
  }
`;

const premultiplied = {
  transparent: true,
  depthWrite: false,
  blending: THREE.CustomBlending,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneMinusSrcAlphaFactor,
  blendSrcAlpha: THREE.OneFactor,
  blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
} as const;

const linearColor = (hex: string) =>
  new THREE.Color(...hexToRgb01(hex)).convertSRGBToLinear();

export interface AudioBands {
  bass: number;
  mid: number;
  high: number;
  level: number;
}

class Glass {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly recipe: DrinkRecipe;
  readonly assets: ShapeAssets;
  private glassMaterials: THREE.ShaderMaterial[] = [];
  private liquidMaterial: THREE.ShaderMaterial;
  private bubbleMaterial: THREE.ShaderMaterial;
  private decalMaterial: THREE.ShaderMaterial;
  private bubbles: THREE.Points;
  private coaster: THREE.Mesh;
  private decal: THREE.Mesh;
  s = 0;
  sVel = 0;
  target = 0;
  wrapTo: number | null = null;
  fade = 0;
  fadeTarget = 1;
  removing = false;
  drop = 0;
  lift = 0;
  glow = 0;
  hover = 0;
  level: number;
  tilt = new THREE.Vector2();
  tiltVel = new THREE.Vector2();
  private prevPos = new THREE.Vector3();
  private prevVel = new THREE.Vector3();
  private hasPrev = false;
  theta = 0;
  presence = 1;
  dragTheta: number | null = null;

  constructor(
    recipe: DrinkRecipe,
    env: THREE.Texture,
    coasterMaterial: THREE.Material,
    coasterGeometry: THREE.BufferGeometry,
    decalGeometry: THREE.BufferGeometry,
    spot: THREE.Vector3,
  ) {
    this.recipe = recipe;
    this.assets = shapeAssets(recipe.shape);
    this.level = recipe.level;
    const top = linearColor(recipe.palette.top);
    const deep = linearColor(recipe.palette.deep);
    const foam = linearColor(recipe.palette.foam);
    const fillY = this.fillHeight(recipe.level);

    for (const back of [1, 0]) {
      const material = new THREE.ShaderMaterial({
        vertexShader: glassVertex,
        fragmentShader: glassFragment,
        uniforms: {
          uEnv: { value: env },
          uSpot: { value: spot },
          uLiquid: { value: top },
          uFill: { value: fillY },
          uRim: { value: this.assets.rim },
          uFade: { value: 0 },
          uGlow: { value: 0 },
          uHover: { value: 0 },
          uBack: { value: back },
        },
        side: back ? THREE.BackSide : THREE.FrontSide,
        ...premultiplied,
      });
      const mesh = new THREE.Mesh(this.assets.glass, material);
      mesh.renderOrder = back ? 6 : 9;
      this.glassMaterials.push(material);
      this.body.add(mesh);
    }

    this.liquidMaterial = new THREE.ShaderMaterial({
      vertexShader: liquidVertex,
      fragmentShader: liquidFragment,
      uniforms: {
        uEnv: { value: env },
        uTop: { value: top },
        uDeep: { value: deep },
        uFoam: { value: foam },
        uSpot: { value: spot },
        uCamLocal: { value: new THREE.Vector3() },
        uTilt: { value: new THREE.Vector2() },
        uFill: { value: fillY },
        uBottom: { value: this.assets.bowlBottom },
        uSurfR: { value: this.assets.radiusAt(fillY) },
        uTime: { value: 0 },
        uWave: { value: 0.0003 },
        uRipple: { value: 0 },
        uGlow: { value: 0 },
        uFlakes: { value: recipe.flakes ? 1 : 0 },
        uFoamAmt: { value: recipe.sparkling ? 0.85 : 0.35 },
        uFade: { value: 0 },
        uScale: { value: 1 },
      },
      side: THREE.DoubleSide,
      ...premultiplied,
      depthWrite: true,
    });
    const liquid = new THREE.Mesh(this.assets.liquid, this.liquidMaterial);
    liquid.renderOrder = 7;
    liquid.visible = recipe.level > 0.06;
    this.body.add(liquid);

    const rand = mulberry32(hashString(recipe.id));
    const count = recipe.sparkling ? 46 : 12;
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < seeds.length; i++) seeds[i] = rand();
    const bubbleGeometry = new THREE.BufferGeometry();
    bubbleGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(count * 3), 3),
    );
    bubbleGeometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 4));
    this.bubbleMaterial = new THREE.ShaderMaterial({
      vertexShader: bubbleVertex,
      fragmentShader: bubbleFragment,
      uniforms: {
        uTime: { value: 0 },
        uFill: { value: fillY },
        uBottom: { value: this.assets.bowlBottom + 0.004 },
        uRadius: {
          value: new THREE.Vector2(
            this.assets.radiusAt(this.assets.bowlBottom + 0.01),
            this.assets.radiusAt(fillY),
          ),
        },
        uSpeed: { value: recipe.sparkling ? 0.32 : 0.12 },
        uPixel: { value: 9 },
        uColor: {
          value: new THREE.Color()
            .copy(top)
            .lerp(new THREE.Color(1, 1, 1), 0.6),
        },
        uFade: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.bubbles = new THREE.Points(bubbleGeometry, this.bubbleMaterial);
    this.bubbles.renderOrder = 8;
    this.bubbles.frustumCulled = false;
    this.bubbles.visible = recipe.level > 0.06;
    this.body.add(this.bubbles);

    this.coaster = new THREE.Mesh(coasterGeometry, coasterMaterial);
    this.coaster.position.y = 0.002;
    this.root.add(this.coaster);

    this.decalMaterial = new THREE.ShaderMaterial({
      vertexShader: decalVertex,
      fragmentShader: decalFragment,
      uniforms: {
        uColor: { value: top },
        uGlow: { value: 0 },
        uFade: { value: 0 },
        uTime: { value: 0 },
      },
      ...premultiplied,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    this.decal = new THREE.Mesh(decalGeometry, this.decalMaterial);
    this.decal.position.y = 0.0012;
    this.decal.renderOrder = 3;
    this.root.add(this.decal);

    this.body.position.y = 0.0045;
    this.root.add(this.body);
  }

  fillHeight(level: number) {
    const { bowlBottom, rim } = this.assets;
    return bowlBottom + (rim - bowlBottom - 0.004) * level;
  }

  /** Physics and shading update. */
  update(
    dt: number,
    time: number,
    audio: AudioBands,
    camera: THREE.Camera,
    isCurrent: boolean,
    progress: number,
  ) {
    const near = Math.exp(-this.s * this.s * 4.5);
    this.presence = near;
    const angle = this.dragTheta ?? this.s * CAROUSEL.step;
    this.theta = angle;
    const angular =
      1 - smoothstep(CAROUSEL.fadeStart, CAROUSEL.fadeEnd, Math.abs(angle));
    this.fade = damp(
      this.fade,
      this.removing ? 0 : this.fadeTarget,
      this.removing ? 7 : 4,
      dt,
    );
    const visible = this.fade * angular;
    this.root.visible = visible > 0.003;

    const r = BAR.glassRing;
    this.drop = damp(this.drop, 0, 5.5, dt);
    this.lift = damp(
      this.lift,
      this.dragTheta !== null ? 0.07 : this.hover * 0.025,
      9,
      dt,
    );
    this.root.position.set(
      Math.sin(angle) * r,
      BAR.top + this.drop + this.lift,
      Math.cos(angle) * r,
    );
    const scale =
      GLASS_SCALE *
      (1 + 0.32 * near) *
      (1 - Math.min(Math.abs(this.s), 6) * 0.012);
    this.body.scale.setScalar(scale);
    this.coaster.scale.setScalar(scale * 0.95);
    this.decal.scale.setScalar(scale);
    // A gentle lean while the glass is being slid along the counter.
    this.body.rotation.z = THREE.MathUtils.clamp(
      -this.sVel * 0.012,
      -0.06,
      0.06,
    );

    // Liquid inertia: a damped spring driven by the glass's own acceleration.
    const pos = this.root.position;
    if (this.hasPrev && dt > 0) {
      const vel = pos.clone().sub(this.prevPos).divideScalar(dt);
      const acc = vel.clone().sub(this.prevVel).divideScalar(dt);
      acc.clampLength(0, 30);
      const K = 120,
        C = 2.6,
        G = 0.11;
      this.tiltVel.x +=
        (-K * this.tilt.x - C * this.tiltVel.x - acc.x * G * K * 0.12) * dt;
      this.tiltVel.y +=
        (-K * this.tilt.y - C * this.tiltVel.y - acc.z * G * K * 0.12) * dt;
      this.tilt.addScaledVector(this.tiltVel, dt);
      this.tilt.clampLength(0, 0.42);
      this.prevVel.copy(vel);
    }
    this.prevPos.copy(pos);
    this.hasPrev = true;
    // idle slosh so the drink never looks frozen
    const idle = 0.012 + (isCurrent ? audio.bass * 0.05 : 0);
    const tilt = this.tilt
      .clone()
      .add(
        new THREE.Vector2(
          Math.sin(time * 1.3 + this.s) * idle,
          Math.cos(time * 1.1 + this.s * 2) * idle,
        ),
      );

    const targetGlow =
      0.12 + near * (isCurrent ? 0.88 : 0.45) + this.hover * 0.45;
    this.glow = damp(this.glow, targetGlow, 4, dt);
    const targetLevel = isCurrent
      ? this.recipe.level * (1 - 0.38 * clamp01(progress))
      : this.recipe.level;
    this.level = damp(this.level, targetLevel, 1.5, dt);
    const fillY = this.fillHeight(this.level);

    const local = this.body.worldToLocal(camera.position.clone());
    const lu = this.liquidMaterial.uniforms;
    lu.uCamLocal.value.copy(local);
    lu.uTilt.value.copy(tilt);
    lu.uFill.value = fillY;
    lu.uSurfR.value = this.assets.radiusAt(fillY);
    lu.uTime.value = time;
    lu.uWave.value = 0.00025 + (isCurrent ? audio.mid * 0.0012 : 0);
    lu.uRipple.value = isCurrent ? audio.bass * 0.0022 : 0;
    lu.uGlow.value = this.glow * (isCurrent ? 0.72 + audio.level * 0.6 : 0.75);
    lu.uFade.value = visible;
    for (const material of this.glassMaterials) {
      material.uniforms.uFade.value = visible;
      material.uniforms.uGlow.value = this.glow;
      material.uniforms.uHover.value = this.hover;
      material.uniforms.uFill.value = fillY;
    }
    const bu = this.bubbleMaterial.uniforms;
    bu.uTime.value = time;
    bu.uFill.value = fillY - 0.002;
    bu.uRadius.value.y = this.assets.radiusAt(fillY);
    bu.uSpeed.value =
      (this.recipe.sparkling ? 0.3 : 0.1) *
      (1 + (isCurrent ? audio.high * 1.5 : 0));
    bu.uFade.value = visible * (0.35 + this.glow * 0.65);
    bu.uPixel.value = 6.5 * scale * (window.innerHeight / 900);
    this.decalMaterial.uniforms.uGlow.value =
      this.glow * (isCurrent ? 1 + audio.level * 0.8 : 0.6);
    this.decalMaterial.uniforms.uFade.value = visible;
    this.decalMaterial.uniforms.uTime.value = time;
    (this.coaster.material as THREE.Material).opacity = 1;
    this.coaster.visible = visible > 0.02;
  }

  dispose() {
    this.glassMaterials.forEach((m) => m.dispose());
    this.liquidMaterial.dispose();
    this.bubbleMaterial.dispose();
    this.decalMaterial.dispose();
    this.bubbles.geometry.dispose();
  }
}

export interface GlassScreenInfo {
  id: string;
  x: number;
  y: number;
  top: number;
  bottom: number;
  width: number;
  visible: boolean;
  offset: number;
  depth: number;
}

/** Glasses travelling on the counter ring. Offsets are relative to the current track. */
export class GlassCarousel {
  readonly group = new THREE.Group();
  private glasses = new Map<string, Glass>();
  private order: string[] = [];
  currentId?: string;
  private coasterGeometry = new THREE.CylinderGeometry(0.06, 0.06, 0.004, 48);
  private decalGeometry = new THREE.PlaneGeometry(0.34, 0.34).rotateX(
    -Math.PI / 2,
  );
  hoveredId?: string;
  draggingId?: string;
  private dropMarker: THREE.Mesh;

  constructor(
    private env: THREE.Texture,
    private coasterMaterial: THREE.Material,
    private spot: THREE.Vector3,
  ) {
    this.group.name = "glasses";
    const ring = new THREE.RingGeometry(0.075, 0.085, 48).rotateX(-Math.PI / 2);
    this.dropMarker = new THREE.Mesh(
      ring,
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(3, 2, 0.9),
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    this.dropMarker.renderOrder = 4;
    this.group.add(this.dropMarker);
  }

  /** Lay the queue out so the current track sits at the front of the counter. */
  setQueue(
    recipes: DrinkRecipe[],
    currentId: string | undefined,
    direction: "next" | "prev" | "pick",
  ) {
    const n = recipes.length;
    const ids = recipes.map((r) => r.id);
    const byId = new Map(recipes.map((r) => [r.id, r]));
    const currentIndex = Math.max(0, currentId ? ids.indexOf(currentId) : 0);
    const left = Math.min(CAROUSEL.maxSide, Math.floor((n - 1) / 2));
    const right = Math.min(CAROUSEL.maxSide, Math.ceil((n - 1) / 2));
    const targets = new Map<string, number>();
    ids.forEach((id, i) => {
      let o = i - currentIndex;
      if (o > right) o -= n;
      if (o < -left) o += n;
      if (
        o >= -left - 1 &&
        o <= right + 1 &&
        Math.abs(o) <= CAROUSEL.maxSide + 1
      )
        targets.set(id, o);
    });
    const sameOrder = ids.join("|") === this.order.join("|");
    const prevCurrentIndex = this.currentId
      ? this.order.indexOf(this.currentId)
      : -1;
    let shift = 0;
    if (sameOrder && prevCurrentIndex >= 0) {
      shift = currentIndex - prevCurrentIndex;
      if (direction === "next" && shift < 0) shift += n;
      if (direction === "prev" && shift > 0) shift -= n;
    }
    const entering = shift > 0 ? 1 : shift < 0 ? -1 : 0;

    for (const [id, glass] of this.glasses) {
      const target = targets.get(id);
      if (
        target === undefined ||
        !byId.has(id) ||
        byId.get(id)!.shape !== glass.recipe.shape ||
        byId.get(id)!.palette.key !== glass.recipe.palette.key
      ) {
        glass.removing = true;
        glass.target = sameOrder ? glass.target - shift : glass.target;
        continue;
      }
      glass.removing = false;
      const continuous = sameOrder ? glass.target - shift : target;
      if (continuous !== target) {
        // The glass wraps around the ring: slide off one end, reappear at the other.
        glass.wrapTo = target;
        glass.target = continuous;
        glass.fadeTarget = 0;
      } else {
        glass.target = target;
        glass.wrapTo = null;
        glass.fadeTarget = 1;
      }
    }
    for (const [id, target] of targets) {
      if (this.glasses.has(id) && !this.glasses.get(id)!.removing) continue;
      const old = this.glasses.get(id);
      if (old) {
        this.group.remove(old.root);
        old.dispose();
      }
      const glass = new Glass(
        byId.get(id)!,
        this.env,
        this.coasterMaterial,
        this.coasterGeometry,
        this.decalGeometry,
        this.spot,
      );
      glass.target = target;
      glass.s = sameOrder && entering ? target + entering : target;
      if (!this.order.length || !sameOrder)
        glass.drop = this.order.length ? 0.18 : 0.12;
      this.glasses.set(id, glass);
      this.group.add(glass.root);
    }
    this.order = ids;
    this.currentId = currentId ?? ids[0];
  }

  update(
    dt: number,
    time: number,
    audio: AudioBands,
    camera: THREE.Camera,
    progress: number,
  ) {
    const K = 58,
      C = 13.5;
    for (const [id, glass] of this.glasses) {
      glass.hover = damp(
        glass.hover,
        id === this.hoveredId && !this.draggingId ? 1 : 0,
        10,
        dt,
      );
      if (id !== this.draggingId) glass.dragTheta = null;
      glass.sVel += (K * (glass.target - glass.s) - C * glass.sVel) * dt;
      glass.s += glass.sVel * dt;
      if (glass.wrapTo !== null && glass.fade < 0.04) {
        glass.s += glass.wrapTo - glass.target;
        glass.target = glass.wrapTo;
        glass.wrapTo = null;
        glass.fadeTarget = 1;
      }
      glass.update(dt, time, audio, camera, id === this.currentId, progress);
      if (glass.removing && glass.fade < 0.01) {
        this.group.remove(glass.root);
        glass.dispose();
        this.glasses.delete(id);
      }
    }
    const marker = this.dropMarker.material as THREE.MeshBasicMaterial;
    marker.opacity = damp(marker.opacity, this.draggingId ? 0.85 : 0, 10, dt);
  }

  /** Begin dragging a glass; returns false if it is not on the counter. */
  beginDrag(id: string) {
    if (!this.glasses.has(id)) return false;
    this.draggingId = id;
    return true;
  }

  /** Move the dragged glass to `theta`; returns the queue offset it would drop on. */
  dragTo(theta: number) {
    const glass = this.draggingId
      ? this.glasses.get(this.draggingId)
      : undefined;
    if (!glass) return undefined;
    const limit = CAROUSEL.step * CAROUSEL.maxSide;
    const clamped = THREE.MathUtils.clamp(theta, -limit, limit);
    glass.dragTheta = clamped;
    const slot = Math.round(clamped / CAROUSEL.step);
    const r = BAR.glassRing;
    const t = slot * CAROUSEL.step;
    this.dropMarker.position.set(
      Math.sin(t) * r,
      BAR.top + 0.003,
      Math.cos(t) * r,
    );
    this.dropMarker.scale.setScalar(GLASS_SCALE * 1.1);
    let targetId: string | undefined;
    for (const [id, other] of this.glasses)
      if (!other.removing && other.target === slot) targetId = id;
    return { slot, targetId };
  }

  endDrag() {
    const glass = this.draggingId
      ? this.glasses.get(this.draggingId)
      : undefined;
    if (glass && glass.dragTheta !== null) {
      glass.s = glass.dragTheta / CAROUSEL.step;
      glass.sVel = 0;
    }
    this.draggingId = undefined;
  }

  screenInfo(
    camera: THREE.Camera,
    width: number,
    height: number,
  ): GlassScreenInfo[] {
    const out: GlassScreenInfo[] = [];
    const v = new THREE.Vector3();
    for (const [id, glass] of this.glasses) {
      if (glass.removing) continue;
      const scale = glass.body.scale.x;
      const base = glass.root.position;
      v.copy(base).project(camera);
      const bx = (v.x * 0.5 + 0.5) * width,
        by = (-v.y * 0.5 + 0.5) * height;
      const depth = v.z;
      v.copy(base)
        .add(new THREE.Vector3(0, glass.assets.height * scale, 0))
        .project(camera);
      const ty = (-v.y * 0.5 + 0.5) * height;
      v.copy(base)
        .add(new THREE.Vector3(0.06 * scale, 0, 0))
        .project(camera);
      const wx = Math.abs((v.x * 0.5 + 0.5) * width - bx);
      const angular =
        1 -
        smoothstep(CAROUSEL.fadeStart, CAROUSEL.fadeEnd, Math.abs(glass.theta));
      out.push({
        id,
        x: bx,
        y: (by + ty) / 2,
        top: ty,
        bottom: by,
        width: Math.max(28, wx * 2.2),
        visible: glass.fade * angular > 0.35,
        offset: glass.target,
        depth,
      });
    }
    return out;
  }

  dispose() {
    for (const glass of this.glasses.values()) glass.dispose();
    this.glasses.clear();
    this.coasterGeometry.dispose();
    this.decalGeometry.dispose();
  }
}
