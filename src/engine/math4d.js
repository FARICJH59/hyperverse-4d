export class Vec4 {
  constructor(x = 0, y = 0, z = 0, w = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }

  add(v) {
    return new Vec4(this.x + v.x, this.y + v.y, this.z + v.z, this.w + v.w);
  }

  sub(v) {
    return new Vec4(this.x - v.x, this.y - v.y, this.z - v.z, this.w - v.w);
  }

  scale(s) {
    return new Vec4(this.x * s, this.y * s, this.z * s, this.w * s);
  }

  length() {
    return Math.hypot(this.x, this.y, this.z, this.w);
  }

  normalize() {
    const len = this.length() || 1;
    return this.scale(1 / len);
  }
}

export class Projector4D {
  constructor(fov4D = 3.5, fov3D = 500) {
    this.fov4D = fov4D;
    this.fov3D = fov3D;
  }

  rotate(v, plane, angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    let { x, y, z, w } = v;

    switch (plane) {
      case 'XY': [x, y] = [x * c - y * s, x * s + y * c]; break;
      case 'XZ': [x, z] = [x * c - z * s, x * s + z * c]; break;
      case 'XW': [x, w] = [x * c - w * s, x * s + w * c]; break;
      case 'YZ': [y, z] = [y * c - z * s, y * s + z * c]; break;
      case 'YW': [y, w] = [y * c - w * s, y * s + w * c]; break;
      case 'ZW': [z, w] = [z * c - w * s, z * s + w * c]; break;
    }
    return new Vec4(x, y, z, w);
  }

  project(point4D, cameraW = 0, screenWidth = 800, screenHeight = 600) {
    const relW = point4D.w - cameraW;
    const wFactor = this.fov4D / (this.fov4D + relW);

    const x3 = point4D.x * wFactor;
    const y3 = point4D.y * wFactor;
    const z3 = point4D.z * wFactor;

    const zOffset = z3 + 12;
    const scale = this.fov3D / Math.max(1, zOffset);

    return {
      x: screenWidth / 2 + x3 * scale,
      y: screenHeight / 2 + y3 * scale,
      scale: scale * wFactor,
      wDistance: Math.abs(relW)
    };
  }
}

export function createTesseractMesh(size = 1) {
  const vertices = [];
  for (let i = 0; i < 16; i++) {
    vertices.push(new Vec4(
      (i & 1 ? 1 : -1) * size,
      (i & 2 ? 1 : -1) * size,
      (i & 4 ? 1 : -1) * size,
      (i & 8 ? 1 : -1) * size
    ));
  }
  const edges = [];
  for (let i = 0; i < 16; i++) {
    for (let bit = 0; bit < 4; bit++) {
      const j = i ^ (1 << bit);
      if (i < j) edges.push([i, j]);
    }
  }
  return { vertices, edges };
}
