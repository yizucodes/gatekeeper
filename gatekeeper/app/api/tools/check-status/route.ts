import { NextResponse } from 'next/server';
import { buildStatus } from '@/lib/server/guidance';
import { logTool, requireToolSecret, sessionFromRequest } from '@/lib/server/http';

// Tool (Grandma): checkStatus. Returns risk level, verification state and action-only guidance.
export async function GET(request: Request) {
  const denied = requireToolSecret(request);
  if (denied) return denied;

  const found = sessionFromRequest(request);
  if ('response' in found) return found.response;

  const status = buildStatus(found.session);
  logTool(
    'check-status',
    found.session.id,
    200,
    `risk=${status.risk_level} verification=${status.verification}`,
  );
  return NextResponse.json(status);
}
