import type { Session, VerifierMode } from '@/types/gatekeeper';
import { startVerifierAgent, type VerifierVars } from './agents';
import { demoModeEnabled } from './config';
import { armWatchdog, finishVerification, stopVerifier } from './outcome';
import { addEvent, setHandle, setVerification } from './store';

// How the family member is reached. BrowserLauncher is the reliable path: the Verifier agent waits
// in a second RTC channel and the family opens /family?session=<id> to answer. Outbound
// telephony is a later adapter (Preview Platform API; access is unresolved, see AGENTS.md).
export interface VerifierLauncher {
  mode: VerifierMode;
  start(session: Session): Promise<{ agentId: string }>;
}

export type VerifyTrigger = 'tool' | 'policy';

// How long the family has to answer before verification is reported as unreachable.
export const VERIFY_TIMEOUT_MS = 90_000;

const SCAM_IDENTITY: Record<string, string> = {
  grandchild: 'a family member',
  family: 'a family member',
  government: 'a government or police official',
  authority: 'a government or police official',
  utility: 'a utility company',
  tech: 'a tech support agent',
  bank: 'a bank',
};

// Best available description of the caller's story. Prefers what Grandma's tool reported;
// falls back to the scorer's scam type and the caller's latest words (policy-triggered path).
export function deriveClaim(session: Session): VerifierVars {
  if (session.claim) {
    return {
      claimedIdentity: session.claim.claimedIdentity,
      claimSummary: session.claim.claimSummary,
    };
  }
  const label = session.scamType?.label.toLowerCase() ?? '';
  const matched = Object.keys(SCAM_IDENTITY).find((key) => label.includes(key));
  const lastCaller = [...session.transcript].reverse().find((l) => l.speaker === 'caller');
  return {
    claimedIdentity: matched ? SCAM_IDENTITY[matched] : 'someone she may know',
    claimSummary: lastCaller
      ? `The caller said: ${lastCaller.text}`
      : 'The caller asked her for money or personal details.',
  };
}

export const browserLauncher: VerifierLauncher = {
  mode: 'browser',
  async start(session) {
    const { agentId } = await startVerifierAgent({
      sessionId: session.id,
      vars: deriveClaim(session),
      onSession: (handle) => setHandle(session.id, 'verifier', handle),
    });
    return { agentId };
  },
};

// Placeholder. Outbound calls need the Preview Platform API (SavedAgent.call + an imported SIP
// number). Not implemented; enabled only with AGORA_TELEPHONY_ENABLED=true and always falls back.
export const telephonyLauncher: VerifierLauncher = {
  mode: 'telephony',
  async start() {
    // TODO(VERIFY): needs Preview access, SavedAgent in agora-agents, and a number_id.
    throw new Error('Telephony launcher is not implemented');
  },
};

let launcherOverride: VerifierLauncher | undefined;

// For tests: replace the launcher so no real agent is started. Pass undefined to restore.
export function setVerifierLauncher(launcher: VerifierLauncher | undefined) {
  launcherOverride = launcher;
}

async function launch(session: Session): Promise<VerifierMode> {
  // Test harness sessions (scripts/harness.ts, DEMO_MODE only) never start a real Verifier agent.
  if (demoModeEnabled() && session.id.startsWith('harness-')) {
    session.verifierAgentId = 'harness-verifier';
    return 'browser';
  }
  if (launcherOverride) {
    const { agentId } = await launcherOverride.start(session);
    session.verifierAgentId = agentId;
    return launcherOverride.mode;
  }
  if (process.env.AGORA_TELEPHONY_ENABLED === 'true') {
    try {
      const { agentId } = await telephonyLauncher.start(session);
      session.verifierAgentId = agentId;
      return 'telephony';
    } catch (error) {
      addEvent(session, 'telephony_unavailable', 'Telephony unavailable, falling back to browser');
      console.warn(`[gatekeeper] ${session.id} telephony launcher failed`, error);
    }
  }
  const { agentId } = await browserLauncher.start(session);
  session.verifierAgentId = agentId;
  return 'browser';
}

// Single idempotent entry point. Both the requestVerification tool and the policy engine call it.
// Returns true only if this call started verification. The Verifier is launched in the background
// so the tool call returns inside its timeout.
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

  // Arm the watchdog first so a failed or slow launch can never leave the call pending forever.
  armWatchdog(session, VERIFY_TIMEOUT_MS);

  void launch(session)
    .then((mode) => {
      session.verifierMode = mode;
      if (session.verification !== 'pending') {
        // Verification already resolved (watchdog, or the call ended) while the launch was in flight.
        void stopVerifier(session);
        return;
      }
      addEvent(
        session,
        'calling_family',
        mode === 'browser'
          ? 'Calling family (browser)'
          : 'Calling family (telephony)',
      );
    })
    .catch((error) => {
      console.error(`[gatekeeper] ${session.id} verifier launch failed`, error);
      addEvent(session, 'verifier_launch_failed', 'Could not start the Verifier agent');
      void finishVerification(session, 'unreachable', 'Verifier could not be started');
    });

  return true;
}
