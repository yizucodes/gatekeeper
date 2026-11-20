'use client';

import { useEffect, useRef } from 'react';
import type { Speaker, TranscriptLine } from '@/types/gatekeeper';

const STYLES: Record<Speaker, { label: string; bubble: string }> = {
  caller: {
    label: 'Caller',
    bubble: 'bg-red-500/15 border-red-500/30',
  },
  grandma: {
    label: 'Grandma',
    bubble: 'bg-muted border-border',
  },
  family: {
    label: 'Family',
    bubble: 'bg-emerald-500/15 border-emerald-500/30',
  },
};

export function TranscriptFeed({ lines }: { lines: TranscriptLine[] }) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [lines.length]);

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-card p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Live transcript
      </h2>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {lines.length === 0 && (
          <p className="text-sm text-muted-foreground">Waiting for the call...</p>
        )}
        {lines.map((line, i) => {
          const style = STYLES[line.speaker];
          return (
            <div
              key={`${line.ts}-${i}`}
              className={`flex ${line.speaker === 'grandma' ? 'justify-start' : 'justify-end'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl border px-3 py-2 text-sm ${style.bubble}`}
              >
                <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {style.label}
                </div>
                {line.text}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
    </section>
  );
}
