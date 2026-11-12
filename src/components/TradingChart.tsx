'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Candlestick, Order, TechnicalIndicators } from '../types';
import { WATCHLIST, addCustomTicker, tickersForMarket } from '../lib/marketData';
import type { StockMetadata } from '../lib/marketData';
import type { TickerSuggestion } from '../app/api/ticker-search/route';
import {
  calculateSMA,
  calculateEMA,
  calculateBollingerBands,
  computeAllIndicators,
} from '../lib/indicators';
import { Eye, EyeOff, TrendingUp, TrendingDown, Crosshair } from 'lucide-react';

interface TradingChartProps {
  symbol: string;
  onSelectSymbol: (sym: string) => void;
  candles: Candlestick[];
  orders: Order[];
  latestIndicators: TechnicalIndicators;
  currencySymbol?: string;
  market: 'US' | 'IN';
  onChangeMarket: (market: 'US' | 'IN') => void;
  onTickerAdded?: (meta: StockMetadata) => void;
  dataStatus?: 'loading' | 'ok' | 'error';
  streamStatus?: 'connecting' | 'open' | 'reconnecting' | 'closed';
  liveFeed?: { error?: string; source?: 'stream' | 'poll'; marketState?: string; at?: number };
}

export const TradingChart: React.FC<TradingChartProps> = ({
  symbol,
  onSelectSymbol,
  candles,
  orders,
  latestIndicators,
  currencySymbol = '$',
  market,
  onChangeMarket,
  onTickerAdded,
  dataStatus,
  streamStatus,
  liveFeed,
}) => {
  const [showBB, setShowBB] = useState(true);
  const [showEMA, setShowEMA] = useState(true);
  const [showSMA, setShowSMA] = useState(true);
  const [timeframe, setTimeframe] = useState<'1m' | '5m' | '1h' | '1D'>('1h');
  const [hoveredCandle, setHoveredCandle] = useState<Candlestick | null>(null);
  const [newTicker, setNewTicker] = useState('');

  const handleAddTicker = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = newTicker.trim();
    if (!raw) return;
    const meta = addCustomTicker(raw, undefined, market);
    setNewTicker('');
    setSuggestOpen(false);
    onTickerAdded?.(meta);
    onSelectSymbol(meta.symbol);
  };

  // ---- Add-ticker autocomplete (Yahoo Finance search via /api/ticker-search) ----
  const [suggestions, setSuggestions] = useState<TickerSuggestion[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchAbortRef = useRef<AbortController | null>(null);

  // Debounced (300ms) search after >= 2 chars; stale requests are aborted
  useEffect(() => {
    const q = newTicker.trim();
    if (q.length < 2) {
      searchAbortRef.current?.abort();
      setSuggestions([]);
      setSuggestOpen(false);
      setSuggestLoading(false);
      return;
    }
    const timer = setTimeout(async () => {
      searchAbortRef.current?.abort();
      const ctrl = new AbortController();
      searchAbortRef.current = ctrl;
      setSuggestLoading(true);
      try {
        const res = await fetch(`/api/ticker-search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        const data = res.ok ? await res.json() : [];
        if (ctrl.signal.aborted) return;
        setSuggestions(Array.isArray(data) ? data : []);
        setHighlight(-1);
        if (document.activeElement === inputRef.current) setSuggestOpen(true);
      } catch {
        if (!ctrl.signal.aborted) setSuggestions([]);
      } finally {
        if (!ctrl.signal.aborted) setSuggestLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [newTicker]);

  // Position the dropdown with fixed coords (the toolbar scrolls horizontally and would clip it)
  useEffect(() => {
    if (!suggestOpen) return;
    const place = () => {
      const r = inputRef.current?.getBoundingClientRect();
      if (r) setDropdownPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 300) });
    };
    place();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!inputRef.current?.contains(t) && !dropdownRef.current?.contains(t)) setSuggestOpen(false);
    };
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('mousedown', onDown);
    };
  }, [suggestOpen]);

  // Add a picked suggestion directly: .NS / .BO -> strip suffix and add as Indian (IN); else US
  const addSuggestion = (sug: TickerSuggestion) => {
    // NSE/BSE indices (e.g. ^NSEI) have no suffix but are Indian too; they keep their ^ symbol
    const isIndian = /\.(NS|BO)$/i.test(sug.symbol) || sug.exchange === 'NSI' || sug.exchange === 'BSE';
    const base = sug.symbol.replace(/\.(NS|BO)$/i, '').toUpperCase();
    const mkt: 'US' | 'IN' = isIndian ? 'IN' : 'US';
    const meta = addCustomTicker(base, sug.shortname, mkt);
    setNewTicker('');
    setSuggestions([]);
    setSuggestOpen(false);
    searchAbortRef.current?.abort();
    onTickerAdded?.(meta);
    if (mkt !== market) onChangeMarket(mkt); // show it under the matching US / IND list
    onSelectSymbol(meta.symbol);
  };

  const handleTickerKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setSuggestOpen(false);
      return;
    }
    if (!suggestOpen || suggestions.length === 0) {
      if (e.key === 'ArrowDown' && suggestions.length > 0) {
        e.preventDefault();
        setSuggestOpen(true);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => (h + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => (h <= 0 ? suggestions.length - 1 : h - 1));
    } else if (e.key === 'Enter' && highlight >= 0 && suggestions[highlight]) {
      e.preventDefault(); // pick the suggestion instead of submitting the typed text
      addSuggestion(suggestions[highlight]);
    }
  };

  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 420 });

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: 420,
        });
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const currentCandle = candles[candles.length - 1];
  const firstCandle = candles[0];
  const priceChange = currentCandle && firstCandle ? currentCandle.close - firstCandle.open : 0;
  const priceChangePct = firstCandle ? (priceChange / firstCandle.open) * 100 : 0;
  const isUp = priceChange >= 0;

  // Chart coordinate mapping
  const chartData = useMemo(() => {
    if (candles.length === 0) return null;

    const closes = candles.map((c) => c.close);
    const bb = calculateBollingerBands(closes, 20, 2);
    const ema9 = calculateEMA(closes, 9);
    const ema21 = calculateEMA(closes, 21);
    const sma50 = calculateSMA(closes, 50);

    let minPrice = Infinity;
    let maxPrice = -Infinity;
    let maxVol = 0;

    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      if (c.low < minPrice) minPrice = c.low;
      if (c.high > maxPrice) maxPrice = c.high;
      if (c.volume > maxVol) maxVol = c.volume;

      if (showBB && bb.upper[i]) {
        if (bb.upper[i] > maxPrice) maxPrice = bb.upper[i];
        if (bb.lower[i] < minPrice) minPrice = bb.lower[i];
      }
    }

    // Add padding to price range
    const priceRange = maxPrice - minPrice || 1;
    minPrice -= priceRange * 0.05;
    maxPrice += priceRange * 0.05;

    return {
      minPrice,
      maxPrice,
      maxVol: maxVol || 1,
      bb,
      ema9,
      ema21,
      sma50,
    };
  }, [candles, showBB]);

  const { width, height } = dimensions;
  const paddingRight = 65;
  const paddingBottom = 45;
  const paddingTop = 20;
  const plotWidth = Math.max(100, width - paddingRight);
  const plotHeight = Math.max(100, height - paddingBottom - paddingTop);

  const candleWidth = Math.max(2, (plotWidth / Math.max(1, candles.length)) * 0.7);
  const candleGap = plotWidth / Math.max(1, candles.length);

  const getY = (val: number) => {
    if (!chartData) return 0;
    const { minPrice, maxPrice } = chartData;
    const ratio = (val - minPrice) / (maxPrice - minPrice || 1);
    return paddingTop + (1 - ratio) * (plotHeight - 40); // 40px reserved for volume
  };

  const getVolY = (vol: number) => {
    if (!chartData) return plotHeight + paddingTop;
    const ratio = vol / chartData.maxVol;
    const volHeight = ratio * 35;
    return paddingTop + plotHeight - volHeight;
  };

  // Filter orders matching current symbol
  const symbolOrders = orders.filter((o) => o.symbol === symbol && o.status === 'FILLED');

  return (
    <div className="bg-broker-card border border-broker-border rounded-lg overflow-hidden flex flex-col h-full select-none">
      {/* Top Bar: Stock Selector & Ticker Details */}
      <div className="border-b border-broker-border px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 bg-[#0f1420]">
        {/* Watchlist Quick Switcher */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {/* Market switcher */}
          <div className="flex items-center rounded border border-broker-border overflow-hidden mr-1 shrink-0">
            {(['US', 'IN'] as const).map((m) => (
              <button
                key={m}
                onClick={() => onChangeMarket(m)}
                className={`px-2 py-1 text-[11px] font-semibold font-mono transition-all ${
                  market === m ? 'bg-cyan-500/25 text-cyan-200' : 'bg-[#151b29] text-slate-400 hover:text-slate-200'
                }`}
              >
                {m === 'US' ? 'US $' : 'IND ₹'}
              </button>
            ))}
          </div>
          {tickersForMarket(market).map((ticker) => {
            const isSelected = ticker === symbol;
            return (
              <button
                key={ticker}
                onClick={() => onSelectSymbol(ticker)}
                className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition-all ${
                  isSelected
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                    : 'bg-[#151b29] hover:bg-[#1c2438] text-slate-400 border border-transparent'
                }`}
              >
                {ticker}
                {WATCHLIST[ticker]?.market && (
                  <span
                    className={`ml-1 text-[9px] px-1 rounded ${
                      WATCHLIST[ticker].market === 'IN'
                        ? 'bg-orange-500/20 text-orange-300'
                        : WATCHLIST[ticker].market === 'US'
                        ? 'bg-blue-500/20 text-blue-300'
                        : 'bg-slate-600/30 text-slate-300'
                    }`}
                  >
                    {WATCHLIST[ticker].market === 'CUSTOM' ? 'C' : WATCHLIST[ticker].market}
                  </span>
                )}
              </button>
            );
          })}
          <form onSubmit={handleAddTicker} className="flex items-center gap-1 ml-1 shrink-0">
            <input
              ref={inputRef}
              value={newTicker}
              onChange={(e) => setNewTicker(e.target.value)}
              onKeyDown={handleTickerKeyDown}
              onFocus={() => suggestions.length > 0 && newTicker.trim().length >= 2 && setSuggestOpen(true)}
              onBlur={() => setSuggestOpen(false)}
              role="combobox"
              aria-expanded={suggestOpen}
              aria-autocomplete="list"
              autoComplete="off"
              spellCheck={false}
              placeholder="Add ticker e.g. GOOGL or WIPRO"
              className="w-48 px-2 py-1 rounded text-xs font-mono bg-[#151b29] border border-broker-border text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/60"
            />
            <button
              type="submit"
              className="px-2.5 py-1 rounded text-xs font-medium bg-cyan-600/30 text-cyan-200 border border-cyan-500/40 hover:bg-cyan-600/50"
            >
              Add
            </button>
            {suggestOpen && dropdownPos && (suggestions.length > 0 || suggestLoading) && (
              <div
                ref={dropdownRef}
                role="listbox"
                style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width }}
                className="z-50 max-h-72 overflow-y-auto rounded-md border border-broker-border bg-[#0b101b] shadow-xl shadow-black/60 py-1 font-mono text-xs"
              >
                {suggestions.length === 0 && suggestLoading && (
                  <div className="px-3 py-2 text-slate-500">Searching…</div>
                )}
                {suggestions.map((sug, i) => {
                  const indian = /\.(NS|BO)$/i.test(sug.symbol) || sug.exchange === 'NSI' || sug.exchange === 'BSE';
                  return (
                    <div
                      key={sug.symbol}
                      role="option"
                      aria-selected={i === highlight}
                      onMouseDown={(e) => e.preventDefault()} // keep input focus so blur doesn't close first
                      onClick={() => addSuggestion(sug)}
                      onMouseEnter={() => setHighlight(i)}
                      className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer ${
                        i === highlight ? 'bg-cyan-500/15 text-white' : 'text-slate-300 hover:bg-slate-800/60'
                      }`}
                    >
                      <span className="w-24 shrink-0 font-semibold text-cyan-200 truncate">{sug.symbol}</span>
                      <span className="flex-1 truncate text-slate-400 font-sans">{sug.shortname}</span>
                      {sug.quoteType !== 'EQUITY' && (
                        <span className="text-[9px] px-1 rounded bg-purple-500/20 text-purple-300">{sug.quoteType}</span>
                      )}
                      <span
                        className={`text-[9px] px-1 rounded shrink-0 ${
                          indian ? 'bg-orange-500/20 text-orange-300' : 'bg-blue-500/20 text-blue-300'
                        }`}
                        title={sug.exchDisp || sug.exchange}
                      >
                        {indian ? 'IN · ' : ''}{sug.exchDisp || sug.exchange}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </form>
        </div>

        {/* Live Price and Return */}
        <div className="flex items-center gap-3">
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold font-mono text-white">
              {currencySymbol}{currentCandle ? currentCandle.close.toFixed(2) : '---'}
            </span>
            <span
              className={`text-xs font-mono font-semibold flex items-center gap-0.5 ${
                isUp ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {isUp ? '+' : ''}{currencySymbol}{priceChange.toFixed(2)} ({isUp ? '+' : ''}
              {priceChangePct.toFixed(2)}%)
            </span>
          </div>

          {/* WebSocket live-feed status */}
          <span
            title={
              liveFeed?.error ||
              (liveFeed?.at ? `Last update ${new Date(liveFeed.at).toLocaleTimeString()} (${liveFeed.source})` : 'WebSocket live feed')
            }
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded border whitespace-nowrap ${
              liveFeed?.error
                ? 'text-rose-300 border-rose-500/40 bg-rose-500/10'
                : streamStatus === 'open'
                ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10'
                : 'text-amber-300 border-amber-500/40 bg-amber-500/10'
            }`}
          >
            {liveFeed?.error
              ? 'LIVE FEED UNAVAILABLE'
              : streamStatus === 'open'
              ? `● LIVE${liveFeed?.source === 'poll' ? ' · SNAPSHOT' : ''}${
                  liveFeed?.marketState && liveFeed.marketState !== 'REGULAR' ? ` · ${liveFeed.marketState}` : ''
                }`
              : streamStatus === 'reconnecting'
              ? 'RECONNECTING…'
              : 'CONNECTING…'}
          </span>

          {/* Timeframe & Overlays */}
          <div className="flex items-center gap-1 border-l border-broker-border pl-3">
            {(['1m', '5m', '1h', '1D'] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-2 py-0.5 text-[11px] rounded font-mono ${
                  timeframe === tf ? 'bg-slate-700 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          {/* Overlay Toggles */}
          <div className="hidden lg:flex items-center gap-1 border-l border-broker-border pl-2 text-xs">
            <button
              onClick={() => setShowBB(!showBB)}
              className={`px-2 py-0.5 rounded text-[11px] font-mono border ${
                showBB ? 'bg-blue-950/60 text-blue-300 border-blue-800' : 'bg-transparent text-slate-500 border-slate-800'
              }`}
            >
              BB(20,2)
            </button>
            <button
              onClick={() => setShowEMA(!showEMA)}
              className={`px-2 py-0.5 rounded text-[11px] font-mono border ${
                showEMA ? 'bg-cyan-950/60 text-cyan-300 border-cyan-800' : 'bg-transparent text-slate-500 border-slate-800'
              }`}
            >
              EMA(9/21)
            </button>
            <button
              onClick={() => setShowSMA(!showSMA)}
              className={`px-2 py-0.5 rounded text-[11px] font-mono border ${
                showSMA ? 'bg-purple-950/60 text-purple-300 border-purple-800' : 'bg-transparent text-slate-500 border-slate-800'
              }`}
            >
              SMA(50)
            </button>
          </div>
        </div>
      </div>

      {/* Main Candlestick Chart Area */}
      <div ref={containerRef} className="relative flex-1 min-h-[380px] bg-[#090d16] p-2">
        {candles.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-sm font-mono text-slate-400">
            {dataStatus === 'error' ? (
              <>
                <span className="text-rose-400">Live data unavailable for this symbol</span>
                <span className="text-xs text-slate-500">{symbol}: no candles returned from Yahoo Finance</span>
              </>
            ) : (
              <span>Loading live data for {symbol}…</span>
            )}
          </div>
        )}
        {chartData && (
          <svg
            width={width}
            height={height}
            className="overflow-visible"
            onMouseLeave={() => setHoveredCandle(null)}
          >
            <defs>
              <linearGradient id="bbGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.12" />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
              </linearGradient>
            </defs>

            {/* Horizontal Grid Lines & Price Labels */}
            {[0.1, 0.3, 0.5, 0.7, 0.9].map((pct, idx) => {
              const priceVal = chartData.minPrice + (chartData.maxPrice - chartData.minPrice) * (1 - pct);
              const y = paddingTop + pct * (plotHeight - 40);
              return (
                <g key={idx}>
                  <line
                    x1={0}
                    y1={y}
                    x2={plotWidth}
                    y2={y}
                    stroke="#162032"
                    strokeDasharray="3 3"
                    strokeWidth={1}
                  />
                  <text
                    x={plotWidth + 8}
                    y={y + 3}
                    fill="#64748b"
                    fontSize="10"
                    fontFamily="monospace"
                  >
                    {currencySymbol}{priceVal.toFixed(2)}
                  </text>
                </g>
              );
            })}

            {/* Bollinger Bands Shaded Area */}
            {showBB && (
              <polygon
                points={
                  candles
                    .map((_, i) => `${i * candleGap + candleGap / 2},${getY(chartData.bb.upper[i])}`)
                    .join(' ') +
                  ' ' +
                  candles
                    .slice()
                    .reverse()
                    .map(
                      (_, revIdx) => {
                        const i = candles.length - 1 - revIdx;
                        return `${i * candleGap + candleGap / 2},${getY(chartData.bb.lower[i])}`;
                      }
                    )
                    .join(' ')
                }
                fill="url(#bbGradient)"
                stroke="none"
              />
            )}

            {/* Bollinger Bands Upper / Lower Lines */}
            {showBB && (
              <>
                <polyline
                  points={candles
                    .map((_, i) => `${i * candleGap + candleGap / 2},${getY(chartData.bb.upper[i])}`)
                    .join(' ')}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="1"
                  strokeOpacity="0.4"
                  strokeDasharray="2 2"
                />
                <polyline
                  points={candles
                    .map((_, i) => `${i * candleGap + candleGap / 2},${getY(chartData.bb.lower[i])}`)
                    .join(' ')}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="1"
                  strokeOpacity="0.4"
                  strokeDasharray="2 2"
                />
              </>
            )}

            {/* SMA 50 Line */}
            {showSMA && (
              <polyline
                points={candles
                  .map((_, i) => `${i * candleGap + candleGap / 2},${getY(chartData.sma50[i])}`)
                  .join(' ')}
                fill="none"
                stroke="#a855f7"
                strokeWidth="1.5"
                strokeOpacity="0.75"
              />
            )}

            {/* EMA 21 Line */}
            {showEMA && (
              <polyline
                points={candles
                  .map((_, i) => `${i * candleGap + candleGap / 2},${getY(chartData.ema21[i])}`)
                  .join(' ')}
                fill="none"
                stroke="#f59e0b"
                strokeWidth="1.5"
                strokeOpacity="0.8"
              />
            )}

            {/* EMA 9 Line */}
            {showEMA && (
              <polyline
                points={candles
                  .map((_, i) => `${i * candleGap + candleGap / 2},${getY(chartData.ema9[i])}`)
                  .join(' ')}
                fill="none"
                stroke="#06b6d4"
                strokeWidth="1.5"
                strokeOpacity="0.9"
              />
            )}

            {/* Volume Bars */}
            {candles.map((c, i) => {
              const x = i * candleGap + (candleGap - candleWidth) / 2;
              const y = getVolY(c.volume);
              const barH = paddingTop + plotHeight - y;
              const isBull = c.close >= c.open;
              return (
                <rect
                  key={`vol_${i}`}
                  x={x}
                  y={y}
                  width={candleWidth}
                  height={barH}
                  fill={isBull ? '#059669' : '#dc2626'}
                  opacity={0.3}
                />
              );
            })}

            {/* Candlesticks (Wick + Body) */}
            {candles.map((c, i) => {
              const x = i * candleGap + (candleGap - candleWidth) / 2;
              const centerX = x + candleWidth / 2;
              const openY = getY(c.open);
              const closeY = getY(c.close);
              const highY = getY(c.high);
              const lowY = getY(c.low);

              const isBull = c.close >= c.open;
              const bodyTop = Math.min(openY, closeY);
              const bodyHeight = Math.max(2, Math.abs(closeY - openY));

              const color = isBull ? '#10b981' : '#ef4444';

              return (
                <g
                  key={`candle_${i}`}
                  className="cursor-crosshair"
                  onMouseEnter={() => setHoveredCandle(c)}
                >
                  {/* High/Low Wick */}
                  <line
                    x1={centerX}
                    y1={highY}
                    x2={centerX}
                    y2={lowY}
                    stroke={color}
                    strokeWidth={1.2}
                  />
                  {/* Open/Close Body */}
                  <rect
                    x={x}
                    y={bodyTop}
                    width={candleWidth}
                    height={bodyHeight}
                    fill={color}
                    stroke={color}
                    strokeWidth={1}
                    rx={1}
                  />
                </g>
              );
            })}

            {/* Live Price Horizontal Line */}
            {currentCandle && (
              <g>
                <line
                  x1={0}
                  y1={getY(currentCandle.close)}
                  x2={plotWidth}
                  y2={getY(currentCandle.close)}
                  stroke="#38bdf8"
                  strokeDasharray="2 2"
                  strokeWidth={1}
                />
                <rect
                  x={plotWidth + 4}
                  y={getY(currentCandle.close) - 9}
                  width={56}
                  height={18}
                  fill="#0284c7"
                  rx={2}
                />
                <text
                  x={plotWidth + 8}
                  y={getY(currentCandle.close) + 4}
                  fill="#ffffff"
                  fontSize="10"
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  {currencySymbol}{currentCandle.close.toFixed(2)}
                </text>
              </g>
            )}

            {/* Autonomous Execution Markers (BUY / SELL arrows) */}
            {symbolOrders.slice(-5).map((order, idx) => {
              const fillPrice = order.filledPrice || 100;
              const y = getY(fillPrice);
              const x = plotWidth - 30 - idx * 45;
              const isBuy = order.side === 'BUY';

              return (
                <g key={`marker_${order.id}`}>
                  <circle
                    cx={x}
                    cy={y}
                    r={6}
                    fill={isBuy ? '#10b981' : '#ef4444'}
                    stroke="#0b0f19"
                    strokeWidth={2}
                  />
                  <text
                    x={x}
                    y={isBuy ? y - 10 : y + 16}
                    textAnchor="middle"
                    fill={isBuy ? '#34d399' : '#f87171'}
                    fontSize="9"
                    fontFamily="monospace"
                    fontWeight="bold"
                  >
                    {isBuy ? '▲ BUY' : '▼ SELL'}
                  </text>
                </g>
              );
            })}
          </svg>
        )}

        {/* Hover Information HUD */}
        {hoveredCandle && (
          <div className="absolute top-3 left-4 bg-[#111726]/95 border border-cyan-800/50 p-2.5 rounded-md text-xs font-mono backdrop-blur-sm shadow-xl flex items-center gap-4 text-slate-300">
            <div>
              <span className="text-slate-500">O: </span>
              <strong className="text-white">{currencySymbol}{hoveredCandle.open.toFixed(2)}</strong>
            </div>
            <div>
              <span className="text-slate-500">H: </span>
              <strong className="text-emerald-400">{currencySymbol}{hoveredCandle.high.toFixed(2)}</strong>
            </div>
            <div>
              <span className="text-slate-500">L: </span>
              <strong className="text-rose-400">{currencySymbol}{hoveredCandle.low.toFixed(2)}</strong>
            </div>
            <div>
              <span className="text-slate-500">C: </span>
              <strong className="text-white">{currencySymbol}{hoveredCandle.close.toFixed(2)}</strong>
            </div>
            <div>
              <span className="text-slate-500">Vol: </span>
              <strong className="text-slate-200">{(hoveredCandle.volume / 1000).toFixed(1)}K</strong>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Technical Indicators Ribbon */}
      <div className="border-t border-broker-border px-4 py-2 bg-[#0c101a] flex flex-wrap items-center justify-between gap-4 text-xs font-mono text-slate-400">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">RSI(14):</span>
            <span
              className={`font-semibold ${
                latestIndicators.rsi < 35
                  ? 'text-emerald-400'
                  : latestIndicators.rsi > 65
                  ? 'text-rose-400'
                  : 'text-slate-200'
              }`}
            >
              {latestIndicators.rsi}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">MACD:</span>
            <span className="text-cyan-400">{latestIndicators.macd.macdLine}</span>
            <span className="text-slate-600">/</span>
            <span className="text-amber-400">{latestIndicators.macd.signalLine}</span>
            <span
              className={`text-[10px] px-1 rounded ${
                latestIndicators.macd.histogram >= 0
                  ? 'bg-emerald-950 text-emerald-400'
                  : 'bg-rose-950 text-rose-400'
              }`}
            >
              {latestIndicators.macd.histogram >= 0 ? '+' : ''}
              {latestIndicators.macd.histogram}
            </span>
          </div>

          <div className="hidden md:flex items-center gap-1.5">
            <span className="text-slate-500">ATR(14):</span>
            <span className="text-slate-200">{currencySymbol}{latestIndicators.atr}</span>
          </div>
        </div>

        {/* Legend */}
        <div className="hidden lg:flex items-center gap-3 text-[11px]">
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-0.5 bg-cyan-400 inline-block" />
            <span className="text-slate-400">EMA 9</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-0.5 bg-amber-400 inline-block" />
            <span className="text-slate-400">EMA 21</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-0.5 bg-purple-400 inline-block" />
            <span className="text-slate-400">SMA 50</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-0.5 bg-blue-500 inline-block border-b border-dashed" />
            <span className="text-slate-400">Bollinger Bands</span>
          </div>
        </div>
      </div>
    </div>
  );
};
