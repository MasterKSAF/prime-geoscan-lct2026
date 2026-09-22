import clipping from 'polygon-clipping';
import {
  verifyMissionOperation,
  deriveOperationVehicleStates,
} from './mission-operations.ts';
import type { MissionOperation } from './mission-operations.ts';
import { parseFleetState, applyFleetState } from './mission-fleet-state.ts';
import type { FleetState } from './mission-fleet-state.ts';
import { recoveryOptions, safetyDocument } from './mission-safety.ts';
import { missionCoverageViews } from './mission-coverage-view.ts';
import type { CoverageView } from './mission-coverage-view.ts';
import { parseMissionDocument, sha256 } from './mission-schema.ts';
import type { MissionDocument, MissionJob } from './mission-schema.ts';
import { projection, area, validatePolygonTopology } from './geometry.ts';
import type { Multi } from './geometry.ts';
import type { Polygon } from './schema.ts';

export type RemainingMissionOptions = {
  acknowledgedData: boolean;
  /** Optional later date in the mission's simulated calendar, never wall-clock
   * freshness time. The original deadline cannot be extended here. */
  modelStartAt?: string;
};
export type RemainingMissionDraft = {
  document: MissionDocument;
  parentBinding: {
    version: 'remaining-work-v1';
    clock: 'mission-model';
    operationId: string;
    revision: number;
    integrityHash: string;
    inputHash: string;
    planHash: string;
    incidentId: string;
    modelTimeSec: number;
    recoveryEndSec: number;
    fleetHash: string;
    draftHash: string;
    acknowledgedData: true;
  };
  coverage: CoverageView[];
  jobMapping: { originalJobId: string; remainingJobIds: string[] }[];
  normalization: {
    gridM: 0.000001;
    maximumNumericDeltaM2: 0.1;
    numericDeltaM2: number;
  };
  notes: string[];
};

/** Numerical normalization in local METRES, not simplification in degrees.
 * Components and holes cannot disappear; real narrow contours remain subject
 * to the ordinary input geometry validator, not discarded by an area filter. */
export function normalizeRemainingGeometry(missing: Multi): {
  geometry: Multi;
  numericDeltaM2: number;
} {
  const gridM = 0.000001,
    maximumNumericDeltaM2 = 0.1;
  const snapped = missing.map((poly) =>
    poly.map((ring) =>
      ring.map(
        ([x, y]) =>
          [Math.round(x / gridM) * gridM, Math.round(y / gridM) * gridM] as [
            number,
            number,
          ],
      ),
    ),
  );
  let geometry: Multi;
  try {
    geometry = snapped.length ? (clipping.union(snapped) as Multi) : [];
  } catch {
    throw new Error(
      'Не удалось нормализовать остаток в пределах численной точности.',
    );
  }
  if (
    geometry.length !== missing.length ||
    geometry.reduce((n, poly) => n + poly.length - 1, 0) !==
      missing.reduce((n, poly) => n + poly.length - 1, 0)
  )
    throw new Error(
      'Численная нормализация меняет число частей или отверстий; такой остаток не изменяется автоматически.',
    );
  const numericDeltaM2 = geometry.length
    ? area(clipping.xor(missing, geometry) as Multi)
    : area(missing);
  if (
    !Number.isFinite(numericDeltaM2) ||
    numericDeltaM2 > maximumNumericDeltaM2
  )
    throw new Error(
      'Численная нормализация остатка превышает допуск 0,1 м²; черновик не создан.',
    );
  return { geometry, numericDeltaM2 };
}

/** Converts without simplification, clipping away tiny parts, or silently
 * dropping holes. Unsupported ring/job complexity rejects the whole draft. */
export function remainingJobs(
  d: MissionDocument,
  coverage: CoverageView[],
): {
  jobs: MissionJob[];
  mapping: RemainingMissionDraft['jobMapping'];
  normalization: RemainingMissionDraft['normalization'];
} {
  const p = projection(d.scenario.area.coordinates[0][0]);
  const jobs: MissionJob[] = [],
    mapping: RemainingMissionDraft['jobMapping'] = [];
  const normalization: RemainingMissionDraft['normalization'] = {
    gridM: 0.000001,
    maximumNumericDeltaM2: 0.1,
    numericDeltaM2: 0,
  };
  for (let index = 0; index < coverage.length; index++) {
    const view = coverage[index],
      original = d.jobs.find((j) => j.id === view.jobId)!;
    if (view.status !== 'calculated')
      throw new Error(`${view.name}: остаток геометрии не проверен.`);
    if (Math.abs(view.requestedM2 - view.coveredM2 - view.missingM2) > 0.1)
      throw new Error(
        `${view.name}: нарушен баланс исходной, выполненной и оставшейся площади.`,
      );
    const ids: string[] = [];
    const reconstructed: Multi = [];
    // Nanometre round trips WGS84 -> metres -> WGS84 can otherwise produce
    // zero-width hairpins at a completed strip's boundary. Normalize in METRES,
    // report the actual symmetric difference, and preserve component/hole count.
    const normalizedGeometry = normalizeRemainingGeometry(view.missing),
      normalized = normalizedGeometry.geometry;
    for (let component = 0; component < normalized.length; component++) {
      const polygon = normalized[component];
      if (polygon.length > 5 || polygon.some((ring) => ring.length > 70))
        throw new Error(
          `${view.name}: точный остаток превышает допустимую сложность контура; упрощение с потерей площади не применяется.`,
        );
      const geometry: Polygon = {
        type: 'Polygon',
        coordinates: polygon.map((ring) => ring.map(p.inverse)),
      };
      try {
        validatePolygonTopology(geometry);
      } catch {
        throw new Error(
          `${view.name}: точный остаток содержит неподдержанный контур или слишком малую часть; она не удаляется автоматически.`,
        );
      }
      const id = `remaining-${index + 1}-${component + 1}`;
      ids.push(id);
      jobs.push({
        ...structuredClone(original),
        id,
        name: `${original.name} · остаток ${component + 1}`.slice(0, 100),
        area: geometry,
      });
      reconstructed.push(
        geometry.coordinates.map((ring) => ring.map(p.forward)),
      );
      if (jobs.length > 8)
        throw new Error(
          'Точный остаток требует более 8 работ. Разделите его отдельным подтверждённым действием; части не отбрасываются автоматически.',
        );
    }
    // Include the final WGS84 round trip in the ONE shared tolerance budget,
    // not an independent allowance for every job or conversion stage.
    normalization.numericDeltaM2 += reconstructed.length
      ? area(clipping.xor(view.missing, reconstructed) as Multi)
      : view.missingM2;
    if (
      !Number.isFinite(normalization.numericDeltaM2) ||
      normalization.numericDeltaM2 > normalization.maximumNumericDeltaM2
    )
      throw new Error(
        'Численная нормализация и перевод координат остатка превышают общий допуск 0,1 м²; черновик не создан.',
      );
    mapping.push({ originalJobId: original.id, remainingJobIds: ids });
  }
  if (!jobs.length)
    throw new Error(
      'Оставшихся участков по подтверждённым полным проходам нет; новая миссия не создаётся.',
    );
  return { jobs, mapping, normalization };
}

/** New draft AFTER verified safe landing, never mutation/resume of the old run.
 * Confirmation means the operator explicitly accepts data from complete nominal
 * survey passes; it is not a sensor log, a photographic QA result or telemetry. */
export async function prepareRemainingMission(
  operation: MissionOperation,
  options: RemainingMissionOptions,
  fleet: readonly FleetState[],
): Promise<RemainingMissionDraft> {
  if (options.acknowledgedData !== true)
    throw new Error(
      'Подтвердите получение пригодных данных полных проходов до события. Без подтверждения выполненная площадь не вычитается.',
    );
  const row = await verifyMissionOperation(operation),
    incident = row.safety;
  if (
    row.status !== 'cancelled' ||
    !incident ||
    incident.stage !== 'landed' ||
    !row.finishedAt
  )
    throw new Error(
      'Остаток можно подготовить только после проверенной безопасной посадки и закрытия исходного выполнения.',
    );
  if (incident.kind === 'sensor' || incident.kind === 'crash')
    throw new Error(
      'После отказа сенсора или потери аппарата нельзя автоматически зачесть данные: требуется отдельная проверка результатов.',
    );
  if (
    row.document.planning.batteryPolicy !== 'installed-current-v1' ||
    row.document.planning.safetyPolicy !== 'continuous-occupancy-v1'
  )
    throw new Error(
      'Для продолжения нужна текущая политика ресурса и непрерывной безопасности; исторический снимок не модернизируется скрыто.',
    );
  const recovery = recoveryOptions(row.document, row.candidate, incident).find(
    (o) => o.policy === incident.policy,
  );
  if (!recovery?.valid || incident.progressSec !== recovery.endSec)
    throw new Error('Безопасная посадка не подтверждена повторной проверкой.');
  if (!Array.isArray(fleet) || !fleet.length || fleet.length > 20)
    throw new Error('Передайте актуальный реестр от 1 до 20 БВС.');
  const states = fleet.map(parseFleetState);
  if (
    new Set(states.map((s) => s.id)).size !== states.length ||
    new Set(states.map((s) => s.battery.id)).size !== states.length
  )
    throw new Error(
      'В актуальном реестре повторяются идентификаторы БВС или батарей.',
    );
  if (
    row.document.scenario.vehicles.some(
      (v) => !states.some((s) => s.id === v.id),
    )
  )
    throw new Error(
      'В актуальном реестре отсутствует БВС исходного задания; его положение и заряд нельзя восстановить из старого плана.',
    );
  if (states.some((s) => !s.grounded || s.operationId !== null))
    throw new Error(
      'Перед новым черновиком все переданные БВС должны находиться на земле и не участвовать в другом выполнении.',
    );
  const used = new Set(row.candidate.sorties.map((s) => s.vehicleId)),
    priorStates = deriveOperationVehicleStates(row);
  for (const state of states.filter((s) => used.has(s.id))) {
    if (Date.parse(state.observedAt) < Date.parse(row.updatedAt))
      throw new Error(
        `${state.vehicle.name}: состояние реестра старше завершения защитного сценария.`,
      );
    const originalBattery = row.document.batteries.find(
        (b) => b.vehicleId === state.id,
      )!,
      returned = recovery.sorties.find((s) => s.vehicleId === state.id),
      expectedPct =
        returned?.remainingPct ??
        priorStates.find((s) => s.vehicleId === state.id)?.batteryPct;
    if (expectedPct === null || expectedPct === undefined)
      throw new Error(
        `${state.vehicle.name}: не установлен ресурс после остановки.`,
      );
    let lastId = originalBattery.id,
      maximumPct = expectedPct;
    const replacements = state.replacements
      .filter(
        (e) =>
          Date.parse(e.at) >= Date.parse(row.finishedAt!) &&
          Date.parse(e.at) <= Date.parse(state.observedAt),
      )
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    for (const event of replacements) {
      if (event.fromId !== lastId)
        throw new Error(
          `${state.vehicle.name}: события замены не образуют последовательность текущей батареи.`,
        );
      lastId = event.toId;
      maximumPct = event.pct;
    }
    if (
      state.battery.id !== lastId ||
      state.battery.initialPct > maximumPct + 0.001
    )
      throw new Error(
        `${state.vehicle.name}: увеличение заряда или новая батарея без явного последующего события замены.`,
      );
  }

  const confirmed = structuredClone(row.candidate);
  confirmed.sorties = confirmed.sorties
    .map((s) => ({
      ...s,
      segments: s.segments.filter(
        (seg) => seg.phase === 'survey' && seg.endSec <= incident.modelTimeSec,
      ),
    }))
    .filter((s) => s.segments.length);
  const coverage = missionCoverageViews(row.document, confirmed),
    { jobs, mapping, normalization } = remainingJobs(row.document, coverage);
  const earliestMs =
      Date.parse(row.document.window.start) + Math.ceil(recovery.endSec * 1000),
    selectedMs =
      options.modelStartAt === undefined
        ? earliestMs
        : Date.parse(options.modelStartAt);
  if (
    !Number.isFinite(selectedMs) ||
    selectedMs < earliestMs ||
    selectedMs >= Date.parse(row.document.window.end)
  )
    throw new Error(
      'Начало нового задания должно быть после модельного возврата и раньше исходного срока; срок не продлевается автоматически.',
    );
  const next = safetyDocument(row.document, row.candidate, incident);
  next.id = crypto.randomUUID();
  next.name = `Остаток · ${row.document.name}`.slice(0, 100);
  next.scenario.name = next.name;
  next.jobs = jobs;
  next.scenario.area = structuredClone(jobs[0].area);
  next.scenario.job = structuredClone(jobs[0].job);
  next.window.start = new Date(selectedMs).toISOString();
  const document = parseMissionDocument(applyFleetState(next, states));
  // Retain provenance even when the user saves only the new mission JSON/YAML,
  // without the optional, more detailed derivation bundle.
  document.notes = [
    `Остаток выполнения ${row.id}, ревизия ${row.revision}; событие ${incident.id}.`,
    `Исходный вход SHA-256: ${row.inputHash}; план SHA-256: ${row.planHash}.`,
    'Получение данных полных проходов подтверждено оператором; требуется новый расчёт и подтверждение.',
    document.notes,
  ].join('\n').slice(0, 2000);
  const notes = [
    'Создан отдельный черновик; исходный план, подтверждение и журнал не изменены. Перед выполнением нужны новый расчёт и новое подтверждение.',
    'Вычтены только номинальные полосы полностью завершённых проходов до события, получение данных которых подтвердил оператор. Неполный проход не засчитан. Это не проверка реальных снимков.',
    'Дата продолжения задана по модельным часам исходной миссии, а не по времени компьютера. Перед реальным планированием оператор должен проверить календарь. Исходный срок не продлён.',
    'Заряд, места старта, оснащение и готовность взяты из переданного реестра. Готовность после происшествия не восстанавливается автоматически.',
    `Геометрия остатка численно нормализована по сетке 1 мкм в локальных метрах. Симметричная разность ${normalization.numericDeltaM2.toPrecision(6)} м² при общем пределе 0,1 м²; число частей и отверстий сохранено.`,
  ];
  if (document.weather)
    notes.push(
      'Погодный снимок сохранён для доказательств, но относится к старой геометрии/окну. Нужно обновить прогноз; проверка старого снимка заблокирует запуск, а не отключит ограничения.',
    );
  if (states.some((s) => !s.ready || !s.vehicle.enabled))
    notes.push(
      'Часть БВС недоступна: в новом черновике они выключены. Пригодность после происшествия подтверждается отдельным сообщением оператора.',
    );
  return {
    document,
    parentBinding: {
      version: 'remaining-work-v1',
      clock: 'mission-model',
      operationId: row.id,
      revision: row.revision,
      integrityHash: row.integrityHash,
      inputHash: row.inputHash,
      planHash: row.planHash,
      incidentId: incident.id,
      modelTimeSec: incident.modelTimeSec,
      recoveryEndSec: recovery.endSec,
      fleetHash: await sha256(states),
      draftHash: await sha256(document),
      acknowledgedData: true,
    },
    coverage,
    jobMapping: mapping,
    normalization,
    notes,
  };
}
