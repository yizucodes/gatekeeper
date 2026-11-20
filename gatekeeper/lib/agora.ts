export const DEFAULT_AGENT_UID = 123456;

// Gatekeeper: the Verifier agent talks to a family member in a second RTC channel,
// `${sessionId}-verify`. Fixed uids let the family page and the agent find each other.
export const VERIFIER_AGENT_UID = 654321;
export const FAMILY_UID = 3001;

export function verifyChannelName(sessionId: string): string {
  return `${sessionId}-verify`;
}
