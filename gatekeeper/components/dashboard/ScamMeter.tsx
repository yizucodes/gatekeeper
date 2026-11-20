'use client';

import { RISK_KEYS, RISK_LABELS } from '@/lib/gatekeeper-shared';
import type { RiskLevel, RiskScores } from '@/types/gatekeeper';

const BADGE: Record<RiskLevel, string> = {
  green: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/40',
  amber: 'bg-amber-500/15 text-amber-600 border-amber-500/40',
  red: 'bg-red-500/15 text-red-600 border-red-500/40',
};

// Matches the default policy thresholds (red 0.80, amber 0.55) for bar colour only.
function barColor(value: number): string {
  if (value >= 0.8) return 'bg-red-500';
  if (value >= 0.55) return 'bg-amber-500';
  return 'bg-emerald-500';
}

export function ScamMeter({
  scores,
  riskLevel,
  scamType,
}: {
  scores: RiskScores;
  riskLevel: RiskLevel;
  scamType?: { label: string; p: number };
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Scam meter
        </h2>
        {scamType && (
          <span className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs">
            {scamType.label}
          </span>
        )}
        <span
          className={`rounded-full border px-3 py-0.5 text-xs font-semibold uppercase ${BADGE[riskLevel]}`}
        >
          {riskLevel}
        </span>
      </div>
      <ul className="space-y-2">
        {RISK_KEYS.map((key) => {
          const value = scores[key];
          return (
            <li key={key}>
              <div className="mb-0.5 flex justify-between text-xs">
                <span>{RISK_LABELS[key]}</span>
                <span className="tabular-nums text-muted-foreground">
                  {Math.round(value * 100)}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${barColor(value)}`}
                  style={{ width: `${Math.round(value * 100)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
