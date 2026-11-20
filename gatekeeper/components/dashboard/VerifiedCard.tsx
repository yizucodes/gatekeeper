'use client';

import type { StateSnapshot } from '@/types/gatekeeper';

function seconds(ms: number): string {
  return (ms / 1000).toFixed(1);
}

// Shows the verification outcome. Times are measured from server timestamps, never estimated.
export function VerifiedCard({
  session,
  callUrlBase,
}: {
  session: Pick<StateSnapshot, 'id' | 'verification' | 'metrics' | 'verifyNote' | 'serverTime' | 'verifierMode'>;
  callUrlBase: string;
}) {
  const { verification, metrics } = session;
  if (verification === 'none') return null;

  const elapsed =
    metrics.verifyStartedAt !== undefined
      ? (metrics.verifyDoneAt ?? session.serverTime) - metrics.verifyStartedAt
      : undefined;

  if (verification === 'pending') {
    const link = `${callUrlBase}/family?session=${encodeURIComponent(session.id)}`;
    return (
      <section className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-amber-600">
          Verifying with family{elapsed !== undefined ? ` (${seconds(elapsed)}s)` : ''}
        </h2>
        <p className="mt-2 text-sm">Waiting for the family member to answer.</p>
        {session.verifierMode !== 'telephony' && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 block break-all text-sm text-primary underline"
          >
            {link}
          </a>
        )}
      </section>
    );
  }

  const blocked = verification === 'confirmed_safe_family_not_caller';
  const tone = blocked
    ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-600'
    : verification === 'family_confirms_call'
      ? 'border-sky-500/50 bg-sky-500/10 text-sky-600'
      : 'border-border bg-muted text-muted-foreground';
  const headline = blocked
    ? 'SCAM BLOCKED'
    : verification === 'family_confirms_call'
      ? 'Family says they made the call'
      : 'Family could not confirm';
  const detail = blocked
    ? 'The family member is safe and did not call. Nothing was sent.'
    : verification === 'family_confirms_call'
      ? 'Grandma was told the family will handle it. Nothing was sent.'
      : 'Grandma agreed to nothing and ended the call.';

  return (
    <section className={`rounded-xl border p-4 ${tone}`}>
      <h2 className="text-2xl font-bold tracking-tight">{headline}</h2>
      <p className="mt-1 text-sm text-foreground">{detail}</p>
      {session.verifyNote && (
        <p className="mt-1 text-xs text-muted-foreground">Family said: {session.verifyNote}</p>
      )}
      {elapsed !== undefined && (
        <p className="mt-1 text-xs text-muted-foreground">
          Verified in {seconds(elapsed)} s
        </p>
      )}
    </section>
  );
}
