import { NextResponse } from 'next/server';
import { guidanceFor } from '@/lib/server/guidance';
import { logTool, requireToolSecret, sessionFromRequest } from '@/lib/server/http';
import { RESULT_MAP, finishVerification } from '@/lib/server/outcome';

// Tool (Verifier): reportVerification. Idempotent: the first result wins.
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

  const result = typeof body?.result === 'string' ? body.result.trim() : '';
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 300) : '';
  const mapped = RESULT_MAP[result];

  // Log the raw arguments (no secrets): the exact tool payload is still TODO(VERIFY) in live runs.
  console.log(
    `[gatekeeper] reportVerification session=${session.id} result=${JSON.stringify(result)} note=${JSON.stringify(note)}`,
  );

  if (!mapped) {
    logTool('report-verification', session.id, 400, `unknown result ${JSON.stringify(result)}`);
    return NextResponse.json(
      { ok: false, error: `result must be one of: ${Object.keys(RESULT_MAP).join(', ')}` },
      { status: 400 },
    );
  }

  const applied = await finishVerification(session, mapped, note);
  logTool('report-verification', session.id, 200, applied ? mapped : `ignored, already=${session.verification}`);

  return NextResponse.json({
    ok: true,
    status: session.verification,
    guidance: applied
      ? 'Recorded. Thank the family member in one sentence, say the call is being handled, and stop talking.'
      : guidanceFor(session),
  });
}
