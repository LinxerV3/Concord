import type { WsIn } from "../types";

/* ⚠️ EDIT THIS after you run `npx wrangler deploy` in /worker —
   paste the URL wrangler prints, with wss:// instead of https://
   e.g. "wss://concord-realtime.michaelnmotyka.workers.dev"        */
export const WORKER_WS_URL = "https://concord-realtime.michaelnmotyka.workers.dev";

type Listener = (ev: WsIn) => void;

export class RoomSocket {
  private ws: WebSocket | null = null;
  private roomId: string;
  private uid: string;
  private name: string;
  private listener: Listener;
  private closed = false;
  private retry = 0;
  private pingTimer: number | null = null;

  constructor(roomId: string, uid: string, name: string, listener: Listener) {
    this.roomId = roomId;
    this.uid = uid;
    this.name = name;
    this.listener = listener;
    this.connect();
  }

  private connect() {
    if (this.closed) return;
    const url = `${WORKER_WS_URL}/room/${encodeURIComponent(this.roomId)}?uid=${encodeURIComponent(
      this.uid
    )}&name=${encodeURIComponent(this.name)}`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.retry = 0;
      // Keepalive every 25s — answered at the edge for free.
      this.pingTimer = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send('{"type":"ping"}');
      }, 25_000);
    };

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as WsIn;
        if (data.type !== "pong") this.listener(data);
      } catch {}
    };

    ws.onclose = () => {
      if (this.pingTimer) clearInterval(this.pingTimer);
      if (!this.closed) {
        const wait = Math.min(1000 * 2 ** this.retry++, 15_000);
        setTimeout(() => this.connect(), wait);
      }
    };

    ws.onerror = () => ws.close();
  }

  send(obj: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }

  destroy() {
    this.closed = true;
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.ws?.close();
  }
}
