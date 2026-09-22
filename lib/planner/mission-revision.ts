import {
  verifyMissionOperation,
  deriveOperationVehicleStates,
} from './mission-operations.ts';
import type { MissionOperation } from './mission-operations.ts';
import type { FleetState } from './mission-fleet-state.ts';
import { applyFleetState } from './mission-fleet-state.ts';
import { missionCoverageViews } from './mission-coverage-view.ts';
import { remainingJobs } from './mission-remaining-work.ts';
import { parseMissionDocument } from './mission-schema.ts';
import type { MissionDocument } from './mission-schema.ts';

/** Safe checkpoint revision; never moves a flying aircraft to its base. */
export async function prepareGroundRevision(
  input: MissionOperation,
  fleet: readonly FleetState[],
  reason: string,
) {
  const row = await verifyMissionOperation(input);
  if (
    row.status !== 'cancelled' ||
    (row.safety && row.safety.stage !== 'landed')
  )
    throw new Error(
      'Сначала завершите проверенную посадку и закройте исходный запуск.',
    );
  if (row.safety && ['sensor', 'crash'].includes(row.safety.kind))
    throw new Error(
      'После отказа сенсора требуется отдельная проверка материалов.',
    );
  const used = new Set(row.candidate.sorties.map((s) => s.vehicleId));
  if (
    fleet.filter((s) => used.has(s.id)).length !== used.size ||
    fleet.some((s) => used.has(s.id) && (!s.grounded || s.operationId))
  )
    throw new Error('Посадка и освобождение всех аппаратов не подтверждены.');
  if (
    !row.safety &&
    deriveOperationVehicleStates(row).some((s) => s.status === 'in_flight')
  )
    throw new Error('Пересмотр в воздухе запрещён.');
  const cutoff = row.safety?.modelTimeSec ?? row.progressSec;
  const partial = structuredClone(row.candidate);
  partial.sorties = partial.sorties
    .map((s) => ({
      ...s,
      segments: s.segments.filter(
        (p) => p.phase === 'survey' && p.endSec <= cutoff,
      ),
    }))
    .filter((s) => s.segments.length);
  const coverage = missionCoverageViews(row.document, partial);
  let jobs: MissionDocument['jobs'];
  let repeated = '';
  try {
    jobs = remainingJobs(row.document, coverage).jobs;
  } catch (error) {
    if (
      coverage.some((c) => c.status !== 'calculated') ||
      !coverage.some((c) => c.missingM2 > 0)
    )
      throw error;
    // Exact polygon subtraction can leave numerically unstable slivers. Never
    // discard them: explicitly repeat affected work, spending real model energy.
    jobs = row.document.jobs
      .filter((j) => coverage.find((c) => c.jobId === j.id)!.missingM2 > 0)
      .map((j) => structuredClone(j));
    repeated =
      ' Точная геометрия остатка нестабильна: оставшиеся работы повторяются целиком, без удаления малых частей.';
  }
  const start =
    Date.parse(row.document.window.start) +
    Math.ceil((row.safety?.progressSec ?? row.progressSec) * 1000);
  if (start >= Date.parse(row.document.window.end))
    throw new Error(
      'Исходный срок истёк. Пересмотр не продлевает его автоматически.',
    );
  for (const j of jobs) {
    delete j.inheritsFrom;
    if (j.window)
      j.window.start = new Date(
        Math.max(start, Date.parse(j.window.start)),
      ).toISOString();
  }
  const d = structuredClone(row.document);
  d.id = 'mission-' + crypto.randomUUID();
  d.name = row.document.name.slice(0, 85) + ' · пересмотр';
  d.scenario.name = d.name;
  d.jobs = jobs;
  d.scenario.area = jobs[0].area;
  d.scenario.job = jobs[0].job;
  d.window.start = new Date(start).toISOString();
  d.revisionSource = {
    operationId: row.id,
    integrityHash: row.integrityHash,
    rootMissionId:
      row.document.revisionSource?.rootMissionId ?? row.document.id,
    progressSec: cutoff,
    reason: (reason + repeated).slice(0, 500),
    coverage: coverage.map((c) => ({
      jobId: c.jobId,
      completedM2: c.coveredM2,
      remainingM2: c.missingM2,
    })),
  };
  return parseMissionDocument(applyFleetState(d, fleet));
}
