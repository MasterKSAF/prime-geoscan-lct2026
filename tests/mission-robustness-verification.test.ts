import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import {
  link,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { SHOWCASE_SCENARIOS } from '../lib/planner/mission-showcase.ts';
import { solveMissionDocument } from '../lib/planner/mission-engine.ts';
import { analyzeMissionRobustness } from '../lib/planner/mission-robustness.ts';
import { sha256 } from '../lib/planner/mission-schema.ts';
import {
  MAX_ROBUSTNESS_BUNDLE_BYTES,
  verifyMissionRobustnessBundle,
  verifyMissionRobustnessFile,
} from '../scripts/verify-mission-robustness.ts';

const fixture = (async () => {
  const document = SHOWCASE_SCENARIOS.find(
    (s) => s.id === 'repeat-sorties',
  )!.create();
  const candidate = (await solveMissionDocument(document)).candidates[0];
  assert.equal(candidate.status, 'feasible_model');
  const report = await analyzeMissionRobustness({ document, candidate });
  return {
    type: 'prime-mission-robustness-bundle',
    schemaVersion: '1.0',
    document,
    candidate,
    report,
  } as const;
})();

void test('stress bundle replay rechecks the complete suite and retains a correctly reported negative case', async () => {
  const bundle = await fixture;
  const before = JSON.stringify(bundle);
  const result = await verifyMissionRobustnessBundle(bundle);
  assert.equal(
    result.status,
    'passes-declared-model',
    JSON.stringify(result.failures),
  );
  assert.equal(result.binding, true);
  assert.equal(result.declaredCases, 4);
  assert.equal(result.comparedCases, 4);
  assert.equal(result.allDeclaredCasesRechecked, true);
  assert.equal(result.allCasesSafeInModel, false);
  assert.equal(result.flightReady, false);
  assert.ok(result.unknowns.some((id) => id.endsWith('CALIBRATION')));
  assert.ok(result.replayedCases.some((c) => c.status === 'unsafe_in_model'));
  assert.equal(result.sourceReportHash, await sha256(bundle.report));
  assert.equal(JSON.stringify(bundle), before);
});

void test('stress replay rejects forged safe status, erased violations and changed battery metrics', async () => {
  for (const mutate of [
    (b: Awaited<typeof fixture>) => {
      b.report.cases[0].status = 'safe';
      b.report.cases[0].failedChecks = [];
      b.report.cases[0].unknownChecks = [];
    },
    (b: Awaited<typeof fixture>) => {
      b.report.cases[3].metrics!.minRemainingPct += 1;
    },
    (b: Awaited<typeof fixture>) => {
      b.report.cases[3].metrics!.reserveMarginPct += 1;
    },
    (b: Awaited<typeof fixture>) => {
      b.report.cases[1].unknownChecks = [];
    },
    (b: Awaited<typeof fixture>) => {
      b.report.baseline.unknownChecks = [];
    },
    (b: Awaited<typeof fixture>) => {
      b.report.assumptions = ['Гарантируется реальная безопасность.'];
    },
  ]) {
    const bundle = structuredClone(await fixture);
    mutate(bundle);
    const result = await verifyMissionRobustnessBundle(bundle);
    assert.equal(result.status, 'rejected');
    assert.ok(result.failures.length);
    assert.equal(result.allCasesSafeInModel, false);
  }
});

void test('stress replay detects deleted, duplicated, reordered and weakened default cases', async () => {
  for (const mutate of [
    (b: Awaited<typeof fixture>) => {
      b.report.cases.splice(0, 1);
    },
    (b: Awaited<typeof fixture>) => {
      b.report.cases[0] = structuredClone(b.report.cases[1]);
    },
    (b: Awaited<typeof fixture>) => {
      b.report.cases.reverse();
    },
    (b: Awaited<typeof fixture>) => {
      b.report.cases[0].perturbation.windSpeedDeltaMps = 0;
    },
  ]) {
    const bundle = structuredClone(await fixture);
    mutate(bundle);
    const result = await verifyMissionRobustnessBundle(bundle);
    assert.equal(result.status, 'rejected');
    assert.ok(result.failures.some((f) => f.id === 'CASE_MANIFEST'));
  }
});

void test('stress proof does not fill in missing policy or perturbation values', async () => {
  const source = await fixture;
  const withoutPolicy = {
    ...source,
    report: { ...source.report, policy: undefined },
  };
  const withoutCaseField = structuredClone(source);
  delete (
    withoutCaseField.report.cases[0].perturbation as Partial<
      (typeof withoutCaseField.report.cases)[0]['perturbation']
    >
  ).startDelaySec;
  const withoutInputSafety = structuredClone(source);
  delete withoutInputSafety.document.planning.safetyPolicy;
  withoutInputSafety.report.inputHash = await sha256(
    withoutInputSafety.document,
  );
  assert.equal(
    (await verifyMissionRobustnessBundle(withoutPolicy)).status,
    'rejected',
  );
  assert.equal(
    (await verifyMissionRobustnessBundle(withoutCaseField)).status,
    'rejected',
  );
  const safety = await verifyMissionRobustnessBundle(withoutInputSafety);
  assert.equal(safety.status, 'rejected');
  assert.ok(safety.failures.some((f) => f.id === 'INPUT_POLICIES'));
});

void test('matching forged hashes do not bypass trajectory and metric verification', async () => {
  const bundle = structuredClone(await fixture);
  bundle.candidate.metrics.makespanSec = 1;
  bundle.candidate.plan.metrics.makespanSec = 1;
  bundle.report.planHash = await sha256(bundle.candidate);
  const result = await verifyMissionRobustnessBundle(bundle);
  assert.equal(result.binding, true);
  assert.equal(result.status, 'rejected');
  assert.ok(result.failures.some((f) => f.id === 'BASELINE_INVALID'));
});

void test('creation and compute timestamps are not forged deterministic measurements', async () => {
  const bundle = structuredClone(await fixture);
  bundle.report.createdAt = '2026-09-20T00:00:00.000Z';
  bundle.report.elapsedMs = 12345;
  bundle.report.budgetExhausted = true;
  const result = await verifyMissionRobustnessBundle(bundle);
  assert.equal(
    result.status,
    'passes-declared-model',
    JSON.stringify(result.failures),
  );
  assert.ok(
    result.limitations.some((text) => text.includes('время вычисления')),
  );
});

void test('original budget-exhausted cases remain incomplete even if replay can now finish', async (t) => {
  const source = await fixture;
  let calls = 0;
  const now = t.mock.method(performance, 'now', () => (calls++ ? 101 : 0));
  const report = await analyzeMissionRobustness({
    document: source.document,
    candidate: source.candidate,
    maxComputeMs: 100,
  });
  now.mock.restore();
  assert.equal(report.baseline.status, 'not_checked');
  const result = await verifyMissionRobustnessBundle({ ...source, report });
  assert.equal(result.status, 'incomplete', JSON.stringify(result.failures));
  assert.equal(result.allDeclaredCasesRechecked, false);
  assert.equal(result.comparedCases, 0);
  assert.equal(result.allCasesSafeInModel, false);
  assert.ok(result.unknowns.includes('BASELINE_NOT_CHECKED'));
  assert.ok(result.unknowns.some((id) => id.startsWith('CASE_NOT_CHECKED:')));
});

async function temporary<T>(
  action: (folder: string) => Promise<T>,
): Promise<T> {
  const folder = await mkdtemp(join(tmpdir(), 'lct-stress-verify-'));
  if (dirname(resolve(folder)) !== resolve(tmpdir()) || !basename(folder).startsWith('lct-stress-verify-')) {
    throw new Error('Refusing cleanup outside the owned temporary test directory.');
  }
  try {
    return await action(folder);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

void test('file verification writes a new report and cannot overwrite input, an existing output or a hardlink', async () => {
  const bundle = await fixture;
  await temporary(async (folder) => {
    const input = join(folder, 'bundle.json');
    const output = join(folder, 'verification.json');
    const alias = join(folder, 'alias.json');
    const text = JSON.stringify(bundle);
    await writeFile(input, text);
    const result = await verifyMissionRobustnessFile(input, output);
    assert.equal(result.status, 'passes-declared-model');
    assert.equal(
      JSON.parse(await readFile(output, 'utf8')).status,
      'passes-declared-model',
    );
    await assert.rejects(
      () => verifyMissionRobustnessFile(input, input),
      /совпадать/,
    );
    await assert.rejects(
      () => verifyMissionRobustnessFile(input, output),
      /существует/,
    );
    await link(input, alias);
    await assert.rejects(
      () => verifyMissionRobustnessFile(input, alias),
      /существует|ссылается/,
    );
    assert.equal(await readFile(input, 'utf8'), text);
  });
});

void test('file verification rejects duplicate keys, unsafe nesting and oversized input before output creation', async () => {
  await temporary(async (folder) => {
    const input = join(folder, 'invalid.json');
    const output = join(folder, 'must-not-exist.json');
    for (const text of [
      '{"report":{},"report":{}}',
      '{"__proto__":{}}',
      '['.repeat(30) + '1' + ']'.repeat(30),
      ' '.repeat(MAX_ROBUSTNESS_BUNDLE_BYTES + 1),
    ]) {
      await writeFile(input, text);
      await assert.rejects(() => verifyMissionRobustnessFile(input, output));
      assert.ok(!(await readdir(folder)).includes('must-not-exist.json'));
    }
  });
});

void test('importing the verifier neither runs its CLI nor writes output files', async () => {
  const scriptUrl = new URL(
    '../scripts/verify-mission-robustness.ts',
    import.meta.url,
  );
  await temporary(async (folder) => {
    const run = spawnSync(
      process.execPath,
      [
        '--no-warnings',
        '--experimental-transform-types',
        '--input-type=module',
        '-e',
        `await import(${JSON.stringify(scriptUrl.href)});`,
      ],
      { cwd: folder, encoding: 'utf8', timeout: 10000 },
    );
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, '');
    assert.deepEqual(await readdir(folder), []);
  });
});

void test('CLI reports pass, rejection and incomplete with distinct exit codes', async () => {
  const script = fileURLToPath(
    new URL('../scripts/verify-mission-robustness.ts', import.meta.url),
  );
  const base = await fixture;
  await temporary(async (folder) => {
    for (const [index, expected] of [0, 1, 2].entries()) {
      const bundle = structuredClone(base);
      if (index === 1) bundle.report.cases[3].metrics!.minRemainingPct += 1;
      if (index === 2) {
        bundle.report.cases[3].status = 'not_checked';
        bundle.report.cases[3].metrics = null;
        bundle.report.cases[3].failedChecks = [];
        bundle.report.cases[3].unknownChecks = [];
        bundle.report.cases[3].detail = 'Исчерпан бюджет.';
        bundle.report.budgetExhausted = true;
      }
      const input = join(folder, `bundle-${index}.json`);
      const output = join(folder, `verification-${index}.json`);
      await writeFile(input, JSON.stringify(bundle));
      const run = spawnSync(
        process.execPath,
        [
          '--no-warnings',
          '--experimental-transform-types',
          script,
          input,
          output,
        ],
        { cwd: folder, encoding: 'utf8', timeout: 10000 },
      );
      assert.equal(run.status, expected, run.stderr || run.stdout);
      const report = JSON.parse(await readFile(output, 'utf8'));
      assert.equal(
        report.status,
        ['passes-declared-model', 'rejected', 'incomplete'][index],
      );
      assert.equal(report.flightReady, false);
    }
  });
});
