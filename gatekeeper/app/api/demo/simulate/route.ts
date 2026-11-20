import { NextResponse } from 'next/server';
import { demoModeEnabled } from '@/lib/server/config';
import { RESULT_MAP, finishVerification } from '@/lib/server/outcome';
import { scheduleScoring } from '@/lib/server/scoring';
import { addEvent, addTranscript, getLatestSession, getSession } from '@/lib/server/store';
import { startVerification } from '@/lib/server/verifier';

const MAX_TEXT_LENGTH = 500;

// Operator fallback for a live demo that misbehaves. Every accepted action is counted in
// session.manualInterventions and logged as an event, so the dashboard stays honest about
// how much of a run was automatic. Disabled unless DEMO_MODE=true.
export async function POST(request: Request) {
  if (!demoModeEnabled()) {
    return NextResponse.json({ error: 'Demo controls are disabled (set DEMO_MODE=true)' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const sessionId = typeof body.session === 'string' ? body.session : undefined;
  const session = sessionId ? getSession(sessionId) : getLatestSession();
  if (!session) {
    return NextResponse.json({ error: 'No active session' }, { status: 404 });
  }

  const action = body.action;
  if (action === 'caller_line') {
    const text = typeof body.text === 'string' ? body.text.trim().slice(0, MAX_TEXT_LENGTH) : '';
    if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 });
    addTranscript(session, 'caller', text);
    scheduleScoring(session);
    addEvent(session, 'manual_intervention', 'Operator injected a caller line');
  } else if (action === 'start_verification') {
    const started = await startVerification(session, 'tool');
    if (!started) {
      return NextResponse.json({ error: `Verification already ${session.verification}` }, { status: 409 });
    }
    addEvent(session, 'manual_intervention', 'Operator started verification');
  } else if (action === 'verify_result') {
    const mapped = typeof body.result === 'string' ? RESULT_MAP[body.result] : undefined;
    if (!mapped) {
      return NextResponse.json(
        { error: `result must be one of: ${Object.keys(RESULT_MAP).join(', ')}` },
        { status: 400 },
      );
    }
    const applied = await finishVerification(session, mapped, 'Set by operator');
    if (!applied) {
      return NextResponse.json({ error: `Verification already ${session.verification}` }, { status: 409 });
    }
    addEvent(session, 'manual_intervention', `Operator set the verification result: ${mapped}`);
  } else {
    return NextResponse.json(
      { error: 'action must be caller_line, start_verification or verify_result' },
      { status: 400 },
    );
  }

  session.manualInterventions += 1;
  return NextResponse.json({ ok: true, manualInterventions: session.manualInterventions });
}
