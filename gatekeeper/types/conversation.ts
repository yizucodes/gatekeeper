import type { RTMClient } from 'agora-rtm';
import type { TranscriptForwardingOptions } from '@/lib/transcript-forwarder';

export interface AgoraTokenData {
  token: string;
  uid: string;
  channel: string;
  agentId?: string;
}

export interface ClientStartRequest {
  requester_id: string;
  channel_name: string;
}

export interface StopConversationRequest {
  agent_id: string;
}

export interface AgentResponse {
  agent_id: string;
  create_ts: number;
  state: string;
}

export interface AgoraRenewalTokens {
  rtcToken: string;
  rtmToken: string;
}

export interface ConversationComponentProps {
  // Gatekeeper: RTC uid of the agent in this channel (defaults to DEFAULT_AGENT_UID).
  agentUid?: string;
  // Gatekeeper: forward final turns to POST /api/transcript.
  transcriptForwarding?: TranscriptForwardingOptions;
  agoraData: AgoraTokenData;
  rtmClient: RTMClient;
  onTokenWillExpire: (uid: string) => Promise<AgoraRenewalTokens>;
  onEndConversation: () => void;
}
