import { emptyScores } from '@/lib/gatekeeper-shared';
import type { RiskScores, ScorerName, TranscriptLine } from '@/types/gatekeeper';

// Risk scoring behind a small interface so the scorer can be swapped (SIE /v1/decisions later)
// while the keyword scorer stays as the always-available fallback.

export interface RiskResult {
  scores: RiskScores;
  scamType?: { label: string; p: number };
  latencyMs: number;
  scorer: ScorerName;
}

export interface RiskScorer {
  name: ScorerName;
  score(window: string): Promise<RiskResult>;
}

const MAX_WINDOW_LINES = 6;
const MAX_WINDOW_CHARS = 1500;

// The scoring window is the last 6 caller utterances (about 1500 characters), newline-joined.
export function buildWindow(
  transcript: Pick<TranscriptLine, 'speaker' | 'text'>[],
): string {
  const callerLines = transcript
    .filter((line) => line.speaker === 'caller')
    .map((line) => line.text.trim())
    .filter(Boolean)
    .slice(-MAX_WINDOW_LINES);
  let window = callerLines.join('\n');
  // Keep the newest text when the window is too long.
  if (window.length > MAX_WINDOW_CHARS) window = window.slice(-MAX_WINDOW_CHARS);
  return window;
}

type KeywordRule = { key: keyof RiskScores; score: number; pattern: RegExp };

// Keyword fallback (handoff section 10.1). Each match raises its key to at least `score`.
const RULES: KeywordRule[] = [
  // payment_demand
  { key: 'payment_demand', score: 0.9, pattern: /gift ?cards?|bitcoin|crypto(currency)?|wire (transfer|money|it|the)|western union|prepaid|money order|cash (app|courier)|zelle|\bbail\b/ },
  { key: 'payment_demand', score: 0.85, pattern: /\b(send|pay|need|owe|transfer|wire|get|buy)\b[^.?!]{0,40}\$\s?\d/ },
  // Natural phrasing without an amount: "send me some money", "give me a little cash", "help me out with money".
  // At most three filler words between "me" and the money word, so "give me a call back, I'll bring money" does not match.
  { key: 'payment_demand', score: 0.85, pattern: /\b(send|give|wire|transfer|get|lend|loan|mail|venmo|zelle)\b\s+(?:[\w']+\s+){0,2}?(me|us)\s+(?:[\w']+,?\s+){0,3}?(money|cash|funds|dollars|bucks)\b|\bhelp me out with\b[^.?!]{0,20}\b(money|cash)\b/ },
  { key: 'payment_demand', score: 0.85, pattern: /safe account|move your (savings|money|funds)|transfer your (savings|money|funds)/ },
  { key: 'payment_demand', score: 0.55, pattern: /\$\s?\d{3,}/ },
  // secrecy
  { key: 'secrecy', score: 0.9, pattern: /don'?t tell|do not tell|keep (this|it) (a )?(secret|quiet)|between us|nobody (needs to|can) know|keep this to yourself|(not|n't) (to )?(tell|mention)\b[^.?!]{0,25}(anyone|mom|dad|family|bank|police|kids)/ },
  // urgency
  { key: 'urgency', score: 0.85, pattern: /right now|immediately|\basap\b|urgent|(in|within) (the next )?\d+ (minutes?|hours?)|\d+ minutes|last chance|too late|disconnect|shut ?off|shut off/ },
  { key: 'urgency', score: 0.55, pattern: /\btoday\b|\btonight\b|deadline|hurry/ },
  // authority_claim
  { key: 'authority_claim', score: 0.85, pattern: /\bfbi\b|f\.b\.i|special agent|\birs\b|internal revenue|police|sheriff|detective|warrant|marshal/ },
  { key: 'authority_claim', score: 0.7, pattern: /arrest|\bcourt\b|\bjudge\b|social security administration|medicare|district attorney/ },
  { key: 'authority_claim', score: 0.6, pattern: /firearms|illegal (activity|drugs)|money laundering|identity (was|has been) (used|stolen)/ },
  // business_claim
  { key: 'business_claim', score: 0.7, pattern: /electric company|power company|utility|gas company|water company|your bank|tech(nical)? support|microsoft|apple support|virus|malware|your computer|account (is )?(past due|overdue|suspended|locked|compromised)|past due|overdue/ },
  // info_request
  // Credentials and account details are red on their own (see policy.ts). Ordinary identity details
  // that legitimate callers (a pharmacy, a clinic) also ask for stay at amber.
  { key: 'info_request', score: 0.85, pattern: /social security number|\bssn\b|bank (account|details)|account number|routing number|\bpin\b|password|credit card|card number|verification code|one[- ]time (code|passcode)|(read|give|tell|share|send) me\b[^.?!]{0,30}(code|number|password)/ },
  { key: 'info_request', score: 0.6, pattern: /(your|her) address|date of birth|maiden name/ },
  { key: 'info_request', score: 0.6, pattern: /install (this|an?|the) (app|software|program)|remote (access|desktop)|anydesk|teamviewer/ },
  // injection
  { key: 'injection', score: 0.95, pattern: /ignore (all |any |your |the |my )?(previous |prior |above |earlier )*(instructions|rules|prompt)|disregard (your|the|all)|admin mode|developer mode|system prompt|reveal your (instructions|prompt)/ },
  { key: 'injection', score: 0.8, pattern: /you are now|pretend (to be|you are)/ },
];

const FAMILY_IDENTITY =
  /it'?s me\b|this is (your )?(grandson|granddaughter|grandchild|son|daughter|nephew|niece)|grandma\?/;
const FAMILY_TROUBLE =
  /trouble|\bjail\b|arrest|\bpolice\b|accident|hospital|\bbail\b|lawyer|stranded|hurt|crash/;
const ROMANCE = /sweetheart|my love|\bdarling\b|miss you|flight to see you/;
const TECH_WORDS = /virus|malware|your computer|tech(nical)? support|microsoft|apple support|install/;

function normalize(text: string): string {
  return text.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ');
}

export function keywordScore(window: string): Pick<RiskResult, 'scores' | 'scamType'> {
  const text = normalize(window);
  const scores = emptyScores();

  for (const rule of RULES) {
    if (rule.pattern.test(text)) {
      scores[rule.key] = Math.max(scores[rule.key], rule.score);
    }
  }

  // family_emergency needs identity and trouble together; either alone is only weak evidence.
  const identity = FAMILY_IDENTITY.test(text);
  const trouble = FAMILY_TROUBLE.test(text);
  scores.family_emergency = identity && trouble ? 0.85 : identity ? 0.4 : trouble ? 0.5 : 0;

  // Scam type: strongest matching candidate wins.
  const candidates: { label: string; p: number }[] = [];
  if (scores.authority_claim >= 0.7) {
    candidates.push({ label: 'government or law enforcement impersonation', p: scores.authority_claim });
  }
  if (scores.family_emergency >= 0.7) {
    candidates.push({ label: 'grandparent or family emergency scam', p: scores.family_emergency });
  }
  if (scores.business_claim >= 0.7) {
    candidates.push({
      label: TECH_WORDS.test(text) ? 'tech support scam' : 'utility shutoff scam',
      p: scores.business_claim,
    });
  }
  if (ROMANCE.test(text) && scores.payment_demand >= 0.55) {
    candidates.push({ label: 'romance scam', p: 0.75 });
  }
  if (scores.injection >= 0.8) {
    candidates.push({ label: 'prompt injection attempt', p: scores.injection });
  }

  let scamType: { label: string; p: number };
  if (candidates.length > 0) {
    scamType = candidates.reduce((best, c) => (c.p > best.p ? c : best));
  } else {
    const max = Math.max(...Object.values(scores));
    scamType = { label: 'normal friendly call', p: Number((1 - max).toFixed(2)) };
  }
  return { scores, scamType };
}

export const keywordScorer: RiskScorer = {
  name: 'keyword',
  async score(window: string): Promise<RiskResult> {
    const started = performance.now();
    const { scores, scamType } = keywordScore(window);
    return {
      scores,
      scamType,
      latencyMs: Math.round(performance.now() - started),
      scorer: 'keyword',
    };
  },
};

// TODO(SIE): swap in an SIE /v1/decisions scorer here (Prompt 6). Keep keywordScorer as the fallback.
export function getScorer(): RiskScorer {
  return keywordScorer;
}
