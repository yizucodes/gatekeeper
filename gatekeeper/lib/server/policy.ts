import { RISK_KEYS } from '@/lib/gatekeeper-shared';
import type {
  PolicyDecision,
  RiskLevel,
  RiskScores,
  ScorerName,
  Session,
} from '@/types/gatekeeper';
import { addEvent } from './store';
import { startVerification } from './verifier';

// Policy: plain code decides, not the chatty LLM (handoff section 10.2).
// Principle: when unsure, pull in a human. The system never decides in the caller's favor.

export interface Thresholds {
  red: number;
  amber: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = { red: 0.8, amber: 0.55 };

export interface PolicyResult {
  riskLevel: RiskLevel;
  reasons: string[];
  wantVerify: boolean;
  injection: boolean;
}

// Pure: scores in, decision out. Shared by the live path and scripts/eval.ts.
export function evaluate(
  scores: RiskScores,
  thresholds: Thresholds = DEFAULT_THRESHOLDS,
): PolicyResult {
  const { red, amber } = thresholds;
  const pressured = scores.urgency >= amber || scores.payment_demand >= amber;
  const reasons: string[] = [];

  if (scores.payment_demand >= red) reasons.push('payment demand');
  if (scores.secrecy >= red) reasons.push('asks for secrecy');
  if (scores.injection >= red) reasons.push('prompt-injection attempt');
  if (scores.authority_claim >= red && pressured) {
    reasons.push('authority claim with urgency or payment demand');
  }
  if (scores.family_emergency >= red && pressured) {
    reasons.push('family emergency claim with urgency or payment demand');
  }

  let riskLevel: RiskLevel;
  if (reasons.length > 0) {
    riskLevel = 'red';
  } else if (Math.max(...RISK_KEYS.map((k) => scores[k])) >= amber) {
    riskLevel = 'amber';
    reasons.push('suspicious signals');
  } else {
    riskLevel = 'green';
  }

  return {
    riskLevel,
    reasons,
    wantVerify: riskLevel === 'red',
    injection: scores.injection >= red,
  };
}

const LEVEL_RANK: Record<RiskLevel, number> = { green: 0, amber: 1, red: 2 };

export interface ScoredWindow {
  scores: RiskScores;
  scorer: ScorerName;
  window: string;
  scamType?: { label: string; p: number };
  latencyMs?: number;
}

// Side effects: update the session, emit events, and trigger verification.
// Scores ratchet up within a call (max so far) and the risk level never drops: a scam does not
// become safe because the old lines slid out of the scoring window.
export async function applyPolicy(
  session: Session,
  scored: ScoredWindow,
  thresholds: Thresholds = DEFAULT_THRESHOLDS,
): Promise<PolicyDecision> {
  for (const key of RISK_KEYS) {
    session.scores[key] = Math.max(session.scores[key], scored.scores[key]);
  }
  session.scorer = scored.scorer;
  if (scored.latencyMs !== undefined) session.metrics.scoreLatencyMs = scored.latencyMs;
  if (scored.scamType) {
    // A benign read never overwrites a scam type that was already detected in this call.
    const benign = scored.scamType.label === 'normal friendly call';
    if (!session.scamType || !benign) session.scamType = scored.scamType;
  }

  const result = evaluate(session.scores, thresholds);
  const previous = session.riskLevel;
  if (LEVEL_RANK[result.riskLevel] > LEVEL_RANK[previous]) {
    session.riskLevel = result.riskLevel;
    if (result.riskLevel === 'amber') {
      addEvent(session, 'risk_amber', `Risk raised to amber (${result.reasons.join(', ')})`);
    } else if (result.riskLevel === 'red') {
      addEvent(session, 'risk_red', `Risk raised to red (${result.reasons.join(', ')})`);
    }
  }

  if (
    result.injection &&
    !session.events.some((e) => e.type === 'injection_flagged')
  ) {
    addEvent(
      session,
      'injection_flagged',
      'Prompt-injection attempt blocked (Grandma stays in character)',
    );
  }

  let action: string | undefined;
  if (session.riskLevel === 'red' && session.verification === 'none') {
    const started = await startVerification(session, 'policy');
    if (started) action = 'verification started (policy: red)';
  }

  const decision: PolicyDecision = {
    ts: Date.now(),
    riskLevel: session.riskLevel,
    thresholds,
    scores: { ...session.scores },
    reasons: result.reasons,
    scorer: scored.scorer,
    window: scored.window,
    action,
  };
  session.decisions.push(decision);
  return decision;
}
