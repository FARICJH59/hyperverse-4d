import { DurableObject } from "cloudflare:workers";

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, Number.isFinite(val) ? val : 0));
}

function spawnCrystal(id) {
  return {
    id,
    x: +(Math.random() * 6 - 3).toFixed(2),
    y: +(Math.random() * 3 - 1.5).toFixed(2),
    z: +(Math.random() * 6 - 3).toFixed(2),
    w: +(Math.random() * 14 - 7).toFixed(2)
  };
}

function spawnBeacon(id) {
  return {
    id,
    x: +(Math.random() * 4 - 2).toFixed(2),
    y: 0,
    z: +(Math.random() * 4 - 2).toFixed(2),
    w: +(Math.random() * 10 - 5).toFixed(2),
    charge: 0,
    linked: 0
  };
}

export class HyperverseShard extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.players = new Map();
    this.pulses = [];
    this.pings = [];
    this.crystals = Array.from({ length: 6 }, (_, i) => spawnCrystal(`C-${i + 1}`));
    this.beacons = [spawnBeacon("B-1"), spawnBeacon("B-2")];
    this.leaderboard = [];
    this.feed = [];

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

  pushFeed(text) {
    this.feed.unshift({ id: crypto.randomUUID().slice(0, 6), text, ts: Date.now() });
    if (this.feed.length > 5) this.feed.length = 5;
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
      player.name,
      player.score
    );
    this.refreshLeaderboard();
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.headers.get("Upgrade") !== "websocket") {
      return Response.json({
        status: "Hyperverse-4D Multiplayer Shard Active",
        tps: 20,
        online: this.players.size,
        leaderboard: this.leaderboard
      });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const id = (url.searchParams.get("id") || crypto.randomUUID().slice(0, 8)).slice(0, 16);
    const rawName = (url.searchParams.get("name") || id).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 14) || id;

    this.ctx.acceptWebSocket(server, [id]);
    server.serializeAttachment({ id });

    const row = [...this.ctx.storage.sql.exec(
      "SELECT score FROM leaderboard WHERE player_id = ?", rawName
    )][0];

    this.players.set(id, {
      id,
      name: rawName,
      x: +(Math.random() * 2 - 1).toFixed(2),
      y: 0,
      z: +(Math.random() * 2 - 1).toFixed(2),
      w: 0,
      score: row ? row.score : 0,
      lastPulseAt: 0,
      lastPingAt: 0
    });
    this.pushFeed(`${rawName} entered the 4D shard`);
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, message) {
    const { id } = ws.deserializeAttachment();
    const data = JSON.parse(message);
    const p = this.players.get(id);
    if (!p) return;

    if (data.type === "move") {
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
        this.pulses.push({ owner: id, ownerName: p.name, x: p.x, y: p.y, z: p.z, w: p.w, r: 0.5, ttl: 14 });
      }
    } else if (data.type === "ping") {
      const now = Date.now();
      if (now - p.lastPingAt >= 1200) {
        p.lastPingAt = now;
        this.pings.push({ ownerName: p.name, x: p.x, y: p.y, z: p.z, w: p.w, ttl: 70 });
        this.pushFeed(`${p.name} pinged W:${p.w.toFixed(1)}`);
      }
    }
  }

  webSocketClose(ws) {
    const { id } = ws.deserializeAttachment();
    const p = this.players.get(id);
    if (p) this.pushFeed(`${p.name} phased out`);
    this.players.delete(id);
  }

  tick() {
    const playerList = [...this.players.values()];

    // 1. Solo/Competitive 4D Crystal Pickups (+5)
    for (const p of playerList) {
      for (let i = 0; i < this.crystals.length; i++) {
        const c = this.crystals[i];
        if (Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z, p.w - c.w) < 0.95) {
          this.awardScore(p, 5);
          this.crystals[i] = spawnCrystal(c.id);
        }
      }
    }

    // 2. Multi-Player 4D Resonance Beacons (requires >=2 players in same W-slice, +25 each)
    for (let i = 0; i < this.beacons.length; i++) {
      const b = this.beacons[i];
      const linkedPlayers = playerList.filter(
        p => Math.hypot(p.x - b.x, p.y - b.y, p.z - b.z, p.w - b.w) < 1.55
      );
      b.linked = linkedPlayers.length;
      if (b.linked >= 2) {
        b.charge = Math.min(100, b.charge + 2.5 * b.linked);
        if (b.charge >= 100) {
          for (const lp of linkedPlayers) this.awardScore(lp, 25);
          this.pushFeed(`${linkedPlayers.map(p => p.name).join(" + ")} harmonized ${b.id} (+25)!`);
          this.beacons[i] = spawnBeacon(b.id);
        }
      } else {
        b.charge = Math.max(0, b.charge - 1);
      }
    }

    // 3. 4D Pulse Combat & W-Knockback (+10)
    this.pulses = this.pulses.filter(pulse => {
      pulse.r += 0.45;
      pulse.ttl -= 1;
      for (const target of playerList) {
        if (target.id === pulse.owner) continue;
        const d4 = Math.hypot(target.x - pulse.x, target.y - pulse.y, target.z - pulse.z, target.w - pulse.w);
        if (Math.abs(d4 - pulse.r) < 0.8) {
          const attacker = this.players.get(pulse.owner);
          if (attacker) {
            this.awardScore(attacker, 10);
            this.pushFeed(`${attacker.name} phase-blasted ${target.name} (+10)`);
          }
          target.w = clamp(target.w + (Math.random() > 0.5 ? 2.8 : -2.8), -8, 8);
          pulse.ttl = 0;
        }
      }
      return pulse.ttl > 0;
    });

    // 4. Decay Spatial Pings
    this.pings = this.pings.filter(ping => --ping.ttl > 0);

    const sockets = this.ctx.getWebSockets();
    if (!sockets.length) return;

    // Build dynamic player tether lines when players are close in 4D space
    const tethers = [];
    for (let i = 0; i < playerList.length; i++) {
      for (let j = i + 1; j < playerList.length; j++) {
        const a = playerList[i], b = playerList[j];
        const d4 = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z, a.w - b.w);
        if (d4 < 3.2) tethers.push({ a: a.id, b: b.id, strength: +(1 - d4 / 3.2).toFixed(2) });
      }
    }

    const snapshot = JSON.stringify({
      type: "state",
      players: playerList.map(({ lastPulseAt, lastPingAt, ...pub }) => pub),
      crystals: this.crystals,
      beacons: this.beacons,
      pulses: this.pulses,
      pings: this.pings,
      tethers,
      leaderboard: this.leaderboard,
      feed: this.feed
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
