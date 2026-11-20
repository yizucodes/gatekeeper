'use client';

import type { ScorerName, VerifierMode } from '@/types/gatekeeper';

// Real measured values only: nothing here is hard-coded or estimated.
export function DashboardFooter({
  scorer,
  latencyMs,
  verifierMode,
  manualInterventions,
}: {
  scorer?: ScorerName;
  latencyMs?: number;
  verifierMode?: VerifierMode;
  manualInterventions?: number;
}) {
  return (
    <footer className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
      <span>scorer: {scorer ?? '-'}</span>
      <span>
        last score: {latencyMs !== undefined ? `${latencyMs} ms` : '-'}
      </span>
      <span>verifier: {verifierMode ?? '-'}</span>
      <span>manual interventions: {manualInterventions ?? 0}</span>
    </footer>
  );
}
