import * as THREE from "three";
import { BAR, CABINET, CHARACTER } from "./layout";
import { revolve, smoothProfile, type ProfilePoint } from "./geometry";
import {
  makeEmblemTexture,
  makeLabelAtlas,
  makeMirrorTexture,
} from "./textures";
import { mulberry32 } from "./util";

interface BottleShape {
  name: string;
  profile: ProfilePoint[];
  height: number;
  label: [number, number];
  foil: number;
}

// Silhouettes are generic bar stock: wine, rounded whisky, tall gin, slim liqueur,
// squat bourbon, champagne and a crystal decanter.
const SHAPES: BottleShape[] = [
  {
    name: "wine",
    profile: [
      [0.001, 0],
      [0.036, 0.002],
      [0.037, 0.19],
      [0.03, 0.225],
      [0.014, 0.25],
      [0.013, 0.3],
      [0.0155, 0.305],
      [0.001, 0.306],
    ],
    height: 0.306,
    label: [0.06, 0.15],
    foil: 0.255,
  },
  {
    name: "whisky",
    profile: [
      [0.001, 0],
      [0.045, 0.003],
      [0.047, 0.16],
      [0.04, 0.19],
      [0.016, 0.21],
      [0.015, 0.25],
      [0.019, 0.255],
      [0.019, 0.27],
      [0.001, 0.272],
    ],
    height: 0.272,
    label: [0.05, 0.13],
    foil: 0.245,
  },
  {
    name: "gin",
    profile: [
      [0.001, 0],
      [0.041, 0.002],
      [0.042, 0.215],
      [0.033, 0.235],
      [0.016, 0.245],
      [0.015, 0.29],
      [0.018, 0.295],
      [0.001, 0.296],
    ],
    height: 0.296,
    label: [0.07, 0.17],
    foil: 0.262,
  },
  {
    name: "liqueur",
    profile: [
      [0.001, 0],
      [0.03, 0.002],
      [0.031, 0.25],
      [0.022, 0.27],
      [0.011, 0.285],
      [0.01, 0.34],
      [0.013, 0.345],
      [0.001, 0.346],
    ],
    height: 0.346,
    label: [0.09, 0.19],
    foil: 0.3,
  },
  {
    name: "bourbon",
    profile: [
      [0.001, 0],
      [0.052, 0.003],
      [0.053, 0.12],
      [0.044, 0.15],
      [0.018, 0.17],
      [0.017, 0.205],
      [0.022, 0.21],
      [0.022, 0.23],
      [0.001, 0.232],
    ],
    height: 0.232,
    label: [0.035, 0.105],
    foil: 0.2,
  },
  {
    name: "champagne",
    profile: [
      [0.001, 0],
      [0.044, 0.004],
      [0.045, 0.17],
      [0.038, 0.215],
      [0.02, 0.26],
      [0.016, 0.3],
      [0.018, 0.32],
      [0.001, 0.322],
    ],
    height: 0.322,
    label: [0.05, 0.13],
    foil: 0.25,
  },
  {
    name: "decanter",
    profile: [
      [0.001, 0],
      [0.04, 0.004],
      [0.062, 0.05],
      [0.064, 0.09],
      [0.05, 0.13],
      [0.02, 0.15],
      [0.018, 0.175],
      [0.03, 0.2],
      [0.02, 0.23],
      [0.001, 0.235],
    ],
    height: 0.235,
    label: [0.0, 0.0],
    foil: 0.18,
  },
];

const GLASS_TINTS = [
  "#1f3b26",
  "#5a2a0d",
  "#263329",
  "#3a1016",
  "#151b2e",
  "#5b4a2e",
  "#6f6a5e",
  "#0d1a33",
  "#3b2a10",
];
const LIQUIDS = [
  "#b0601c",
  "#d38a2a",
  "#7b1220",
  "#d7c27a",
  "#8a2a12",
  "#c8b48a",
  "#4a6e2a",
  "#e0a640",
  "#6b1d4a",
];
const FOILS = ["#c9a04f", "#141010", "#7a1622", "#d8c49a", "#2b2b35"];

const bottleVertex = /* glsl */ `
  attribute vec3 aTint;
  attribute vec4 aLiquid;
  attribute vec3 aMeta;
  uniform float uHeight;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying vec3 vTint;
  varying vec4 vLiquid;
  varying vec3 vMeta;
  varying vec2 vUv;
  varying float vLocalY;
  void main() {
    vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
    vTint = aTint;
    vLiquid = aLiquid;
    vMeta = aMeta;
    vUv = uv;
    vLocalY = position.y / uHeight;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const bottleFragment = /* glsl */ `
  #include <common>
  uniform sampler2D uEnv;
  uniform sampler2D uLabels;
  uniform vec2 uLabelBand;
  uniform float uFoil;
  uniform float uHeight;
  uniform float uTime;
  uniform float uGlow;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying vec3 vTint;
  varying vec4 vLiquid;
  varying vec3 vMeta;
  varying vec2 vUv;
  varying float vLocalY;
  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorld);
    float facing = abs(dot(N, V));
    float fres = pow(1.0 - facing, 3.0);
    float y = vLocalY * uHeight;
    float inLiquid = 1.0 - smoothstep(vLiquid.a - 0.01, vLiquid.a + 0.004, vLocalY);
    // light from the mirror and LED strips passes through glass and spirit
    float through = 0.25 + 0.75 * pow(facing, 1.4);
    vec3 liquid = vLiquid.rgb * 1.35;
    vec3 col = mix(vTint * 0.5, liquid, inLiquid) * through * (0.75 + uGlow * vMeta.z);
    // a hot line where the spirit meets the air
    col += vLiquid.rgb * 2.6 * exp(-pow((vLocalY - vLiquid.a) * 90.0, 2.0)) * facing;
    // warm strip light from the shelf above grazes the shoulders
    col += vec3(1.0, 0.62, 0.25) * smoothstep(0.5, 1.0, vLocalY) * pow(facing, 2.0) * 0.18;
    // shoulder and neck catch the strip light above
    col += vec3(1.0, 0.72, 0.38) * smoothstep(0.55, 0.95, vLocalY) * fres * 1.4;
    vec3 R = reflect(-V, N);
    vec3 env = texture2D(uEnv, equirectUv(R)).rgb;
    col += env * (0.05 + fres * 0.9);
    // foil / wax capsule
    if (y > uFoil) {
      vec3 foil = vMeta.y > 0.5 ? vec3(0.78, 0.58, 0.28) : vTint * 1.2 + 0.02;
      col = foil * (0.2 + 0.8 * env) + fres * 0.3;
    }
    // paper label at the front
    if (uLabelBand.y > 0.0 && y > uLabelBand.x && y < uLabelBand.y) {
      float u = fract(vUv.x + 0.5);
      float cell = vMeta.x;
      vec2 cellUv = vec2((mod(cell, 4.0) + u) / 4.0, 1.0 - (floor(cell / 4.0) + 1.0 - (y - uLabelBand.x) / (uLabelBand.y - uLabelBand.x)) / 4.0);
      vec4 paper = texture2D(uLabels, cellUv);
      float lit = 0.18 + 0.32 * facing;
      col = mix(col, paper.rgb * paper.rgb * lit * vec3(1.15, 0.95, 0.75) + env * 0.04, paper.a);
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;

interface BottlePlacement {
  shape: number;
  pos: THREE.Vector3;
  rot: number;
  scale: number;
}

/** Bottles drawn at the same world scale as the glassware and the bartender. */
const BOTTLE_SCALE = 1.45;

function buildBottles(
  placements: BottlePlacement[],
  envTexture: THREE.Texture,
  labelAtlas: THREE.Texture,
  rand: () => number,
  group: THREE.Group,
  disposables: { dispose(): void }[],
) {
  const materials: THREE.ShaderMaterial[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  SHAPES.forEach((shape, index) => {
    const items = placements.filter((p) => p.shape === index);
    if (!items.length) return;
    const geometry = new THREE.LatheGeometry(
      smoothProfile(shape.profile, 3).map(([r, y]) => new THREE.Vector2(r, y)),
      16,
    );
    const tint = new Float32Array(items.length * 3);
    const liquid = new Float32Array(items.length * 4);
    const meta = new Float32Array(items.length * 3);
    const color = new THREE.Color();
    items.forEach((item, i) => {
      color
        .set(GLASS_TINTS[Math.floor(rand() * GLASS_TINTS.length)])
        .convertSRGBToLinear();
      tint.set([color.r, color.g, color.b], i * 3);
      color
        .set(LIQUIDS[Math.floor(rand() * LIQUIDS.length)])
        .convertSRGBToLinear();
      liquid.set(
        [
          color.r,
          color.g,
          color.b,
          shape.name === "decanter" ? 0.45 : 0.35 + rand() * 0.45,
        ],
        i * 4,
      );
      meta.set([Math.floor(rand() * 16), rand() > 0.55 ? 1 : 0, rand()], i * 3);
    });
    geometry.setAttribute("aTint", new THREE.InstancedBufferAttribute(tint, 3));
    geometry.setAttribute(
      "aLiquid",
      new THREE.InstancedBufferAttribute(liquid, 4),
    );
    geometry.setAttribute("aMeta", new THREE.InstancedBufferAttribute(meta, 3));
    const material = new THREE.ShaderMaterial({
      vertexShader: bottleVertex,
      fragmentShader: bottleFragment,
      uniforms: {
        uEnv: { value: envTexture },
        uLabels: { value: labelAtlas },
        uLabelBand: { value: new THREE.Vector2(...shape.label) },
        uFoil: { value: shape.foil },
        uHeight: { value: shape.height },
        uTime: { value: 0 },
        uGlow: { value: 0.35 },
      },
    });
    materials.push(material);
    const mesh = new THREE.InstancedMesh(geometry, material, items.length);
    items.forEach((item, i) => {
      q.setFromAxisAngle(up, item.rot);
      m.compose(
        item.pos,
        q,
        new THREE.Vector3(item.scale, item.scale, item.scale),
      );
      mesh.setMatrixAt(i, m);
    });
    mesh.frustumCulled = false;
    group.add(mesh);
    disposables.push(geometry, material);
  });
  return materials;
}

export function createCabinet(
  envTexture: THREE.Texture,
  materials: {
    brass: THREE.MeshStandardMaterial;
    darkBrass: THREE.MeshStandardMaterial;
  },
) {
  const group = new THREE.Group();
  group.name = "bottle-wall";
  const { radius: R, span, bays, floor, shelves, crown, depth } = CABINET;
  const start = Math.PI - span / 2;
  const seg = 160;
  const disposables: { dispose(): void }[] = [];

  // Antique mirror washed by warm uplights above each shelf.
  const mirrorTexture = makeMirrorTexture();
  mirrorTexture.repeat.set(1 / 0.8, 1 / 0.8);
  const mirror = new THREE.MeshStandardMaterial({
    map: mirrorTexture,
    color: 0x9a7a52,
    metalness: 0.92,
    roughness: 0.22,
    envMapIntensity: 0.55,
  });
  mirror.onBeforeCompile = (shader) => {
    shader.uniforms.uShelves = { value: new THREE.Vector4(...shelves) };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vW;")
      .replace(
        "#include <worldpos_vertex>",
        "#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vW;\nuniform vec4 uShelves;",
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        float wash = 0.0;
        for (int i = 0; i < 4; i++) {
          float h = uShelves[i];
          float above = vW.y - h;
          wash += step(0.0, above) * exp(-above * 5.0) * (0.75 + 0.25 * sin(atan(vW.x, -vW.z) * 40.0));
        }
        float az = atan(vW.x, -vW.z);
        float side = smoothstep(1.35, 0.2, abs(az));
        float halo = exp(-(az * az) / 0.09 - pow(vW.y - 2.55, 2.0) / 0.6);
        totalEmissiveRadiance += diffuseColor.rgb * vec3(2.6, 1.45, 0.55) * wash * (0.6 + 0.4 * side);
        totalEmissiveRadiance += vec3(1.0, 0.56, 0.2) * halo * 0.55;`,
      );
  };
  group.add(
    new THREE.Mesh(
      revolve(
        [
          [R, crown],
          [R, floor],
        ],
        start,
        span,
        seg,
        R,
      ),
      mirror,
    ),
  );
  disposables.push(mirrorTexture, mirror);

  // Back counter below the shelves (marble top, dark panels).
  const darkWood = new THREE.MeshStandardMaterial({
    color: 0x1d0e09,
    roughness: 0.55,
    metalness: 0.05,
  });
  const marble = new THREE.MeshPhysicalMaterial({
    color: 0x0c0a0a,
    roughness: 0.2,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
  });
  const counterR = R - 0.55;
  group.add(
    new THREE.Mesh(
      revolve(
        [
          [counterR, 0.94],
          [counterR, 0],
        ],
        start,
        span,
        seg,
      ),
      darkWood,
    ),
  );
  group.add(
    new THREE.Mesh(
      revolve(
        [
          [R, 0.98],
          [counterR - 0.03, 0.98],
          [counterR - 0.03, 0.94],
        ],
        start,
        span,
        seg,
      ),
      marble,
    ),
  );
  disposables.push(darkWood, marble);

  // Shelves: dark wood with a brass nosing and an LED line underneath.
  const shelfWood = new THREE.MeshStandardMaterial({
    color: 0x2a140b,
    roughness: 0.5,
  });
  // LED lines dim where they pass behind Lappland: at full strength their bloom
  // spilled across her hair as bright horizontal bands that read as tearing.
  const led = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(4.2, 2.3, 0.8) } },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying vec3 vWorld;
      void main() {
        float behind = 1.0 - smoothstep(0.45, 1.35, abs(vWorld.x - (${CHARACTER.x.toFixed(3)})));
        gl_FragColor = vec4(uColor * mix(1.0, 0.32, behind), 1.0);
      }`,
  });
  const rFront = R - depth;
  for (const h of shelves) {
    group.add(
      new THREE.Mesh(
        revolve(
          [
            [R, h],
            [rFront, h],
          ],
          start,
          span,
          seg,
        ),
        shelfWood,
      ),
    );
    group.add(
      new THREE.Mesh(
        revolve(
          [
            [rFront, h + 0.004],
            [rFront, h - 0.03],
          ],
          start,
          span,
          seg,
        ),
        materials.brass,
      ),
    );
    group.add(
      new THREE.Mesh(
        revolve(
          [
            [rFront + 0.015, h - 0.031],
            [rFront + 0.05, h - 0.031],
          ],
          start,
          span,
          seg,
        ),
        led,
      ),
    );
    group.add(
      new THREE.Mesh(
        revolve(
          [
            [rFront - 0.003, h - 0.019],
            [rFront - 0.003, h - 0.027],
          ],
          start,
          span,
          seg,
        ),
        led,
      ),
    );
  }
  disposables.push(shelfWood, led);

  // Pilasters between bays, every other one carrying a small sconce.
  const pilasterGeometry = new THREE.BoxGeometry(
    0.15,
    crown - floor + 0.3,
    0.24,
  );
  const capitalGeometry = new THREE.BoxGeometry(0.21, 0.07, 0.3);
  const pilasters = new THREE.InstancedMesh(
    pilasterGeometry,
    darkWood,
    bays + 1,
  );
  const capitals = new THREE.InstancedMesh(
    capitalGeometry,
    materials.brass,
    (bays + 1) * 2,
  );
  const sconceMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(4, 2.3, 0.9),
  });
  const sconceGeometry = new THREE.SphereGeometry(0.035, 12, 10);
  sconceGeometry.scale(1, 1.6, 1);
  const sconces = new THREE.InstancedMesh(
    sconceGeometry,
    sconceMaterial,
    bays + 1,
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const sconcePositions: THREE.Vector3[] = [];
  let sconceCount = 0;
  for (let k = 0; k <= bays; k++) {
    const t = start + (k / bays) * span;
    const r = R - 0.1;
    q.setFromAxisAngle(up, t);
    m.compose(
      new THREE.Vector3(
        Math.sin(t) * r,
        (crown + floor - 0.3) / 2 + 0.15,
        Math.cos(t) * r,
      ),
      q,
      new THREE.Vector3(1, 1, 1),
    );
    pilasters.setMatrixAt(k, m);
    for (const [i, y] of [floor - 0.12, crown].entries()) {
      m.compose(
        new THREE.Vector3(
          Math.sin(t) * (r - 0.02),
          y,
          Math.cos(t) * (r - 0.02),
        ),
        q,
        new THREE.Vector3(1, 1, 1),
      );
      capitals.setMatrixAt(k * 2 + i, m);
    }
    if (k % 2 === 1 && Math.abs(t - Math.PI) > 0.25) {
      const p = new THREE.Vector3(
        Math.sin(t) * (r - 0.16),
        2.62,
        Math.cos(t) * (r - 0.16),
      );
      m.makeTranslation(p.x, p.y, p.z);
      sconces.setMatrixAt(sconceCount++, m);
      sconcePositions.push(p);
    }
  }
  sconces.count = sconceCount;
  group.add(pilasters, capitals, sconces);
  disposables.push(
    pilasterGeometry,
    capitalGeometry,
    sconceGeometry,
    sconceMaterial,
  );

  // Cornice projecting towards the room, with a gilt edge.
  const cornice = new THREE.Mesh(
    revolve(
      [
        [R + 0.05, crown + 0.44],
        [R - 0.47, crown + 0.42],
        [R - 0.47, crown + 0.31],
        [R - 0.38, crown + 0.2],
        [R - 0.38, crown + 0.07],
        [R - 0.05, crown + 0.0],
      ],
      start,
      span,
      seg,
    ),
    darkWood,
  );
  group.add(cornice);
  group.add(
    new THREE.Mesh(
      revolve(
        [
          [R - 0.475, crown + 0.335],
          [R - 0.475, crown + 0.3],
        ],
        start,
        span,
        seg,
      ),
      materials.brass,
    ),
  );

  // Gilt sign above Lappland.
  const emblemTexture = makeEmblemTexture();
  const emblemMaterial = new THREE.MeshBasicMaterial({
    map: emblemTexture,
    transparent: true,
    color: new THREE.Color(1.9, 1.5, 1.0),
    depthWrite: false,
  });
  const emblem = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 0.75),
    emblemMaterial,
  );
  emblem.position.set(0, crown + 0.78, -R + 0.32);
  emblem.renderOrder = 2;
  group.add(emblem);
  disposables.push(emblemTexture, emblemMaterial);

  // Bottles: one instanced mesh per silhouette, hundreds in total.
  const labelAtlas = makeLabelAtlas();
  disposables.push(labelAtlas);
  const rand = mulberry32(2026);
  const placements: BottlePlacement[] = [];
  const levels = shelves.map((h) => h + 0.002);
  for (let b = 0; b < bays; b++) {
    const t0 = start + (b / bays) * span,
      t1 = start + ((b + 1) / bays) * span;
    const central = Math.abs((t0 + t1) / 2 - Math.PI) < 0.2;
    for (const h of levels) {
      let t = t0 + 0.06;
      while (t < t1 - 0.06) {
        const shape = Math.floor(rand() * SHAPES.length);
        const width = (0.1 + rand() * 0.03) * BOTTLE_SCALE;
        const dt = width / (R - 0.2);
        if (t + dt > t1 - 0.05) break;
        if (!central || rand() > 0.4) {
          const r = R - 0.15 - rand() * 0.07;
          placements.push({
            shape,
            pos: new THREE.Vector3(
              Math.sin(t + dt / 2) * r,
              h + 0.002,
              Math.cos(t + dt / 2) * r,
            ),
            rot: t + dt / 2 + Math.PI + (rand() - 0.5) * 0.5,
            scale: BOTTLE_SCALE * (0.92 + rand() * 0.16),
          });
        }
        t += dt;
      }
    }
  }
  // a few bottles stand on the back counter too
  for (let i = 0; i < 16; i++) {
    const t = start + 0.15 + rand() * (span - 0.3);
    if (Math.abs(t - Math.PI) < 0.45) continue;
    const r = R - 0.3 - rand() * 0.15;
    placements.push({
      shape: Math.floor(rand() * SHAPES.length),
      pos: new THREE.Vector3(Math.sin(t) * r, 0.982, Math.cos(t) * r),
      rot: t + Math.PI,
      scale: BOTTLE_SCALE * (1.0 + rand() * 0.15),
    });
  }

  // Underbar inside the counter ring: a dark work top with a speed rail of bottles,
  // so the bartender's side looks worked-in rather than empty floor.
  const underbarTop = 0.9;
  const workTop = new THREE.MeshStandardMaterial({
    color: 0x120d0b,
    metalness: 0.55,
    roughness: 0.32,
  });
  const ringStart = -BAR.span / 2,
    ringSpan = BAR.span;
  group.add(
    new THREE.Mesh(
      revolve(
        [
          [BAR.inner + 0.04, underbarTop],
          [BAR.inner - 0.46, underbarTop],
          [BAR.inner - 0.46, 0],
        ],
        ringStart,
        ringSpan,
        180,
      ),
      workTop,
    ),
  );
  group.add(
    new THREE.Mesh(
      revolve(
        [
          [BAR.inner - 0.455, underbarTop + 0.02],
          [BAR.inner - 0.465, underbarTop - 0.02],
        ],
        ringStart,
        ringSpan,
        180,
      ),
      materials.brass,
    ),
  );
  disposables.push(workTop);
  for (
    let t = ringStart + 0.12;
    t < ringStart + ringSpan - 0.12;
    t += 0.075 + rand() * 0.05
  ) {
    if (Math.abs(t) < 0.42) continue;
    const r = BAR.inner - 0.14 - rand() * 0.06;
    placements.push({
      shape: [0, 2, 3, 1][Math.floor(rand() * 4)],
      pos: new THREE.Vector3(Math.sin(t) * r, underbarTop, Math.cos(t) * r),
      rot: t + (rand() - 0.5) * 0.8,
      scale: BOTTLE_SCALE * (0.95 + rand() * 0.1),
    });
  }

  const bottleMaterials = buildBottles(
    placements,
    envTexture,
    labelAtlas,
    rand,
    group,
    disposables,
  );

  return {
    group,
    sconces: sconcePositions,
    bottleCount: placements.length,
    update(time: number, pulse: number) {
      for (const material of bottleMaterials) {
        material.uniforms.uTime.value = time;
        material.uniforms.uGlow.value = 0.35 + pulse * 0.5;
      }
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
    },
  };
}
