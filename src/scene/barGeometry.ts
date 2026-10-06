export interface BarGeometry {
  width: number;
  height: number;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  inner: number;
  thickness: number;
}

// Both the counter mesh and the moving cups use this projected semicircle.
export function getBarGeometry(width: number, height: number): BarGeometry {
  const mobile = width <= 760;
  return {
    width,
    height,
    cx: width / 2,
    cy: height * (mobile ? 0.45 : 0.42),
    rx: width * (mobile ? 0.81 : 0.46),
    ry: height * (mobile ? 0.275 : 0.405),
    inner: 0.72,
    thickness: mobile ? 36 : 53,
  };
}

export function arcPoint(bar: BarGeometry, angle: number, radius = 1) {
  return {
    x: bar.cx + Math.sin(angle) * bar.rx * radius,
    y: bar.cy + Math.cos(angle) * bar.ry * radius,
  };
}

export function cupPosition(bar: BarGeometry, position: number) {
  const angle = position * 0.47;
  const depth = Math.max(0, Math.cos(angle));
  return {
    ...arcPoint(bar, angle, 0.86),
    angle,
    scale: (bar.width <= 760 ? 1.02 : 1.17) * (0.49 + 0.51 * depth * depth),
    opacity:
      Math.max(0, Math.min(1, (1.75 - Math.abs(angle)) * 2)) *
      (0.48 + depth * 0.52),
    blur: (1 - depth) * 1.3,
  };
}
