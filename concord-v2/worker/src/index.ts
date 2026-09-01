// Concord Realtime — Cloudflare Worker + Durable Object
// One ChatRoom instance per channel/DM. Uses the WebSocket Hibernation API
// so idle rooms cost $0 on the free plan.

export interface Env {
  ROOMS: DurableObjectNamespace;
}

type Session = { uid: string; name: string };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return new Response("Concord realtime: online ⌁", { status: 200 });
    }

    // /room/:roomId  → route to that room's Durable Object
    const match = url.pathname.match(/^\/room\/([a-zA-Z0-9_\-]{1,120})$/);
    if (match) {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected a WebSocket upgrade", { status: 426 });
      }
      const id = env.ROOMS.idFromName(match[1]);
      return env.ROOMS.get(id).fetch(request);
    }

    return new Response("Not found", { status: 404 });
  },
};

export class ChatRoom {
  state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
    // Free keepalive: the edge answers pings without waking the object.
    this.state.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('{"type":"ping"}', '{"type":"pong"}')
    );
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const uid = (url.searchParams.get("uid") || "").slice(0, 64);
    const name = (url.searchParams.get("name") || "?").slice(0, 24);
    if (!uid) return new Response("Missing uid", { status: 400 });

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    // Hibernation-friendly accept; session data survives hibernation.
    this.state.acceptWebSocket(server);
    server.serializeAttachment({ uid, name } satisfies Session);

    // Tell the newcomer who's here, tell everyone else they arrived.
    server.send(JSON.stringify({ type: "roster", users: this.roster() }));
    this.broadcast({ type: "join", uid, name }, server);

    return new Response(null, { status: 101, webSocket: client });
  }

  roster(): Session[] {
    const seen = new Map<string, Session>();
    for (const ws of this.state.getWebSockets()) {
      const s = ws.deserializeAttachment() as Session | null;
      if (s) seen.set(s.uid, s);
    }
    return [...seen.values()];
  }

  broadcast(msg: unknown, except?: WebSocket) {
    const data = JSON.stringify(msg);
    for (const ws of this.state.getWebSockets()) {
      if (ws === except) continue;
      try { ws.send(data); } catch {}
    }
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== "string" || raw.length > 4000) return;
    const session = ws.deserializeAttachment() as Session | null;
    if (!session) return;

    let msg: any;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      case "msg": {
        // Instant fanout to everyone (sender included — clients dedupe by id).
        this.broadcast({
          type: "msg",
          id: String(msg.id || "").slice(0, 64),
          uid: session.uid,
          username: session.name,
          text: String(msg.text || "").slice(0, 1500),
          isAdmin: !!msg.isAdmin,
          ts: Date.now(),
        });
        break;
      }
      case "typing": {
        this.broadcast({ type: "typing", uid: session.uid, name: session.name }, ws);
        break;
      }
    }
  }

  async webSocketClose(ws: WebSocket) {
    const s = ws.deserializeAttachment() as Session | null;
    // Only announce "left" if no other tab/socket for the same uid remains.
    if (s && !this.roster().some((r) => r.uid === s.uid)) {
      this.broadcast({ type: "leave", uid: s.uid }, ws);
    }
  }

  async webSocketError(ws: WebSocket) {
    await this.webSocketClose(ws);
  }
}
