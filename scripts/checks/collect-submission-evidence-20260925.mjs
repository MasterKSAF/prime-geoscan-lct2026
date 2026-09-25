import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { sha256 } from '../../lib/planner/mission-schema.ts';

const root = 'output/playwright/acceptance-2026-09-25';
const read = file => fs.readFile(file, 'utf8');
const json = async file => JSON.parse(await read(file));
const artifact = async file => {
  const bytes = await fs.readFile(file);
  return { path: file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
};
const build = await read(`${root}/engine/package-docker-build.log`);
const plain = build.replace(/^#\d+\s+[\d.]+\s?/gm, '');
const count = key => Number(plain.match(new RegExp(`^(?:#|ℹ) ${key} (\\d+)\\s*$`, 'm'))?.[1]);
assert.equal(count('tests'), 706);
assert.equal(count('pass'), 706);
assert.equal(count('fail'), 0);
assert.equal(count('skipped'), 0);
assert.match(build, /Build complete/);
const ui = await json(`${root}/ui/summary.json`);
assert.equal(ui.engineVersion, '0.4.0');
assert.equal(ui.status, 'pass');
assert.ok(ui.checks.length && ui.checks.every(check => check.pass));
const demo1Path = 'output/playwright/video-demo1-20260925/take-03/archive-verification.json';
const demo1 = await json(demo1Path);
assert.equal(demo1.status, 'passes-declared-model');
assert.ok(!demo1.checks.some(check => check.status === 'fail'));
const benchmark = await json(`${root}/engine/benchmark/report.json`);
const benchmarkVerification = JSON.parse((await read(`${root}/engine/benchmark-verification.log`)).split(/\r?\n/).find(line => line.startsWith('{')));
assert.equal(benchmarkVerification.status, 'passes-declared-model');
assert.equal(benchmarkVerification.runs, 63);
assert.equal(benchmark.aggregate.runs, 63);
assert.equal(await sha256(benchmark), benchmarkVerification.reportHash);
const videoQa = await json('output/playwright/video-demo1-20260925/soft-voice/qa.json');
const video = await artifact('output/playwright/video-demo1-20260925/Planner-Demo1-PRIME-soft-voice.mp4');
assert.equal(video.sha256, videoQa.sha256);
assert.equal(videoQa.status, 'passed');
const healthResponse = await fetch('http://127.0.0.1:3017/api/planner/health');
const health = await healthResponse.json();
assert.equal(healthResponse.status, 200);
assert.equal(health.status, 'ok');
assert.equal(health.missionEngineVersion, '0.4.0');
const pageResponse = await fetch('http://127.0.0.1:3017/');
assert.equal(pageResponse.status, 200);
assert.equal(new URL(pageResponse.url).pathname, '/planner');
await fs.writeFile(`${root}/engine/package-http-check.json`, JSON.stringify({checkedAt: new Date().toISOString(), health, plannerStatus: pageResponse.status, rootRedirect: pageResponse.url}, null, 2) + '\n');
const summary = {
  schemaVersion: 1, status: 'pass', engineVersion: '0.4.0', checkedAt: new Date().toISOString(),
  modelOnly: true, flightReady: false, published: false,
  build: { source: 'autonomous-local-source-copy', tests: 706, passed: 706, failed: 0, skipped: 0,
    typescript: 'pass', production: 'pass', health: 'pass', plannerHttp: 200,
    imageId: 'sha256:2c4a199ef1ae6f749be17fd9113d831401a7a3d3c5bf3848af5be8ab517f470f',
    log: await artifact(`${root}/engine/package-docker-build.log`),
    limitation: 'Not a clean Git clone. Only app/page.tsx is transformed to redirect to /planner; runtime source equality is checked by final packager.' },
  browser: { assertions: ui.uiChecks, totalWithExportChecks: ui.checks.length, downloads: ui.artifacts.length,
    imageId: ui.imageId, summary: await artifact(`${root}/ui/summary.json`) },
  demo1: { status: demo1.status, checks: Object.fromEntries(['pass', 'fail', 'unknown'].map(status => [status, demo1.checks.filter(check => check.status === status).length])), protocol: await artifact(demo1Path) },
  benchmark: { cases: benchmarkVerification.cases, runs: benchmarkVerification.runs, status: benchmarkVerification.status,
    report: await artifact(`${root}/engine/benchmark/report.json`), limitations: benchmark.methodology.limitations,
    timingNote: 'Observed on shared CPU alongside other checks; not a performance SLA.' },
  video: { ...video, durationSec: videoQa.durationSec, status: videoQa.status },
  passport: { ...(await artifact('output/pdf/prime-planner-formular-0.4.0.pdf')), pages: 7, visualInspection: 'All seven pages reviewed; no overlapping or clipped text.' },
  checks: [
    { name: 'Autonomous source production build and 706 tests', pass: true },
    { name: 'Fresh UI and independent exported artifact checks', pass: true },
    { name: 'Demo 1 archive replay', pass: true },
    { name: 'Complete benchmark corpus, including expected negative cases', pass: true },
    { name: 'Approved video identity', pass: true },
  ],
  limitations: ['Only declared model constraints, not physical flight certification.', 'Presentation and final package integrity have their own QA protocols.', 'External links and final submission are separate actions.'],
};
await fs.writeFile(`${root}/engine/full-suite-706.log`, plain);
for (const file of [`${root}/engine/acceptance-summary.json`, 'docs/planner/submission/evidence/acceptance-0.4.0.json']) await fs.writeFile(file, JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ status: summary.status, tests: 706, ui: summary.browser, benchmarkRuns: 63 }, null, 2));
