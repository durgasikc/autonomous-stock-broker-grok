import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

  // Map common Indian tickers to Yahoo .NS suffix if needed
  let yahooSymbol = symbol.toUpperCase();
  const indianSymbols = ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'NIFTYBEES', 'WIPRO', 'SBIN', 'HINDUNILVR', 'ITC'];
  if (indianSymbols.includes(yahooSymbol) && !yahooSymbol.endsWith('.NS') && !yahooSymbol.endsWith('.BO')) {
    yahooSymbol = `${yahooSymbol}.NS`;
  }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1h&range=60d`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error(`Yahoo error ${res.status}`);
    const data = await res.json();

    const result = data.chart?.result?.[0];
    if (!result) throw new Error('No data');

    const timestamps = result.timestamp || [];
    const quote = result.indicators?.quote?.[0] || {};
    const candles = timestamps.map((ts: number, i: number) => ({
      timestamp: ts * 1000,
      open: quote.open?.[i] ?? 0,
      high: quote.high?.[i] ?? 0,
      low: quote.low?.[i] ?? 0,
      close: quote.close?.[i] ?? 0,
      volume: quote.volume?.[i] ?? 0,
    })).filter((c: any) => c.close > 0);

    const meta = result.meta || {};
    return NextResponse.json({
      symbol: symbol.toUpperCase(),
      yahooSymbol,
      currency: meta.currency || (yahooSymbol.endsWith('.NS') ? 'INR' : 'USD'),
      candles,
      regularMarketPrice: meta.regularMarketPrice,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch' }, { status: 500 });
  }
}
