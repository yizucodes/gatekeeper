import { NextResponse } from 'next/server';
import { getConfig } from '@/lib/server/config';
import { getLatestSession, getSession, toSnapshot } from '@/lib/server/store';
import type { StateResponse } from '@/types/gatekeeper';

export const dynamic = 'force-dynamic';

// Dashboard polling endpoint: ?session=<id>, or the latest call when omitted.
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('session');
  const session = id ? getSession(id) : getLatestSession();
  const { publicBaseUrl } = getConfig();

  const body: StateResponse = {
    session: session ? toSnapshot(session) : null,
    callUrl: publicBaseUrl ? `${publicBaseUrl}/call` : null,
    serverTime: Date.now(),
  };
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
}
