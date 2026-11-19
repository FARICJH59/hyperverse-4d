import { Vec4 } from '../src/engine/math4d.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Route WebSocket connections to a named 4D shard (supports multiple rooms via ?shard=...)
    const shardName = url.searchParams.get('shard') || 'global-alpha';
    const id = env.SHARD.idFromName(shardName);
    const stub = env.SHARD.get(id);
    return stub.fetch(request);
  }
};

export class HyperverseShard {
  constructor(state, env) {
    this.state = state;
    this.players = new Map();
    this.tickInterval = null;
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Hyperverse-4D Edge Shard Ready', { status: 200 });
    }

    if (this.players.size >= 50) {
      return new Response('Shard Full', { status: 503 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();

    const id = Math.random().toString(36).slice(2, 9);
    this.players.set(id, {
      id,
      ws: server,
      pos: new Vec4((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, 0, 0),
      input: { moveX: 0, moveY: 0 },
      hp: 100
    });

    server.send(JSON.stringify({ type: 'welcome', id }));
    this._ensureTickLoop();

    server.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(event.data);
        const p = this.players.get(id);
        if (!p) return;
        if (msg.type === 'input') {
          p.input.moveX = Math.max(-1, Math.min(1, Number(msg.moveX) || 0));
          p.input.moveY = Math.max(-1, Math.min(1, Number(msg.moveY) || 0));
          if (typeof msg.targetW === 'number') {
            p.pos.w = Math.max(-1.5, Math.min(1.5, msg.targetW));
          }
        }
      } catch (_) {}
    });

    server.addEventListener('close', () => {
      this.players.delete(id);
      if (this.players.size === 0 && this.tickInterval) {
        clearInterval(this.tickInterval);
        this.tickInterval = null;
      }
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  _ensureTickLoop() {
    if (this.tickInterval) return;
    const TICK_RATE = 20;
    const dt = 1 / TICK_RATE;

    this.tickInterval = setInterval(() => {
      const snapshot = [];
      for (const p of this.players.values()) {
        p.pos.x = Math.max(-6, Math.min(6, p.pos.x + p.input.moveX * 4.5 * dt));
        p.pos.y = Math.max(-6, Math.min(6, p.pos.y + p.input.moveY * 4.5 * dt));
        snapshot.push({ id: p.id, x: p.pos.x, y: p.pos.y, w: p.pos.w, hp: p.hp });
      }

      const payload = JSON.stringify({ type: 'state', players: snapshot });
      for (const p of this.players.values()) {
        try { p.ws.send(payload); } catch (_) {}
      }
    }, 1000 / TICK_RATE);
  }
}
