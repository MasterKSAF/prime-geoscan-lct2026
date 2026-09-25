import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  MISSION_ENGINE_VERSION,
  parseMissionDocument,
  sha256,
  sha256Text,
  type MissionDocument,
  type MissionCandidate,
  type MissionResult,
} from '../../lib/planner/mission-schema.ts';
import { DEMO_IDS } from '../../lib/planner/demo-session.ts';
import { solveMissionDocument } from '../../lib/planner/mission-engine.ts';
import { validateExportedCandidate } from '../../lib/planner/mission-validation.ts';
import {
  buildMissionArchive,
  buildMissionDiagnosticArchive,
  readStoredZip,
  verifyArchiveFiles,
} from '../../lib/planner/mission-archive.ts';
import { certifyMissionContingencies } from '../../lib/planner/mission-contingency.ts';
import { missionImprovementTrials } from '../../lib/planner/mission-insights.ts';
import { moveMissionBase } from '../../lib/planner/mission-bases.ts';
import { projection, type Point } from '../../lib/planner/geometry.ts';
import { catalogRestrictions } from '../../lib/planner/mission-catalog.ts';
import {
  parseObstacleKml,
  relevantObstacles,
  coordinateBounds,
  boundsOverlap,
  expandedBounds,
} from '../../lib/planner/obstacle-layer.ts';
import type { Coordinate, Polygon, Segment } from '../../lib/planner/schema.ts';

const out =
  process.argv.find((x) => x.startsWith('--out='))?.slice(6) ??
  'output/playwright/acceptance-2026-09-24/engine';
await mkdir(out, { recursive: true });
const save = (name: string, value: unknown) =>
  writeFile(join(out, name), JSON.stringify(value, null, 2) + '\n');
const checks: { name: string; pass: boolean; detail?: unknown }[] = [];
const check = (name: string, pass: boolean, detail?: unknown) => {
  checks.push({ name, pass, ...(detail === undefined ? {} : { detail }) });
  if (!pass) console.error('FAIL', name, JSON.stringify(detail));
};
const documents = await Promise.all(
  DEMO_IDS.map(async (id) =>
    parseMissionDocument(
      JSON.parse(
        await readFile(`public/planner/scenarios/${id}.mission.json`, 'utf8'),
      ),
    ),
  ),
);
const originalDemo2 = documents[1];
const p = projection([38.12, 55.563]);
const rectangle = (x: number, y: number, w: number, h: number): Polygon => ({
  type: 'Polygon',
  coordinates: [
    [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
      [x, y],
    ].map((q) => p.inverse(q as Point)),
  ],
});

/** A separate operator-created task in the unmodified expert obstacle catalogue. */
function denseExpertCopy(): MissionDocument {
  let d = structuredClone(originalDemo2);
  d.id = 'demo2-dense-real-acceptance';
  d.name = 'Приёмка · Демо 2 · район 54 реальных препятствий';
  d.scenario.name = d.name;
  d.scenario.airspace = rectangle(30, 40, 350, 200);
  d.scenario.area = rectangle(235, 140, 80, 70);
  d.jobs[0].area = structuredClone(d.scenario.area);
  d.jobs[1].area = structuredClone(d.scenario.area);
  d.jobs[2].area = rectangle(235, 75, 80, 45);
  for (const [i, job] of d.jobs.entries())
    job.name = `Приёмочный участок ${i + 1} · операторская геометрия`;
  // Preserve every source byte; these operator-created work areas are not item-205/item-197.
  for (const layer of d.catalogLayers ?? [])
    if (layer.role === 'areas') layer.selectedIds = [];
  d = moveMissionBase(d, 'base-1', p.inverse([50, 70]));
  d = moveMissionBase(d, 'base-2', p.inverse([50, 145]));
  d.scenario.reserveSites = d.scenario.vehicles.map(
    (v) => [...v.landing] as Coordinate,
  );
  d.notes =
    '[DEMO-SIMULATION-V1]\nОтдельная приёмочная копия Демо 2. Базы, граница и два небольших рабочих участка перенесены в район 38.12 E / 55.563 N. Геометрия работ задана оператором для расчётной проверки; это не неизменённые экспертные участки 205/197. Полные исходники препятствий и зон сохранены побайтно. Парк, батареи, зазоры 30/20 м и 2 с, 5 м границы и 10 м препятствий, высоты, погода и окно исходного Demo2 сохранены. Плоская поверхность и ISA — модель, не измерения и не разрешение полёта.';
  return parseMissionDocument(d);
}
const dense = denseExpertCopy();
const tight = structuredClone(dense);
tight.id = 'demo2-dense-boundary-negative';
tight.name = 'Приёмка · граница исключает обе базы';
tight.scenario.airspace = rectangle(70, 40, 310, 200);
tight.notes +=
  '\nОтрицательный случай: обе действующие базы вне новой границы. Ожидается отказ, не автоматический перенос.';
const lowLayer = structuredClone(dense);
lowLayer.id = 'demo2-dense-agl-negative';
lowLayer.name = 'Приёмка · запрет AGL 40–60 м пересекает взлёт';
lowLayer.restrictions.push({
  id: 'acceptance-agl-layer',
  name: 'Синтетический проверочный слой 40–60 м AGL',
  kind: 'noFlight',
  geometry: structuredClone(lowLayer.scenario.airspace),
  minAltitudeM: 40,
  maxAltitudeM: 60,
  startAt: lowLayer.window.start,
  endAt: lowLayer.window.end,
  source:
    'Синтетический отрицательный тест: метры над объявленной плоской поверхностью. Не экспертное ограничение.',
});
lowLayer.notes +=
  '\nСинтетический слой 40–60 м AGL: рабочая высота выше слоя не разрешает взлёт сквозь него.';
const overBudget = structuredClone(originalDemo2);
overBudget.id = 'demo2-real-budget-negative';
overBudget.name = 'Приёмка · реальный плотный каталог выше лимита';
overBudget.scenario.airspace = {
  type: 'Polygon',
  coordinates: [
    [
      [38.81, 55.015],
      [38.87, 55.015],
      [38.87, 55.07],
      [38.81, 55.07],
      [38.81, 55.015],
    ],
  ],
};
// Keep this case focused on catalogue complexity; all endpoint/work geometry is local.
const q = projection([38.85, 55.05]);
overBudget.scenario.vehicles.forEach((v, i) => {
  v.start = q.inverse([200, i * 100]);
  v.landing = [...v.start];
});
overBudget.bases = overBudget.scenario.vehicles.map((v, i) => ({
  id: `base-${i + 1}`,
  name: `База ${i + 1}`,
  coordinate: v.start,
}));
overBudget.scenario.reserveSites = overBudget.scenario.vehicles.map(
  (v) => v.landing,
);
overBudget.scenario.area = {
  type: 'Polygon',
  coordinates: [
    [
      [300, 0],
      [380, 0],
      [380, 80],
      [300, 80],
      [300, 0],
    ].map((xy) => q.inverse(xy as Point)),
  ],
};
overBudget.jobs.forEach(
  (j) => (j.area = structuredClone(overBudget.scenario.area)),
);
for (const layer of overBudget.catalogLayers ?? [])
  if (layer.role === 'areas') layer.selectedIds = [];
overBudget.notes =
  '[DEMO-SIMULATION-V1]\nОтрицательная приёмочная копия. Полный реальный каталог, плотный район и новая граница; ожидается отказ при >80 локальных препятствиях. Источники и защитные запасы не изменены. Другие реальные ограничения также продолжают действовать.';

for (const d of [...documents, dense, tight, lowLayer, overBudget])
  await save(`${d.id}.input.json`, d);
// Separate fixture aircraft avoid claiming that an already executed shared
// aircraft teleported from its previous base when importing the dense UI case.
const denseUi = structuredClone(dense);
denseUi.id = 'demo2-dense-real-ui';
const denseVehicleIds = new Map(
  denseUi.scenario.vehicles.map((v, i) => [v.id, `dense-real-uav-${i + 1}`]),
);
for (const v of denseUi.scenario.vehicles) v.id = denseVehicleIds.get(v.id)!;
for (const [i, b] of denseUi.batteries.entries()) {
  b.id = `dense-real-battery-${i + 1}`;
  b.vehicleId = denseVehicleIds.get(b.vehicleId)!;
}
for (const job of denseUi.jobs)
  job.assignedVehicleIds = job.assignedVehicleIds.map((id) => denseVehicleIds.get(id)!);
delete denseUi.fleetSnapshot;
delete denseUi.resourceReservations;
denseUi.notes += '\nUI-копия: два отдельных модельных аппарата с уникальными ID; не перенос ранее выполненного общего парка. Геометрия, оборудование, батарейный заряд и защитные настройки совпадают с расчётной плотной копией.';
await save('dense-real-ui.input.json', parseMissionDocument(denseUi));
const fixtureInfo = {
  denseOrigin: [38.12, 55.563],
  denseBases: dense.bases,
  relevantObstacleIds: relevantObstacles(dense).map((o) => o.id),
  obstacleBoundsIntersectingFlightBoundary: relevantObstacles(dense)
    .filter(
      (o) =>
        o.bounds &&
        boundsOverlap(
          o.bounds,
          coordinateBounds(dense.scenario.airspace.coordinates.flat()),
        ),
    )
    .map((o) => o.id),
  obstacleSelectionMeaning:
    '54 catalogue objects in the boundary neighbourhood (the adapter retains its 1000 m look-ahead). The smaller flight corridor intersects only the listed obstacle bounding boxes; no claim of 54 separate in-corridor obstacles.',
  constraints: {
    planning: dense.planning,
    clearanceM: dense.scenario.clearanceM,
    reservePct: dense.scenario.reservePct,
    obstacleBufferM: dense.obstacleLayer!.bufferM,
    terrainModel: dense.terrainModel,
    flightEnvelope: dense.flightEnvelope,
  },
  zones: catalogRestrictions(dense).map((r) => ({
    id: r.id,
    name: r.name,
    minAltitudeM: r.minAltitudeM,
    maxAltitudeM: r.maxAltitudeM,
  })),
};
await save('fixtures.json', fixtureInfo);
if (process.argv.includes('--prepare-only')) {
  console.log(JSON.stringify(fixtureInfo, null, 2));
  process.exit(0);
}

// Independent numerical audit. Does not import the production geometry/energy validators.
// These checks supplement, rather than replace, continuous production replay.
function pointSegmentDistance(p0: Point, a: Point, b: Point) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p0[0] - a[0]) * dx + (p0[1] - a[1]) * dy) / (dx * dx + dy * dy || 1),
    ),
  );
  return Math.hypot(p0[0] - a[0] - t * dx, p0[1] - a[1] - t * dy);
}
function inRing(pt: Point, ring: Point[]) {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a[1] > pt[1] !== b[1] > pt[1] &&
      pt[0] < ((b[0] - a[0]) * (pt[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      result = !result;
  }
  return result;
}
function independentAudit(d: MissionDocument, c: MissionCandidate) {
  const origin = d.scenario.area.coordinates[0][0],
    lat = (origin[1] * Math.PI) / 180;
  const metres = ([lon, latitude]: Coordinate): Point => [
    (((lon - origin[0]) * Math.PI) / 180) * 6371008.8 * Math.cos(lat),
    (((latitude - origin[1]) * Math.PI) / 180) * 6371008.8,
  ];
  const boundary = d.scenario.airspace.coordinates.map((r) => r.map(metres));
  const obstacles = relevantObstacles(d).map((o) => ({
    kind: o.kind,
    rings: o.coordinates.map((r) => r.map((xy) => metres([xy[0], xy[1]]))),
  }));
  let minBoundaryM = Infinity,
    minObstacleM = Infinity,
    maxEnergyErrorPct = 0,
    minLandingPct = Infinity,
    samples = 0,
    outside = 0,
    insideObstacle = 0,
    heightViolations = 0,
    continuityErrorM = 0,
    endpointErrorM = 0,
    maxBatteryContinuityErrorPct = 0,
    minHorizontalM = Infinity,
    sampledSeparationViolations = 0;
  const durations: number[] = [];
  for (const sortie of c.sorties) {
    const vehicle = d.scenario.vehicles.find((v) => v.id === sortie.vehicleId)!;
    const first = sortie.segments[0],
      last = sortie.segments.at(-1)!;
    endpointErrorM = Math.max(
      endpointErrorM,
      Math.hypot(
        ...metres(first.from).map((x, i) => x - metres(vehicle.start)[i]),
      ),
      Math.hypot(
        ...metres(last.to).map((x, i) => x - metres(vehicle.landing)[i]),
      ),
    );
    const previousSortie = c.sorties
      .filter(
        (s) => s.vehicleId === sortie.vehicleId && s.endSec <= sortie.startSec,
      )
      .sort((a, b) => b.endSec - a.endSec)[0];
    const expectedInitial = previousSortie?.remainingPct ?? vehicle.batteryPct;
    maxBatteryContinuityErrorPct = Math.max(
      maxBatteryContinuityErrorPct,
      Math.abs(first.batteryFromPct - expectedInitial),
    );
    minLandingPct = Math.min(minLandingPct, last.batteryToPct);
    durations.push(last.endSec - first.startSec);
    for (const [index, seg] of sortie.segments.entries()) {
      const expectedEnd =
        seg.batteryFromPct -
        ((seg.endSec - seg.startSec) / (vehicle.effectiveEnduranceMin * 60)) *
          100;
      maxEnergyErrorPct = Math.max(
        maxEnergyErrorPct,
        Math.abs(seg.batteryToPct - expectedEnd),
      );
      if (index)
        continuityErrorM = Math.max(
          continuityErrorM,
          Math.hypot(
            ...metres(seg.from).map(
              (v, i) => v - metres(sortie.segments[index - 1].to)[i],
            ),
          ),
        );
      if (index)
        maxBatteryContinuityErrorPct = Math.max(
          maxBatteryContinuityErrorPct,
          Math.abs(
            seg.batteryFromPct - sortie.segments[index - 1].batteryToPct,
          ),
        );
      const a = metres(seg.from),
        b = metres(seg.to);
      // Max 1 m / 0.25 s spacing is diagnostic sampling, not a collision-proof tolerance.
      const steps = Math.max(
        1,
        Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])),
        Math.ceil((seg.endSec - seg.startSec) * 4),
      );
      for (let k = 0; k <= steps; k++) {
        const f = k / steps,
          pt: Point = [a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1])];
        samples++;
        if (
          !inRing(pt, boundary[0]) ||
          boundary.slice(1).some((r) => inRing(pt, r))
        )
          outside++;
        for (const r of boundary)
          for (let i = 1; i < r.length; i++)
            minBoundaryM = Math.min(
              minBoundaryM,
              pointSegmentDistance(pt, r[i - 1], r[i]),
            );
        for (const o of obstacles) {
          if (
            o.kind === 'Polygon' &&
            inRing(pt, o.rings[0]) &&
            !o.rings.slice(1).some((r) => inRing(pt, r))
          )
            insideObstacle++;
          for (const r of o.rings)
            for (let i = 1; i < r.length; i++)
              minObstacleM = Math.min(
                minObstacleM,
                pointSegmentDistance(pt, r[i - 1], r[i]) -
                  (o.kind === 'LineString'
                    ? d.obstacleLayer!.lineHalfWidthM
                    : 0),
              );
        }
        const height =
          seg.altitudeFromM + f * (seg.altitudeToM - seg.altitudeFromM);
        if (height < -1e-6 || height > d.flightEnvelope.maxAltitudeM + 1e-6)
          heightViolations++;
      }
    }
  }
  const state = (s: Segment, t: number) => {
    const f = (t - s.startSec) / (s.endSec - s.startSec || 1),
      a = metres(s.from),
      b = metres(s.to);
    return [
      a[0] + (b[0] - a[0]) * f,
      a[1] + (b[1] - a[1]) * f,
      s.altitudeFromM + f * (s.altitudeToM - s.altitudeFromM),
    ];
  };
  for (let i = 0; i < c.sorties.length; i++)
    for (let j = i + 1; j < c.sorties.length; j++) {
      if (c.sorties[i].vehicleId === c.sorties[j].vehicleId) continue;
      for (const a of c.sorties[i].segments)
        for (const b of c.sorties[j].segments) {
          const start = Math.max(a.startSec, b.startSec),
            end = Math.min(a.endSec, b.endSec);
          if (end < start) continue;
          const steps = Math.max(1, Math.ceil((end - start) * 4));
          for (let k = 0; k <= steps; k++) {
            const t = start + ((end - start) * k) / steps,
              x = state(a, t),
              y = state(b, t);
            const h = Math.hypot(x[0] - y[0], x[1] - y[1]);
            minHorizontalM = Math.min(minHorizontalM, h);
            if (
              h < d.planning.separationHorizontalM &&
              Math.abs(x[2] - y[2]) <= d.planning.separationVerticalM
            )
              sampledSeparationViolations++;
          }
        }
    }
  return {
    samples,
    maxSampleSpacingM: 1,
    maxSampleSpacingSec: 0.25,
    minBoundaryM,
    minObstacleM: Number.isFinite(minObstacleM) ? minObstacleM : null,
    outside,
    insideObstacle,
    heightViolations,
    continuityErrorM,
    endpointErrorM,
    maxBatteryContinuityErrorPct,
    maxEnergyErrorPct,
    minLandingPct,
    sampledSeparationViolations,
    minHorizontalM: Number.isFinite(minHorizontalM) ? minHorizontalM : null,
    independentlySummedFlightTimeSec: durations.reduce((a, b) => a + b, 0),
    limitation:
      'Independent diagnostic samples do not prove continuous clearance. Continuous replay below uses shared production validation; energy is the declared linear endurance model, not calibrated battery physics.',
  };
}

const summaries: unknown[] = [];
async function checkIndependentSamples(
  d: MissionDocument,
  c: MissionCandidate,
) {
  const label = `${d.id}/${c.id}`;
  const audit = independentAudit(d, c);
  await save(`${d.id}.${c.id}.independent-samples.json`, audit);
  check(
    `${label}:independent-samples`,
    audit.outside === 0 &&
      audit.insideObstacle === 0 &&
      audit.heightViolations === 0 &&
      audit.sampledSeparationViolations === 0 &&
      audit.maxEnergyErrorPct < 1e-6 &&
      audit.continuityErrorM < 1e-6 &&
      audit.endpointErrorM < 1e-6 &&
      audit.maxBatteryContinuityErrorPct < 1e-6 &&
      audit.minLandingPct >= d.scenario.reservePct &&
      audit.minBoundaryM >= d.scenario.clearanceM - 1e-6 &&
      (audit.minObstacleM === null ||
        audit.minObstacleM >=
          Math.max(d.scenario.clearanceM, d.obstacleLayer?.bufferM ?? 0) -
            1e-6),
    audit,
  );
  check(
    `${label}:independent-flight-time`,
    Math.abs(audit.independentlySummedFlightTimeSec - c.metrics.flightTimeSec) <
      1e-6,
  );
  return audit;
}
async function run(
  d: MissionDocument,
  expected: 'feasible_model' | 'rejected',
  contingencies = false,
) {
  console.log('SOLVE', d.id);
  const began = performance.now();
  const result = await solveMissionDocument(d);
  await save(`${d.id}.result.json`, result);
  check(`${d.id}:input-hash`, result.inputHash === (await sha256(d)));
  check(`${d.id}:engine`, result.engineVersion === MISSION_ENGINE_VERSION);
  check(
    `${d.id}:both-objectives`,
    ['makespan', 'flightTime'].every((o) =>
      result.candidates.some((c) => c.objective === o),
    ),
  );
  const candidateReports = [];
  for (const c of result.candidates) {
    const label = `${d.id}/${c.id}`;
    check(
      `${label}:outcome`,
      expected === 'feasible_model'
        ? c.status === 'feasible_model'
        : c.status !== 'feasible_model',
      c.status,
    );
    const replay = await validateExportedCandidate(d, c);
    await save(`${d.id}.${c.id}.replay.json`, replay);
    let audit: ReturnType<typeof independentAudit> | undefined;
    if (expected === 'feasible_model' && c.status === 'feasible_model') {
      check(
        `${label}:continuous-replay`,
        replay.every((x) => x.status !== 'fail'),
        replay.filter((x) => x.status === 'fail'),
      );
      audit = await checkIndependentSamples(d, c);
    }
    const archive =
      c.status === 'feasible_model'
        ? await buildMissionArchive(d, c)
        : await buildMissionDiagnosticArchive(d, c);
    await writeFile(join(out, `${d.id}.${c.id}.zip`), archive.bytes);
    const verified = await verifyArchiveFiles(readStoredZip(archive.bytes));
    await save(`${d.id}.${c.id}.archive-verification.json`, verified);
    check(
      `${label}:archive-replay`,
      verified.status ===
        (c.status === 'feasible_model'
          ? 'passes-declared-model'
          : 'diagnostic-only-not-flight-approved'),
    );
    candidateReports.push({
      id: c.id,
      objective: c.objective,
      status: c.status,
      metrics: c.metrics,
      sorties: c.sorties.map((s) => ({
        vehicleId: s.vehicleId,
        startSec: s.startSec,
        endSec: s.endSec,
        remainingPct: s.remainingPct,
        segments: s.segments.length,
      })),
      replayFailures: replay.filter((x) => x.status === 'fail'),
      unknownChecks: replay.filter((x) => x.status === 'unknown'),
      audit,
      archiveStatus: verified.status,
    });
  }
  let certificate;
  const first = result.candidates.find(
    (c) => c.objective === 'makespan' && c.status === 'feasible_model',
  );
  if (contingencies && first) {
    certificate = await certifyMissionContingencies(d, first, {
      maxComputeMs: 30000,
      maxAnchors: 2048,
    });
    await save(`${d.id}.contingency.json`, certificate);
    check(
      `${d.id}:controlled-abort-model`,
      certificate.status === 'certified_model',
      {
        status: certificate.status,
        checked: certificate.checkedAnchors,
        count: certificate.anchorCount,
        independent: certificate.independentAnchors,
        plannedCorridor: certificate.plannedCorridorAnchors,
        minBattery: certificate.minimumRemainingPct,
        reasons: certificate.reasons,
      },
    );
  }
  summaries.push({
    id: d.id,
    expected,
    wallMs: performance.now() - began,
    candidates: candidateReports,
    contingency: certificate && {
      status: certificate.status,
      count: certificate.anchorCount,
      checked: certificate.checkedAnchors,
      independent: certificate.independentAnchors,
      plannedCorridor: certificate.plannedCorridorAnchors,
      minBattery: certificate.minimumRemainingPct,
      maxResponseDelaySec: certificate.maxResponseDelaySec,
      assumptions: certificate.assumptions,
      reasons: certificate.reasons,
    },
  });
  console.log(
    'DONE',
    d.id,
    result.candidates.map((c) => `${c.objective}:${c.status}`).join(','),
  );
  return result;
}

if (process.argv.includes('--supplement-existing')) {
  for (const id of [
    DEMO_IDS[0],
    DEMO_IDS[1],
    'demo3-battery-repaired-acceptance',
    dense.id,
  ]) {
    const result = JSON.parse(
      await readFile(join(out, `${id}.result.json`), 'utf8'),
    ) as MissionResult;
    const document = parseMissionDocument(result.document);
    check(
      `${id}:saved-result-input-binding`,
      result.inputHash === (await sha256(document)),
    );
    for (const candidate of result.candidates) {
      check(
        `${id}/${candidate.id}:saved-feasible`,
        candidate.status === 'feasible_model',
      );
      if (candidate.status === 'feasible_model')
        await checkIndependentSamples(document, candidate);
    }
    if (id === dense.id) await tamperChecks(document, result.candidates[0]);
  }
  const supplement = {
    at: new Date().toISOString(),
    engineVersion: MISSION_ENGINE_VERSION,
    command:
      'node --experimental-transform-types scripts/checks/acceptance-engine-20260924.ts --supplement-existing',
    status: checks.every((c) => c.pass) ? 'pass' : 'fail',
    checks,
    scope:
      'Recheck saved computed snapshots using independent numerical sampling and three deliberate trajectory corruptions. Full solve, continuous replay, archives and abort intervals remain in report.json.',
  };
  await save('independent-report.json', supplement);
  console.log(
    JSON.stringify(
      {
        status: supplement.status,
        checks: checks.length,
        failed: checks.filter((c) => !c.pass),
      },
      null,
      2,
    ),
  );
  process.exit(supplement.status === 'pass' ? 0 : 1);
}

const sources =
  originalDemo2.catalogLayers?.map((l) => ({
    role: l.role,
    filename: l.filename,
    sha256: '',
  })) ?? [];
for (const s of sources)
  s.sha256 = await sha256Text(
    originalDemo2.catalogLayers!.find((l) => l.role === s.role)!.sourceText,
  );
check(
  'dense:expert-source-bytes-preserved',
  originalDemo2.obstacleLayer!.sourceText === dense.obstacleLayer!.sourceText &&
    (originalDemo2.catalogLayers ?? []).every(
      (l) =>
        dense.catalogLayers!.find((x) => x.role === l.role)!.sourceText ===
        l.sourceText,
    ),
);
check(
  'dense:protective-settings-preserved',
  JSON.stringify(originalDemo2.planning) === JSON.stringify(dense.planning) &&
    originalDemo2.scenario.clearanceM === dense.scenario.clearanceM &&
    originalDemo2.scenario.reservePct === dense.scenario.reservePct &&
    JSON.stringify(originalDemo2.obstacleLayer) ===
      JSON.stringify(dense.obstacleLayer),
);
check(
  'dense:real-obstacle-density',
  relevantObstacles(dense).length >= 20,
  relevantObstacles(dense).map((o) => o.id),
);
try {
  moveMissionBase(dense, 'base-1', p.inverse([110, 130]));
  check('dense:base-inside-building-rejected', false);
} catch (e) {
  check(
    'dense:base-inside-building-rejected',
    /препятств|ограничени/.test(String(e)),
    String(e),
  );
}
try {
  moveMissionBase(dense, 'base-1', p.inverse([29, 70]));
  check('dense:base-outside-boundary-rejected', false);
} catch (e) {
  check(
    'dense:base-outside-boundary-rejected',
    /границ/.test(String(e)),
    String(e),
  );
}
const bounds = expandedBounds(
  coordinateBounds(overBudget.scenario.airspace.coordinates.flat()),
  overBudget.obstacleLayer!.bufferM +
    overBudget.obstacleLayer!.lineHalfWidthM +
    overBudget.scenario.clearanceM +
    1000,
);
const budgetCount = parseObstacleKml(
  overBudget.obstacleLayer!.sourceText,
).objects.filter((o) => !o.bounds || boundsOverlap(o.bounds, bounds)).length;
check('negative:actual-budget-overflow', budgetCount > 80, budgetCount);

for (const [i, d] of documents.entries()) {
  const r = await run(d, i === 2 ? 'rejected' : 'feasible_model', i < 2);
  if (i === 2) {
    const trials = missionImprovementTrials(d, r.candidates[0]);
    const battery = trials.find((t) => t.id.startsWith('battery-full-'));
    check(
      'demo3:battery-repair-offered',
      !!battery,
      trials.map((t) => t.id),
    );
    if (battery) {
      battery.document.id = 'demo3-battery-repaired-acceptance';
      await save(`${battery.document.id}.input.json`, battery.document);
      await run(battery.document, 'feasible_model', true);
    }
    const wait = trials.find((t) => t.id === 'extra-time');
    check('demo3:extra-time-trial-offered', !!wait);
    if (wait) {
      wait.document.id = 'demo3-wait-negative';
      await save(`${wait.document.id}.input.json`, wait.document);
      await run(wait.document, 'rejected');
    }
  }
}
const denseResult = await run(dense, 'feasible_model', true);
if (denseResult.candidates[0].status === 'feasible_model') {
  const replay = await validateExportedCandidate(
    tight,
    denseResult.candidates[0],
  );
  check(
    'dense:old-plan-invalid-after-boundary-edit',
    replay.some((c) => c.status === 'fail'),
  );
  await tamperChecks(dense, denseResult.candidates[0]);
}
async function tamperChecks(
  dense: MissionDocument,
  candidate: MissionCandidate,
) {
  const forgedBattery = structuredClone(candidate);
  forgedBattery.sorties[0].segments[0].batteryToPct += 1;
  forgedBattery.plan.missions = structuredClone(forgedBattery.sorties);
  const batteryReplay = await validateExportedCandidate(dense, forgedBattery);
  await save('dense-forged-battery.replay.json', batteryReplay);
  check(
    'dense:forged-battery-rejected',
    batteryReplay.some((c) => c.id === 'ENERGY' && c.status === 'fail'),
  );
  const forgedObstacle = structuredClone(candidate);
  const transit = forgedObstacle.sorties[0].segments.find(
    (s) => s.phase === 'transit',
  )!;
  transit.to = p.inverse([110, 130]);
  forgedObstacle.plan.missions = structuredClone(forgedObstacle.sorties);
  const obstacleReplay = await validateExportedCandidate(dense, forgedObstacle);
  await save('dense-forged-obstacle-crossing.replay.json', obstacleReplay);
  check(
    'dense:forged-obstacle-crossing-rejected',
    obstacleReplay.some((c) => c.id === 'GEOMETRY' && c.status === 'fail'),
  );
  const forgedCollision = structuredClone(candidate);
  const a = forgedCollision.sorties[0];
  const b = forgedCollision.sorties.find((s) => s.vehicleId !== a.vehicleId)!;
  Object.assign(b, {
    startSec: a.startSec,
    endSec: a.endSec,
    readySec: a.readySec,
    durationSec: a.durationSec,
    segments: structuredClone(a.segments),
  });
  forgedCollision.plan.missions = structuredClone(forgedCollision.sorties);
  const collisionReplay = await validateExportedCandidate(
    dense,
    forgedCollision,
  );
  await save('dense-forged-collision.replay.json', collisionReplay);
  check(
    'dense:forged-collision-rejected',
    collisionReplay.some((c) => c.id === 'SEPARATION' && c.status === 'fail'),
  );
}
await run(tight, 'rejected');
await run(lowLayer, 'rejected');
await run(overBudget, 'rejected');
try {
  await copyFile(
    'output/acceptance-engine-tests-20260924.log',
    join(out, 'unit-tests.log'),
  );
} catch {
  /* Test process may be running independently. */
}
const report = {
  at: new Date().toISOString(),
  engineVersion: MISSION_ENGINE_VERSION,
  status: checks.every((c) => c.pass) ? 'pass' : 'fail',
  modelOnly: true,
  flightReady: false,
  command:
    'node --experimental-transform-types scripts/checks/acceptance-engine-20260924.ts',
  checks,
  fixtures: fixtureInfo,
  sourceHashes: [
    ...sources,
    {
      role: 'obstacles',
      filename: originalDemo2.obstacleLayer!.filename,
      sha256: await sha256Text(originalDemo2.obstacleLayer!.sourceText),
    },
  ],
  scenarios: summaries,
  limits: [
    'Local engine + exported ZIP replay; no browser/server/real flight executed by this script.',
    'Continuous replay and controlled abort reuse production geometry. Separate numerical samples supplement them, not independent certification.',
    'All source files preserved; the dense case changes bases, permitted boundary and operator-created work areas and is not the original Demo 2.',
    '30/20 m, 2 s, 5/10 m and reserve 25% are inherited declared simulation parameters, not certified regulatory minima.',
    'Flat surface, ISA/FL conversion and linear endurance battery are declared models; no DEM, measured QNH/temperature, calibrated battery or real wind evidence.',
    'Obstacle source heights are not a DEM; obstacles are routed around laterally at all altitudes.',
    'Current legal zone activity and actual flight permissions are outside this offline acceptance.',
    'A negative search result is not a proof that no solution exists; geometry and compute budgets are retained.',
  ],
};
await save('report.json', report);
await writeFile(
  join(out, 'report.md'),
  [
    '# Повторная расчётная приёмка Planner · 24.09.2026',
    '',
    `Ядро ${report.engineVersion}. Итог: ${report.status}. Проверки: ${checks.filter((c) => c.pass).length}/${checks.length}.`,
    '',
    'Команда: `' + report.command + '`.',
    '',
    '| Проверка | Итог |',
    '| --- | --- |',
    ...checks.map((c) => `| ${c.name} | ${c.pass ? 'PASS' : 'FAIL'} |`),
    '',
    '## Границы проверки',
    '',
    ...report.limits.map((x) => `- ${x}`),
    '',
    'Подробные значения, источники, входы, полные результаты, независимые выборки, повторная проверка ZIP и условные маршруты прекращения работы находятся рядом с этим отчётом.',
    '',
  ].join('\n'),
);
console.log(
  JSON.stringify(
    {
      out,
      status: report.status,
      checks: checks.length,
      failed: checks.filter((c) => !c.pass),
    },
    null,
    2,
  ),
);
if (report.status === 'fail') process.exitCode = 1;
