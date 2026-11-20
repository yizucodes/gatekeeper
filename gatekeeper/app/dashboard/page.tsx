'use client';

import { useEffect, useRef, useState } from 'react';
import { DashboardFooter } from '@/components/dashboard/DashboardFooter';
import { EventTimeline } from '@/components/dashboard/EventTimeline';
import { ScamMeter } from '@/components/dashboard/ScamMeter';
import { TranscriptFeed } from '@/components/dashboard/TranscriptFeed';
import { VerifiedCard } from '@/components/dashboard/VerifiedCard';
import type { StateResponse } from '@/types/gatekeeper';

const POLL_MS = 500;

export default function DashboardPage() {
  const [state, setState] = useState<StateResponse | null>(null);
  const [offline, setOffline] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    // Optional ?session=<id> pins the dashboard to one call; otherwise it follows the latest.
    const pinned = new URLSearchParams(window.location.search).get('session');
    const url = pinned
      ? `/api/state?session=${encodeURIComponent(pinned)}`
      : '/api/state';

    const tick = async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error(`state ${res.status}`);
        setState((await res.json()) as StateResponse);
        setOffline(false);
      } catch {
        setOffline(true);
      } finally {
        inFlight.current = false;
      }
    };

    void tick();
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, []);

  const session = state?.session ?? null;
  const active = session && !session.endedAt;

  return (
    <main className="mx-auto flex h-dvh max-w-7xl flex-col gap-4 bg-background p-4 text-foreground">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Gatekeeper</h1>
        <span className="text-xs text-muted-foreground">
          {offline
            ? 'Server unreachable, retrying...'
            : session
              ? active
                ? 'Call in progress'
                : 'Call ended'
              : 'Waiting for a call'}
        </span>
      </header>

      {!session ? (
        <IdleScreen callUrl={state?.callUrl ?? null} />
      ) : (
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
          <TranscriptFeed lines={session.transcript} />
          <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
            <VerifiedCard
              session={session}
              callUrlBase={state?.callUrl ? new URL(state.callUrl).origin : window.location.origin}
            />
            <ScamMeter
              scores={session.scores}
              riskLevel={session.riskLevel}
              scamType={session.scamType}
            />
            <EventTimeline events={session.events} startedAt={session.createdAt} />
          </div>
        </div>
      )}

      <DashboardFooter
        scorer={session?.scorer}
        latencyMs={session?.metrics.scoreLatencyMs}
        verifierMode={session?.verifierMode}
      />
    </main>
  );
}

function IdleScreen({ callUrl }: { callUrl: string | null }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <h2 className="text-2xl font-medium">Scan and try to scam my grandmother</h2>
      {callUrl ? (
        <>
          {/* QR image is rendered by a public QR service so no extra dependency is needed.
              The encoded value is only the public call URL. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=8&data=${encodeURIComponent(callUrl)}`}
            alt="QR code to the call page"
            width={280}
            height={280}
            className="rounded-lg bg-white"
          />
          <p className="text-sm text-muted-foreground">{callUrl}</p>
        </>
      ) : (
        <p className="max-w-md text-sm text-muted-foreground">
          Set PUBLIC_BASE_URL (your https tunnel to this server) to show the QR
          code for the call page.
        </p>
      )}
    </div>
  );
}
