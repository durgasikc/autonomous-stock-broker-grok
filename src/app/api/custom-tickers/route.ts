import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const DATA_DIR = path.join(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'custom-tickers.json');
const HIDDEN_FILE = path.join(DATA_DIR, 'hidden-tickers.json'); // built-in tickers the user removed

const SYMBOL_RE = /^[A-Z0-9.\-&^]{1,20}$/;

interface CustomTicker {
  symbol: string;
  name?: string;
  market?: 'US' | 'IN' | 'CUSTOM';
}

async function readJsonArray<T>(file: string): Promise<T[]> {
  try {
    const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const readList = () => readJsonArray<CustomTicker>(FILE);
const readHidden = async () => (await readJsonArray<unknown>(HIDDEN_FILE)).filter((s): s is string => typeof s === 'string');

async function writeJson(file: string, data: unknown) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

// GET -> custom ticker array (unchanged). GET ?full=1 -> { tickers, hidden }
export async function GET(request: NextRequest) {
  const list = await readList();
  if (request.nextUrl.searchParams.get('full') === '1') {
    return NextResponse.json({ tickers: list, hidden: await readHidden() });
  }
  return NextResponse.json(list);
}

// Body: { symbol, name?, market? } — appends, or updates an existing symbol. Also un-hides it.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const symbol = String(body?.symbol || '').toUpperCase().trim();
    if (!SYMBOL_RE.test(symbol)) {
      return NextResponse.json({ error: 'valid symbol required' }, { status: 400 });
    }
    const market: CustomTicker['market'] = body?.market === 'IN' || body?.market === 'US' ? body.market : 'CUSTOM';
    const entry: CustomTicker = { symbol, name: body?.name ? String(body.name).slice(0, 100) : symbol, market };

    const list = await readList();
    const idx = list.findIndex((t) => t.symbol === symbol);
    if (idx >= 0) list[idx] = entry;
    else list.push(entry);
    await writeJson(FILE, list);

    const hidden = await readHidden();
    if (hidden.includes(symbol)) await writeJson(HIDDEN_FILE, hidden.filter((s) => s !== symbol));
    return NextResponse.json(list);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to save' }, { status: 500 });
  }
}

// DELETE ?symbol=X[&builtin=1] — removes a custom ticker permanently; builtin=1 also hides a built-in one.
export async function DELETE(request: NextRequest) {
  try {
    const symbol = String(request.nextUrl.searchParams.get('symbol') || '').toUpperCase().trim();
    if (!SYMBOL_RE.test(symbol)) {
      return NextResponse.json({ error: 'valid symbol required' }, { status: 400 });
    }
    const list = await readList();
    const next = list.filter((t) => t.symbol !== symbol);
    if (next.length !== list.length) await writeJson(FILE, next);

    let hidden = await readHidden();
    if (request.nextUrl.searchParams.get('builtin') === '1' && !hidden.includes(symbol)) {
      hidden = [...hidden, symbol];
      await writeJson(HIDDEN_FILE, hidden);
    }
    return NextResponse.json({ tickers: next, hidden, removed: symbol });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to remove' }, { status: 500 });
  }
}
