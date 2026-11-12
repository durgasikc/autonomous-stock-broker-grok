/**
 * Browser client for the live market-data WebSocket server (server/ws-server.mjs).
 * - Single shared connection, lazily opened on first subscribe.
 * - Auto-reconnects with exponential backoff (1s -> 30s) and re-subscribes every active symbol.
 * - URL: NEXT_PUBLIC_WS_URL, or ws(s)://<current host>:3002 by default.
 */

export type StreamStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface LivePriceMessage {
  type: 'price';
  symbol: string;
  yahooSymbol: string;
  price: number;
  timestamp: number;
  currency?: string;
  change?: number;
  changePercent?: number;
  dayVolume?: number;
  marketState?: 'PRE' | 'REGULAR' | 'POST' | 'EXTENDED';
  source: 'stream' | 'poll';
}

export interface LiveErrorMessage {
  type: 'error';
  symbol: string;
  yahooSymbol?: string;
  message: string;
}

export type LiveMessage = LivePriceMessage | LiveErrorMessage;
type Handler = (msg: LiveMessage) => void;

function defaultUrl(): string {
  if (process.env.NEXT_PUBLIC_WS_URL) return process.env.NEXT_PUBLIC_WS_URL;
  if (typeof window === 'undefined') return 'ws://localhost:3002';
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.hostname || 'localhost'}:3002`;
}

class LiveSocket {
  private ws: WebSocket | null = null;
  private subs = new Map<string, { market?: string; handlers: Set<Handler> }>();
  private statusListeners = new Set<(s: StreamStatus) => void>();
  private status: StreamStatus = 'closed';
  private retry = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private setStatus(s: StreamStatus) {
    this.status = s;
    this.statusListeners.forEach((l) => l(s));
  }

  onStatus(listener: (s: StreamStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  private connect() {
    if (typeof window === 'undefined' || this.ws) return;
    this.setStatus(this.retry === 0 ? 'connecting' : 'reconnecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(defaultUrl());
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.setStatus('open');
      this.subs.forEach((s, symbol) => this.send({ action: 'subscribe', symbol, market: s.market }));
    };
    ws.onmessage = (ev) => {
      let msg: LiveMessage;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if ((msg.type === 'price' || msg.type === 'error') && msg.symbol) {
        this.subs.get(msg.symbol)?.handlers.forEach((h) => h(msg));
      }
    };
    ws.onclose = () => {
      if (this.ws === ws) this.ws = null;
      this.scheduleReconnect();
    };
    ws.onerror = () => {
      try {
        ws.close();
      } catch {}
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || this.subs.size === 0) {
      if (this.subs.size === 0) this.setStatus('closed');
      return;
    }
    const delay = Math.min(30000, 1000 * 2 ** this.retry++) + Math.floor(Math.random() * 300);
    this.setStatus('reconnecting');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private send(msg: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  /** Subscribe to live prices for a symbol. Returns an unsubscribe function. */
  subscribe(symbol: string, market: string | undefined, handler: Handler): () => void {
    const sym = symbol.toUpperCase();
    let entry = this.subs.get(sym);
    if (!entry) {
      entry = { market, handlers: new Set() };
      this.subs.set(sym, entry);
      this.send({ action: 'subscribe', symbol: sym, market });
    }
    entry.handlers.add(handler);
    this.connect();
    return () => {
      const e = this.subs.get(sym);
      if (!e) return;
      e.handlers.delete(handler);
      if (e.handlers.size === 0) {
        this.subs.delete(sym);
        this.send({ action: 'unsubscribe', symbol: sym, market: e.market });
      }
    };
  }
}

export const liveSocket = new LiveSocket();
