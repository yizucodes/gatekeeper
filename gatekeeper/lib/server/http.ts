import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { DEFAULT_GUIDANCE } from '@/lib/gatekeeper-shared';
import type { Session } from '@/types/gatekeeper';
import { getConfig, toolsDisabledReason } from './config';
import { getSession } from './store';

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// All /api/tools/* routes call this first. Returns a response to send, or null if the secret matches.
export function requireToolSecret(request: Request): NextResponse | null {
  const { toolSecret } = getConfig();
  if (!toolSecret || toolSecret === 'change-me') {
    return NextResponse.json(
      { error: toolsDisabledReason() ?? 'TOOL_SECRET not configured', guidance: DEFAULT_GUIDANCE },
      { status: 503 },
    );
  }
  const provided = request.headers.get('x-tool-secret') ?? '';
  if (!safeEqual(provided, toolSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

// Resolves ?session=<id>. On failure returns a 404 that still carries safe default guidance.
export function sessionFromRequest(
  request: Request,
): { session: Session } | { response: NextResponse } {
  const id = new URL(request.url).searchParams.get('session');
  const session = getSession(id);
  if (!session) {
    return {
      response: NextResponse.json(
        { error: 'Unknown session', guidance: DEFAULT_GUIDANCE },
        { status: 404 },
      ),
    };
  }
  return { session };
}

export function logTool(route: string, sessionId: string, status: number, extra?: string) {
  console.log(
    `[gatekeeper] tool ${route} session=${sessionId} status=${status}${extra ? ` ${extra}` : ''}`,
  );
}
