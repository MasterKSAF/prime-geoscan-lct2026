import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from '@xmldom/xmldom';
import { demoMission } from '../lib/planner/mission-demo.ts';
import { solveMissionDocument } from '../lib/planner/mission-engine.ts';
import {
  missionEvidence,
  missionGeoJSON,
  missionKML,
} from '../lib/planner/mission-export.ts';
import { sha256, sha256Text } from '../lib/planner/mission-schema.ts';

void test('failed calculation still exports diagnostic evidence without invented paths', async () => {
  const result = await solveMissionDocument(demoMission(100));
  const candidate = result.candidates[0];
  assert.equal(candidate.status, 'not_found');
  assert.equal(candidate.sorties.length, 0);
  const evidence = await missionEvidence(result, candidate);
  assert.equal(evidence.artifacts.geojson.features.length, 0);
  assert.ok(evidence.artifacts.geojson.properties.jobs.length);
  assert.equal(evidence.artifacts.kml.includes('<Placemark>'), false);
  assert.equal(evidence.flightReady, false);
  assert.ok(candidate.checks.some((check) => check.status === 'fail'));
});

void test('v2 exports preserve sortie, battery, absolute time and honest height datum', async () => {
  const doc = demoMission();
  doc.name = 'Тест <миссии> & "экспорт"';
  const result = await solveMissionDocument(doc),
    candidate = result.candidates[0];
  assert.equal(candidate.status, 'feasible_model');
  const geo = missionGeoJSON(result.document, candidate);
  assert.equal(geo.properties.flightReady, false);
  assert.equal(
    geo.properties.altitudeDatum,
    'above_declared_local_flat_surface',
  );
  assert.equal(geo.properties.jobs[0].job.type, 'RGB');
  assert.ok(geo.properties.jobs[0].effectiveJob!.triggerDistanceM > 0);
  assert.ok(geo.properties.jobs[0].quality.source);
  assert.equal(
    geo.features.filter((f) => f.properties.kind === 'sortie').length,
    candidate.sorties.length,
  );
  for (const f of geo.features) {
    assert.ok(f.properties.sortieId);
    assert.ok(f.properties.vehicleId);
    const pairs =
      f.geometry.type === 'Point'
        ? [f.geometry.coordinates]
        : f.geometry.coordinates;
    assert.ok(
      (pairs as number[][]).every(
        (p) => p.length === 2 && p.every(Number.isFinite),
      ),
    );
  }
  const filtered = missionGeoJSON(
    result.document,
    candidate,
    candidate.sorties[0].vehicleId,
  );
  assert.equal(
    filtered.properties.checksScope,
    'complete_candidate_before_vehicle_filter',
  );
  assert.deepEqual(filtered.properties.checks, candidate.checks);
  assert.ok(
    filtered.features.every(
      (f) => f.properties.vehicleId === candidate.sorties[0].vehicleId,
    ),
  );
  const kml = missionKML(result.document, candidate),
    errors: string[] = [];
  const xml = new DOMParser({
    onError: (level, msg) => {
      if (level !== 'warning') errors.push(msg);
    },
  }).parseFromString(kml, 'application/xml');
  assert.deepEqual(errors, []);
  assert.equal(xml.getElementsByTagName('name')[0].textContent, doc.name);
  assert.equal(
    xml.getElementsByTagName('Placemark').length,
    candidate.sorties.reduce((n, s) => n + s.segments.length, 0),
  );
  assert.ok(kml.includes('clampToGround'));
  assert.ok(!kml.includes('<altitudeMode>absolute'));
});
void test('evidence binds the exact input, candidate, approval and raw UTF-8 KML', async () => {
  const result = await solveMissionDocument(demoMission()),
    candidate = result.candidates[0];
  const approval = {
    inputHash: result.inputHash,
    candidateId: candidate.id,
    planHash: await sha256(candidate),
    approvedAt: new Date().toISOString(),
  };
  const evidence = await missionEvidence(result, candidate, approval);
  assert.equal(
    evidence.artifactHashes.kmlUtf8,
    await sha256Text(evidence.artifacts.kml),
  );
  assert.equal(
    evidence.artifactHashes.geojsonCanonicalJson,
    await sha256(evidence.artifacts.geojson),
  );
  const changed = structuredClone(result);
  changed.document.planning.separationHorizontalM++;
  await assert.rejects(
    () => missionEvidence(changed, candidate, approval),
    /хеш/,
  );
  const stale = { ...approval, planHash: '0'.repeat(64) };
  await assert.rejects(
    () => missionEvidence(result, candidate, stale),
    /Подтверждение/,
  );
});
