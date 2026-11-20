import { NextRequest, NextResponse } from 'next/server';
import { ClientStartRequest, AgentResponse } from '@/types/conversation';
import { requireEnv, startGrandma } from '@/lib/server/agents';
import {
  addEvent,
  createSession,
  endSession,
  setHandle,
} from '@/lib/server/store';

// Starts the Grandma agent for a browser caller.
// The agent prompt, tools and voice pipeline live in lib/server/agents.ts (buildGrandmaAgent).
export async function POST(request: NextRequest) {
  try {
    // --- 1. Parse request ---

    const body: ClientStartRequest = await request.json();
    const { requester_id, channel_name } = body;

    // Validate required env vars on first request so misconfiguration surfaces
    // with a clear error message rather than a silent failure.
    requireEnv('NEXT_PUBLIC_AGORA_APP_ID');
    requireEnv('NEXT_AGORA_APP_CERTIFICATE');

    if (!channel_name || !requester_id) {
      return NextResponse.json(
        { error: 'channel_name and requester_id are required' },
        { status: 400 },
      );
    }

    // --- 2. Register the call, then start the agent ---

    // The store session exists before the agent starts, so tool calls can resolve it immediately.
    // Session id = RTC channel name.
    const gkSession = createSession(channel_name, requester_id);

    try {
      const { agentId, session } = await startGrandma({
        channel: channel_name,
        requesterId: requester_id,
        onSession: (handle) => setHandle(gkSession.id, 'grandma', handle),
      });
      gkSession.grandmaAgentId = agentId;
      addEvent(gkSession, 'grandma_started', 'Grandma agent joined the call');
      setHandle(gkSession.id, 'grandma', session);

      return NextResponse.json({
        agent_id: agentId,
        create_ts: Math.floor(Date.now() / 1000),
        state: 'RUNNING',
      } as AgentResponse);
    } catch (startError) {
      addEvent(gkSession, 'grandma_start_failed', 'Grandma agent failed to start');
      endSession(gkSession);
      throw startError;
    }
  } catch (error) {
    console.error('Error starting conversation:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to start conversation',
      },
      { status: 500 },
    );
  }
}
