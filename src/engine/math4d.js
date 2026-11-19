export class Vec4 {
  constructor(x = 0, y = 0, z = 0, w = 0) {
    this.x = x; this.y = y; this.z = z; this.w = w;
  }
}

export function rotate4D(v, angles) {
  let { x, y, z, w } = v;
  const { xy = 0, xz = 0, yz = 0, xw = 0, yw = 0, zw = 0 } = angles;

  // 3D standard planes
  if (xy) { const c = Math.cos(xy), s = Math.sin(xy); [x, y] = [x * c - y * s, x * s + y * c]; }
  if (xz) { const c = Math.cos(xz), s = Math.sin(xz); [x, z] = [x * c - z * s, x * s + z * c]; }
  if (yz) { const c = Math.cos(yz), s = Math.sin(yz); [y, z] = [y * c - z * s, y * s + z * c]; }

  // 4D hyperplane rotations (morphs geometry across the W axis)
  if (xw) { const c = Math.cos(xw), s = Math.sin(xw); [x, w] = [x * c - w * s, x * s + w * c]; }
  if (yw) { const c = Math.cos(yw), s = Math.sin(yw); [y, w] = [y * c - w * s, y * s + w * c]; }
  if (zw) { const c = Math.cos(zw), s = Math.sin(zw); [z, w] = [z * c - w * s, z * s + w * c]; }

  return new Vec4(x, y, z, w);
}

export function project4Dto2D(v4, cameraW = 0, fov = 420) {
  const relW = v4.w - cameraW;
  const wFactor = 3.5 / Math.max(0.6, 3.5 + relW * 0.35);
  const x3 = v4.x * wFactor;
  const y3 = v4.y * wFactor;
  const z3 = v4.z * wFactor + 6;
  const scale = fov / Math.max(0.5, z3);
  return {
    x: x3 * scale,
    y: y3 * scale,
    scale,
    relW,
    visible: Math.abs(relW) < 6.5
  };
}
