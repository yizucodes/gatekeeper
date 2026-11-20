import {
  Agent,
  AgoraClient,
  Area,
  DeepgramSTT,
  ExpiresIn,
  MiniMaxTTS,
  OpenAI,
  type AgentSession,
} from 'agora-agents';
import { DEFAULT_AGENT_UID } from '@/lib/agora';
import { getConfig, toolsDisabledReason, toolsEnabled } from './config';
import { buildGrandmaPrompt, GRANDMA_FAILURE, grandmaGreeting } from './prompts';
import { grandmaTools } from './tools';

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

// AgoraClient authenticates API calls to the Agora Conversational AI service.
// area: change to Area.EU or Area.AP for European or Asia-Pacific deployments.
export function agoraClient(): AgoraClient {
  return new AgoraClient({
    area: Area.US,
    appId: requireEnv('NEXT_PUBLIC_AGORA_APP_ID'),
    appCertificate: requireEnv('NEXT_AGORA_APP_CERTIFICATE'),
  });
}

// Grandma: Deepgram (managed) STT -> OpenAI (managed) LLM -> MiniMax (managed) TTS.
// Vendor API keys are omitted, so AgentKit uses Agora-managed credentials.
export function buildGrandmaAgent(client: AgoraClient, sessionId: string) {
  const { grandmaName, publicBaseUrl } = getConfig();
  const greeting = grandmaGreeting(grandmaName);
  const withTools = toolsEnabled();

  if (!withTools) {
    console.warn(
      `[gatekeeper] Grandma starting WITHOUT tools: ${toolsDisabledReason()}. ` +
        'Policy-triggered verification still works; the checkStatus tool will not.',
    );
  }

  // Only the session id and the tool secret are passed as template variables.
  // The tool secret travels in a header and is never shown to the LLM.
  const llm = new OpenAI({
    model: 'gpt-4o-mini',
    greetingMessage: greeting,
    failureMessage: GRANDMA_FAILURE,
    maxHistory: 20,
    params: { max_tokens: 200, temperature: 0.7, top_p: 0.95 },
    ...(withTools
      ? {
          templateVariables: {
            session_id: sessionId,
            tool_secret: getConfig().toolSecret,
          },
          tools: grandmaTools(publicBaseUrl),
        }
      : {}),
  });

  return new Agent({
    client,
    instructions: buildGrandmaPrompt(grandmaName),
    greeting,
    failureMessage: GRANDMA_FAILURE,
    maxHistory: 20,
    // VAD decides when the caller starts/stops speaking; short interrupt window gives barge-in.
    turnDetection: {
      config: {
        speech_threshold: 0.5,
        start_of_speech: {
          mode: 'vad',
          vad_config: { interrupt_duration_ms: 160, prefix_padding_ms: 300 },
        },
        end_of_speech: {
          mode: 'vad',
          vad_config: { silence_duration_ms: 480 },
        },
      },
    },
    // RTM carries transcripts to the browser; enable_tools is required for custom tools.
    advancedFeatures: { enable_rtm: true, enable_tools: true },
    parameters: {
      audio_scenario: 'chorus',
      data_channel: 'rtm',
      enable_error_message: true,
      enable_metrics: true,
    },
  })
    .withStt(new DeepgramSTT({ model: 'nova-3', language: 'en' }))
    .withLlm(llm)
    .withTts(
      new MiniMaxTTS({
        model: 'speech_2_6_turbo',
        voiceId: 'English_captivating_female1',
      }),
    )
    .withTools(true);
}

export interface StartedAgent {
  agentId: string;
  session: AgentSession;
}

export async function startGrandma(opts: {
  channel: string;
  requesterId: string;
  onSession?: (session: AgentSession) => void;
}): Promise<StartedAgent> {
  const client = agoraClient();
  const agent = buildGrandmaAgent(client, opts.channel);
  // remoteUids restricts the agent to only process audio from this user.
  const session = agent.createSession({
    channel: opts.channel,
    agentUid: String(DEFAULT_AGENT_UID),
    remoteUids: [opts.requesterId],
    idleTimeout: 120,
    expiresIn: ExpiresIn.hours(1),
    debug: false, // enable debug to show restful API calls in the console
  });
  opts.onSession?.(session);
  const started = Date.now();
  const agentId = await session.start();
  console.log(
    `[gatekeeper] grandma started agent=${agentId} channel=${opts.channel} in ${Date.now() - started}ms`,
  );
  return { agentId, session };
}

function isAgentAlreadyStoppingOrStopped(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const maybeErr = error as {
    statusCode?: number;
    body?: { detail?: string; reason?: string };
    message?: string;
  };
  const reason = maybeErr.body?.reason?.toLowerCase();
  const detail =
    maybeErr.body?.detail?.toLowerCase() ?? maybeErr.message?.toLowerCase() ?? '';
  if (maybeErr.statusCode === 404) return true;
  return (
    reason === 'invalidrequest' &&
    detail.includes('already in the process of shutting down')
  );
}

// Idempotent stop. Resolves 'already-stopping' when the agent is gone or exiting; throws otherwise.
export async function stopAgentSafe(
  agentId: string,
): Promise<'stopped' | 'already-stopping'> {
  const client = agoraClient();
  const started = Date.now();
  try {
    await client.stopAgent(agentId);
    console.log(
      `[gatekeeper] leave agent=${agentId} status=200 in ${Date.now() - started}ms`,
    );
    return 'stopped';
  } catch (error) {
    if (isAgentAlreadyStoppingOrStopped(error)) {
      console.log(`[gatekeeper] leave agent=${agentId} status=already-stopping`);
      return 'already-stopping';
    }
    console.error(`[gatekeeper] leave agent=${agentId} failed`, error);
    throw error;
  }
}
