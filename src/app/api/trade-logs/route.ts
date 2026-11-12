import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const DATA_DIR = path.join(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'trade-logs.json');
const MAX_LOGS = 200;

async function readLogs(): Promise<unknown[]> {
  try {
    const parsed = JSON.parse(await fs.readFile(FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function GET() {
  return NextResponse.json(await readLogs());
}

// Body: { logs: AgentLog[], mode?: 'replace' | 'append' } (or a bare array, treated as replace)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const incoming: unknown[] = Array.isArray(body) ? body : Array.isArray(body?.logs) ? body.logs : [];
    const mode = !Array.isArray(body) && body?.mode === 'append' ? 'append' : 'replace';
    const merged = mode === 'append' ? [...(await readLogs()), ...incoming] : incoming;
    const logs = merged.slice(-MAX_LOGS);

    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(logs, null, 2));
    return NextResponse.json({ saved: logs.length });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to save' }, { status: 500 });
  }
}
