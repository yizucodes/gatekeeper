import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SCENARIOS, type Scenario } from '../lib/server/scenarios';
import type { GkEvent, PolicyDecision, StateSnapshot } from '../types/gatekeeper';

// End-to-end harness for a RUNNING Gatekeeper server. It plays each scripted call through the same
// HTTP endpoints the browser and Agora use (POST /api/transcript, /api/tools/*, GET /api/state,
// the trail export) and checks the live behaviour: timing, debounce, policy, verification, trail.
//
// It does NOT exercise audio, STT/LLM/TTS or the Agora agent join: those need a real call.
// Harness sessions are prefixed "harness-" and never start a real Verifier agent.
//
//   pnpm harness --spawn              start a server on a free port (needs `pnpm build` first)
//   pnpm harness                      use a server that is already running (DEMO_MODE=true needed)
// Options: --base-url=http://localhost:3000  --port=3457  --pause=1100  --only=<scenario-id>

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'] as const;
  }),
);
const spawnServer = args.has('spawn');
const port = Number(args.get('port') ?? 3457);
const baseUrl = (args.get('base-url') ?? (spawnServer ? `http://localhost:${port}` : 'http://localhost:3000')).replace(/\/+$/, '');
// Longer than the 700 ms scoring debounce so every line gets its own scored window.
const pauseMs = Number(args.get('pause') ?? 1100);
const only = args.get('only');

// Minimal .env.local reader. Only TOOL_SECRET and DEMO_FAMILY_NAME are used; nothing is printed.
function readEnvFile(): Record<string, string> {
  const file = resolve(process.cwd(), '.env.local');
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trimStart().startsWith('#')) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const envFile = readEnvFile();
const toolSecret = spawnServer ? `harness-${randomBytes(12).toString('hex')}` : envFile.TOOL_SECRET ?? process.env.TOOL_SECRET ?? '';
const familyName = envFile.DEMO_FAMILY_NAME || process.env.DEMO_FAMILY_NAME || 'Alex';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api(path: string, init: RequestInit & { secret?: string | null } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const secret = init.secret === undefined ? toolSecret : init.secret;
  if (secret) headers['x-tool-secret'] = secret;
  const started = performance.now();
  const res = await fetch(`${baseUrl}${path}`, { ...init, headers: { ...headers, ...(init.headers as object) } });
  const text = await res.text();
  // Responses are checked field by field below, so the JSON is deliberately loosely typed.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Non-JSON body (for example an HTML 404 page); leave json null.
  }
  return { status: res.status, json, text, headers: res.headers, ms: Math.round(performance.now() - started) };
}

interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}

interface ScenarioRun {
  scenario: Scenario;
  checks: Check[];
  redLine: number | null;
}

async function getState(id: string): Promise<StateSnapshot | null> {
  const res = await api(`/api/state?session=${encodeURIComponent(id)}`);
  return (res.json?.session as StateSnapshot | undefined) ?? null;
}

async function waitFor<T>(fn: () => Promise<T | null | undefined | false>, timeoutMs: number, stepMs = 150): Promise<T | null> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const value = await fn();
    if (value) return value;
    await sleep(stepMs);
  }
  return null;
}

async function play(scenario: Scenario): Promise<ScenarioRun> {
  const id = `harness-${scenario.id}-${Date.now().toString(36)}`;
  const checks: Check[] = [];
  const check = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  const created = await api('/api/demo/simulate', { method: 'POST', body: JSON.stringify({ action: 'new_session', session: id }) });
  check('session created', created.status === 200, `status ${created.status}`);
  if (created.status !== 200) return { scenario, checks, redLine: null };

  // 1. Play the caller's lines through the real ingest route, one scored window per line.
  let redLine: number | null = null;
  let maxLevel = 'green';
  for (let i = 0; i < scenario.lines.length; i++) {
    const res = await api('/api/transcript', {
      method: 'POST',
      body: JSON.stringify({ sessionId: id, speaker: 'caller', text: scenario.lines[i], ts: Date.now() }),
    });
    if (res.status !== 200) check(`line ${i + 1} accepted`, false, `status ${res.status}`);
    await sleep(pauseMs);
    const state = await getState(id);
    if (state?.riskLevel === 'red') {
      maxLevel = 'red';
      redLine ??= i + 1;
    } else if (state?.riskLevel === 'amber' && maxLevel === 'green') {
      maxLevel = 'amber';
    }
  }
  const state = await getState(id);
  check('transcript stored', state?.transcript?.length === scenario.lines.length, `${state?.transcript?.length ?? 0}/${scenario.lines.length} lines`);
  check('scored with the keyword or SIE scorer', state?.scorer === 'keyword' || state?.scorer === 'sie', `scorer=${state?.scorer}`);

  if (scenario.kind === 'benign') {
    check('never turned red', redLine === null, redLine ? `red at line ${redLine}` : undefined);
    check('no verification started', state?.verification === 'none', `verification=${state?.verification}`);
  } else {
    const limit = scenario.expectRedByLine ?? scenario.lines.length;
    check(`red by line ${limit}`, redLine !== null && redLine <= limit, redLine ? `red at line ${redLine}` : `never red (max ${maxLevel})`);
    if (scenario.expectInjection) {
      check('injection flagged', !!state?.events?.some((e: GkEvent) => e.type === 'injection_flagged'));
    }

    // 2. Red must start verification automatically and launch the (fake) Verifier.
    const pending = await waitFor(async () => {
      const s = await getState(id);
      return s?.verification === 'pending' && s.events.some((e: GkEvent) => e.type === 'calling_family') ? s : null;
    }, 3000);
    check('verification started automatically', !!pending, pending ? undefined : `verification=${state?.verification}`);
    check('timeline shows "verification_started" and "calling_family"', !!pending);

    // 3. Tool routes: auth, status, idempotency.
    const noAuth = await api(`/api/tools/check-status?session=${id}`, { secret: null });
    const wrongAuth = await api(`/api/tools/check-status?session=${id}`, { secret: 'wrong' });
    check('tools reject missing or wrong secret', noAuth.status === 401 && wrongAuth.status === 401, `${noAuth.status}/${wrongAuth.status}`);

    const status = await api(`/api/tools/check-status?session=${id}`);
    check('checkStatus returns pending guidance', status.status === 200 && status.json?.verification === 'pending' && typeof status.json?.guidance === 'string', `status ${status.status}`);
    check('guidance contains no family name or secret', !JSON.stringify(status.json).includes(familyName) && !JSON.stringify(status.json).includes(toolSecret));

    const startedAt = (await getState(id))?.metrics?.verifyStartedAt;
    const again = await api(`/api/tools/request-verification?session=${id}`, {
      method: 'POST',
      body: JSON.stringify({ claimed_identity: 'grandson', claim_summary: 'Says he needs bail money', tool_call_id: 'harness' }),
    });
    check('requestVerification is idempotent', again.status === 200 && again.json?.status === 'pending' && (await getState(id))?.metrics?.verifyStartedAt === startedAt);

    // 4. The Verifier reports back: family is safe and did not call.
    const report = await api(`/api/tools/report-verification?session=${id}`, {
      method: 'POST',
      body: JSON.stringify({ result: 'family_safe_did_not_call', note: 'Harness: I am fine and did not call' }),
    });
    check('reportVerification accepted', report.status === 200 && report.json?.ok === true, `status ${report.status}`);
    const done = await getState(id);
    check('state is confirmed_safe_family_not_caller', done?.verification === 'confirmed_safe_family_not_caller', `verification=${done?.verification}`);
    check('timeline shows family_reached', !!done?.events?.some((e: GkEvent) => e.type === 'family_reached'));
    const after = await api(`/api/tools/check-status?session=${id}`);
    check('checkStatus now tells Grandma to end the call', after.json?.verification === 'confirmed_safe_family_not_caller' && /ending|hang|goodbye/i.test(after.json?.guidance ?? ''));
  }

  // 5. Honesty and export checks for every scenario.
  const final = await getState(id);
  check('no manual interventions were used', final?.manualInterventions === 0, `count=${final?.manualInterventions}`);
  const trail = await api(`/api/session/${id}/trail`);
  const decisions: PolicyDecision[] = trail.json?.session?.decisions ?? [];
  check(
    'trail export has a decision per scored line',
    trail.status === 200 &&
      (trail.headers.get('content-disposition') ?? '').startsWith('attachment') &&
      decisions.length >= 1 &&
      decisions.every((d: PolicyDecision) => typeof d.window === 'string' && d.window.length > 0),
    `${decisions.length} decisions`,
  );

  return { scenario, checks, redLine };
}

async function startServer(): Promise<ChildProcess> {
  if (!existsSync(resolve(process.cwd(), '.next/BUILD_ID'))) {
    throw new Error('No production build found. Run `pnpm build` first (or start your own server and omit --spawn).');
  }
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DEMO_MODE: 'true',
      TOOL_SECRET: toolSecret,
      PUBLIC_BASE_URL: 'https://harness.invalid',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout?.on('data', (d) => (log += d));
  child.stderr?.on('data', (d) => (log += d));
  const ready = await waitFor(async () => {
    if (child.exitCode !== null) throw new Error(`Server exited early:\n${log}`);
    try {
      return (await fetch(`${baseUrl}/api/state`)).ok;
    } catch {
      return false;
    }
  }, 30000, 300);
  if (!ready) {
    child.kill();
    throw new Error(`Server did not become ready on ${baseUrl}:\n${log}`);
  }
  return child;
}

async function main() {
  let server: ChildProcess | undefined;
  if (pauseMs < 800) {
    console.warn(`Warning: --pause=${pauseMs} is below the 700 ms scoring debounce, so the "red by line N" checks can fail even when the server is fine.`);
  }
  try {
    if (spawnServer) {
      console.log(`Starting server on ${baseUrl} ...`);
      server = await startServer();
    } else {
      const probe = await api('/api/state').catch(() => null);
      if (!probe || probe.status !== 200) throw new Error(`No Gatekeeper server at ${baseUrl}. Start one, or use --spawn.`);
      const demo = await api('/api/demo/simulate', { method: 'POST', body: JSON.stringify({ action: 'nope' }) });
      if (demo.status === 403) throw new Error('The server has DEMO_MODE off. Set DEMO_MODE=true in .env.local and restart it, or use --spawn.');
      if (!toolSecret) throw new Error('TOOL_SECRET is not set in .env.local, so the tool routes cannot be tested.');
    }

    const scenarios = SCENARIOS.filter((s) => !only || s.id === only);
    if (scenarios.length === 0) throw new Error(`No scenario with id "${only}". Ids: ${SCENARIOS.map((s) => s.id).join(', ')}`);

    const runs: ScenarioRun[] = [];
    for (const scenario of scenarios) {
      process.stdout.write(`Playing "${scenario.name}" ... `);
      const run = await play(scenario);
      const failed = run.checks.filter((c) => !c.ok).length;
      console.log(failed === 0 ? 'ok' : `${failed} check(s) failed`);
      runs.push(run);
    }

    console.log('\n| Scenario | Kind | Red at | Checks | Result |');
    console.log('| --- | --- | --- | --- | --- |');
    for (const r of runs) {
      const passed = r.checks.filter((c) => c.ok).length;
      console.log(
        `| ${r.scenario.name} | ${r.scenario.kind} | ${r.redLine ? `line ${r.redLine}/${r.scenario.lines.length}` : '-'} | ${passed}/${r.checks.length} | ${passed === r.checks.length ? 'pass' : 'FAIL'} |`,
      );
    }

    const failures = runs.flatMap((r) => r.checks.filter((c) => !c.ok).map((c) => `  ${r.scenario.id}: ${c.name}${c.detail ? ` (${c.detail})` : ''}`));
    const total = runs.reduce((n, r) => n + r.checks.length, 0);
    console.log(`\n${total - failures.length}/${total} checks passed against ${baseUrl}`);
    console.log('Not covered: audio, STT/LLM/TTS, the Agora agent join, and the real Verifier call (needs a live call).');
    if (failures.length > 0) {
      console.error(`\nFailures:\n${failures.join('\n')}`);
      process.exitCode = 1;
    }
  } finally {
    server?.kill();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
