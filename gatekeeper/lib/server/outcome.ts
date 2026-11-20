import type { Session, Verification } from '@/types/gatekeeper';
import { agoraClient, requireEnv, stopAgentSafe } from './agents';
import { closingLine } from './guidance';
import { addEvent, setVerification } from './store';

// Everything that happens once verification has a result. Used by the reportVerification tool,
// the watchdog, and the demo simulate route, so all paths behave the same.

const VERIFIER_STOP_DELAY_MS = 6000;

type Resolved = Exclude<Verification, 'none' | 'pending'>;

// Verifier result (reportVerification tool argument) -> session verification state.
export const RESULT_MAP: Record<string, Resolved> = {
  family_safe_did_not_call: 'confirmed_safe_family_not_caller',
  family_confirms_they_called: 'family_confirms_call',
  unclear: 'unreachable',
};

const EVENT_LABELS: Record<Resolved, { type: string; detail: string }> = {
  confirmed_safe_family_not_caller: {
    type: 'family_reached',
    detail: 'Family reached: safe, did not make the call',
  },
  family_confirms_call: {
    type: 'family_reached',
    detail: 'Family reached: says they made the call',
  },
  unreachable: {
    type: 'verification_unclear',
    detail: 'Family could not confirm',
  },
};

// Push Grandma's closing line to the running agent. If this fails (for example the agent already
// left) Grandma still gets the same guidance from checkStatus on her next turn.
// TODO(VERIFY): whether the speak endpoint is accepted while the LLM is mid tool-call.
export async function speakClosingLine(session: Session): Promise<boolean> {
  const text = closingLine(session.verification);
  const agentId = session.grandmaAgentId;
  if (!text || !agentId || session.endedAt) return false;
  try {
    const client = agoraClient();
    await client.agents.speak({
      appid: requireEnv('NEXT_PUBLIC_AGORA_APP_ID'),
      agentId,
      text,
      priority: 'INTERRUPT',
      interruptable: false,
    });
    addEvent(session, 'grandma_closing', 'Grandma told the caller the family checked');
    return true;
  } catch (error) {
    console.warn(
      `[gatekeeper] ${session.id} closing line via speak failed; relying on checkStatus guidance`,
      error,
    );
    addEvent(session, 'closing_fallback', 'Closing line will be delivered through checkStatus');
    return false;
  }
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();

export function clearWatchdog(sessionId: string) {
  const timer = timers.get(sessionId);
  if (timer) clearTimeout(timer);
  timers.delete(sessionId);
}

export function armWatchdog(session: Session, ms: number) {
  clearWatchdog(session.id);
  const timer = setTimeout(() => {
    timers.delete(session.id);
    if (session.verification === 'pending') {
      void finishVerification(session, 'unreachable', 'No answer from family in time');
    }
  }, ms);
  timer.unref?.();
  timers.set(session.id, timer);
}

export async function stopVerifier(session: Session): Promise<void> {
  const agentId = session.verifierAgentId;
  if (!agentId || agentId === 'harness-verifier') return; // harness sessions have no real agent
  try {
    const result = await stopAgentSafe(agentId);
    addEvent(session, 'verifier_stopped', `Verifier agent ${result}`);
  } catch (error) {
    addEvent(session, 'verifier_stop_failed', 'Verifier agent did not stop cleanly');
    console.error(`[gatekeeper] ${session.id} verifier stop failed`, error);
  }
}

// Idempotent: only the first result wins. Returns false if verification was already resolved.
export async function finishVerification(
  session: Session,
  verification: Resolved,
  note?: string,
  options: { stopVerifierAfterMs?: number; speak?: boolean } = {},
): Promise<boolean> {
  if (session.verification !== 'pending' && session.verification !== 'none') return false;
  clearWatchdog(session.id);
  setVerification(session, verification);
  session.verifyNote = note?.slice(0, 300) || undefined;
  session.metrics.verifyDoneAt = Date.now();
  const label = EVENT_LABELS[verification];
  addEvent(session, label.type, note ? `${label.detail} (${note.slice(0, 120)})` : label.detail);

  if (options.speak !== false) await speakClosingLine(session);

  const delay = options.stopVerifierAfterMs ?? VERIFIER_STOP_DELAY_MS;
  if (session.verifierAgentId) {
    const timer = setTimeout(() => void stopVerifier(session), delay);
    timer.unref?.();
  }
  return true;
}
