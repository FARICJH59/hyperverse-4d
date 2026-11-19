import { Projector4D } from './math4d.js';

export class HyperEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.projector = new Projector4D();
    this.entities = [];
    this.cameraW = 0;
    this.input = { moveX: 0, moveY: 0, shiftW: 0 };
    this.scene = null;
    this.lastTime = 0;
    this.running = false;

    this._bindEvents();
    this.resize();
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  _bindEvents() {
    window.addEventListener('resize', () => this.resize());

    const keys = new Set();
    window.addEventListener('keydown', (e) => {
      keys.add(e.key.toLowerCase());
      this._updateKeyboardInput(keys);
    });
    window.addEventListener('keyup', (e) => {
      keys.delete(e.key.toLowerCase());
      this._updateKeyboardInput(keys);
    });

    let touchStart = null;
    this.canvas.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      touchStart = { x: t.clientX, y: t.clientY };
    }, { passive: true });

    this.canvas.addEventListener('touchmove', (e) => {
      if (!touchStart) return;
      const t = e.touches[0];
      const dx = t.clientX - touchStart.x;
      const dy = t.clientY - touchStart.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 5) {
        const clamped = Math.min(dist, 50) / 50;
        this.input.moveX = (dx / dist) * clamped;
        this.input.moveY = (dy / dist) * clamped;
      }
    }, { passive: true });

    this.canvas.addEventListener('touchend', () => {
      touchStart = null;
      this.input.moveX = 0;
      this.input.moveY = 0;
    });
  }

  _updateKeyboardInput(keys) {
    this.input.moveX = (keys.has('d') || keys.has('arrowright') ? 1 : 0) -
                       (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
    this.input.moveY = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) -
                       (keys.has('w') || keys.has('arrowup') ? 1 : 0);
    this.input.shiftW = (keys.has('e') ? 1 : 0) - (keys.has('q') ? 1 : 0);
  }

  loadScene(scene) {
    this.scene = scene;
    this.entities = [];
    if (this.scene.init) this.scene.init(this);
  }

  start() {
    this.running = true;
    this.lastTime = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      const dt = Math.min((now - this.lastTime) / 1000, 0.05);
      this.lastTime = now;

      this.update(dt);
      this.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  update(dt) {
    if (this.scene && this.scene.update) {
      this.scene.update(this, dt);
    }
    this.entities = this.entities.filter((e) => !e.dead);
  }

  render() {
    const { ctx, canvas } = this;
    ctx.fillStyle = '#07080f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (this.scene && this.scene.renderBackground) {
      this.scene.renderBackground(this, ctx);
    }

    const sorted = [...this.entities].sort((a, b) => {
      const da = Math.abs(a.pos.w - this.cameraW);
      const db = Math.abs(b.pos.w - this.cameraW);
      return db - da;
    });

    for (const ent of sorted) {
      this.drawEntity4D(ent);
    }
  }

  drawEntity4D(ent) {
    const { ctx, canvas, projector, cameraW } = this;
    const wDist = Math.abs(ent.pos.w - cameraW);

    if (wDist > 2.2) return;
    const alpha = Math.max(0.12, 1 - wDist / 2.2);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = ent.color || '#00f5d4';
    ctx.lineWidth = wDist < 0.35 ? 2.2 : 1;

    if (ent.mesh) {
      const projected = ent.mesh.vertices.map((v) => {
        let rotated = v;
        if (ent.rotXW) rotated = projector.rotate(rotated, 'XW', ent.rotXW);
        if (ent.rotYW) rotated = projector.rotate(rotated, 'YW', ent.rotYW);
        if (ent.rotXY) rotated = projector.rotate(rotated, 'XY', ent.rotXY);
        return projector.project(rotated.add(ent.pos), cameraW, canvas.width, canvas.height);
      });

      ctx.beginPath();
      for (const [i, j] of ent.mesh.edges) {
        ctx.moveTo(projected[i].x, projected[i].y);
        ctx.lineTo(projected[j].x, projected[j].y);
      }
      ctx.stroke();
    } else {
      const p = projector.project(ent.pos, cameraW, canvas.width, canvas.height);
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(2, (ent.radius || 0.3) * p.scale), 0, Math.PI * 2);
      ctx.fillStyle = ent.color || '#fff';
      ctx.fill();
    }

    ctx.restore();
  }
}
