'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import type { RTMClient } from 'agora-rtm';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FAMILY_UID, VERIFIER_AGENT_UID, verifyChannelName } from '@/lib/agora';
import type { StateResponse, StateSnapshot } from '@/types/gatekeeper';
import type { AgoraRenewalTokens, AgoraTokenData } from '@/types/conversation';
import { ErrorBoundary } from './ErrorBoundary';
import { LoadingSkeleton } from './LoadingSkeleton';

const ConversationComponent = dynamic(() => import('./ConversationComponent'), { ssr: false });
const AgoraProvider = dynamic(() => import('./AgoraProvider'), { ssr: false });

type Phase = 'waiting' | 'ready' | 'connecting' | 'incall' | 'done';

const POLL_MS = 1000;
// After the verification result arrives, leave the call screen once the Verifier has said goodbye.
const AUTO_LEAVE_MS = 8000;

// The family member's page (opened from the dashboard link or a text message). Answering joins the
// Verifier's RTC channel; the Verifier agent asks whether they are safe and whether they called.
export default function FamilyLanding() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<StateSnapshot | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [phase, setPhase] = useState<Phase>('waiting');
  const [error, setError] = useState<string | null>(null);
  const [agoraData, setAgoraData] = useState<AgoraTokenData | null>(null);
  const [rtmClient, setRtmClient] = useState<RTMClient | null>(null);

  useEffect(() => {
    import('agora-rtc-react').catch(() => {});
    import('agora-rtm').catch(() => {});
    setSessionId(new URLSearchParams(window.location.search).get('session'));
  }, []);

  // Poll the session so the page knows when the Verifier is ready and when a result arrives.
  useEffect(() => {
    if (!sessionId) return;
    let stopped = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/state?session=${encodeURIComponent(sessionId)}`, {
          cache: 'no-store',
        });
        if (stopped) return;
        const body = (await res.json()) as StateResponse;
        setNotFound(!body.session);
        setSnapshot(body.session);
      } catch {
        // Keep the last known state; the next poll retries.
      }
    };
    void tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [sessionId]);

  const verification = snapshot?.verification ?? 'none';
  const resolved = verification !== 'none' && verification !== 'pending';
  const verifierReady = verification === 'pending' && !!snapshot?.verifierAgentId;

  useEffect(() => {
    setPhase((current) => {
      if (current === 'connecting' || current === 'incall' || current === 'done') return current;
      if (resolved) return 'done';
      return verifierReady ? 'ready' : 'waiting';
    });
  }, [resolved, verifierReady]);

  const leave = useCallback(async () => {
    const verifierAgentId = snapshot?.verifierAgentId;
    // Stopping the Verifier does not end the caller's call (the route only ends Grandma's session).
    if (verifierAgentId && !resolved) {
      void fetch('/api/stop-conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: verifierAgentId }),
      }).catch(() => {});
    }
    rtmClient?.logout().catch((err) => console.error('RTM logout error:', err));
    setRtmClient(null);
    setAgoraData(null);
    setPhase('done');
  }, [snapshot?.verifierAgentId, resolved, rtmClient]);

  // Once the result is in, give the Verifier a moment to say goodbye, then leave.
  useEffect(() => {
    if (phase !== 'incall' || !resolved) return;
    const timer = setTimeout(() => void leave(), AUTO_LEAVE_MS);
    return () => clearTimeout(timer);
  }, [phase, resolved, leave]);

  const answer = async () => {
    if (!sessionId) return;
    setPhase('connecting');
    setError(null);
    try {
      const channel = verifyChannelName(sessionId);
      const res = await fetch(`/api/generate-agora-token?channel=${channel}&uid=${FAMILY_UID}`);
      const data = await res.json();
      if (!res.ok) throw new Error(`Failed to generate Agora token: ${JSON.stringify(data)}`);

      const { default: AgoraRTM } = await import('agora-rtm');
      const rtm: RTMClient = new AgoraRTM.RTM(process.env.NEXT_PUBLIC_AGORA_APP_ID!, data.uid);
      await rtm.login({ token: data.token });
      await rtm.subscribe(channel);

      setRtmClient(rtm);
      setAgoraData({ token: data.token, uid: data.uid, channel: data.channel });
      setPhase('incall');
    } catch (err) {
      console.error('Error joining the verification call:', err);
      setError('Could not connect. Please try again.');
      setPhase('ready');
    }
  };

  const handleTokenWillExpire = useCallback(
    async (uid: string): Promise<AgoraRenewalTokens> => {
      if (!sessionId) throw new Error('Missing session for token renewal');
      const channel = verifyChannelName(sessionId);
      const res = await fetch(`/api/generate-agora-token?channel=${channel}&uid=${uid}`);
      const data = await res.json();
      if (!res.ok) throw new Error('Failed to generate renewal tokens');
      // Same uid for RTC and RTM, so one token (buildTokenWithRtm) serves both.
      return { rtcToken: data.token, rtmToken: data.token };
    },
    [sessionId],
  );

  const transcriptForwarding = useMemo(
    () =>
      sessionId
        ? { sessionId, localSpeaker: 'family' as const }
        : undefined,
    [sessionId],
  );

  if (phase === 'incall' && agoraData && rtmClient) {
    return (
      <div className="flex h-dvh min-h-screen flex-col bg-background text-foreground">
        <Suspense fallback={<LoadingSkeleton />}>
          <ErrorBoundary>
            <AgoraProvider>
              <ConversationComponent
                agentUid={String(VERIFIER_AGENT_UID)}
                transcriptForwarding={transcriptForwarding}
                agoraData={agoraData}
                rtmClient={rtmClient}
                onTokenWillExpire={handleTokenWillExpire}
                onEndConversation={() => void leave()}
              />
            </AgoraProvider>
          </ErrorBoundary>
        </Suspense>
      </div>
    );
  }

  const profile = snapshot?.profile;
  const who = profile?.grandmaName ?? 'your family member';

  return (
    <main className="flex h-dvh min-h-screen flex-col items-center justify-center bg-background px-4 text-center text-foreground">
      <div className="flex w-[min(92vw,26.25rem)] flex-col items-center gap-4 rounded-[20px] border border-[#2b2b2b] bg-[rgb(16,16,16)] px-10 py-10">
        <h1 className="text-[24px] font-medium leading-tight text-white">Gatekeeper</h1>

        {!sessionId || notFound ? (
          <p className="text-sm text-muted-foreground">
            This link is not valid, or the call has already been cleared.
          </p>
        ) : phase === 'done' ? (
          <DoneMessage verification={verification} who={who} />
        ) : phase === 'ready' || phase === 'connecting' ? (
          <>
            <p className="text-base font-medium text-white">
              Someone may be trying to scam {who}.
            </p>
            <p className="text-sm text-muted-foreground">
              Answer to tell our AI assistant, in one short conversation, whether you are okay and
              whether you called her.
            </p>
            <Button
              onClick={() => void answer()}
              disabled={phase === 'connecting'}
              className="mt-2 h-10 w-full rounded-lg border border-primary bg-primary text-sm font-medium text-black hover:border-white hover:bg-white hover:text-black"
            >
              {phase === 'connecting' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                'Answer'
              )}
            </Button>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </>
        ) : (
          <>
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Waiting for a verification request about {who}...
            </p>
          </>
        )}
      </div>
    </main>
  );
}

function DoneMessage({ verification, who }: { verification: string; who: string }) {
  if (verification === 'confirmed_safe_family_not_caller') {
    return (
      <p className="text-sm text-muted-foreground">
        Thank you. We told the caller you are safe and did not call. {who} will not send anything.
      </p>
    );
  }
  if (verification === 'family_confirms_call') {
    return (
      <p className="text-sm text-muted-foreground">
        Thank you. We noted that you made the call. {who} will not send anything on her own.
      </p>
    );
  }
  return (
    <p className="text-sm text-muted-foreground">
      Thank you. {who} will not agree to anything until you speak with her directly.
    </p>
  );
}
