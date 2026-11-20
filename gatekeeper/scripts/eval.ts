import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_THRESHOLDS } from '../lib/server/policy';
import { getScorer } from '../lib/server/risk';
import {
  SCENARIOS,
  runScenario,
  scenarioPassed,
  type ScenarioResult,
} from '../lib/server/scenarios';

// Replays the scripted scenarios through the active scorer and the policy, prints a table, and
// writes eval_results.md. Exits non-zero if any scenario misses its expectation.
// All numbers come from the run itself; nothing is hard-coded.

function row(result: ScenarioResult): string[] {
  const { scenario, firstRedLine, finalLevel, latenciesMs } = result;
  const avg = latenciesMs.reduce((a, b) => a + b, 0) / Math.max(1, latenciesMs.length);
  return [
    scenario.name,
    scenario.kind,
    firstRedLine === null ? '-' : `line ${firstRedLine}/${scenario.lines.length}`,
    finalLevel,
    scenario.expectInjection ? (result.injectionFlagged ? 'flagged' : 'MISSED') : '-',
    `${avg.toFixed(1)} ms`,
    scenarioPassed(result) ? 'pass' : 'FAIL',
  ];
}

function markdownTable(header: string[], rows: string[][]): string {
  const lines = [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.join(' | ')} |`),
  ];
  return lines.join('\n');
}

async function main() {
  const scorer = getScorer();
  const results: ScenarioResult[] = [];
  for (const scenario of SCENARIOS) {
    results.push(await runScenario(scenario, scorer, DEFAULT_THRESHOLDS));
  }

  const scams = results.filter((r) => r.scenario.kind === 'scam');
  const benign = results.filter((r) => r.scenario.kind === 'benign');
  const caught = scams.filter(scenarioPassed).length;
  const falseAlarms = benign.filter((r) => r.firstRedLine !== null).length;
  const injections = results.filter((r) => r.scenario.expectInjection);
  const injectionsFlagged = injections.filter((r) => r.injectionFlagged).length;
  const allLatencies = results.flatMap((r) => r.latenciesMs);
  const avgLatency = allLatencies.reduce((a, b) => a + b, 0) / Math.max(1, allLatencies.length);

  const header = ['Scenario', 'Kind', 'Turned red at', 'Final', 'Injection', 'Avg score time', 'Result'];
  const table = markdownTable(header, results.map(row));
  const summary = [
    `Scams caught: ${caught}/${scams.length}`,
    `False alarms: ${falseAlarms}/${benign.length}`,
    `Injection flagged: ${injectionsFlagged}/${injections.length}`,
    `Scorer: ${scorer.name}, average ${avgLatency.toFixed(1)} ms per scored window`,
    `Thresholds: red ${DEFAULT_THRESHOLDS.red}, amber ${DEFAULT_THRESHOLDS.amber}`,
  ];

  console.log(`\n${table}\n`);
  console.log(summary.join('\n'));

  const report = [
    '# Gatekeeper eval results',
    '',
    `Generated ${new Date().toISOString()} by \`pnpm eval\`.`,
    '',
    table,
    '',
    ...summary.map((line) => `- ${line}`),
    '',
  ].join('\n');
  const out = resolve(process.cwd(), 'eval_results.md');
  writeFileSync(out, report);
  console.log(`\nWrote ${out}`);

  const failed = results.filter((r) => !scenarioPassed(r));
  if (failed.length > 0) {
    console.error(`\n${failed.length} scenario(s) failed: ${failed.map((r) => r.scenario.id).join(', ')}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
