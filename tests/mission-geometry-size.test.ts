import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGeometryOverflowFixtures } from '../scripts/create-geometry-overflow-fixtures.ts';
import {
  canonicalMissionJson,
  importGeometryText,
  MAX_MISSION_FILE_BYTES,
  parseMissionText,
  parseSizedMissionDocument,
  serializeMissionJson,
} from '../lib/planner/mission-io.ts';
import { parseMissionDocument } from '../lib/planner/mission-schema.ts';
import type { MissionDocument } from '../lib/planner/mission-schema.ts';
import type { Polygon } from '../lib/planner/schema.ts';

void test('geometry merge rejects a schema-valid mission above the save limit before editor state changes', () => {
  const fixture = createGeometryOverflowFixtures();
  const input = serializeMissionJson(fixture.document);
  assert.ok(Buffer.byteLength(input) <= MAX_MISSION_FILE_BYTES);
  assert.ok(Buffer.byteLength(fixture.geometryText) <= MAX_MISSION_FILE_BYTES);
  const original = parseMissionText(input, 'json');
  const before = structuredClone(original);
  const imported = importGeometryText(fixture.geometryText, 'geojson', 'area');
  const merged = structuredClone(original);
  merged.jobs.splice(
    0,
    1,
    ...imported.features.map((feature, i) => ({
      ...structuredClone(original.jobs[0]),
      id: i === 0 ? original.jobs[0].id : `import-${i}`,
      name: feature.name,
      area: feature.geometry as Polygon,
    })),
  );
  assert.doesNotThrow(() => parseMissionDocument(merged));
  assert.ok(
    Buffer.byteLength(canonicalMissionJson(merged)) > MAX_MISSION_FILE_BYTES,
  );
  let edited: MissionDocument | undefined;
  assert.throws(() => {
    edited = parseSizedMissionDocument(merged);
  }, /200 КиБ/);
  assert.equal(edited, undefined);
  assert.deepEqual(original, before);
});

void test('sized mission validation retains every field, returns a clone and keeps schema checks', () => {
  const { document } = createGeometryOverflowFixtures();
  const accepted = parseSizedMissionDocument(document);
  assert.notEqual(accepted, document);
  assert.deepEqual(accepted, document);
  assert.deepEqual(parseMissionText(serializeMissionJson(accepted)), document);
  assert.throws(() =>
    parseSizedMissionDocument({ ...document, unknown: true }),
  );
  assert.throws(
    () =>
      parseSizedMissionDocument({
        ...document,
        window: { ...document.window, end: document.window.start },
      }),
    /Окно миссии/,
  );
});
