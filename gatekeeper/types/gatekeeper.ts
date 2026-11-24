// Shared (browser + server) types for Gatekeeper. Types only: constants live in lib/gatekeeper-shared.ts.

export type RiskKey =
  | 'payment_demand'
  | 'secrecy'
  | 'urgency'
  | 'authority_claim'
  | 'business_claim'
  | 'family_emergency'
  | 'info_request'
  | 'injection';

export type RiskScores = Record<RiskKey, number>;

export type RiskLevel = 'green' | 'amber' | 'red';

export type Verification =
  | 'none'
  | 'pending'
  | 'confirmed_safe_family_not_caller'
  | 'family_confirms_call'
  | 'unreachable';

export type Speaker = 'caller' | 'grandma' | 'family';

export type VerifierMode = 'telephony' | 'browser';

export type ScorerName = 'sie' | 'keyword';

export interface TranscriptLine {
  speaker: Speaker;
  text: string;
  ts: number;
  // Set for live-call lines. Later updates with the same speaker and turnId replace the text, because
  // speech recognition refines a turn in place ("Grandma, it's" -> "Grandma, it's me, I need money").
  turnId?: string;
}

export interface GkEvent {
  ts: number;
  type: string;
  detail: string;
}

export interface Claim {
  claimedIdentity: string;
  claimSummary: string;
  toolCallId?: string;
}

export interface PolicyDecision {
  ts: number;
  riskLevel: RiskLevel;
  thresholds: { red: number; amber: number };
  scores: RiskScores;
  reasons: string[];
  scorer: ScorerName;
  window: string;
  action?: string;
}

export interface SessionMetrics {
  scoreLatencyMs?: number;
  verifyStartedAt?: number;
  verifyDoneAt?: number;
}

export interface Session {
  id: string;
  createdAt: number;
  endedAt?: number;
  channel: string;
  callerUid: string;
  grandmaAgentId?: string;
  verifierAgentId?: string;
  verifierMode?: VerifierMode;
  transcript: TranscriptLine[];
  scores: RiskScores;
  scorer: ScorerName;
  scamType?: { label: string; p: number };
  riskLevel: RiskLevel;
  verification: Verification;
  claim?: Claim;
  verifyNote?: string;
  events: GkEvent[];
  metrics: SessionMetrics;
  decisions: PolicyDecision[];
  manualInterventions: number;
}

// What GET /api/state returns. Decisions are only in the trail export.
export interface StateSnapshot extends Omit<Session, 'decisions'> {
  serverTime: number;
  // Names are shown on the dashboard only. They must never reach the Grandma LLM.
  profile: { grandmaName: string; familyName: string; familyRelation: string };
}

export interface StateResponse {
  session: StateSnapshot | null;
  // Public URL of the /call page (for the QR code), or null when PUBLIC_BASE_URL is unset.
  callUrl: string | null;
  serverTime: number;
}

export interface ToolStatusResponse {
  risk_level: RiskLevel;
  verification: Verification;
  guidance: string;
}
