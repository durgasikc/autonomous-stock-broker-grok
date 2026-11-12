import type { Candlestick } from '../types';

export interface StockMetadata {
  symbol: string;
  name: string;
  basePrice: number;
  volatility: number; // annualized volatility e.g. 0.35
  description: string;
  sector: string;
  market: 'US' | 'IN' | 'CUSTOM';
  currency?: string; // ISO code reported by the live feed, e.g. 'INR'
}

export const WATCHLIST: Record<string, StockMetadata> = {
  NVDA: {
    symbol: 'NVDA',
    name: 'NVIDIA Corporation',
    basePrice: 142.5,
    volatility: 0.45,
    description: 'Semiconductors & AI Accelerated Computing',
    sector: 'Technology',
    market: 'US',
  },
  AAPL: {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    basePrice: 228.3,
    volatility: 0.25,
    description: 'Consumer Electronics & Software Ecosystem',
    sector: 'Technology',
    market: 'US',
  },
  TSLA: {
    symbol: 'TSLA',
    name: 'Tesla, Inc.',
    basePrice: 246.8,
    volatility: 0.55,
    description: 'Electric Vehicles, Robotics & Autonomous AI',
    sector: 'Automotive',
    market: 'US',
  },
  MSFT: {
    symbol: 'MSFT',
    name: 'Microsoft Corporation',
    basePrice: 421.1,
    volatility: 0.22,
    description: 'Enterprise Cloud, Productivity & Azure AI',
    sector: 'Technology',
    market: 'US',
  },
  AMZN: {
    symbol: 'AMZN',
    name: 'Amazon.com, Inc.',
    basePrice: 188.4,
    volatility: 0.3,
    description: 'E-commerce, AWS Cloud Infrastructure',
    sector: 'Consumer Cyclical',
    market: 'US',
  },
  SPY: {
    symbol: 'SPY',
    name: 'SPDR S&P 500 ETF Trust',
    basePrice: 585.2,
    volatility: 0.16,
    description: 'Benchmark S&P 500 Index ETF',
    sector: 'Index ETF',
    market: 'US',
  },
  // Indian markets (NSE), prices in INR
  RELIANCE: {
    symbol: 'RELIANCE',
    name: 'Reliance Industries Ltd.',
    basePrice: 1450,
    volatility: 0.28,
    description: 'Energy, Retail & Telecom Conglomerate',
    sector: 'Conglomerate',
    market: 'IN',
  },
  TCS: {
    symbol: 'TCS',
    name: 'Tata Consultancy Services',
    basePrice: 4100,
    volatility: 0.22,
    description: 'IT Services & Consulting',
    sector: 'Technology',
    market: 'IN',
  },
  INFY: {
    symbol: 'INFY',
    name: 'Infosys Ltd.',
    basePrice: 1850,
    volatility: 0.25,
    description: 'IT Services & Digital Transformation',
    sector: 'Technology',
    market: 'IN',
  },
  HDFCBANK: {
    symbol: 'HDFCBANK',
    name: 'HDFC Bank Ltd.',
    basePrice: 1720,
    volatility: 0.24,
    description: 'Private Sector Banking',
    sector: 'Financials',
    market: 'IN',
  },
  ICICIBANK: {
    symbol: 'ICICIBANK',
    name: 'ICICI Bank Ltd.',
    basePrice: 1250,
    volatility: 0.3,
    description: 'Private Sector Banking',
    sector: 'Financials',
    market: 'IN',
  },
  NIFTYBEES: {
    symbol: 'NIFTYBEES',
    name: 'Nippon India Nifty BeES ETF',
    basePrice: 265,
    volatility: 0.16,
    description: 'Benchmark Nifty 50 Index ETF',
    sector: 'Index ETF',
    market: 'IN',
  },
};

export function addCustomTicker(
  symbol: string,
  name?: string,
  market: 'US' | 'IN' | 'CUSTOM' = 'CUSTOM'
): StockMetadata {
  const upper = symbol.toUpperCase().trim();
  if (WATCHLIST[upper]) return WATCHLIST[upper];
  const meta: StockMetadata = {
    symbol: upper,
    name: name || upper,
    basePrice: 100 + Math.random() * 200,
    volatility: 0.25 + Math.random() * 0.3,
    description: 'Custom ticker',
    sector: 'Custom',
    market,
  };
  WATCHLIST[upper] = meta;
  return meta;
}

/**
 * Currency symbol to display for a ticker: ₹ for Indian (NSE) stocks or INR-quoted feeds, $ otherwise
 */
export function getCurrencySymbol(symbol: string): string {
  const meta = WATCHLIST[symbol];
  return meta?.market === 'IN' || meta?.currency === 'INR' ? '₹' : '$';
}

/**
 * Tickers belonging to a market view: 'IN' shows NSE tickers, 'US' shows US plus untagged custom tickers
 */
export function tickersForMarket(market: 'US' | 'IN'): string[] {
  return Object.keys(WATCHLIST).filter((t) =>
    market === 'IN' ? WATCHLIST[t].market === 'IN' : WATCHLIST[t].market !== 'IN'
  );
}

function marketParam(symbol: string): string {
  return WATCHLIST[symbol]?.market === 'IN' ? '&market=IN' : '';
}

/**
 * Fetches live hourly candles from the /api/market-data route (Yahoo Finance).
 * Returns [] when live data is unavailable. Never substitutes synthetic data.
 */
export async function fetchLiveCandles(symbol: string, count = 80): Promise<Candlestick[]> {
  try {
    const res = await fetch(`/api/market-data?symbol=${encodeURIComponent(symbol)}${marketParam(symbol)}`);
    if (!res.ok) throw new Error(`API error ${res.status}`);
    const data = await res.json();
    const candles: Candlestick[] = (data.candles || []).slice(-count);
    if (WATCHLIST[symbol] && data.currency) WATCHLIST[symbol].currency = data.currency;
    return candles;
  } catch (err) {
    console.warn(`Live data unavailable for ${symbol}`, err);
    return [];
  }
}

const inflightQuotes = new Set<string>();

/**
 * Fetches just the latest live price (lightweight). Returns null if unavailable
 * or if a request for this symbol is already in flight (avoids piling up calls).
 */
export async function fetchLivePrice(symbol: string): Promise<number | null> {
  if (inflightQuotes.has(symbol)) return null;
  inflightQuotes.add(symbol);
  try {
    const res = await fetch(`/api/market-data?symbol=${encodeURIComponent(symbol)}&quote=1${marketParam(symbol)}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json();
    const price = Number(data.regularMarketPrice);
    return Number.isFinite(price) && price > 0 ? price : null;
  } catch {
    return null;
  } finally {
    inflightQuotes.delete(symbol);
  }
}

/**
 * Generates synthetic historical candlestick data with realistic geometric Brownian motion
 */
export function generateHistoricalCandles(
  symbol: string,
  count = 90,
  intervalMinutes = 60
): Candlestick[] {
  const meta = WATCHLIST[symbol] || {
    symbol,
    basePrice: 100,
    volatility: 0.3,
  };

  const candles: Candlestick[] = [];
  const now = Date.now();
  const stepMs = intervalMinutes * 60 * 1000;
  let currentPrice = meta.basePrice * (1 + (Math.random() - 0.5) * 0.1);

  const startTime = now - count * stepMs;

  for (let i = 0; i < count; i++) {
    const timestamp = startTime + i * stepMs;
    // Volatility drift
    const dt = 1 / (252 * (390 / intervalMinutes));
    const drift = 0.08 * dt; // 8% expected annual return
    const shock = meta.volatility * Math.sqrt(dt) * (Math.random() * 2 - 1);
    const returnPct = drift + shock;

    const open = currentPrice;
    const close = Math.max(1, Number((open * (1 + returnPct)).toFixed(2)));
    const spread = Math.abs(close - open);
    const wickHigh = spread * (0.3 + Math.random() * 0.8);
    const wickLow = spread * (0.3 + Math.random() * 0.8);

    const high = Number((Math.max(open, close) + wickHigh).toFixed(2));
    const low = Number((Math.max(0.5, Math.min(open, close) - wickLow)).toFixed(2));
    const volume = Math.floor(50000 + Math.random() * 250000 + spread * 100000);

    candles.push({
      timestamp,
      open,
      high,
      low,
      close,
      volume,
    });

    currentPrice = close;
  }

  return candles;
}

/**
 * Advances price with a single new tick/candle
 */
export function generateNextCandle(prevCandle: Candlestick, volatility = 0.3): Candlestick {
  const dt = 1 / (252 * 390);
  const shock = volatility * Math.sqrt(dt) * (Math.random() * 2 - 1);
  const open = prevCandle.close;
  const close = Number((open * (1 + shock)).toFixed(2));
  const diff = Math.abs(close - open);
  const high = Number((Math.max(open, close) + diff * Math.random()).toFixed(2));
  const low = Number((Math.max(1, Math.min(open, close) - diff * Math.random())).toFixed(2));
  const volume = Math.floor(10000 + Math.random() * 50000);

  return {
    timestamp: Date.now(),
    open,
    high,
    low,
    close,
    volume,
  };
}
