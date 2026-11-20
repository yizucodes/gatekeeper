'use client';

import type { GkEvent } from '@/types/gatekeeper';

const DOT: Record<string, string> = {
  risk_red: 'bg-red-500',
  risk_amber: 'bg-amber-500',
  injection_flagged: 'bg-red-500',
  verification_started: 'bg-sky-500',
  family_reached: 'bg-emerald-500',
  verification_result: 'bg-emerald-500',
};

function offset(ts: number, start: number): string {
  const s = Math.max(0, Math.round((ts - start) / 1000));
  return `+${s}s`;
}

export function EventTimeline({
  events,
  startedAt,
}: {
  events: GkEvent[];
  startedAt: number;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Timeline
      </h2>
      <ol className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
        {events.length === 0 && (
          <li className="text-sm text-muted-foreground">No events yet.</li>
        )}
        {[...events].reverse().map((event, i) => (
          <li key={`${event.ts}-${i}`} className="flex items-start gap-2 text-sm">
            <span
              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[event.type] ?? 'bg-muted-foreground'}`}
            />
            <span className="w-12 shrink-0 tabular-nums text-xs text-muted-foreground">
              {offset(event.ts, startedAt)}
            </span>
            <span>{event.detail}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
