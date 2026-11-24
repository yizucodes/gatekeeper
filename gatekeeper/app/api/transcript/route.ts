import { NextResponse } from 'next/server';
import { scheduleScoring } from '@/lib/server/scoring';
import { addTranscript, getSession } from '@/lib/server/store';
import type { Speaker } from '@/types/gatekeeper';

const SPEAKERS: Speaker[] = ['caller', 'grandma', 'family'];
const MAX_TEXT_LENGTH = 2000;

// The browser forwards every text update of a turn here (optional turnId updates the line in place).
// Caller turns are scored (debounced) and fed to policy;
// grandma and family turns are dashboard-only.
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
  const speaker = body.speaker as Speaker;
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, MAX_TEXT_LENGTH) : '';
  const ts = typeof body.ts === 'number' && Number.isFinite(body.ts) ? body.ts : Date.now();

  if (!sessionId || !text || !SPEAKERS.includes(speaker)) {
    return NextResponse.json(
      { error: 'sessionId, speaker (caller|grandma|family) and text are required' },
      { status: 400 },
    );
  }

  const session = getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: 'Unknown session' }, { status: 404 });
  }

  const turnId =
    typeof body.turnId === 'string' && body.turnId.length > 0 ? body.turnId.slice(0, 64) : undefined;

  addTranscript(session, speaker, text, ts, turnId);
  if (speaker === 'caller') scheduleScoring(session);

  return NextResponse.json({ ok: true });
}
