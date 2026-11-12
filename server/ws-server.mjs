/**
 * AURA live market-data WebSocket server.
 *
 * Browser clients connect to ws://<host>:WS_PORT (default 3002) and send:
 *   {"action":"subscribe","symbol":"NVDA"}                 (US / custom)
 *   {"action":"subscribe","symbol":"RELIANCE","market":"IN"} (NSE -> RELIANCE.NS)
 *   {"action":"unsubscribe","symbol":"NVDA"}
 *
 * Server pushes:
 *   {type:"subscribed", symbol, yahooSymbol}
 *   {type:"price", symbol, yahooSymbol, price, timestamp, currency, change, changePercent, dayVolume, marketState, source}
 *   {type:"error", symbol, yahooSymbol, message}
 *
 * Data sources (both free, no API key):
 *   1. Yahoo Finance streamer (wss://streamer.finance.yahoo.com) - true push of trades, protobuf payloads.
 *      One shared upstream connection; only symbols with at least one subscriber are subscribed.
 *   2. Yahoo chart endpoint (v8/finance/chart, 1m/1d) - snapshot on subscribe (so clients get the
 *      latest price immediately, even when the market is closed) and fallback polling for any symbol
 *      that has had no streamed tick recently or while the streamer is down. Backs off on errors/429.
 * Only changed prices are pushed (deltas). One poller/subscription per symbol, shared by all clients.
 */
import { WebSocketServer, WebSocket } from 'ws';

const PORT = Number(process.env.WS_PORT || 3002);
const STREAMER_URL = process.env.YAHOO_STREAMER_URL || 'wss://streamer.finance.yahoo.com/?version=2';
const POLL_MS = Number(process.env.WS_POLL_MS || 2000); // fallback poll interval while streamer is down
const IDLE_POLL_MS = Number(process.env.WS_IDLE_POLL_MS || 15000); // refresh snapshot when no streamed ticks
const STREAM_FRESH_MS = 20000; // a streamed tick within this window suppresses polling
const MAX_BACKOFF_MS = 60000;
const FAILS_BEFORE_ERROR = 3;
// Note: a full desktop-browser UA string gets HTTP 429 from the chart endpoint; the short form is accepted.
const UA = "Mozilla/5.0";

const INDIAN_SYMBOLS = ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'NIFTYBEES', 'WIPRO', 'SBIN', 'HINDUNILVR', 'ITC'];

function toYahooSymbol(symbol, market) {
  const s = String(symbol).toUpperCase();
  if ((INDIAN_SYMBOLS.includes(s) || market === 'IN') && !s.endsWith('.NS') && !s.endsWith('.BO')) return `${s}.NS`;
  return s;
}

const log = (...a) => console.log(`[ws ${new Date().toTimeString().slice(0, 8)}]`, ...a);

// ---------------------------------------------------------------------------
// Minimal protobuf decoder for Yahoo's PricingData message
// ---------------------------------------------------------------------------
const MARKET_STATES = { 0: 'PRE', 1: 'REGULAR', 2: 'POST', 3: 'EXTENDED' };

function decodePricing(b64) {
  const buf = Buffer.from(b64, 'base64');
  let i = 0;
  const varint = () => {
    let r = 0n, shift = 0n, b;
    do {
      b = buf[i++];
      r |= BigInt(b & 0x7f) << shift;
      shift += 7n;
    } while (b & 0x80 && i < buf.length);
    return r;
  };
  const zigzag = (v) => Number((v >> 1n) ^ -(v & 1n));
  const out = {};
  while (i < buf.length) {
    const key = Number(varint());
    const field = key >> 3, wire = key & 7;
    if (wire === 0) {
      const v = varint();
      if (field === 3) out.time = zigzag(v);
      else if (field === 7) out.marketHours = Number(v);
      else if (field === 9) out.dayVolume = zigzag(v);
    } else if (wire === 5) {
      const v = buf.readFloatLE(i);
      i += 4;
      if (field === 2) out.price = v;
      else if (field === 8) out.changePercent = v;
      else if (field === 12) out.change = v;
    } else if (wire === 1) {
      i += 8;
    } else if (wire === 2) {
      const len = Number(varint());
      const str = buf.toString('utf8', i, i + len);
      i += len;
      if (field === 1) out.id = str;
      else if (field === 4) out.currency = str;
    } else {
      break; // unknown wire type: stop parsing
    }
  }
  return out;
}

const round = (n, d = 4) => (Number.isFinite(n) ? Number(n.toFixed(d)) : undefined);

// ---------------------------------------------------------------------------
// Per-symbol state, shared by all subscribers
// ---------------------------------------------------------------------------
/** @type {Map<string, {yahooSymbol:string, clients:Map<WebSocket,string>, last:any, currency?:string, fails:number, backoff:number, nextPollAt:number, lastStreamAt:number, inflight:boolean, errored:boolean}>} */
const entries = new Map();

function send(ws, msg) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(entry, msg) {
  for (const [ws, clientSymbol] of entry.clients) send(ws, { ...msg, symbol: clientSymbol });
}

/** Push only when price or timestamp changed (deltas). */
function publish(entry, quote) {
  if (!Number.isFinite(quote.price) || quote.price <= 0) return;
  const prev = entry.last;
  if (prev && prev.price === quote.price && prev.timestamp === quote.timestamp) return;
  if (prev && quote.timestamp && prev.timestamp && quote.timestamp < prev.timestamp) return; // stale
  entry.last = { ...prev, ...quote };
  entry.errored = false;
  entry.fails = 0;
  broadcast(entry, { type: 'price', yahooSymbol: entry.yahooSymbol, ...entry.last });
}

async function pollSnapshot(entry) {
  if (entry.inflight) return;
  entry.inflight = true;
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(entry.yahooSymbol)}?interval=1m&range=1d`;
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (res.status === 429) throw Object.assign(new Error('Yahoo rate limit (429)'), { rateLimited: true });
    if (!res.ok) throw new Error(`Yahoo error ${res.status}`);
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    const meta = result?.meta;
    if (!meta || !Number.isFinite(meta.regularMarketPrice)) throw new Error(data?.chart?.error?.description || 'No data');
    entry.currency = meta.currency || entry.currency;
    const prevClose = meta.chartPreviousClose ?? meta.previousClose;
    const price = meta.regularMarketPrice;
    entry.backoff = 0;
    publish(entry, {
      price: round(price),
      timestamp: (meta.regularMarketTime || Math.floor(Date.now() / 1000)) * 1000,
      currency: entry.currency || (entry.yahooSymbol.endsWith('.NS') ? 'INR' : 'USD'),
      change: Number.isFinite(prevClose) ? round(price - prevClose) : undefined,
      changePercent: Number.isFinite(prevClose) && prevClose ? round(((price - prevClose) / prevClose) * 100) : undefined,
      dayVolume: meta.regularMarketVolume,
      marketState: undefined,
      source: 'poll',
    });
  } catch (err) {
    entry.fails += 1;
    entry.backoff = Math.min(MAX_BACKOFF_MS, Math.max(POLL_MS, (entry.backoff || POLL_MS) * 2) * (err.rateLimited ? 2 : 1));
    if (entry.fails >= FAILS_BEFORE_ERROR && !entry.errored && !entry.last) {
      entry.errored = true;
      broadcast(entry, { type: 'error', yahooSymbol: entry.yahooSymbol, message: `Live data unavailable: ${err.message}` });
    }
    log(`poll ${entry.yahooSymbol} failed (${entry.fails}): ${err.message}; next in ${entry.backoff}ms`);
  } finally {
    entry.inflight = false;
    const base = streamer.connected ? IDLE_POLL_MS : POLL_MS;
    entry.nextPollAt = Date.now() + Math.max(base, entry.backoff || 0);
  }
}

// Scheduler: one loop drives all symbols' fallback polling
setInterval(() => {
  const now = Date.now();
  for (const entry of entries.values()) {
    const streamFresh = streamer.connected && now - entry.lastStreamAt < STREAM_FRESH_MS;
    if (!streamFresh && now >= entry.nextPollAt) pollSnapshot(entry);
  }
}, 500).unref();

// ---------------------------------------------------------------------------
// Upstream Yahoo streamer (true push)
// ---------------------------------------------------------------------------
const streamer = {
  ws: /** @type {WebSocket|null} */ (null),
  connected: false,
  retry: 0,
  timer: /** @type {NodeJS.Timeout|null} */ (null),
  ensure() {
    if (this.ws || entries.size === 0 || process.env.WS_DISABLE_STREAMER === '1') return;
    const ws = new WebSocket(STREAMER_URL, { headers: { 'User-Agent': UA, Origin: 'https://finance.yahoo.com' } });
    this.ws = ws;
    ws.on('open', () => {
      this.connected = true;
      this.retry = 0;
      log('upstream streamer connected');
      const syms = [...entries.values()].map((e) => e.yahooSymbol);
      if (syms.length) ws.send(JSON.stringify({ subscribe: syms }));
    });
    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg?.type !== 'pricing' || !msg.message) return;
      let q;
      try {
        q = decodePricing(msg.message);
      } catch {
        return;
      }
      if (!q.id) return;
      for (const entry of entries.values()) {
        if (entry.yahooSymbol !== q.id) continue;
        entry.lastStreamAt = Date.now();
        publish(entry, {
          price: round(q.price),
          timestamp: q.time || Date.now(),
          currency: q.currency || entry.currency || (entry.yahooSymbol.endsWith('.NS') ? 'INR' : 'USD'),
          change: round(q.change),
          changePercent: round(q.changePercent),
          dayVolume: q.dayVolume,
          marketState: MARKET_STATES[q.marketHours ?? -1],
          source: 'stream',
        });
      }
    });
    const drop = (why) => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.connected) log(`upstream streamer disconnected (${why}); falling back to polling`);
      this.connected = false;
      if (entries.size === 0) return;
      const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.retry++);
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.ensure(), delay);
    };
    ws.on('close', (code) => drop(`close ${code}`));
    ws.on('error', (err) => {
      drop(err.message);
      try {
        ws.terminate();
      } catch {}
    });
  },
  subscribe(sym) {
    this.ensure();
    if (this.connected) this.ws.send(JSON.stringify({ subscribe: [sym] }));
  },
  unsubscribe(sym) {
    if (this.connected) this.ws.send(JSON.stringify({ unsubscribe: [sym] }));
    if (entries.size === 0 && this.ws) {
      const ws = this.ws;
      this.ws = null;
      this.connected = false;
      ws.close();
    }
  },
};

// ---------------------------------------------------------------------------
// Browser-facing WebSocket server
// ---------------------------------------------------------------------------
function subscribe(ws, symbol, market) {
  const clientSymbol = String(symbol).toUpperCase().trim();
  if (!/^[A-Z0-9.\-&^=]{1,20}$/.test(clientSymbol)) {
    send(ws, { type: 'error', symbol: clientSymbol, message: 'Invalid symbol' });
    return;
  }
  const yahooSymbol = toYahooSymbol(clientSymbol, market);
  let entry = entries.get(yahooSymbol);
  const isNew = !entry;
  if (!entry) {
    entry = { yahooSymbol, clients: new Map(), last: null, fails: 0, backoff: 0, nextPollAt: 0, lastStreamAt: 0, inflight: false, errored: false };
    entries.set(yahooSymbol, entry);
  }
  entry.clients.set(ws, clientSymbol);
  ws.subs.add(yahooSymbol);
  send(ws, { type: 'subscribed', symbol: clientSymbol, yahooSymbol });
  if (entry.last) send(ws, { type: 'price', yahooSymbol, ...entry.last, symbol: clientSymbol }); // latest immediately
  else if (entry.errored) send(ws, { type: 'error', symbol: clientSymbol, yahooSymbol, message: 'Live data unavailable' });
  if (isNew) {
    pollSnapshot(entry); // immediate snapshot
    streamer.subscribe(yahooSymbol);
  }
}

function unsubscribe(ws, yahooSymbol) {
  const entry = entries.get(yahooSymbol);
  ws.subs.delete(yahooSymbol);
  if (!entry) return;
  entry.clients.delete(ws);
  if (entry.clients.size === 0) {
    entries.delete(yahooSymbol);
    streamer.unsubscribe(yahooSymbol);
  }
}

const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (ws, req) => {
  ws.subs = new Set();
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));
  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return send(ws, { type: 'error', message: 'Invalid JSON' });
    }
    if (msg?.action === 'subscribe' && msg.symbol) subscribe(ws, msg.symbol, msg.market);
    else if (msg?.action === 'unsubscribe' && msg.symbol) unsubscribe(ws, toYahooSymbol(msg.symbol, msg.market));
    else if (msg?.action === 'ping') send(ws, { type: 'pong', timestamp: Date.now() });
  });
  ws.on('close', () => {
    for (const sym of [...ws.subs]) unsubscribe(ws, sym);
  });
  send(ws, { type: 'hello', timestamp: Date.now() });
  log(`client connected from ${req.socket.remoteAddress} (${wss.clients.size} total)`);
});

// Heartbeat: drop dead clients
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

wss.on('listening', () => log(`market-data WebSocket server listening on ws://localhost:${PORT}`));
wss.on('error', (err) => {
  console.error(`[ws] server error: ${err.message}`);
  process.exit(1);
});

const shutdown = () => {
  clearInterval(heartbeat);
  streamer.ws?.close();
  wss.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 500).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
