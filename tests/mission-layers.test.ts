import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoMission } from '../lib/planner/mission-demo.ts';
import {
  appendRestrictionLayer,
  parseRestrictionLayer,
  serializeRestrictionLayer,
  restrictionFromPolygon,
} from '../lib/planner/mission-layers.ts';

const fixture = () => {
  const document = demoMission();
  document.restrictions = [
    restrictionFromPolygon(
      document.jobs[0].area,
      'hill-1',
      'Учебная возвышенность',
      70,
      'Объём оператора, не реальный DEM',
    ),
  ];
  document.restrictions[0].startAt = document.window.start;
  document.restrictions[0].endAt = document.window.end;
  return document;
};
void test('restriction layer round-trip preserves geometry, heights and active interval', () => {
  const document = fixture();
  const layer = parseRestrictionLayer(serializeRestrictionLayer(document));
  assert.deepEqual(layer.restrictions, document.restrictions);
  const empty = demoMission(),
    next = appendRestrictionLayer(empty, layer);
  assert.deepEqual(next.restrictions, document.restrictions);
  assert.deepEqual(empty.restrictions, []);
});
void test('restriction import rejects duplicate IDs and overflow atomically', () => {
  const document = fixture(),
    original = structuredClone(document);
  const layer = parseRestrictionLayer(serializeRestrictionLayer(document));
  assert.throws(
    () => appendRestrictionLayer(document, layer),
    /уже существует/,
  );
  assert.deepEqual(document, original);
  document.restrictions = Array.from({ length: 20 }, (_, i) => ({
    ...structuredClone(original.restrictions[0]),
    id: `r-${i}`,
  }));
  assert.throws(() => appendRestrictionLayer(document, layer), /более 20/);
  assert.equal(document.restrictions.length, 20);
});
void test('restriction contract rejects wrong datum, duplicate JSON keys and invalid intervals', () => {
  const layer = parseRestrictionLayer(serializeRestrictionLayer(fixture()));
  assert.throws(() =>
    parseRestrictionLayer(
      JSON.stringify({ ...layer, altitudeReference: 'AMSL' }),
    ),
  );
  assert.throws(() =>
    parseRestrictionLayer(
      JSON.stringify(layer).replace(
        '"schemaVersion":"1.0"',
        '"schemaVersion":"9.0","schemaVersion":"1.0"',
      ),
    ),
  );
  layer.restrictions[0].maxAltitudeM = -1;
  assert.throws(() => parseRestrictionLayer(JSON.stringify(layer)), /ниже/);
  layer.restrictions[0].maxAltitudeM = 70;
  layer.restrictions[0].endAt = null;
  assert.throws(() => parseRestrictionLayer(JSON.stringify(layer)), /границы/);
});
void test('restriction import does not silently close malformed rings or accept unknown fields', () => {
  const layer = parseRestrictionLayer(serializeRestrictionLayer(fixture()));
  layer.restrictions[0].geometry.coordinates[0].pop();
  assert.throws(
    () => parseRestrictionLayer(JSON.stringify(layer)),
    /не замкнуто/,
  );
  assert.throws(() =>
    parseRestrictionLayer(JSON.stringify({ ...layer, groundElevationM: 100 })),
  );
});
