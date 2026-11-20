import type { Session, ToolStatusResponse } from '@/types/gatekeeper';

// Guidance returned to Grandma's LLM through checkStatus / requestVerification.
// ACTION TEXT ONLY: no family names, organisations or profile facts (handoff section 20.2).

export function guidanceFor(session: Pick<Session, 'verification' | 'riskLevel'>): string {
  switch (session.verification) {
    case 'pending':
      return 'Keep stalling warmly. Do not agree to anything. Verification is in progress.';
    case 'confirmed_safe_family_not_caller':
      return 'The family member the caller claimed to be has confirmed they are safe and did not call. Tell the caller, kindly but firmly, that you just checked with that person, that you will not send anything, and that you are ending the call. Say goodbye. Do not say any names.';
    case 'family_confirms_call':
      return 'The family says they will handle this directly. Do not send anything yourself. Tell the caller your family will take it from here, then say goodbye.';
    case 'unreachable':
      return 'The family could not be reached. Agree to nothing. Tell the caller your family will call them back, then say goodbye.';
    case 'none':
    default:
      if (session.riskLevel === 'red') {
        return 'This looks like a scam. Keep stalling warmly, agree to nothing, and call requestVerification if you have not already.';
      }
      if (session.riskLevel === 'amber') {
        return 'Be careful. Ask who is calling and why. Do not agree to anything.';
      }
      return 'Nothing suspicious so far. Chat naturally and keep replies short. Never agree to pay or share anything.';
  }
}

// Grandma's closing line, pushed through the speak endpoint when verification finishes.
// Deliberately nameless (handoff section 20.2) and under the 512-byte speak limit.
export function closingLine(verification: Session['verification']): string | null {
  switch (verification) {
    case 'confirmed_safe_family_not_caller':
      return "Oh dear, I just checked with my family, and they're safe and say they didn't call me. I won't be sending anything. I'm hanging up now. Goodbye.";
    case 'family_confirms_call':
      return "My family says they'll handle this directly, so I won't send anything myself. Goodbye now, dear.";
    case 'unreachable':
      return "I couldn't reach my family just now, so I won't agree to anything. They'll call you back. Goodbye.";
    default:
      return null;
  }
}

export function buildStatus(session: Session): ToolStatusResponse {
  return {
    risk_level: session.riskLevel,
    verification: session.verification,
    guidance: guidanceFor(session),
  };
}
