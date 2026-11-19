import { DurableObject } from "cloudflare:workers";

export class HyperverseShard extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.players = new Map();
    this.pulses = [];
    this.ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS leaderboard (
          player_id TEXT PRIMARY KEY,
          score INTEGER DEFAULT 0
        )
      `);
    });
    this.loop = setInterval(() => this.tick(), 50);
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.headers.get("Upgrade") !== "websocket") {
      const top = [...this.ctx.storage.sql.exec(
        "SELECT player_id, score FROM leaderboard ORDER BY score DESC LIMIT 10"
      )];
      return Response.json({ status: "Hyperverse-4D Edge Shard Ready", tps: 20, top });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const id = url.searchParams.get("id") || crypto.randomUUID().slice(0, 8);
    this.ctx.acceptWebSocket(server, [id]);
    server.serializeAttachment({ id });

    const row = [...this.ctx.storage.sql.exec(
      "SELECT score FROM leaderboard WHERE player_id = ?", id
    )][0];
    this.players.set(id, { id, x: 0, y: 0, z: 0, w: 0, score: row ? row.score : 0 });
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, message) {
    const { id } = ws.deserializeAttachment();
    const data = JSON.parse(message);
    const p = this.players.get(id);
    if (!p) return;

    if (data.type === "move") {
      Object.assign(p, { x: data.x, y: data.y, z: data.z, w: data.w });
    } else if (data.type === "pulse") {
      this.pulses.push({ owner: id, x: p.x, y: p.y, z: p.z, w: p.w, r: 0.5, ttl: 12 });
    }
  }

  webSocketClose(ws) {
    const { id } = ws.deserializeAttachment();
    this.players.delete(id);
  }

  tick() {
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
          if (attacker) {
            attacker.score += 10;
            this.ctx.storage.sql.exec(
              "INSERT INTO leaderboard (player_id, score) VALUES (?, ?) ON CONFLICT(player_id) DO UPDATE SET score = excluded.score",
              attacker.id, attacker.score
            );
          }
          target.w = Math.max(-8, Math.min(8, target.w + (Math.random() > 0.5 ? 2.5 : -2.5)));
          pulse.ttl = 0;
        }
      }
      return pulse.ttl > 0;
    });

    const sockets = this.ctx.getWebSockets();
    if (!sockets.length) return;
    const snapshot = JSON.stringify({
      type: "state",
      players: [...this.players.values()],
      pulses: this.pulses
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
