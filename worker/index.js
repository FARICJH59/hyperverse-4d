import { DurableObject } from "cloudflare:workers";

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, Number.isFinite(val) ? val : 0));
}

function spawnCrystal(id) {
  return {
    id,
    x: +(Math.random() * 6 - 3).toFixed(2),
    y: +(Math.random() * 4 - 2).toFixed(2),
    z: +(Math.random() * 6 - 3).toFixed(2),
    w: +(Math.random() * 14 - 7).toFixed(2)
  };
}

export class HyperverseShard extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.players = new Map();
    this.pulses = [];
    this.crystals = Array.from({ length: 6 }, (_, i) => spawnCrystal(`C-${i + 1}`));
    this.leaderboard = [];

    this.ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS leaderboard (
          player_id TEXT PRIMARY KEY,
          score INTEGER DEFAULT 0
        )
      `);
      this.refreshLeaderboard();
    });

    this.loop = setInterval(() => this.tick(), 50); // 20 TPS
  }

  refreshLeaderboard() {
    this.leaderboard = [...this.ctx.storage.sql.exec(
      "SELECT player_id, score FROM leaderboard ORDER BY score DESC LIMIT 5"
    )];
  }

  awardScore(player, points) {
    player.score += points;
    this.ctx.storage.sql.exec(
      "INSERT INTO leaderboard (player_id, score) VALUES (?, ?) ON CONFLICT(player_id) DO UPDATE SET score = excluded.score",
      player.id,
      player.score
    );
    this.refreshLeaderboard();
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.headers.get("Upgrade") !== "websocket") {
      return Response.json({
        status: "Hyperverse-4D Edge Shard Ready",
        tps: 20,
        online: this.players.size,
        leaderboard: this.leaderboard
      });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const id = (url.searchParams.get("id") || crypto.randomUUID().slice(0, 8)).slice(0, 16);
    this.ctx.acceptWebSocket(server, [id]);
    server.serializeAttachment({ id });

    const row = [...this.ctx.storage.sql.exec(
      "SELECT score FROM leaderboard WHERE player_id = ?", id
    )][0];
    this.players.set(id, {
      id,
      x: 0,
      y: 0,
      z: 0,
      w: 0,
      score: row ? row.score : 0,
      lastPulseAt: 0
    });
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, message) {
    const { id } = ws.deserializeAttachment();
    const data = JSON.parse(message);
    const p = this.players.get(id);
    if (!p) return;

    if (data.type === "move") {
      // Clamp to tesseract arena bounds & cap max per-packet displacement (anti-teleport)
      const nx = clamp(data.x, -4.5, 4.5);
      const ny = clamp(data.y, -4.5, 4.5);
      const nz = clamp(data.z, -4.5, 4.5);
      const nw = clamp(data.w, -8.0, 8.0);
      const stepDist = Math.hypot(nx - p.x, ny - p.y, nz - p.z, nw - p.w);
      if (stepDist <= 1.2) {
        p.x = nx; p.y = ny; p.z = nz; p.w = nw;
      }
    } else if (data.type === "pulse") {
      const now = Date.now();
      if (now - p.lastPulseAt >= 350) {
        p.lastPulseAt = now;
        this.pulses.push({ owner: id, x: p.x, y: p.y, z: p.z, w: p.w, r: 0.5, ttl: 12 });
      }
    }
  }

  webSocketClose(ws) {
    const { id } = ws.deserializeAttachment();
    this.players.delete(id);
  }

  tick() {
    // 1. Server-authoritative 4D crystal collection
    for (const p of this.players.values()) {
      for (let i = 0; i < this.crystals.length; i++) {
        const c = this.crystals[i];
        const d4 = Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z, p.w - c.w);
        if (d4 < 0.95) {
          this.awardScore(p, 5);
          this.crystals[i] = spawnCrystal(c.id);
        }
      }
    }

    // 2. Expand 4D pulses & validate 4D Euclidean combat hits
    this.pulses = this.pulses.filter(pulse => {
      pulse.r += 0.45;
      pulse.ttl -= 1;
      for (const [targetId, target] of this.players) {
        if (targetId === pulse.owner) continue;
        const d4 = Math.hypot(
          target.x - pulse.x,
          target.y - pulse.y,
          target.z - pulse.z,
          target.w - pulse.w
        );
        if (Math.abs(d4 - pulse.r) < 0.75) {
          const attacker = this.players.get(pulse.owner);
          if (attacker) this.awardScore(attacker, 10);
          target.w = clamp(target.w + (Math.random() > 0.5 ? 2.5 : -2.5), -8, 8);
          pulse.ttl = 0;
        }
      }
      return pulse.ttl > 0;
    });

    const sockets = this.ctx.getWebSockets();
    if (!sockets.length) return;
    const snapshot = JSON.stringify({
      type: "state",
      players: [...this.players.values()].map(({ lastPulseAt, ...pub }) => pub),
      crystals: this.crystals,
      pulses: this.pulses,
      leaderboard: this.leaderboard
    });
    for (const ws of sockets) {
      try { ws.send(snapshot); } catch {}
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const shardName = url.searchParams.get("shard") || "global-alpha";
    const id = env.SHARD.idFromName(shardName);
    return env.SHARD.get(id).fetch(request);
  }
};
