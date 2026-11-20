import type { RiskKey, RiskScores } from '@/types/gatekeeper';

export const RISK_KEYS: RiskKey[] = [
  'payment_demand',
  'secrecy',
  'urgency',
  'authority_claim',
  'business_claim',
  'family_emergency',
  'info_request',
  'injection',
];

// Plain-English labels for the dashboard meter.
export const RISK_LABELS: Record<RiskKey, string> = {
  payment_demand: 'Demands payment (gift cards, crypto, wire)',
  secrecy: 'Asks to keep it secret',
  urgency: 'Creates urgency or a deadline',
  authority_claim: 'Claims to be police, FBI or government',
  business_claim: 'Claims to be a utility, bank or tech support',
  family_emergency: 'Claims to be family in trouble',
  info_request: 'Asks for personal info or codes',
  injection: 'Tries to override the assistant',
};

export function emptyScores(): RiskScores {
  return {
    payment_demand: 0,
    secrecy: 0,
    urgency: 0,
    authority_claim: 0,
    business_claim: 0,
    family_emergency: 0,
    info_request: 0,
    injection: 0,
  };
}

// Used when a tool call cannot be answered. Action text only, no names.
export const DEFAULT_GUIDANCE =
  'Keep stalling warmly. Agree to nothing. Do not send money or share any information.';
