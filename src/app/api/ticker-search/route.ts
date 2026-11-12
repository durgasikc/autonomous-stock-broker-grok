import { NextRequest, NextResponse } from 'next/server';

export interface TickerSuggestion {
  symbol: string;
  shortname: string;
  exchange: string;
  exchDisp?: string;
  quoteType: string;
}

const ALLOWED_TYPES = new Set(['EQUITY', 'ETF', 'INDEX']);

/**
 * Proxies Yahoo Finance symbol search (no API key) for the "Add ticker" autocomplete.
 * GET /api/ticker-search?q=relia -> [{symbol, shortname, exchange, exchDisp, quoteType}]
 */
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get('q') || '').trim();
  if (q.length < 2 || q.length > 40 || !/^[\p{L}\p{N} .\-&^=']+$/u.test(q)) {
    return NextResponse.json({ error: 'q must be 2-40 characters (letters, digits, space . - & ^ = \')' }, { status: 400 });
  }

  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0&listsCount=0&enableFuzzyQuery=false`;
    // Short UA on purpose: a full desktop-browser UA string gets HTTP 429 from Yahoo
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 300 } });
    if (!res.ok) throw new Error(`Yahoo error ${res.status}`);
    const data = await res.json();
    const quotes: any[] = Array.isArray(data?.quotes) ? data.quotes : [];
    const results: TickerSuggestion[] = quotes
      .filter((x) => x?.symbol && ALLOWED_TYPES.has(String(x.quoteType).toUpperCase()))
      .map((x) => ({
        symbol: String(x.symbol).toUpperCase(),
        shortname: String(x.shortname || x.longname || x.symbol),
        exchange: String(x.exchange || ''),
        exchDisp: x.exchDisp ? String(x.exchDisp) : undefined,
        quoteType: String(x.quoteType).toUpperCase(),
      }));
    return NextResponse.json(results, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' } });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Search failed' }, { status: 502 });
  }
}
