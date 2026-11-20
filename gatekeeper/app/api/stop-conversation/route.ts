import { NextResponse } from 'next/server';
import { StopConversationRequest } from '@/types/conversation';
import { stopAgentSafe } from '@/lib/server/agents';
import { clearWatchdog, stopVerifier } from '@/lib/server/outcome';
import { endSession, findByAgentId } from '@/lib/server/store';

export async function POST(request: Request) {
  try {
    const body: StopConversationRequest = await request.json();
    const { agent_id } = body;

    if (!agent_id) {
      return NextResponse.json(
        { error: 'agent_id is required' },
        { status: 400 },
      );
    }

    const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID;
    const appCertificate = process.env.NEXT_AGORA_APP_CERTIFICATE;
    if (!appId || !appCertificate) {
      throw new Error(
        'Missing Agora configuration. Set NEXT_PUBLIC_AGORA_APP_ID and NEXT_AGORA_APP_CERTIFICATE.',
      );
    }

    // Mark the matching Gatekeeper call as ended (no-op for unknown agents). Stopping the Verifier
    // agent (family page hang-up) must NOT end the caller's call, only stopping Grandma does.
    const gkSession = findByAgentId(agent_id);
    const stoppingGrandma = gkSession?.grandmaAgentId === agent_id;
    if (gkSession && stoppingGrandma) {
      endSession(gkSession);
      clearWatchdog(gkSession.id);
      // Best effort: the Verifier should not outlive the call. Never fails this request.
      if (gkSession.verifierAgentId) await stopVerifier(gkSession);
    }

    // Treat stop as idempotent: an agent that is already exiting (or gone) is a success.
    const result = await stopAgentSafe(agent_id);
    if (result === 'already-stopping') {
      return NextResponse.json({ success: true, state: 'already-stopping' });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error stopping conversation:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to stop conversation',
      },
      { status: 500 },
    );
  }
}
