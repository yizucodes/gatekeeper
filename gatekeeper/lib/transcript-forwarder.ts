import {
  TurnStatus,
  type AgentTranscription,
  type TranscriptHelperItem,
  type UserTranscription,
} from 'agora-agent-client-toolkit';
import type { Speaker } from '@/types/gatekeeper';

// Browser-side: forwards each turn (and every later text refinement of it) from the starter's transcript mechanism
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
  // Last text sent per turn. The toolkit's TEXT mode marks every item END and then overwrites the
  // same turn_id with fuller text as speech recognition refines it, so "sent once per turn" would
  // keep only the first fragment ("Grandma, it's"). Send again whenever the text changes.
  const lastText = new Map<string, string>();
  // Posts are chained so an older, shorter text can never land after a newer one.
  let queue: Promise<unknown> = Promise.resolve();

  // `items` must already be uid-normalized (toolkit uid "0" remapped to the local RTC uid).
  return (items: Item[]) => {
    for (const item of items) {
      // Explicit IN_PROGRESS partials are skipped; END and INTERRUPTED are sent.
      if (item.status === TurnStatus.IN_PROGRESS) continue;
      const text = typeof item.text === 'string' ? item.text.trim() : '';
      if (!text) continue;

      let speaker: Speaker | undefined;
      if (item.uid === options.localUid) speaker = options.localSpeaker;
      else if (item.uid === options.agentUid) speaker = options.agentSpeaker;
      if (!speaker) continue;

      const key = `${item.uid}:${item.turn_id}`;
      if (lastText.get(key) === text) continue;
      lastText.set(key, text);

      const body = JSON.stringify({
        sessionId: options.sessionId,
        speaker,
        text,
        turnId: key,
        ts: Date.now(),
      });
      // Fire and forget: a failed post must never disturb the call.
      queue = queue.then(() =>
        fetch('/api/transcript', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          keepalive: true,
        }).catch((error) => {
          console.warn('[gatekeeper] transcript forward failed', error);
        }),
      );
    }
  };
}
