// Read-only investigation of the application model; writes only a study report.
// This is not a regression test that freezes the current model's limitations.
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { demoScenario } from '../lib/planner/demo.ts';
import { solve } from '../lib/planner/engine.ts';
import { ENGINE_VERSION } from '../lib/planner/schema.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceFiles = ['lib/planner/schema.ts', 'lib/planner/engine.ts', 'lib/planner/geometry.ts', 'lib/planner/demo.ts'];
const runs = [15.6, 200].map((triggerDistanceM) => {
  const scenario = demoScenario();
  scenario.job.triggerDistanceM = triggerDistanceM;
  const result = solve(scenario);
  return {
    triggerDistanceM,
    inputSha256: createHash('sha256').update(JSON.stringify(scenario)).digest('hex'),
    coveragePct: result.metrics.coveragePct,
    makespanSec: result.metrics.makespanSec,
    plannedShots: result.missions.reduce((sum, mission) => sum + (mission.shots ?? 0), 0),
    payloadCheck: result.checks.find((check) => check.id === 'PAYLOAD'),
    failedChecks: result.checks.filter((check) => check.status === 'fail'),
  };
});
const cameraExample = {
  kind: 'analytical-example-not-aircraft-calibration',
  heightM: 100,
  sensorWidthMm: 23.5,
  sensorHeightMm: 15.6,
  focalMm: 20,
  imageWidthPx: 6000,
  imageHeightPx: 4000,
  sideOverlap: 0.7,
  frontOverlap: 0.8,
  groundSpeedMps: 12,
  assumedMinTriggerSec: 2,
};
const widthM = cameraExample.heightM * cameraExample.sensorWidthMm / cameraExample.focalMm;
const lengthM = cameraExample.heightM * cameraExample.sensorHeightMm / cameraExample.focalMm;
const triggerM = lengthM * (1 - cameraExample.frontOverlap);
const output = {
  recordedAt: new Date().toISOString(),
  evidenceKind: 'local-model-diagnostic',
  engineVersion: ENGINE_VERSION,
  nodeVersion: process.versions.node,
  reproduce: 'node --experimental-transform-types scripts/study-gcs-transfer.ts',
  input: 'demoScenario(): synthetic boundaries, weather and operating profiles; no real flight data',
  sources: sourceFiles.map((file) => ({ file, sha256: createHash('sha256').update(readFileSync(resolve(root, file))).digest('hex') })),
  triggerSensitivity: {
    runs,
    geometricCoverageUnchanged: Math.abs(runs[0].coveragePct - runs[1].coveragePct) < 1e-9,
    limitation: 'The current metric measures swept strips, not camera-frame coverage or image quality. This observation is not a QGC/Mission Planner benchmark.',
  },
  cameraExample: {
    ...cameraExample,
    footprintWidthM: widthM,
    footprintLengthM: lengthM,
    gsdXcm: widthM / cameraExample.imageWidthPx * 100,
    gsdYcm: lengthM / cameraExample.imageHeightPx * 100,
    lineSpacingM: widthM * (1 - cameraExample.sideOverlap),
    triggerDistanceM: triggerM,
    triggerIntervalSec: triggerM / cameraExample.groundSpeedMps,
    hypotheticalGroundSpeedLimitMps: triggerM / cameraExample.assumedMinTriggerSec,
    assumptions: 'Flat terrain; nadir camera; specified orientation; pinhole model. The 2 s interval is hypothetical, not a Sony or Geoscan specification.',
  },
};
const destination = resolve(root, 'output/gcs-study/transfer-diagnostic.json');
mkdirSync(dirname(destination), { recursive: true });
writeFileSync(destination, JSON.stringify(output, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(output, null, 2));
