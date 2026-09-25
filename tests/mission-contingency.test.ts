import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHOWCASE_SCENARIOS,
  DEMONSTRATION_SCENARIOS,
} from '../lib/planner/mission-showcase.ts';
import { solveMissionDocument } from '../lib/planner/mission-engine.ts';
import { certifyMissionContingencies } from '../lib/planner/mission-contingency.ts';
import { canonicalStringify, sha256 } from '../lib/planner/mission-schema.ts';
import { fixedWingFixture } from './fixtures/fixed-wing.ts';

const fixture = async () => {
  const document = SHOWCASE_SCENARIOS.find(
    (x) => x.id === 'repeat-sorties',
  )!.create();
  const candidate = (await solveMissionDocument(document)).candidates[0];
  return { document, candidate };
};

void test('contingency: every continuous motion interval is covered without sampling gaps or mutating inputs', async () => {
  const { document, candidate } = await fixture();
  const before = canonicalStringify({ document, candidate });
  const certificate = await certifyMissionContingencies(document, candidate, {
    maxComputeMs: 10000,
  });
  assert.equal(certificate.status, 'certified_model');
  assert.equal(certificate.anchorCount, certificate.certifiedAnchors);
  assert.equal(certificate.checkedAnchors, certificate.anchors.length);
  assert.equal(
    certificate.certifiedAnchors,
    certificate.independentAnchors + certificate.plannedCorridorAnchors,
  );
  assert.equal(certificate.inputHash, await sha256(document));
  assert.equal(certificate.candidateHash, await sha256(candidate));
  assert.equal(canonicalStringify({ document, candidate }), before);
  assert.ok(certificate.maxResponseDelaySec <= 30 + 1e-6);
  assert.ok(certificate.minimumRemainingPct! >= document.scenario.reservePct);
  for (const sortie of candidate.sorties)
    for (const [index, seg] of sortie.segments.entries()) {
      const anchors = certificate.anchors.filter(
        (a) => a.sortieId === sortie.id && a.segmentIndex === index,
      );
      assert.equal(anchors[0].intervalStartSec, seg.startSec);
      assert.ok(Math.abs(anchors.at(-1)!.anchorSec - seg.endSec) < 1e-6);
      for (let i = 1; i < anchors.length; i++)
        assert.ok(
          Math.abs(anchors[i].intervalStartSec - anchors[i - 1].anchorSec) <
            1e-6,
        );
    }
});

void test('contingency: bounded anchor cap cannot be reported as a complete certificate', async () => {
  const { document, candidate } = await fixture();
  const c = await certifyMissionContingencies(document, candidate, {
    maxAnchors: 1,
  });
  assert.equal(c.status, 'not_certified');
  assert.equal(c.budgetExceeded, true);
  assert.ok(c.anchorCount > 1);
  assert.equal(c.checkedAnchors, 0);
});

void test('contingency: incomplete or modified source plans are never trusted', async () => {
  const { document, candidate } = await fixture();
  const modified = structuredClone(candidate);
  modified.sorties[0].segments[0].batteryToPct = 100;
  assert.equal(
    (await certifyMissionContingencies(document, modified)).status,
    'not_certified',
  );
  const partial = structuredClone(candidate);
  partial.status = 'partial';
  assert.equal(
    (await certifyMissionContingencies(document, partial)).status,
    'not_certified',
  );
  document.name = 'Changed input';
  const mismatch = await certifyMissionContingencies(document, candidate);
  assert.equal(mismatch.status, 'not_certified');
  assert.match(mismatch.reasons.join(' '), /другому заданию/);
});

void test('contingency: unknown terrain is explicitly outside the claimed certificate scope', async () => {
  const { document } = await fixture();
  document.terrainModel = { kind: 'unknown', source: 'Нет DEM' };
  const candidate = (await solveMissionDocument(document)).candidates[0];
  const c = await certifyMissionContingencies(document, candidate);
  assert.equal(c.status, 'not_certified');
  assert.match(c.reasons.join(' '), /плоский рельеф/);
});

void test('contingency: obstacle demonstration certifies actual independent routed departures', async () => {
  const document = DEMONSTRATION_SCENARIOS.find(
    (x) => x.id === 'demo-02-obstacles',
  )!.create();
  const candidate = (await solveMissionDocument(document)).candidates[0];
  const c = await certifyMissionContingencies(document, candidate, {
    maxComputeMs: 15000,
  });
  assert.equal(c.status, 'certified_model');
  assert.ok(c.independentAnchors > 0);
  assert.ok(
    c.anchors.some(
      (a) =>
        a.mode === 'independent-escape' &&
        a.route.filter((s) => s.phase === 'return').length > 2,
    ),
  );
  for (const a of c.anchors.filter((a) => a.mode === 'independent-escape')) {
    assert.ok(a.route.every((s) => s.phase !== 'survey'));
    assert.ok(a.remainingPct! >= document.scenario.reservePct);
  }
});

void test('contingency: planned-corridor fallback is counted separately and cannot pretend to be a shortcut', async () => {
  // Fixed-wing emergency turns are not synthesized by this certificate. Unlike
  // a particular optimizer choice in demo 1, this fixture necessarily exercises
  // the original-corridor fallback, even when the main search improves.
  const { d: document } = fixedWingFixture();
  document.planning.safetyPolicy = 'continuous-occupancy-v1';
  document.planning.batteryPolicy = 'installed-current-v1';
  document.planning.maxComputeMs = 10000;
  const candidate = (await solveMissionDocument(document)).candidates[0];
  const c = await certifyMissionContingencies(document, candidate, {
    maxComputeMs: 15000,
  });
  assert.equal(c.status, 'certified_model');
  assert.ok(c.plannedCorridorAnchors > 0);
  for (const a of c.anchors.filter(
    (a) => a.mode === 'planned-corridor-sensing-off',
  )) {
    const original = candidate.sorties.find((s) => s.id === a.sortieId)!;
    assert.equal(a.landingSec, original.endSec);
    assert.equal(a.remainingPct, original.remainingPct);
    assert.deepEqual(a.landing, original.segments.at(-1)!.to);
    assert.ok(a.reasons.length > 0);
  }
});

void test('contingency: invalid limits are rejected instead of silently weakening coverage', async () => {
  const { document, candidate } = await fixture();
  await assert.rejects(
    certifyMissionContingencies(document, candidate, {
      maxIntervalSec: Infinity,
    }),
  );
  await assert.rejects(
    certifyMissionContingencies(document, candidate, { maxAnchors: 0 }),
  );
  await assert.rejects(
    certifyMissionContingencies(document, candidate, { maxComputeMs: 0 }),
  );
});

void test('contingency: 201 original-corridor certificate preserves full moving phases and reports its actual longer response delay', async () => {
  const { d } = fixedWingFixture();
  d.planning.safetyPolicy = 'continuous-occupancy-v1';
  d.planning.batteryPolicy = 'installed-current-v1';
  d.planning.maxComputeMs = 10000;
  const candidate = (await solveMissionDocument(d)).candidates[0];
  const c = await certifyMissionContingencies(d, candidate, {
    maxComputeMs: 15000,
  });
  assert.equal(c.status, 'certified_model');
  assert.equal(c.independentAnchors, 0);
  assert.equal(c.plannedCorridorAnchors, c.anchorCount);
  assert.equal(
    c.anchorCount,
    candidate.sorties.reduce((n, s) => n + s.segments.length, 0),
  );
  assert.ok(c.maxResponseDelaySec > 30); // Never advertise an unverified 30s response.
  for (const a of c.anchors) {
    const original = candidate.sorties.find((s) => s.id === a.sortieId)!;
    assert.equal(a.anchorSec, original.segments[a.segmentIndex].endSec);
    assert.deepEqual(a.route, original.segments.slice(a.segmentIndex + 1));
  }
});
