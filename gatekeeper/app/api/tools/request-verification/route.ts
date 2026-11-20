import { NextResponse } from 'next/server';
import { guidanceFor } from '@/lib/server/guidance';
import { logTool, requireToolSecret, sessionFromRequest } from '@/lib/server/http';
import { addEvent } from '@/lib/server/store';
import { startVerification } from '@/lib/server/verifier';
import { DEFAULT_GUIDANCE } from '@/lib/gatekeeper-shared';

const MAX_FIELD_LENGTH = 300;

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, MAX_FIELD_LENGTH) : '';
}

// Tool (Grandma): requestVerification. Idempotent: if verification already started, returns its state.
export async function POST(request: Request) {
  const denied = requireToolSecret(request);
  if (denied) return denied;

  const found = sessionFromRequest(request);
  if ('response' in found) return found.response;
  const { session } = found;

  let body: Record<string, unknown> | null = null;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = null;
  }

  const claimedIdentity = clean(body?.claimed_identity);
  const claimSummary = clean(body?.claim_summary);
  const toolCallId = clean(body?.tool_call_id) || undefined;

  if (!claimedIdentity || !claimSummary) {
    logTool('request-verification', session.id, 400, 'missing claimed_identity or claim_summary');
    return NextResponse.json(
      { ok: false, error: 'claimed_identity and claim_summary are required', guidance: DEFAULT_GUIDANCE },
      { status: 400 },
    );
  }

  // Log the arguments so the tool call is visible in the server log (Slice A acceptance check).
  console.log(
    `[gatekeeper] requestVerification session=${session.id} tool_call_id=${toolCallId ?? '-'} ` +
      `claimed_identity=${JSON.stringify(claimedIdentity)} claim_summary=${JSON.stringify(claimSummary)}`,
  );

  if (!session.claim) {
    session.claim = { claimedIdentity, claimSummary, toolCallId };
    addEvent(session, 'claim_recorded', `Caller says: ${claimedIdentity}`);
  }

  const started = await startVerification(session, 'tool');
  logTool('request-verification', session.id, 200, started ? 'started' : `already=${session.verification}`);

  if (session.verification === 'pending') {
    return NextResponse.json({
      ok: true,
      status: 'pending',
      guidance:
        'Tell the caller you need a moment to find your glasses. Keep them talking. Do not agree to anything.',
    });
  }
  return NextResponse.json({
    ok: true,
    status: session.verification,
    guidance: guidanceFor(session),
  });
}
