import { mkdir, writeFile } from 'node:fs/promises';
import { DEMONSTRATION_SCENARIOS } from '../lib/planner/mission-showcase.ts';
import type {
  MissionDocument,
  MissionResult,
} from '../lib/planner/mission-schema.ts';
import {
  MISSION_ENGINE_VERSION,
  sha256,
} from '../lib/planner/mission-schema.ts';
import { missionEvidence } from '../lib/planner/mission-export.ts';
import {
  missionImprovementTrials,
  compareMissionTrial,
} from '../lib/planner/mission-insights.ts';
import { buildMissionDeliveryManifest } from '../lib/planner/mission-delivery-manifest.ts';
import { verifyMissionEvidence } from './verify-mission-evidence.ts';
import { sortiesConflict } from '../lib/planner/mission-validation.ts';

const base = process.argv[2] ?? 'http://127.0.0.1:3016',
  out = process.argv[3] ?? 'output/three-demo-evidence';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))
  throw Error('Only a loopback test server is allowed.');
await mkdir(out, { recursive: true });
const json = (path: string, value: unknown) =>
  writeFile(`${out}/${path}`, JSON.stringify(value, null, 2));
const checks: { name: string; pass: boolean; detail: string }[] = [],
  summaries: unknown[] = [];
const check = (name: string, pass: boolean, detail = '') => {
  checks.push({ name, pass, detail });
};
let requests = 0;
async function solve(d: MissionDocument): Promise<MissionResult> {
  requests++;
  const response = await fetch(`${base}/api/planner/missions/solve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(d),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw Error(`HTTP ${response.status}: ${await response.text()}`);
  const r = (await response.json()) as MissionResult;
  check(
    `${d.id}: returned input hash`,
    r.inputHash === (await sha256(d)) &&
      r.inputHash === (await sha256(r.document)),
  );
  check(
    `${d.id}: running engine version`,
    r.engineVersion === MISSION_ENGINE_VERSION,
  );
  return r;
}
for (const s of DEMONSTRATION_SCENARIOS) {
  const d = s.create();
  await json(`${s.id}.input.json`, d);
  try {
    const result = await solve(d);
    await json(`${s.id}.result.json`, result);
    const expected = s.expected === 'feasible_model';
    for (const c of result.candidates) {
      const evidence = await missionEvidence(result, c),
        audit = await verifyMissionEvidence(evidence);
      await json(`${s.id}.${c.id}.evidence.json`, evidence);
      await json(`${s.id}.${c.id}.verification.json`, audit);
      check(
        `${s.id}/${c.id}: declared outcome`,
        expected
          ? c.status === 'feasible_model' &&
              c.metrics.grossCoveragePct >= 99.99 &&
              !audit.some((a) => a.status === 'fail')
          : c.status !== 'feasible_model' &&
              audit.some(
                (a) => a.id === 'CLAIMED_SUCCESS' && a.status === 'fail',
              ),
      );
      await json(
        `${s.id}.${c.id}.delivery-manifest.json`,
        await buildMissionDeliveryManifest(d, c, false),
      );
      if (s.id === 'demo-02-obstacles') {
        const [a, b] = c.sorties;
        check(
          `${s.id}/${c.id}: actual separated schedule`,
          !!a && !!b && !sortiesConflict(d, a, b),
        );
        if (a && b) {
          const changed = structuredClone(b),
            delta = b.startSec - a.startSec;
          changed.startSec -= delta;
          changed.endSec -= delta;
          changed.readySec -= delta;
          changed.segments.forEach((p) => {
            p.startSec -= delta;
            p.endSec -= delta;
          });
          check(
            `${s.id}/${c.id}: removing delay is unsafe`,
            sortiesConflict(d, a, changed),
          );
        }
      }
    }
    const trials = [];
    if (s.id === 'demo-03-repair')
      for (const t of missionImprovementTrials(d, result.candidates[0])) {
        const alternative = await solve(t.document),
          c = alternative.candidates[0],
          comparison = compareMissionTrial(result.candidates[0], c),
          evidence = await missionEvidence(alternative, c),
          audit = await verifyMissionEvidence(evidence);
        await json(`${s.id}.${t.id}.json`, {
          trial: t,
          comparison,
          result: alternative,
          evidence,
          audit,
        });
        check(
          `${s.id}/${t.id}: repair outcome`,
          t.id === 'battery-full-demo-07'
            ? comparison.feasible && !audit.some((a) => a.status === 'fail')
            : !comparison.feasible,
        );
        trials.push({
          id: t.id,
          title: t.title,
          status: c.status,
          feasible: comparison.feasible,
        });
      }
    summaries.push({
      id: s.id,
      title: s.title,
      expected: s.expected,
      candidates: result.candidates.map((c) => ({
        id: c.id,
        status: c.status,
        metrics: c.metrics,
      })),
      trials,
    });
  } catch (e) {
    check(`${s.id}: runtime`, false, String(e));
  }
}
const report = {
  at: new Date().toISOString(),
  base,
  engineVersion: MISSION_ENGINE_VERSION,
  requests,
  retries: 0,
  modelOnly: true,
  simulationsExecuted: false,
  status: checks.every((c) => c.pass) ? 'pass' : 'fail',
  checks,
  scenarios: summaries,
  limits: [
    'API and exported model checks only. Browser simulation is checked separately.',
    'Shared geometry/validation library; not independent certification.',
    'No imagery generated or acquired; manifests describe planned outputs.',
  ],
};
await json('report.json', report);
await writeFile(
  `${out}/report.md`,
  [
    `# Три демонстрационных сценария: API и доказательства`,
    ``,
    `Дата: ${report.at}. Ядро: ${report.engineVersion}. Итог: ${report.status}. Проверок: ${checks.filter((c) => c.pass).length}/${checks.length}. HTTP-запросов: ${requests}; повторов: 0.`,
    ``,
    `| Проверка | Результат |`,
    `|---|---|`,
    ...checks.map(
      (c) =>
        `| ${c.name.replaceAll('|', '/')} | ${c.pass ? 'PASS' : 'FAIL'} ${c.detail.replaceAll('|', '/')} |`,
    ),
    ``,
    `## Границы`,
    ``,
    `Это расчёт и повторная проверка выгруженных доказательств. Завершение браузерной симуляции проверяется отдельным скриптом. Нет реальных полётов, полученных снимков, сертификации или гарантии оценки жюри.`,
    ``,
  ].join('\n'),
);
console.log(
  JSON.stringify(
    {
      output: out,
      status: report.status,
      checks: checks.length,
      failed: checks.filter((c) => !c.pass),
      requests,
    },
    null,
    2,
  ),
);
if (report.status === 'fail') process.exitCode = 1;
