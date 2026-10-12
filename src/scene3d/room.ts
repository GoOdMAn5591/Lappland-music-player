import * as THREE from "three";
import { BAR } from "./layout";
import { makeFloorTexture, makeSoftSprite } from "./textures";
import { mulberry32 } from "./util";

const flameVertex = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    float flicker = sin(uTime * 13.0 + uSeed * 7.0) * 0.5 + sin(uTime * 23.0 + uSeed * 3.0) * 0.5;
    p.x += sin(uTime * 3.0 + uSeed) * 0.004 * uv.y;
    p.y *= 1.0 + flicker * 0.08;
    // billboard
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.xy += p.xy;
    gl_Position = projectionMatrix * mv;
  }
`;

const flameFragment = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv - vec2(0.5, 0.3);
    p.x *= 2.4 + vUv.y * 2.0;
    float body = smoothstep(0.42, 0.0, length(vec2(p.x, p.y * (p.y > 0.0 ? 0.55 : 1.4))));
    float core = smoothstep(0.18, 0.0, length(vec2(p.x * 1.4, (p.y + 0.06) * 1.2)));
    vec3 col = vec3(3.6, 1.7, 0.45) * body + vec3(4.5, 3.8, 2.6) * core;
    col += vec3(0.4, 0.5, 1.4) * smoothstep(0.12, 0.0, length(vec2(p.x, p.y + 0.2))) * 0.6;
    float a = body;
    gl_FragColor = vec4(col * a, 0.0);
  }
`;

const beamVertex = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vAlong;
  void main() {
    vAlong = uv.y;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const beamFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uTime;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vAlong;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 45758.5); }
  void main() {
    vec3 V = normalize(cameraPosition - vWorld);
    float facing = abs(dot(normalize(vNormal), V));
    float soft = pow(facing, 2.2);
    float along = smoothstep(0.0, 0.25, vAlong) * (0.35 + 0.65 * (1.0 - vAlong));
    float haze = 0.75 + 0.25 * sin(vWorld.y * 7.0 + uTime * 0.6 + vWorld.x * 5.0);
    gl_FragColor = vec4(uColor * soft * along * haze * uIntensity, 0.0);
  }
`;

const dustVertex = /* glsl */ `
  attribute vec4 aSeed;
  uniform float uTime;
  uniform float uPixel;
  uniform vec3 uBeamTop;
  uniform vec3 uBeamBottom;
  uniform float uBeamRadius;
  varying float vLight;
  void main() {
    vec3 p = position;
    float t = uTime * (0.02 + aSeed.z * 0.03);
    p.x += sin(t * 6.2831 + aSeed.x * 20.0) * 0.25;
    p.y += mod(t * 0.4 + aSeed.y * 3.0, 3.0) - 1.5;
    p.z += cos(t * 5.0 + aSeed.w * 20.0) * 0.2;
    vec3 axis = normalize(uBeamBottom - uBeamTop);
    vec3 rel = p - uBeamTop;
    float along = clamp(dot(rel, axis) / length(uBeamBottom - uBeamTop), 0.0, 1.0);
    float radius = mix(0.05, uBeamRadius, along);
    float dist = length(rel - axis * dot(rel, axis));
    vLight = 0.12 + smoothstep(radius, radius * 0.4, dist) * 1.4;
    vLight *= 0.5 + 0.5 * sin(uTime * (1.0 + aSeed.w) + aSeed.x * 30.0);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = uPixel * (0.4 + aSeed.z) / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const dustFragment = /* glsl */ `
  varying float vLight;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vec3(1.0, 0.78, 0.5) * a * vLight * 0.55, 0.0);
  }
`;

/** Build a gathered velvet drape as a displaced grid. */
function drapeGeometry(
  width: number,
  height: number,
  folds: number,
  tie: number,
  side: number,
) {
  const geometry = new THREE.PlaneGeometry(width, height, 90, 60);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i),
      y = pos.getY(i);
    const u = x / width + 0.5; // 0 outer .. 1 inner (after mirroring)
    const v = y / height + 0.5;
    // tie-back: the inner edge is gathered towards the outside around `tie`
    const gather = Math.exp(-((v - tie) ** 2) / 0.02);
    const open = 1 - gather * 0.55 * u;
    const nx = (u - 0.5) * width * open;
    const amplitude = 0.07 * (1 - gather * 0.5);
    const z =
      Math.sin(u * folds * Math.PI * 2 * (1 + gather * 0.8)) * amplitude +
      Math.sin(u * 37) * 0.012;
    pos.setXYZ(i, nx * side, y, z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function createRoom() {
  const group = new THREE.Group();
  group.name = "room";
  const disposables: { dispose(): void }[] = [];
  const sprite = makeSoftSprite();
  disposables.push(sprite);

  // Floor
  const floorTexture = makeFloorTexture();
  floorTexture.repeat.set(5, 5);
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(10, 64).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({
      map: floorTexture,
      roughness: 0.32,
      metalness: 0.1,
      envMapIntensity: 0.45,
    }),
  );
  group.add(floor);
  disposables.push(
    floorTexture,
    floor.geometry,
    floor.material as THREE.Material,
  );

  // Dark room shell so the edges of the frame never fall into a flat void.
  const shell = new THREE.Mesh(
    new THREE.CylinderGeometry(6.2, 6.2, 5.2, 48, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0x1b0708,
      roughness: 0.9,
      side: THREE.BackSide,
    }),
  );
  shell.position.y = 2.6;
  group.add(shell);
  const ceiling = new THREE.Mesh(
    new THREE.CircleGeometry(6.3, 48).rotateX(Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x0c0605, roughness: 0.9 }),
  );
  ceiling.position.y = 4.8;
  group.add(ceiling);
  disposables.push(
    shell.geometry,
    shell.material as THREE.Material,
    ceiling.geometry,
    ceiling.material as THREE.Material,
  );

  // Velvet proscenium: two tied-back drapes and a swagged valance with gilt braid.
  const velvet = new THREE.MeshPhysicalMaterial({
    color: 0x4a0712,
    roughness: 0.78,
    sheen: 1,
    sheenColor: new THREE.Color(0xff5a6e),
    sheenRoughness: 0.42,
    envMapIntensity: 0.4,
    side: THREE.DoubleSide,
  });
  disposables.push(velvet);
  const drapes: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const geometry = drapeGeometry(1.9, 5.0, 6, 0.3, side);
    const drape = new THREE.Mesh(geometry, velvet);
    drape.position.set(side * 3.35, 2.5, 0.55);
    drape.rotation.y = -side * 0.55;
    group.add(drape);
    drapes.push(drape);
    disposables.push(geometry);
  }
  const valanceWidth = 9.6;
  const valanceGeometry = new THREE.PlaneGeometry(valanceWidth, 1.0, 160, 16);
  {
    const pos = valanceGeometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i),
        y = pos.getY(i);
      const swag = Math.abs(Math.sin((x / valanceWidth) * Math.PI * 4));
      const v = y + 0.5;
      const drop = (1 - v) * swag * 0.32;
      pos.setY(i, y - drop);
      pos.setZ(
        i,
        Math.sin((x / valanceWidth) * Math.PI * 28) * 0.03 * (1 - v) +
          swag * 0.12 * (1 - v),
      );
    }
    valanceGeometry.computeVertexNormals();
  }
  const valance = new THREE.Mesh(valanceGeometry, velvet);
  valance.position.set(0, 4.42, 2.75);
  group.add(valance);
  disposables.push(valanceGeometry);
  const braidPoints = Array.from({ length: 160 }, (_, i) => {
    const x = (i / 159 - 0.5) * valanceWidth;
    const swag = Math.abs(Math.sin((x / valanceWidth) * Math.PI * 4));
    return new THREE.Vector3(
      x,
      4.42 - 0.5 - swag * 0.32,
      2.75 + swag * 0.12 + 0.01,
    );
  });
  const braid = new THREE.Mesh(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(braidPoints),
      400,
      0.018,
      8,
    ),
    new THREE.MeshStandardMaterial({
      color: 0xe0b060,
      metalness: 1,
      roughness: 0.28,
      emissive: 0x3a2206,
      emissiveIntensity: 0.8,
    }),
  );
  group.add(braid);
  disposables.push(braid.geometry, braid.material as THREE.Material);

  // Pendant lamps hanging over the guest side of the counter.
  const pendants: THREE.Vector3[] = [];
  const shadeMaterial = new THREE.MeshStandardMaterial({
    color: 0x8a6331,
    metalness: 1,
    roughness: 0.32,
    side: THREE.DoubleSide,
  });
  const bulbMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(6, 3.6, 1.5),
  });
  const cordMaterial = new THREE.MeshBasicMaterial({ color: 0x050303 });
  disposables.push(shadeMaterial, bulbMaterial, cordMaterial);
  const shadeGeometry = new THREE.LatheGeometry(
    [
      [0.012, 0.0],
      [0.03, -0.02],
      [0.07, -0.09],
      [0.16, -0.2],
      [0.165, -0.21],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    40,
  );
  disposables.push(shadeGeometry);
  for (const [x, y, z] of [
    [-2.05, 3.05, 1.55],
    [2.05, 3.05, 1.55],
  ]) {
    const shade = new THREE.Mesh(shadeGeometry, shadeMaterial);
    shade.position.set(x, y, z);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 16, 12),
      bulbMaterial,
    );
    bulb.position.set(x, y - 0.17, z);
    const cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.004, 0.004, 1.8, 6),
      cordMaterial,
    );
    cord.position.set(x, y + 0.9, z);
    group.add(shade, bulb, cord);
    pendants.push(bulb.position.clone());
    disposables.push(bulb.geometry, cord.geometry);
  }

  // Candles on the bartender side of the counter.
  const candles: { position: THREE.Vector3; material: THREE.ShaderMaterial }[] =
    [];
  // Votives are unlit: the candle's own point light sits a hand above them so it
  // never blows out a highlight on the glass right next to the flame.
  const votiveMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(1.1, 0.42, 0.12),
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const waxMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0.95, 0.62, 0.32),
  });
  disposables.push(votiveMaterial, waxMaterial);
  const rand = mulberry32(12);
  for (const angle of [-0.68, 0.72, -1.38, 1.4]) {
    const r = BAR.inner + 0.15;
    const x = Math.sin(angle) * r,
      z = Math.cos(angle) * r;
    const votive = new THREE.Mesh(
      new THREE.CylinderGeometry(0.068, 0.06, 0.135, 24, 1, true),
      votiveMaterial,
    );
    votive.position.set(x, BAR.top + 0.068, z);
    votive.renderOrder = 5;
    const wax = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.075, 20),
      waxMaterial,
    );
    wax.position.set(x, BAR.top + 0.038, z);
    const flameMaterial = new THREE.ShaderMaterial({
      vertexShader: flameVertex,
      fragmentShader: flameFragment,
      uniforms: { uTime: { value: 0 }, uSeed: { value: rand() * 10 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const flame = new THREE.Mesh(
      new THREE.PlaneGeometry(0.05, 0.1),
      flameMaterial,
    );
    flame.position.set(x, BAR.top + 0.122, z);
    flame.renderOrder = 10;
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: sprite,
        color: new THREE.Color(1.0, 0.5, 0.16),
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    glow.scale.set(0.26, 0.26, 1);
    glow.position.set(x, BAR.top + 0.12, z);
    group.add(votive, wax, flame, glow);
    candles.push({ position: flame.position.clone(), material: flameMaterial });
    disposables.push(
      votive.geometry,
      wax.geometry,
      flame.geometry,
      flameMaterial,
      glow.material,
    );
  }

  // Visible shaft of the spotlight that crowns the current glass.
  const beamTop = new THREE.Vector3(0, 4.6, 3.05);
  const beamBottom = new THREE.Vector3(0, BAR.top, BAR.glassRing + 0.02);
  const beamLength = beamTop.distanceTo(beamBottom);
  const beamGeometry = new THREE.CylinderGeometry(
    0.05,
    0.36,
    beamLength,
    48,
    1,
    true,
  );
  beamGeometry.translate(0, -beamLength / 2, 0);
  // uv.y: 1 at the lamp, 0 at the counter. Flip so 0 = lamp.
  const uvs = beamGeometry.attributes.uv;
  for (let i = 0; i < uvs.count; i++) uvs.setY(i, 1 - uvs.getY(i));
  const beamMaterial = new THREE.ShaderMaterial({
    vertexShader: beamVertex,
    fragmentShader: beamFragment,
    uniforms: {
      uColor: { value: new THREE.Color(1.0, 0.72, 0.42) },
      uIntensity: { value: 0.11 },
      uTime: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(beamGeometry, beamMaterial);
  beam.position.copy(beamTop);
  beam.lookAt(beamBottom);
  beam.rotateX(-Math.PI / 2);
  beam.renderOrder = 11;
  group.add(beam);
  disposables.push(beamGeometry, beamMaterial);

  // Dust motes, brighter inside the beam.
  const dustCount = 520;
  const dustGeometry = new THREE.BufferGeometry();
  const dustPositions = new Float32Array(dustCount * 3);
  const dustSeeds = new Float32Array(dustCount * 4);
  const r2 = mulberry32(99);
  for (let i = 0; i < dustCount; i++) {
    const inBeam = i < 220;
    if (inBeam) {
      const t = r2();
      dustPositions.set(
        [
          beamTop.x + (beamBottom.x - beamTop.x) * t + (r2() - 0.5) * 0.6 * t,
          beamTop.y + (beamBottom.y - beamTop.y) * t,
          beamTop.z + (beamBottom.z - beamTop.z) * t + (r2() - 0.5) * 0.6 * t,
        ],
        i * 3,
      );
    } else
      dustPositions.set(
        [(r2() - 0.5) * 6, 1.0 + r2() * 3, -2.6 + r2() * 5],
        i * 3,
      );
    dustSeeds.set([r2(), r2(), r2(), r2()], i * 4);
  }
  dustGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(dustPositions, 3),
  );
  dustGeometry.setAttribute("aSeed", new THREE.BufferAttribute(dustSeeds, 4));
  const dustMaterial = new THREE.ShaderMaterial({
    vertexShader: dustVertex,
    fragmentShader: dustFragment,
    uniforms: {
      uTime: { value: 0 },
      uPixel: { value: 22 },
      uBeamTop: { value: beamTop },
      uBeamBottom: { value: beamBottom },
      uBeamRadius: { value: 0.36 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const dust = new THREE.Points(dustGeometry, dustMaterial);
  dust.frustumCulled = false;
  dust.renderOrder = 12;
  group.add(dust);
  disposables.push(dustGeometry, dustMaterial);

  return {
    group,
    /** Light shaft + dust: drawn after depth of field so they stay in front of Lappland. */
    overlay: [beam, dust] as THREE.Object3D[],
    candles,
    pendants,
    beamTop,
    beamBottom,
    drapes,
    update(time: number, pulse: number, pixelScale: number) {
      for (const candle of candles) candle.material.uniforms.uTime.value = time;
      beamMaterial.uniforms.uTime.value = time;
      beamMaterial.uniforms.uIntensity.value = 0.09 + pulse * 0.06;
      dustMaterial.uniforms.uTime.value = time;
      dustMaterial.uniforms.uPixel.value = 22 * pixelScale;
      drapes.forEach((drape, i) => {
        drape.rotation.z = Math.sin(time * 0.35 + i * 2) * 0.004;
      });
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
    },
  };
}
