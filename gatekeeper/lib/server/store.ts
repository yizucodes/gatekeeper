import type { AgentSession } from 'agora-agents';
import { emptyScores } from '@/lib/gatekeeper-shared';
import type {
  GkEvent,
  Session,
  Speaker,
  StateSnapshot,
  Verification,
} from '@/types/gatekeeper';
import { getConfig } from './config';

// In-memory store. Lives on globalThis so it survives Next.js hot reload and is
// shared between route bundles. Run as a single local Node process (not serverless).
interface Handles {
  grandma?: AgentSession;
  verifier?: AgentSession;
}

interface Store {
  sessions: Map<string, Session>;
  handles: Map<string, Handles>;
  latestId?: string;
}

const g = globalThis as typeof globalThis & { __gatekeeper?: Store };

function store(): Store {
  if (!g.__gatekeeper) {
    g.__gatekeeper = { sessions: new Map(), handles: new Map() };
  }
  return g.__gatekeeper;
}

const MAX_TRANSCRIPT_LINES = 500;
const MAX_EVENTS = 200;

// Session id is the RTC channel name, so the starter's token/invite/stop routes keep their contracts.
export function createSession(channel: string, callerUid: string): Session {
  const s = store();
  const existing = s.sessions.get(channel);
  if (existing) return existing;
  const session: Session = {
    id: channel,
    createdAt: Date.now(),
    channel,
    callerUid,
    transcript: [],
    scores: emptyScores(),
    scorer: 'keyword',
    riskLevel: 'green',
    verification: 'none',
    events: [],
    metrics: {},
    decisions: [],
    manualInterventions: 0,
  };
  s.sessions.set(channel, session);
  s.latestId = channel;
  addEvent(session, 'call_started', 'Caller connected');
  return session;
}

export function getSession(id: string | null | undefined): Session | undefined {
  if (!id) return undefined;
  return store().sessions.get(id);
}

export function getLatestSession(): Session | undefined {
  const s = store();
  return s.latestId ? s.sessions.get(s.latestId) : undefined;
}

export function findByAgentId(agentId: string): Session | undefined {
  for (const session of store().sessions.values()) {
    if (session.grandmaAgentId === agentId || session.verifierAgentId === agentId) {
      return session;
    }
  }
  return undefined;
}

export function addEvent(session: Session, type: string, detail: string): GkEvent {
  const event: GkEvent = { ts: Date.now(), type, detail };
  session.events.push(event);
  if (session.events.length > MAX_EVENTS) session.events.shift();
  console.log(`[gatekeeper] ${session.id} event ${type}: ${detail}`);
  return event;
}

export function addTranscript(
  session: Session,
  speaker: Speaker,
  text: string,
  ts: number = Date.now(),
  turnId?: string,
) {
  if (turnId) {
    // Update the turn in place. Search from the end: a turn is almost always among the latest lines.
    for (let i = session.transcript.length - 1; i >= 0; i--) {
      const line = session.transcript[i];
      if (line.speaker === speaker && line.turnId === turnId) {
        line.text = text;
        return;
      }
    }
  }
  session.transcript.push({ speaker, text, ts, ...(turnId ? { turnId } : {}) });
  if (session.transcript.length > MAX_TRANSCRIPT_LINES) session.transcript.shift();
}

export function setVerification(session: Session, verification: Verification) {
  session.verification = verification;
}

export function setHandle(
  sessionId: string,
  role: keyof Handles,
  handle: AgentSession | undefined,
) {
  const s = store();
  const handles = s.handles.get(sessionId) ?? {};
  handles[role] = handle;
  s.handles.set(sessionId, handles);
}

export function getHandles(sessionId: string): Handles {
  return store().handles.get(sessionId) ?? {};
}

export function endSession(session: Session) {
  if (!session.endedAt) {
    session.endedAt = Date.now();
    addEvent(session, 'call_ended', `Outcome: ${session.verification}`);
  }
}

export function toSnapshot(session: Session): StateSnapshot {
  const { decisions: _decisions, ...rest } = session;
  void _decisions;
  const { grandmaName, familyName, familyRelation } = getConfig();
  return {
    ...rest,
    serverTime: Date.now(),
    profile: { grandmaName, familyName, familyRelation },
  };
}
