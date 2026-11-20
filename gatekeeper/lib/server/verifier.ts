import type { Session, VerifierMode } from '@/types/gatekeeper';
import { addEvent, setVerification } from './store';

// How the family member is reached. Slice C adds BrowserLauncher; telephony is a later adapter.
export interface VerifierLauncher {
  start(session: Session): Promise<{ mode: VerifierMode; ref: string }>;
}

export type VerifyTrigger = 'tool' | 'policy';

// Single idempotent entry point. Both the requestVerification tool and the policy engine call it.
// Returns true only if this call started verification.
export async function startVerification(
  session: Session,
  trigger: VerifyTrigger,
): Promise<boolean> {
  if (session.verification !== 'none') return false;
  setVerification(session, 'pending');
  session.metrics.verifyStartedAt = Date.now();
  addEvent(
    session,
    'verification_started',
    trigger === 'policy'
      ? 'Verification triggered automatically (policy: red)'
      : 'Verification requested by Grandma',
  );
  // TODO(slice C): launch the Verifier agent through BrowserLauncher here.
  return true;
}
