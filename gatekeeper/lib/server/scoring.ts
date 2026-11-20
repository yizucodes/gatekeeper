import type { Session } from '@/types/gatekeeper';
import { applyPolicy } from './policy';
import { buildWindow, getScorer, keywordScorer, type RiskResult } from './risk';
import { addEvent } from './store';

// Score the caller's recent words and apply policy. Debounced per session to at most one run
// every MIN_INTERVAL_MS; a burst of lines is coalesced into one trailing run on the latest text.

const MIN_INTERVAL_MS = 700;

interface Slot {
  lastRun: number;
  running: boolean;
  timer?: ReturnType<typeof setTimeout>;
  dirty: boolean;
}

const g = globalThis as typeof globalThis & { __gatekeeperScoring?: Map<string, Slot> };
function slots(): Map<string, Slot> {
  if (!g.__gatekeeperScoring) g.__gatekeeperScoring = new Map();
  return g.__gatekeeperScoring;
}

export async function scoreAndDecide(session: Session): Promise<void> {
  const window = buildWindow(session.transcript);
  if (!window) return;

  let result: RiskResult;
  try {
    result = await getScorer().score(window);
  } catch (error) {
    // Any scorer failure falls back to keywords so the demo never stalls.
    console.error('[gatekeeper] scorer failed, using keyword fallback', error);
    addEvent(session, 'scorer_fallback', 'Scorer failed; using keyword scorer');
    result = await keywordScorer.score(window);
  }
  console.log(
    `[gatekeeper] scored session=${session.id} scorer=${result.scorer} latency=${result.latencyMs}ms`,
  );
  await applyPolicy(session, {
    scores: result.scores,
    scorer: result.scorer,
    window,
    scamType: result.scamType,
    latencyMs: result.latencyMs,
  });
}

export function scheduleScoring(session: Session): void {
  const map = slots();
  const slot = map.get(session.id) ?? { lastRun: 0, running: false, dirty: false };
  map.set(session.id, slot);
  slot.dirty = true;
  if (slot.running || slot.timer) return;

  const wait = Math.max(0, slot.lastRun + MIN_INTERVAL_MS - Date.now());
  slot.timer = setTimeout(async function run() {
    slot.timer = undefined;
    slot.running = true;
    slot.dirty = false;
    slot.lastRun = Date.now();
    try {
      await scoreAndDecide(session);
    } catch (error) {
      console.error('[gatekeeper] scoring failed', error);
    } finally {
      slot.running = false;
      // New lines arrived while scoring: run once more on the latest window.
      if (slot.dirty) {
        slot.timer = setTimeout(run, Math.max(0, slot.lastRun + MIN_INTERVAL_MS - Date.now()));
      }
    }
  }, wait);
}
