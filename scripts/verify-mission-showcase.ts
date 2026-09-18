import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHOWCASE_SCENARIOS } from '../lib/planner/mission-showcase.ts';
import type { ShowcaseScenario } from '../lib/planner/mission-showcase.ts';
import {
  MISSION_ENGINE_VERSION,
  MISSION_VERSION,
  sha256,
} from '../lib/planner/mission-schema.ts';
import type {
  MissionDocument,
  MissionResult,
} from '../lib/planner/mission-schema.ts';
import type { Check } from '../lib/planner/schema.ts';
import { serializeMissionJson } from '../lib/planner/mission-io.ts';
import { sameMissionPlan } from '../lib/planner/mission-comparison.ts';
import { missionEvidence } from '../lib/planner/mission-export.ts';
import { verifyMissionEvidence } from './verify-mission-evidence.ts';

// The runner obtains every solution over loopback HTTP: no local solver,
// substitution, retries, parallel POSTs or promotion of negative examples.
// Evidence checks are a separate local validation pass, not certification.
const failures = (checks: Check[]) => checks.filter((c) => c.status === 'fail');
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
const json = (path: string, value: unknown) =>
  writeFile(path, JSON.stringify(value, null, 2));

export async function inspectShowcaseResult(
  scenario: ShowcaseScenario,
  submitted: MissionDocument,
  result: MissionResult,
) {
  const checks: Check[] = [];
  const add = (id: string, pass: boolean, detail: string) =>
    checks.push({ id, status: pass ? 'pass' : 'fail', title: id, detail });
  add(
    'ENGINE_VERSION',
    result.engineVersion === MISSION_ENGINE_VERSION,
    `Required ${MISSION_ENGINE_VERSION}.`,
  );
  add(
    'INPUT_HASH',
    result.inputHash === (await sha256(submitted)) &&
      result.inputHash === (await sha256(result.document)),
    'Submitted and returned documents have the same canonical hash.',
  );
  add(
    'LEGACY_CANDIDATES',
    result.candidates.length === 2 &&
      result.candidates[0]?.objective === 'makespan' &&
      result.candidates[1]?.objective === 'flightTime',
    'Exactly two legacy candidates in objective order.',
  );
  const positive = scenario.expected === 'feasible_model';
  add(
    'RECOMMENDATION_GATE',
    positive ? !!result.recommendation : !result.recommendation,
    'Positive examples require a recommendation; rejected examples must not receive one.',
  );
  const candidates = [
    ...result.candidates,
    ...(result.recommendation ? [result.recommendation.candidate] : []),
  ];
  const bundles = [];
  for (const [index, candidate] of candidates.entries()) {
    const label = index < 2 ? `legacy-${index + 1}` : 'balanced';
    const evidence = await missionEvidence(result, candidate);
    const independent = await verifyMissionEvidence(
      JSON.parse(JSON.stringify(evidence)),
    );
    const rejected = failures(independent);
    add(
      `${label}_MODEL_ONLY`,
      evidence.flightReady === false && evidence.approval === null,
      'Unapproved model evidence only.',
    );
    add(
      `${label}_EXPECTATION`,
      positive
        ? candidate.status === 'feasible_model' &&
            !failures(candidate.checks).length &&
            !rejected.length
        : candidate.status !== 'feasible_model' &&
            failures(candidate.checks).length > 0 &&
            independent.some(
              (c) => c.id === 'CLAIMED_SUCCESS' && c.status === 'fail',
            ),
      positive
        ? 'Full feasible plan passes evidence verification.'
        : 'Saved and independently checked rejection; not a successful flight plan.',
    );
    if (positive) {
      for (const id of scenario.checks)
        add(
          `${label}_${id}`,
          independent.some((c) => c.id === id && c.status === 'pass'),
          'Declared showcase check passes on exported evidence.',
        );
      add(
        `${label}_RESERVE`,
        candidate.metrics.minimumRemainingPct >= submitted.scenario.reservePct,
        'Reserve is not traded against cost.',
      );
    }
    bundles.push({
      label,
      evidence,
      independent,
      summary: {
        label,
        candidateId: candidate.id,
        objective: candidate.objective,
        status: candidate.status,
        verificationStatus: rejected.length
          ? 'rejected'
          : 'passes-declared-model',
        metrics: candidate.metrics,
        vehicles: [...new Set(candidate.sorties.map((s) => s.vehicleId))],
        bearings: candidate.jobCoverage.map((row) => ({
          jobId: row.jobId,
          bearingDeg: row.bearingDeg,
        })),
        independentChecks: independent.length,
        failures: rejected,
        unknowns: independent.filter((c) => c.status === 'unknown'),
      },
    });
  }
  const recommendation = result.recommendation;
  if (recommendation) {
    const candidate = recommendation.candidate;
    const normalize = (value: number, range: { min: number; max: number }) =>
      range.max === range.min
        ? 0
        : (value - range.min) / (range.max - range.min);
    const t = normalize(
      candidate.metrics.makespanSec,
      recommendation.ranges.makespanSec,
    );
    const f = normalize(
      candidate.metrics.flightTimeSec,
      recommendation.ranges.flightTimeSec,
    );
    add(
      'BALANCED_FORMULA',
      recommendation.policy === 'balanced-normalized-v1' &&
        recommendation.weights.makespan === 0.5 &&
        recommendation.weights.flightTime === 0.5 &&
        Math.abs(t - recommendation.normalized.makespan) < 1e-9 &&
        Math.abs(f - recommendation.normalized.flightTime) < 1e-9 &&
        Math.abs(recommendation.score - 0.5 * t - 0.5 * f) < 1e-9,
      'Recompute 50/50 score from disclosed pool ranges; this does not certify global optimality.',
    );
    add(
      'BALANCED_EXPORT_ASSUMPTIONS',
      candidate.assumptions.includes(recommendation.explanation) &&
        recommendation.explanation.includes('50/50') &&
        recommendation.explanation.includes('(T − min T)/(max T − min T)') &&
        recommendation.explanation.includes('(F − min F)/(max F − min F)') &&
        recommendation.explanation.includes('не физический износ') &&
        recommendation.resourceProxy === 'flightTimeSec',
      'Independent balanced export retains formula, normalization and resource-proxy meaning.',
    );
    const actualSame = result.candidates
      .filter((c) => sameMissionPlan(c, candidate))
      .map((c) => c.objective);
    add(
      'SAME_PLAN_HONESTY',
      recommendation.samePlan === actualSame.length > 0 &&
        JSON.stringify(recommendation.samePlanAs) ===
          JSON.stringify(actualSame),
      'Route identity is recomputed, not inferred from objective labels.',
    );
    if (scenario.id === 'automatic-tradeoff') {
      const [fast, economical] = result.candidates;
      add(
        'AUTOMATIC_ASSIGNMENT',
        submitted.scenario.vehicles.length >= 2 &&
          submitted.jobs.every((job) => job.assignedVehicleIds.length === 0),
        'Vehicles are selected by the solver.',
      );
      add(
        'THREE_DISTINCT_PLANS',
        !sameMissionPlan(fast, economical) &&
          !sameMissionPlan(fast, candidate) &&
          !sameMissionPlan(economical, candidate),
        'All three physical plans differ.',
      );
      add(
        'STRICT_INTERIOR_TRADEOFF',
        fast.metrics.makespanSec < candidate.metrics.makespanSec &&
          candidate.metrics.makespanSec < economical.metrics.makespanSec &&
          economical.metrics.flightTimeSec < candidate.metrics.flightTimeSec &&
          candidate.metrics.flightTimeSec < fast.metrics.flightTimeSec,
        'Balanced is strictly between both extremes in makespan and total flight time.',
      );
    }
  }
  return { checks, bundles, status: failures(checks).length ? 'fail' : 'pass' };
}

export async function runShowcaseVerification(
  base = 'http://127.0.0.1:3016',
  output = 'output/mission-showcase-0.3.0/scenarios',
) {
  if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))
    throw new Error('Verification is loopback HTTP-only.');
  await mkdir(output, { recursive: true });
  const report: {
    createdAt: string;
    base: string;
    engineVersion: string;
    flightReady: false;
    retries: number;
    plannedScenarios: number;
    postRequests: number;
    status: 'pass' | 'fail';
    scenarios: unknown[];
    errors: string[];
    limitations: string[];
  } = {
    createdAt: new Date().toISOString(),
    base,
    engineVersion: MISSION_ENGINE_VERSION,
    flightReady: false,
    retries: 0,
    plannedScenarios: SHOWCASE_SCENARIOS.length,
    postRequests: 0,
    status: 'pass',
    scenarios: [],
    errors: [],
    limitations: [
      'Synthetic examples and declared model only; not official benchmark, real-flight clearance or telemetry.',
      'Independent pass shares geometry/validation libraries with the solver; not independent certification.',
      'Bounded search is hardware/time dependent; full pool and global optimality are not independently proven.',
      'One sequential request per scenario; no retries, stress, oversized-body or runtime-stability proof.',
    ],
  };
  const health = async (phase: string) => {
    const response = await fetch(`${base}/api/planner/health`, {
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    });
    const body = await response.text();
    await json(`${output}/health-${phase}.json`, {
      checkedAt: new Date().toISOString(),
      status: response.status,
      body,
    });
    const state = JSON.parse(body);
    if (
      response.status !== 200 ||
      state.missionSchemaVersion !== MISSION_VERSION ||
      state.missionEngineVersion !== MISSION_ENGINE_VERSION ||
      state.flightReady !== false
    )
      throw new Error(
        `Health/version gate failed (${phase}): HTTP ${response.status}, ${body}`,
      );
  };
  try {
    await health('before');
    for (const scenario of SHOWCASE_SCENARIOS) {
      const dir = `${output}/${scenario.id}`;
      await mkdir(dir, { recursive: true });
      const document = scenario.create();
      await writeFile(`${dir}/mission.json`, serializeMissionJson(document));
      const started = performance.now();
      try {
        report.postRequests++;
        const response = await fetch(`${base}/api/planner/missions/solve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: serializeMissionJson(document),
          redirect: 'error',
          signal: AbortSignal.timeout(30_000),
        });
        const body = await response.text();
        const httpMs = performance.now() - started;
        await json(`${dir}/http.json`, {
          status: response.status,
          httpMs,
          retryCount: 0,
          contentType: response.headers.get('content-type'),
        });
        await writeFile(`${dir}/result.json`, body);
        if (response.status !== 200)
          throw new Error(`HTTP ${response.status}: ${body}`);
        const result = JSON.parse(body) as MissionResult;
        const audit = await inspectShowcaseResult(scenario, document, result);
        for (const bundle of audit.bundles) {
          await json(`${dir}/evidence-${bundle.label}.json`, bundle.evidence);
          await json(`${dir}/independent-${bundle.label}.json`, {
            flightReady: false,
            status: bundle.summary.verificationStatus,
            checks: bundle.independent,
          });
        }
        const summary = {
          id: scenario.id,
          title: scenario.title,
          expected: scenario.expected,
          status: audit.status,
          inputHash: result.inputHash,
          httpMs,
          computationMs: result.computationMs,
          candidates: audit.bundles.map((bundle) => bundle.summary),
          recommendation: result.recommendation
            ? { ...result.recommendation, candidate: undefined }
            : null,
          checks: audit.checks,
        };
        await json(`${dir}/report.json`, summary);
        report.scenarios.push(summary);
        if (audit.status === 'fail') report.status = 'fail';
        console.log(
          JSON.stringify({
            id: scenario.id,
            status: audit.status,
            expected: scenario.expected,
            httpMs,
            failures: failures(audit.checks),
          }),
        );
      } catch (error) {
        report.status = 'fail';
        const failure = {
          id: scenario.id,
          expected: scenario.expected,
          status: 'fail',
          error: errorMessage(error),
        };
        report.scenarios.push(failure);
        await json(`${dir}/report.json`, failure);
        console.error(JSON.stringify(failure));
      }
    }
    await health('after');
  } catch (error) {
    report.status = 'fail';
    report.errors.push(errorMessage(error));
  }
  await json(`${output}/report.json`, report);
  console.log(
    JSON.stringify({
      output,
      status: report.status,
      scenarios: report.scenarios.length,
      postRequests: report.postRequests,
      errors: report.errors,
    }),
  );
  return report;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.includes('--help'))
    console.log(
      'node --experimental-transform-types scripts/verify-mission-showcase.ts [http://127.0.0.1:3016] [output/mission-showcase-0.3.0/scenarios]',
    );
  else if (
    (await runShowcaseVerification(process.argv[2], process.argv[3])).status ===
    'fail'
  )
    process.exitCode = 1;
}
