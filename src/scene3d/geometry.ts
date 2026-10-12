import * as THREE from "three";

export type ProfilePoint = [radius: number, y: number];

/**
 * Revolve a 2D profile (radius, y) around the Y axis between two angles.
 * Unlike LatheGeometry, UVs are in metres (u = arc length at `uvRadius`,
 * v = distance along the profile) so procedural textures keep their scale,
 * and normals come straight from the profile tangent.
 * Traverse the profile so the visible side is on the right of the direction of travel
 * (e.g. upwards on an outward face, inwards on a top face).
 */
export function revolve(
  profile: ProfilePoint[],
  start: number,
  length: number,
  segments: number,
  uvRadius?: number,
) {
  const n = profile.length;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const along: number[] = [0];
  for (let j = 1; j < n; j++) {
    const [r0, y0] = profile[j - 1];
    const [r1, y1] = profile[j];
    along.push(along[j - 1] + Math.hypot(r1 - r0, y1 - y0));
  }
  const tangents = profile.map((_, j) => {
    const a = profile[Math.max(0, j - 1)];
    const b = profile[Math.min(n - 1, j + 1)];
    const dr = b[0] - a[0],
      dy = b[1] - a[1];
    const len = Math.hypot(dr, dy) || 1;
    return [dy / len, -dr / len];
  });
  const refRadius = uvRadius ?? profile.reduce((sum, p) => sum + p[0], 0) / n;
  for (let i = 0; i <= segments; i++) {
    const theta = start + (i / segments) * length;
    const s = Math.sin(theta),
      c = Math.cos(theta);
    for (let j = 0; j < n; j++) {
      const [r, y] = profile[j];
      const [nr, ny] = tangents[j];
      positions.push(r * s, y, r * c);
      normals.push(nr * s, ny, nr * c);
      uvs.push(theta * refRadius, along[j]);
    }
  }
  for (let i = 0; i < segments; i++)
    for (let j = 0; j < n - 1; j++) {
      const a = i * n + j,
        b = (i + 1) * n + j;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

/** Quarter/half round arc points for profiles. Angles in degrees. */
export function arcPoints(
  cr: number,
  cy: number,
  radius: number,
  fromDeg: number,
  toDeg: number,
  steps: number,
): ProfilePoint[] {
  const points: ProfilePoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = ((fromDeg + ((toDeg - fromDeg) * i) / steps) * Math.PI) / 180;
    points.push([cr + Math.cos(a) * radius, cy + Math.sin(a) * radius]);
  }
  return points;
}

/** Smooth a polyline profile with Catmull-Rom so lathe objects look turned. */
export function smoothProfile(
  points: ProfilePoint[],
  samples = 6,
): ProfilePoint[] {
  const curve = new THREE.SplineCurve(
    points.map(([r, y]) => new THREE.Vector2(r, y)),
  );
  return curve
    .getSpacedPoints(Math.max(points.length * samples, 8))
    .map((p) => [Math.max(0, p.x), p.y] as ProfilePoint);
}
