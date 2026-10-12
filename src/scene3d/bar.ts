import * as THREE from "three";
import { BAR } from "./layout";
import { arcPoints, revolve, type ProfilePoint } from "./geometry";
import { makeBarWoodTexture, makeFasciaTextures } from "./textures";

export interface BarMaterials {
  brass: THREE.MeshStandardMaterial;
  darkBrass: THREE.MeshStandardMaterial;
}

/** Semicircular counter: lacquered top, bull-nose lip, gilt trim, panelled fascia, foot rail. */
export function createBar(materials: BarMaterials) {
  const group = new THREE.Group();
  group.name = "bar";
  const { top, inner, outer, lip, span } = BAR;
  const start = -span / 2;
  const seg = 220;

  const wood = makeBarWoodTexture();
  wood.repeat.set(1 / 1.7, 1 / 0.8);
  const lacquer = new THREE.MeshPhysicalMaterial({
    map: wood,
    color: 0xffffff,
    roughness: 0.55,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    envMapIntensity: 0.38,
  });

  // Counter top with the bull-nose front and a rounded inner edge, one smooth sweep.
  const nose = arcPoints(outer + lip - 0.034, top - 0.036, 0.036, -90, 90, 12);
  const back = arcPoints(inner + 0.03, top - 0.03, 0.03, 90, 180, 6);
  const topProfile: ProfilePoint[] = [
    [outer - 0.03, top - 0.072],
    ...nose,
    [outer + lip - 0.05, top],
    [outer - 0.08, top],
    [inner + 0.2, top],
    ...back,
    [inner, top - 0.075],
  ];
  const counter = new THREE.Mesh(
    revolve(topProfile, start, span, seg, (inner + outer) / 2),
    lacquer,
  );
  counter.name = "counter-top";
  counter.receiveShadow = true;
  group.add(counter);

  // Gilt inlay lines set into the lacquer.
  const inlayMaterial = new THREE.MeshStandardMaterial({
    color: 0xd7a85a,
    metalness: 1,
    roughness: 0.22,
    emissive: 0x3a2508,
    emissiveIntensity: 0.6,
  });
  for (const r of [outer - 0.075, inner + 0.105]) {
    const ring = revolve(
      [
        [r + 0.0045, top + 0.0007],
        [r - 0.0045, top + 0.0007],
      ],
      start,
      span,
      seg,
    );
    group.add(new THREE.Mesh(ring, inlayMaterial));
  }

  // Half-round brass moulding under the lip.
  const trim = new THREE.Mesh(
    revolve(
      arcPoints(outer - 0.016, top - 0.098, 0.016, -90, 90, 8),
      start,
      span,
      seg,
    ),
    materials.brass,
  );
  group.add(trim);

  // Panelled fascia with a warm spill of light from the hidden LED under the lip.
  const fascia = makeFasciaTextures();
  const panelWidth = 0.62;
  const fasciaBottom = 0.17,
    fasciaTop = top - 0.115;
  fascia.map.repeat.set(1 / panelWidth, 1 / (fasciaTop - fasciaBottom));
  fascia.normalMap.repeat.copy(fascia.map.repeat);
  const fasciaMaterial = new THREE.MeshStandardMaterial({
    map: fascia.map,
    normalMap: fascia.normalMap,
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughness: 0.48,
    metalness: 0.05,
    envMapIntensity: 0.6,
  });
  fasciaMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uSpillTop = { value: fasciaTop };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vWorldY;")
      .replace(
        "#include <worldpos_vertex>",
        "#include <worldpos_vertex>\nvWorldY = (modelMatrix * vec4(transformed, 1.0)).y;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying float vWorldY;\nuniform float uSpillTop;",
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        float spill = exp(-(uSpillTop - vWorldY) * 7.5);
        totalEmissiveRadiance += diffuseColor.rgb * vec3(2.6, 1.55, 0.7) * spill * 0.35;
        totalEmissiveRadiance += vec3(1.0, 0.55, 0.18) * exp(-(uSpillTop - vWorldY) * 90.0) * 0.6;`,
      );
  };
  const fasciaMesh = new THREE.Mesh(
    revolve(
      [
        [outer - 0.022, fasciaBottom],
        [outer - 0.022, fasciaTop],
      ],
      start,
      span,
      seg,
      outer,
    ),
    fasciaMaterial,
  );
  group.add(fasciaMesh);

  // Plinth and kick plate.
  const plinth = new THREE.Mesh(
    revolve(
      [
        [outer + 0.03, 0.0],
        [outer + 0.03, 0.12],
        ...arcPoints(outer + 0.005, 0.12, 0.025, 0, 90, 4),
        [outer - 0.022, fasciaBottom],
      ],
      start,
      span,
      seg,
    ),
    materials.darkBrass,
  );
  group.add(plinth);

  // Bartender side of the counter (visible near the ends of the ring).
  const innerMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a0d09,
    roughness: 0.7,
  });
  const innerFace = new THREE.Mesh(
    revolve(
      [
        [inner + 0.04, top - 0.075],
        [inner + 0.04, 0],
      ],
      start,
      span,
      120,
    ),
    innerMaterial,
  );
  group.add(innerFace);

  // Foot rail on brackets.
  const railRadius = outer + 0.2,
    railY = 0.24;
  const railCurve = new THREE.CatmullRomCurve3(
    Array.from({ length: 80 }, (_, i) => {
      const t = start + 0.06 + (i / 79) * (span - 0.12);
      return new THREE.Vector3(
        Math.sin(t) * railRadius,
        railY,
        Math.cos(t) * railRadius,
      );
    }),
  );
  const rail = new THREE.Mesh(
    new THREE.TubeGeometry(railCurve, 300, 0.024, 16, false),
    materials.brass,
  );
  group.add(rail);
  const bracketGeometry = new THREE.CylinderGeometry(0.011, 0.011, 0.23, 10);
  bracketGeometry.rotateX(Math.PI / 2);
  const ball = new THREE.SphereGeometry(0.028, 16, 12);
  const brackets = 13;
  const bracketMesh = new THREE.InstancedMesh(
    bracketGeometry,
    materials.brass,
    brackets,
  );
  const ballMesh = new THREE.InstancedMesh(ball, materials.brass, brackets);
  const m = new THREE.Matrix4();
  for (let i = 0; i < brackets; i++) {
    const t = start + 0.2 + (i / (brackets - 1)) * (span - 0.4);
    const r = outer + 0.09;
    m.makeRotationY(t).setPosition(Math.sin(t) * r, railY, Math.cos(t) * r);
    bracketMesh.setMatrixAt(i, m);
    m.makeTranslation(
      Math.sin(t) * railRadius,
      railY,
      Math.cos(t) * railRadius,
    );
    ballMesh.setMatrixAt(i, m);
  }
  group.add(bracketMesh, ballMesh);

  // End posts where the ring meets the drapes, each crowned with a small lamp.
  const posts: THREE.Vector3[] = [];
  const postMaterial = new THREE.MeshStandardMaterial({
    color: 0x2a140c,
    roughness: 0.42,
    metalness: 0.1,
  });
  const lampMaterial = new THREE.MeshStandardMaterial({
    color: 0xffe2b0,
    emissive: 0xffb45a,
    emissiveIntensity: 2.0,
    roughness: 0.3,
  });
  for (const side of [-1, 1]) {
    const t = side * (span / 2 - 0.03);
    const r = (inner + outer) / 2 + 0.03;
    const x = Math.sin(t) * r,
      z = Math.cos(t) * r;
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, top + 0.18, 0.26),
      postMaterial,
    );
    post.position.set(x, (top + 0.18) / 2, z);
    post.rotation.y = t;
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.05, 0.32),
      materials.brass,
    );
    cap.position.set(x, top + 0.2, z);
    cap.rotation.y = t;
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.02, 0.22, 10),
      materials.brass,
    );
    stem.position.set(x, top + 0.33, z);
    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 24, 16),
      lampMaterial,
    );
    globe.position.set(x, top + 0.5, z);
    group.add(post, cap, stem, globe);
    posts.push(globe.position.clone());
  }

  return {
    group,
    posts,
    dispose() {
      wood.dispose();
      fascia.map.dispose();
      fascia.normalMap.dispose();
      [
        lacquer,
        inlayMaterial,
        fasciaMaterial,
        innerMaterial,
        postMaterial,
        lampMaterial,
      ].forEach((x) => x.dispose());
    },
  };
}
