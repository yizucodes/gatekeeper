import {
  TurnStatus,
  type AgentTranscription,
  type TranscriptHelperItem,
  type UserTranscription,
} from 'agora-agent-client-toolkit';
import type { Speaker } from '@/types/gatekeeper';

// Browser-side: forwards each FINAL turn from the starter's transcript mechanism
// (AgoraVoiceAI TRANSCRIPT_UPDATED, via ConversationComponent) to POST /api/transcript.

type Item = TranscriptHelperItem<Partial<UserTranscription | AgentTranscription>>;

export interface TranscriptForwardingOptions {
  sessionId: string;
  // Speaker label for the local user's turns.
  localSpeaker: Extract<Speaker, 'caller' | 'family'>;
  // When set, turns from the agent are forwarded with this label (dashboard only, not scored).
  agentSpeaker?: Extract<Speaker, 'grandma'>;
}

export function createTranscriptForwarder(
  options: TranscriptForwardingOptions & { localUid: string; agentUid: string },
) {
  const sent = new Set<string>();

  // `items` must already be uid-normalized (toolkit uid "0" remapped to the local RTC uid).
  return (items: Item[]) => {
    for (const item of items) {
      // END and INTERRUPTED are final; IN_PROGRESS is a partial and must not be scored.
      if (item.status === TurnStatus.IN_PROGRESS) continue;
      const text = typeof item.text === 'string' ? item.text.trim() : '';
      if (!text) continue;

      let speaker: Speaker | undefined;
      if (item.uid === options.localUid) speaker = options.localSpeaker;
      else if (item.uid === options.agentUid) speaker = options.agentSpeaker;
      if (!speaker) continue;

      const key = `${item.uid}:${item.turn_id}`;
      if (sent.has(key)) continue;
      sent.add(key);

      // Fire and forget: a failed post must never disturb the call.
      void fetch('/api/transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: options.sessionId,
          speaker,
          text,
          ts: Date.now(),
        }),
        keepalive: true,
      }).catch((error) => {
        console.warn('[gatekeeper] transcript forward failed', error);
      });
    }
  };
}
