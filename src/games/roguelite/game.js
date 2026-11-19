import { Vec4, createTesseractMesh } from '../../engine/math4d.js';

export class RiftSurvivorScene {
  constructor(uiCallbacks) {
    this.ui = uiCallbacks;
    this.arenaMesh = createTesseractMesh(6.5);
  }

  init(engine) {
    this.engine = engine;
    this.time = 0;
    this.spawnTimer = 0;
    this.fireTimer = 0;
    this.paused = false;

    this.player = {
      type: 'player',
      pos: new Vec4(0, 0, 0, 0),
      mesh: createTesseractMesh(0.35),
      color: '#00f5d4',
      speed: 4.5,
      hp: 100,
      maxHp: 100,
      xp: 0,
      nextXp: 10,
      level: 1,
      score: 0,
      fireRate: 0.45,
      bulletDamage: 25,
      phaseRange: 0.45,
      rotXW: 0,
      rotYW: 0
    };

    engine.entities.push(this.player);
    this._syncUI();
  }

  setTargetW(wVal) {
    this.player.pos.w = Math.max(-1.5, Math.min(1.5, wVal));
  }

  applyUpgrade(id) {
    if (id === 'fireRate') this.player.fireRate *= 0.8;
    if (id === 'damage') this.player.bulletDamage += 15;
    if (id === 'speed') this.player.speed += 0.8;
    if (id === 'heal') this.player.hp = Math.min(this.player.maxHp, this.player.hp + 40);
    this.paused = false;
  }

  update(engine, dt) {
    if (this.paused || this.player.hp <= 0) return;
    this.time += dt;

    this.player.pos.x = Math.max(-6, Math.min(6, this.player.pos.x + engine.input.moveX * this.player.speed * dt));
    this.player.pos.y = Math.max(-6, Math.min(6, this.player.pos.y + engine.input.moveY * this.player.speed * dt));
    if (engine.input.shiftW !== 0) {
      this.setTargetW(this.player.pos.w + engine.input.shiftW * 1.8 * dt);
    }

    this.player.rotXW += dt * 1.4;
    this.player.rotYW += dt * 0.9;
    engine.cameraW += (this.player.pos.w - engine.cameraW) * Math.min(1, dt * 10);

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = Math.max(0.35, 1.4 - this.time * 0.015);
      this._spawnEnemy(engine);
    }

    this.fireTimer -= dt;
    if (this.fireTimer <= 0) {
      const target = this._findNearestInPhaseEnemy(engine);
      if (target) {
        this.fireTimer = this.player.fireRate;
        this._fireProjectile(engine, target);
      }
    }

    for (const ent of engine.entities) {
      if (ent.type === 'enemy') {
        ent.rotXW += dt * 2;
        const dir = this.player.pos.sub(ent.pos);
        const flatDist = Math.hypot(dir.x, dir.y);
        if (flatDist > 0.05) {
          ent.pos.x += (dir.x / flatDist) * ent.speed * dt;
          ent.pos.y += (dir.y / flatDist) * ent.speed * dt;
        }
        const wDiff = Math.abs(ent.pos.w - this.player.pos.w);
        if (flatDist < 0.55 && wDiff <= this.player.phaseRange) {
          this.player.hp -= 22 * dt;
          if (this.player.hp <= 0) {
            this.player.hp = 0;
            this.ui.onGameOver(this.player.score);
          }
        }
      } else if (ent.type === 'bullet') {
        ent.pos = ent.pos.add(ent.vel.scale(dt));
        ent.life -= dt;
        if (ent.life <= 0) ent.dead = true;

        for (const other of engine.entities) {
          if (other.type === 'enemy' && !other.dead) {
            const dist = ent.pos.sub(other.pos).length();
            if (dist < 0.55) {
              other.hp -= this.player.bulletDamage;
              ent.dead = true;
              if (other.hp <= 0) {
                other.dead = true;
                this.player.score += 100;
                this._spawnXP(engine, other.pos);
              }
              break;
            }
          }
        }
      } else if (ent.type === 'xp') {
        const dist = this.player.pos.sub(ent.pos).length();
        if (dist < 1.8) {
          ent.pos = ent.pos.add(this.player.pos.sub(ent.pos).normalize().scale(6 * dt));
        }
        if (dist < 0.45) {
          ent.dead = true;
          this.player.xp += 3;
          if (this.player.xp >= this.player.nextXp) {
            this.player.xp -= this.player.nextXp;
            this.player.level += 1;
            this.player.nextXp = Math.round(this.player.nextXp * 1.4);
            this.paused = true;
            this.ui.onLevelUp(this.player.level);
          }
        }
      }
    }

    this._syncUI();
  }

  _spawnEnemy(engine) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 6.5;
    const layers = [-1.0, 0.0, 1.0];
    const wLayer = layers[Math.floor(Math.random() * layers.length)];
    const colors = { '-1': '#ff006e', '0': '#ffbe0b', '1': '#8338ec' };

    engine.entities.push({
      type: 'enemy',
      pos: new Vec4(Math.cos(angle) * radius, Math.sin(angle) * radius, 0, wLayer),
      mesh: createTesseractMesh(0.28),
      color: colors[String(wLayer)],
      speed: 1.5 + Math.min(2.0, this.time * 0.02),
      hp: 30 + this.time * 0.8,
      rotXW: 0
    });
  }

  _findNearestInPhaseEnemy(engine) {
    let best = null;
    let bestDist = Infinity;
    for (const ent of engine.entities) {
      if (ent.type !== 'enemy') continue;
      if (Math.abs(ent.pos.w - this.player.pos.w) > this.player.phaseRange) continue;
      const d = ent.pos.sub(this.player.pos).length();
      if (d < bestDist) {
        bestDist = d;
        best = ent;
      }
    }
    return best;
  }

  _fireProjectile(engine, target) {
    const dir = target.pos.sub(this.player.pos).normalize();
    engine.entities.push({
      type: 'bullet',
      pos: new Vec4(this.player.pos.x, this.player.pos.y, 0, this.player.pos.w),
      vel: dir.scale(11),
      color: '#00f5d4',
      radius: 0.14,
      life: 1.2
    });
  }

  _spawnXP(engine, pos) {
    engine.entities.push({
      type: 'xp',
      pos: new Vec4(pos.x, pos.y, 0, pos.w),
      color: '#38b000',
      radius: 0.16
    });
  }

  renderBackground(engine, ctx) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    const pts = this.arenaMesh.vertices.map((v) =>
      engine.projector.project(v, engine.cameraW, engine.canvas.width, engine.canvas.height)
    );
    ctx.beginPath();
    for (const [i, j] of this.arenaMesh.edges) {
      ctx.moveTo(pts[i].x, pts[i].y);
      ctx.lineTo(pts[j].x, pts[j].y);
    }
    ctx.stroke();
    ctx.restore();
  }

  _syncUI() {
    this.ui.onStats({
      hp: Math.ceil(this.player.hp),
      maxHp: this.player.maxHp,
      w: this.player.pos.w.toFixed(2),
      level: this.player.level,
      score: this.player.score
    });
  }
}
