import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const DATA_DIR = path.join(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'custom-tickers.json');

interface CustomTicker {
  symbol: string;
  name?: string;
  market?: 'US' | 'IN' | 'CUSTOM';
}

async function readList(): Promise<CustomTicker[]> {
  try {
    const parsed = JSON.parse(await fs.readFile(FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function GET() {
  return NextResponse.json(await readList());
}

// Body: { symbol, name?, market? } — appends, or updates an existing symbol
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const symbol = String(body?.symbol || '').toUpperCase().trim();
    if (!/^[A-Z0-9.\-&^]{1,20}$/.test(symbol)) {
      return NextResponse.json({ error: 'valid symbol required' }, { status: 400 });
    }
    const market: CustomTicker['market'] = body?.market === 'IN' || body?.market === 'US' ? body.market : 'CUSTOM';
    const entry: CustomTicker = { symbol, name: body?.name ? String(body.name).slice(0, 100) : symbol, market };

    const list = await readList();
    const idx = list.findIndex((t) => t.symbol === symbol);
    if (idx >= 0) list[idx] = entry;
    else list.push(entry);

    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(list, null, 2));
    return NextResponse.json(list);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to save' }, { status: 500 });
  }
}
