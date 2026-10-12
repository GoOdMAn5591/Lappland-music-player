// World layout for the tavern scene. Units are metres; +Y is up and the
// camera looks down -Z. Lappland stands at the centre of the semicircular bar.
const deg = (value: number) => (value * Math.PI) / 180;

export const BAR = {
  /** Bar top height. */
  top: 1.08,
  /** Inner (bartender side) and outer (guest side) radius of the counter top. */
  inner: 2.02,
  outer: 2.74,
  /** Front lip overhang beyond the fascia. */
  lip: 0.045,
  /** Total angle covered by the counter. Ends run off-screen behind the curtains. */
  span: deg(216),
  /** Radius of the ring the glasses travel on. */
  glassRing: 2.43,
};

export const CABINET = {
  radius: 3.55,
  span: deg(164),
  bays: 11,
  floor: 1.16,
  shelves: [1.3, 1.94, 2.58, 3.22],
  crown: 3.86,
  depth: 0.4,
};

export const CAROUSEL = {
  /** Angle between neighbouring glasses on the ring. */
  step: deg(15.2),
  /** Glasses further than this from the front are fully hidden. */
  fadeEnd: deg(98),
  fadeStart: deg(80),
  maxSide: 6,
};

export const CHARACTER = {
  /** Height of the portrait plane in metres; width follows the image aspect. */
  height: 1.86,
  /** World position of the image centre: just behind the inner edge, like a bartender serving. */
  x: -0.1,
  y: 1.79,
  z: 1.7,
};

export const deg2rad = deg;

/** Point on a ring around the bar centre. theta = 0 is the front, + is to the right. */
export function ringPoint(radius: number, theta: number, y = 0) {
  return { x: radius * Math.sin(theta), y, z: radius * Math.cos(theta) };
}
