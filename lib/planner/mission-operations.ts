import { z } from 'zod';
import { assertRevisionBinding } from './mission-revision-binding.ts';
import { independentOperations } from './mission-coordination.ts';
import {
  MISSION_ENGINE_VERSION,
  parseMissionDocument,
  sha256,
  canonicalStringify,
} from './mission-schema.ts';
import type {
  MissionApproval,
  MissionCandidate,
  MissionDocument,
  ScheduledSortie,
} from './mission-schema.ts';
import type { Check, Phase } from './schema.ts';
import { assertSafeTree, serializeMissionJson } from './mission-io.ts';
import { validateExportedCandidate } from './mission-validation.ts';
import {
  createSafetySession,
  decideSafety,
  recoveryOptions,
  safetySchema,
} from './mission-safety.ts';
import type { IncidentKind, SafetySession } from './mission-safety.ts';
import {
  FLEET_STATE_STORE,
  parseFleetState,
  fleetStateFromDocument,
} from './mission-fleet-state.ts';
import type { FleetState, FleetReport } from './mission-fleet-state.ts';

export const MAX_MISSION_OPERATIONS = 20;
export const MAX_OPERATION_BYTES = 5 * 1024 * 1024;
export const OPERATIONS_STORE = 'operations';
export const OPERATIONS_DB = 'prime-planner-operations';
export type MissionOperationStatus =
  | 'scheduled'
  | 'running'
  | 'paused'
  | 'completed'
  | 'cancelled';
export type MissionOperation = {
  schemaVersion: '1.0';
  modelOnly: true;
  engineVersion: string;
  id: string;
  revision: number;
  status: MissionOperationStatus;
  progressSec: number;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  document: MissionDocument;
  candidate: MissionCandidate;
  approval: MissionApproval;
  inputHash: string;
  planHash: string;
  integrityHash: string;
  safety?: SafetySession;
};
export type EnqueueMissionOperation = Pick<
  MissionOperation,
  'id' | 'document' | 'candidate' | 'approval'
>;
export type MissionOperationsOptions = {
  indexedDB?: IDBFactory;
  dbName?: string;
  now?: () => Date;
};

/** Rejected records remain in IndexedDB, but never enter the executable rows. */
export type RejectedMissionOperation = {
  id: string | null;
  name: string;
  status: MissionOperationStatus | null;
  reason: string;
  checkIds: string[];
  blocksExecution: boolean;
  archived: boolean;
  originalHash: string | null;
};
export type MissionOperationsInspection = {
  rows: MissionOperation[];
  rejected: RejectedMissionOperation[];
};

class ModelRevalidationError extends Error {
  readonly checkIds: string[];
  constructor(checks: Check[]) {
    const ids = [...new Set(checks.map((check) => check.id))];
    const archivedTextOnly = ids.every((id) =>
      ['EVENT_JOURNAL', 'SAVED_CHECKS'].includes(id),
    );
    super(
      archivedTextOnly
        ? 'Снимок не прошёл повторную модельную проверку: журнал событий или состав проверок обновился. Откройте исходное задание и пересчитайте план.'
        : `Снимок не прошёл повторную модельную проверку (${ids.join(', ')}). Откройте задание и пересчитайте план; старое подтверждение не применяется.`,
    );
    this.checkIds = ids;
  }
}

const hash = z.string().regex(/^[a-f0-9]{64}$/),
  id = z.string().regex(/^[a-zA-Z0-9_-]{1,60}$/);
const instant = z.iso.datetime({ offset: true });
const metadata = z
  .object({
    schemaVersion: z.literal('1.0'),
    modelOnly: z.literal(true),
    // Older versions can be exported or explicitly stopped, never executed.
    engineVersion: z.string().min(1).max(64),
    id,
    revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    status: z.enum([
      'scheduled',
      'running',
      'paused',
      'completed',
      'cancelled',
    ]),
    progressSec: z.number().min(0),
    createdAt: instant,
    updatedAt: instant,
    startedAt: instant.nullable(),
    finishedAt: instant.nullable(),
    document: z.unknown(),
    candidate: z.unknown(),
    approval: z
      .object({
        inputHash: hash,
        planHash: hash,
        candidateId: id,
        approvedAt: instant,
      })
      .strict(),
    inputHash: hash,
    planHash: hash,
    integrityHash: hash,
    safety: safetySchema.optional(),
  })
  .strict();

const archiveMetadata = z
  .object({
    recordType: z.literal('quarantined-mission-archive'),
    schemaVersion: z.literal('1.0'),
    id,
    archivedAt: instant,
    action: z.literal('operator-confirmed-simulation-stop'),
    original: z.unknown(),
    originalHash: hash,
    integrityHash: hash,
  })
  .strict();

async function checkedMetadata(value: unknown) {
  checkSize(value);
  const raw = metadata.parse(value);
  const { integrityHash, ...payload } = raw;
  if ((await sha256(payload)) !== integrityHash)
    throw new Error('Нарушена целостность записи выполнения.');
  return raw;
}

async function unwrapArchive(value: unknown): Promise<{
  original: unknown;
  archived: boolean;
}> {
  if (
    !value ||
    typeof value !== 'object' ||
    !('recordType' in value) ||
    value.recordType !== 'quarantined-mission-archive'
  )
    return { original: value, archived: false };
  checkSize(value);
  const record = archiveMetadata.parse(value);
  const { integrityHash, ...payload } = record;
  if (
    (await sha256(payload)) !== integrityHash ||
    (await sha256(record.original)) !== record.originalHash
  )
    throw new Error('Нарушена целостность архивной оболочки выполнения.');
  const original = await checkedMetadata(record.original);
  if (
    original.id !== record.id ||
    !['scheduled', 'running', 'paused'].includes(original.status)
  )
    throw new Error('Архивная остановка не соответствует исходной симуляции.');
  return { original: record.original, archived: true };
}

async function rejectedRecord(
  value: unknown,
  error: unknown,
): Promise<RejectedMissionOperation> {
  const source =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  let raw: z.infer<typeof metadata> | undefined;
  let archived = false;
  let originalHash: string | null = null;
  try {
    const unwrapped = await unwrapArchive(value);
    raw = await checkedMetadata(unwrapped.original);
    archived = unwrapped.archived;
    originalHash = await sha256(unwrapped.original);
  } catch {
    /* No unverified metadata is used to release an occupied simulator. */
  }
  const document = raw?.document as { name?: unknown } | undefined;
  const duration = (
    raw?.candidate as { metrics?: { makespanSec?: number } } | undefined
  )?.metrics?.makespanSec;
  const lifecycleCoherent =
    !!raw &&
    typeof duration === 'number' &&
    Number.isFinite(duration) &&
    duration > 0 &&
    raw.progressSec <= duration &&
    Date.parse(raw.updatedAt) >= Date.parse(raw.createdAt) &&
    (raw.startedAt === null ||
      (Date.parse(raw.startedAt) >= Date.parse(raw.createdAt) &&
        Date.parse(raw.startedAt) <= Date.parse(raw.updatedAt))) &&
    (raw.finishedAt === null ||
      (raw.finishedAt === raw.updatedAt &&
        Date.parse(raw.finishedAt) >=
          Date.parse(raw.startedAt ?? raw.createdAt))) &&
    ((raw.status === 'scheduled' &&
      raw.progressSec === 0 &&
      raw.startedAt === null &&
      raw.finishedAt === null) ||
      (['running', 'paused'].includes(raw.status) &&
        raw.startedAt !== null &&
        raw.finishedAt === null &&
        raw.progressSec < duration) ||
      (raw.status === 'completed' &&
        raw.startedAt !== null &&
        raw.finishedAt !== null &&
        raw.progressSec === duration &&
        !raw.safety) ||
      (raw.status === 'cancelled' &&
        raw.finishedAt !== null &&
        (raw.startedAt !== null || raw.progressSec === 0) &&
        (!raw.safety || !['pending', 'returning'].includes(raw.safety.stage))));
  return {
    id:
      raw?.id ??
      (typeof source.id === 'string' && source.id.length <= 60
        ? source.id
        : null),
    name:
      typeof document?.name === 'string'
        ? document.name.slice(0, 160)
        : 'Сохранённое выполнение',
    status: raw?.status ?? null,
    reason: archived
      ? 'Старая симуляция явно остановлена оператором. Исходный снимок сохранён; для нового выполнения нужен новый расчёт и подтверждение.'
      : error instanceof Error
        ? error.message
        : 'Запись не прошла проверку. Исходные данные сохранены.',
    checkIds: error instanceof ModelRevalidationError ? error.checkIds : [],
    blocksExecution:
      !archived &&
      (!raw ||
        !lifecycleCoherent ||
        ['running', 'paused'].includes(raw.status)),
    archived,
    originalHash,
  };
}

function checkSize(value: unknown) {
  assertSafeTree(value);
  const attached =
    value &&
    typeof value === 'object' &&
    'document' in value &&
    value.document &&
    typeof value.document === 'object' &&
    'obstacleLayer' in value.document;
  if (attached) {
    const record = value as { document: MissionDocument };
    const core = {
      ...record,
      document: { ...record.document, obstacleLayer: undefined },
    };
    if (
      new TextEncoder().encode(JSON.stringify(core)).length >
        MAX_OPERATION_BYTES ||
      new TextEncoder().encode(JSON.stringify(value)).length > 20 * 1024 * 1024
    )
      throw new Error(
        'Превышен размер снимка: 5 МиБ без слоя, 20 МиБ вместе с ним.',
      );
    return;
  }
  if (
    new TextEncoder().encode(JSON.stringify(value)).length > MAX_OPERATION_BYTES
  )
    throw new Error('Снимок выполнения больше 5 МиБ. Запись не сохранена.');
}
async function seal(
  value: Omit<MissionOperation, 'integrityHash'>,
): Promise<MissionOperation> {
  return { ...value, integrityHash: await sha256(value) };
}

/** Hashes bind a local snapshot; they are not a signature or a flight clearance.
 * Saved pass flags are not trusted: every read/mutation reruns model validation.
 */
export async function verifyMissionOperation(
  value: unknown,
): Promise<MissionOperation> {
  const raw = await checkedMetadata(value);
  const document = parseMissionDocument(raw.document);
  serializeMissionJson(document);
  const candidate = raw.candidate as MissionCandidate;
  if (
    raw.engineVersion !== MISSION_ENGINE_VERSION ||
    !candidate ||
    candidate.status !== 'feasible_model' ||
    candidate.plan?.engineVersion !== MISSION_ENGINE_VERSION ||
    candidate.plan.status !== 'undetermined' ||
    !Array.isArray(candidate.assumptions) ||
    !candidate.assumptions.length ||
    candidate.assumptions.some((s) => typeof s !== 'string' || !s.trim())
  )
    throw new Error(
      'Для выполнения нужен полный проверенный модельный план текущей версии.',
    );
  const inputHash = await sha256(document),
    planHash = await sha256(candidate);
  if (
    inputHash !== raw.inputHash ||
    inputHash !== candidate.plan.inputHash ||
    planHash !== raw.planHash ||
    raw.approval.inputHash !== inputHash ||
    raw.approval.planHash !== planHash ||
    raw.approval.candidateId !== candidate.id
  )
    throw new Error('Подтверждение или хеши не соответствуют снимку миссии.');
  const checks = await validateExportedCandidate(document, candidate);
  const failedChecks = [
    ...checks,
    ...candidate.checks,
    ...candidate.plan.checks,
  ].filter((check) => check.status === 'fail');
  if (failedChecks.length) throw new ModelRevalidationError(failedChecks);
  const duration = candidate.metrics.makespanSec;
  if (raw.safety) {
    const s = raw.safety;
    if (
      !['paused', 'cancelled'].includes(raw.status) ||
      (raw.status === 'cancelled' &&
        ['pending', 'returning'].includes(s.stage)) ||
      s.modelTimeSec !== raw.progressSec ||
      s.progressSec < s.modelTimeSec ||
      !document.scenario.vehicles.some((v) => v.id === s.vehicleId)
    )
      throw new Error('Нештатный режим не согласован с контрольной точкой.');
    if (s.stage === 'returning' || s.stage === 'landed') {
      const route = recoveryOptions(document, candidate, s).find(
        (o) => o.policy === s.policy,
      );
      if (
        !route?.valid ||
        s.progressSec > route.endSec ||
        (s.stage === 'landed' && s.progressSec !== route.endSec)
      )
        throw new Error('Защитная траектория не прошла повторную проверку.');
    }
  }
  const started = raw.startedAt !== null,
    finished = raw.finishedAt !== null;
  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    raw.progressSec > duration ||
    (raw.status === 'scheduled' &&
      (raw.progressSec !== 0 || started || finished)) ||
    (['running', 'paused'].includes(raw.status) &&
      (!started || finished || raw.progressSec >= duration)) ||
    (raw.status === 'completed' &&
      (!started || !finished || raw.progressSec !== duration)) ||
    (raw.status === 'cancelled' &&
      (!finished || (!started && raw.progressSec !== 0))) ||
    Date.parse(raw.updatedAt) < Date.parse(raw.createdAt) ||
    (started &&
      (Date.parse(raw.startedAt!) < Date.parse(raw.createdAt) ||
        Date.parse(raw.startedAt!) > Date.parse(raw.updatedAt))) ||
    (finished &&
      (Date.parse(raw.finishedAt!) <
        Date.parse(raw.startedAt ?? raw.createdAt) ||
        raw.finishedAt !== raw.updatedAt))
  )
    throw new Error(
      'Статус, модельное время или отметки журнала противоречат друг другу.',
    );
  return structuredClone({ ...raw, document, candidate } as MissionOperation);
}

type Charge = { sortie: ScheduledSortie; start: number; end: number };
function chargeTimeline(row: MissionOperation, vehicleId: string): Charge[] {
  let chargerReady = 0;
  const charges: Charge[] = [];
  for (const sortie of row.candidate.sorties
    .filter((s) => s.vehicleId === vehicleId)
    .sort((a, b) => a.endSec - b.endSec)) {
    const battery = row.document.batteries.find(
      (b) => b.id === sortie.batteryId,
    )!;
    if (battery.rechargeSec !== null) {
      const start = Math.max(sortie.endSec, chargerReady),
        end = start + battery.rechargeSec;
      charges.push({ sortie, start, end });
      chargerReady = end;
    }
  }
  return charges;
}

export type OperationStartBlocker = {
  code: 'STATE' | 'SIMULATOR_BUSY' | 'VEHICLE_TIME_CONFLICT';
  detail: string;
  otherId?: string;
  vehicleId?: string;
};
/** Conservative reservation: each assigned vehicle from preparation through its
 * final service/recharge. Different IDs are NOT proof of airspace separation.
 * A paused operation still occupies space; cross-operation replanning is not
 * implemented, so even disjoint fleets must finish their active operation first.
 */
export function getOperationStartBlockers(
  row: MissionOperation,
  rows: readonly MissionOperation[],
  fleet: readonly FleetState[] = [],
): OperationStartBlocker[] {
  const blockers: OperationStartBlocker[] = [];
  if (
    rows.some(
      (other) =>
        other.id !== row.id &&
        other.status !== 'cancelled' &&
        other.safety &&
        ['pending', 'returning'].includes(other.safety.stage),
    )
  )
    blockers.push({
      code: 'SIMULATOR_BUSY',
      detail: 'Сначала завершите защитный сценарий другой миссии.',
    });
  if (row.safety)
    blockers.push({
      code: 'STATE',
      detail:
        'Исходный план остановлен из-за события. Продолжайте защитный сценарий или создайте пересмотр задания.',
    });
  if (row.status !== 'scheduled' && row.status !== 'paused')
    blockers.push({
      code: 'STATE',
      detail: 'Запуск возможен только из очереди или явной паузы.',
    });
  try {
    assertRevisionBinding(
      row.document,
      rows.find((r) => r.id === row.document.revisionSource?.operationId),
    );
  } catch (e) {
    blockers.push({
      code: 'STATE',
      detail: e instanceof Error ? e.message : 'Повреждена связь версий.',
    });
  }
  const source = row.document.revisionSource;
  if (
    source &&
    !rows.some(
      (parent) =>
        parent.id === source.operationId &&
        parent.integrityHash === source.integrityHash &&
        ['cancelled', 'completed'].includes(parent.status),
    )
  )
    blockers.push({
      code: 'STATE',
      detail:
        'Исходная версия пересмотра отсутствует или изменилась. Пересоздайте остаток из журнала.',
    });
  const vehicles = [...new Set(row.candidate.sorties.map((s) => s.vehicleId))];
  if (row.document.planning.safetyPolicy !== 'continuous-occupancy-v1')
    blockers.push({
      code: 'STATE',
      detail:
        'Архивная проверка безопасности: откройте задание в редакторе, обновите состояние парка и пересчитайте план перед запуском или продолжением.',
    });
  if (!row.startedAt && !row.document.planning.batteryPolicy)
    blockers.push({
      code: 'STATE',
      detail:
        'Архивная политика батарей: откройте задание в редакторе, обновите состояние парка и пересчитайте.',
    });
  if (!row.startedAt)
    for (const state of fleet) {
      if (vehicles.includes(state.id)) continue;
      if (
        state.operationId &&
        rows.some(
          (other) =>
            other.id === state.operationId && independentOperations(row, other),
        )
      )
        continue;
      const vehicle = row.document.scenario.vehicles.find(
        (v) => v.id === state.id,
      );
      if (
        !vehicle ||
        !state.grounded ||
        canonicalStringify(vehicle.start) !==
          canonicalStringify(state.vehicle.start) ||
        canonicalStringify(vehicle.landing) !==
          canonicalStringify(state.vehicle.landing)
      )
        blockers.push({
          code: 'STATE',
          vehicleId: state.id,
          detail: `БВС ${state.id}: расположение всего парка не подтверждено снимком. Обновите «Парк» в редакторе, пересчитайте и подтвердите новый план.`,
        });
    }
  if (!row.startedAt)
    for (const vehicleId of vehicles) {
      const s = fleet.find((s) => s.id === vehicleId);
      const v = row.document.scenario.vehicles.find((v) => v.id === vehicleId)!;
      const b = row.document.batteries.find((b) => b.vehicleId === vehicleId)!;
      const differs =
        s &&
        (canonicalStringify({ ...v, enabled: true }) !==
          canonicalStringify({ ...s.vehicle, enabled: true }) ||
          canonicalStringify({ ...b, readyAt: '' }) !==
            canonicalStringify({ ...s.battery, readyAt: '' }) ||
          Date.parse(b.readyAt) <
            Date.parse(row.document.window.start) +
              s.preparationRemainingSec * 1000);
      if (
        s &&
        (!s.ready ||
          !s.grounded ||
          !s.vehicle.enabled ||
          differs ||
          row.document.fleetSnapshot?.find((x) => x.vehicleId === vehicleId)
            ?.revision !== s.revision)
      )
        blockers.push({
          code: 'STATE',
          vehicleId,
          detail: `БВС ${vehicleId}: состояние парка изменилось или аппарат не готов. Обновите парк, пересчитайте и подтвердите новый план.`,
        });
      if (
        !s &&
        rows.some(
          (r) =>
            r.id !== row.id &&
            r.startedAt &&
            r.candidate.sorties.some((f) => f.vehicleId === vehicleId),
        )
      )
        blockers.push({
          code: 'STATE',
          vehicleId,
          detail: `БВС ${vehicleId}: после архивного выполнения подтвердите текущий заряд и посадку через «Парк».`,
        });
    }
  const interval = (r: MissionOperation, vehicleId: string) => ({
    start: Date.parse(r.document.window.start),
    end:
      Date.parse(r.document.window.start) +
      1000 *
        Math.max(
          0,
          ...r.candidate.sorties
            .filter((s) => s.vehicleId === vehicleId)
            .map((s) => s.readySec),
          ...chargeTimeline(r, vehicleId).map((c) => c.end),
        ),
  });
  for (const other of rows) {
    if (
      other.id === row.id ||
      other.status === 'completed' ||
      other.status === 'cancelled'
    )
      continue;
    if (
      (other.status === 'running' ||
        (other.startedAt !== null && other.status === 'paused')) &&
      !independentOperations(row, other)
    )
      blockers.push({
        code: 'SIMULATOR_BUSY',
        otherId: other.id,
        detail: `В журнале уже выполняется ${other.document.name}. Пауза сохраняет занятое пространство; сначала завершите или безопасно отмените другую миссию. Горизонтальные защитные области пересекаются или используется один БВС. Разведите территории/базы либо выполняйте последовательно.`,
      });
    for (const vehicleId of vehicles) {
      if (!other.candidate.sorties.some((s) => s.vehicleId === vehicleId))
        continue;
      const a = interval(row, vehicleId),
        b = interval(other, vehicleId);
      if (
        (other.startedAt !== null && other.status === 'paused') ||
        (a.start < b.end && b.start < a.end)
      )
        blockers.push({
          code: 'VEHICLE_TIME_CONFLICT',
          otherId: other.id,
          vehicleId,
          detail: `БВС ${vehicleId}: пересечение модельного окна с ${other.document.name}. Запуск заблокирован; измените план или отмените конфликтующую запись.`,
        });
    }
  }
  return blockers;
}

export type OperationBatteryState = {
  batteryId: string;
  status: 'waiting' | 'in_use' | 'charging' | 'ready' | 'reserve_only';
  pct: number;
  readyAtSec: number | null;
};
export type OperationVehicleState = {
  vehicleId: string;
  name: string;
  modelOnly: true;
  status:
    | 'disabled'
    | 'not_assigned'
    | 'preparing'
    | 'waiting'
    | 'in_flight'
    | 'servicing'
    | 'ready'
    | 'unavailable';
  phase: Phase | null;
  batteryId: string | null;
  batteryPct: number | null;
  nextSortieSec: number | null;
  readyAtSec: number | null;
  batteries: OperationBatteryState[];
  detail: string;
};
const operationPhaseNames: Record<Phase, string> = {
  takeoff: 'взлёт',
  transit: 'переход к работе',
  survey: 'работа сенсора',
  turn: 'манёвр',
  return: 'возврат на базу',
  landing: 'посадка',
};
/** Pure view of the verified snapshot at its explicit saved model time. No Date.now,
 * radio polling, assumed elapsed wall time, linear charging or cross-mission reuse.
 */
export function deriveOperationVehicleStates(
  row: MissionOperation,
): OperationVehicleState[] {
  const t = row.progressSec,
    doc = row.document;
  return doc.scenario.vehicles.map((vehicle) => {
    const flights = row.candidate.sorties
      .filter((s) => s.vehicleId === vehicle.id)
      .sort((a, b) => a.startSec - b.startSec);
    const charges = chargeTimeline(row, vehicle.id);
    const active = flights.find((s) => s.startSec <= t && t < s.endSec);
    const previous = flights.filter((s) => s.endSec <= t).at(-1);
    const next = flights.find((s) => s.startSec > t);
    const batteries: OperationBatteryState[] = doc.batteries
      .filter((b) => b.vehicleId === vehicle.id)
      .map((battery) => {
        let pct = battery.initialPct,
          ready = Math.max(
            0,
            (Date.parse(battery.readyAt) - Date.parse(doc.window.start)) / 1000,
          );
        let status: OperationBatteryState['status'] =
          t < ready
            ? 'waiting'
            : pct > doc.scenario.reservePct
              ? 'ready'
              : 'reserve_only';
        for (const flight of flights.filter(
          (s) => s.batteryId === battery.id,
        )) {
          if (t < flight.startSec) break;
          if (t < flight.endSec) {
            const segment = flight.segments.find(
              (s) => s.startSec <= t && t < s.endSec,
            )!;
            pct =
              segment.batteryFromPct +
              ((segment.batteryToPct - segment.batteryFromPct) *
                (t - segment.startSec)) /
                (segment.endSec - segment.startSec);
            return {
              batteryId: battery.id,
              status: 'in_use',
              pct,
              readyAtSec:
                charges.find((c) => c.sortie.id === flight.id)?.end ??
                flight.readySec,
            };
          }
          const charge = charges.find((c) => c.sortie.id === flight.id);
          pct = charge && t >= charge.end ? 100 : flight.remainingPct;
          ready = charge?.end ?? flight.readySec;
          status =
            t < ready
              ? charge && t >= charge.start
                ? 'charging'
                : 'waiting'
              : pct > doc.scenario.reservePct
                ? 'ready'
                : 'reserve_only';
        }
        return {
          batteryId: battery.id,
          status,
          pct,
          readyAtSec: status === 'reserve_only' ? null : ready,
        };
      });
    const segment = active?.segments.find(
      (s) => s.startSec <= t && t < s.endSec,
    );
    const usableTimes = batteries
      .filter((b) => b.status !== 'reserve_only' && b.readyAtSec !== null)
      .map((b) => b.readyAtSec!);
    const readyAtSec = usableTimes.length
      ? Math.max(
          active?.readySec ?? previous?.readySec ?? doc.planning.preparationSec,
          Math.min(...usableTimes),
        )
      : null;
    let status: OperationVehicleState['status'], detail: string;
    if (!vehicle.enabled) {
      status = 'disabled';
      detail = 'Исключён из данного снимка оператором.';
    } else if (!flights.length) {
      status = 'not_assigned';
      detail =
        'В выбранном плане не назначен; готовность к иной миссии не доказана.';
    } else if (row.status === 'cancelled') {
      status = 'unavailable';
      detail =
        'Модельное выполнение отменено; фактическое положение и готовность неизвестны.';
    } else if (active) {
      status = 'in_flight';
      detail = `Модельная фаза: ${segment ? operationPhaseNames[segment.phase] : 'переход между фазами'}; ${row.status === 'paused' ? 'время зафиксировано на паузе' : 'по модельному времени'}.`;
    } else if (previous && t < previous.readySec) {
      status = 'servicing';
      detail = `Модельное обслуживание до t=${previous.readySec.toFixed(1)} с.`;
    } else if (t < doc.planning.preparationSec) {
      status = 'preparing';
      detail = `Подготовка до t=${doc.planning.preparationSec} с; контакт с БВС не устанавливается.`;
    } else if (next) {
      status = 'waiting';
      detail = `Следующий назначенный старт t=${next.startSec.toFixed(1)} с; АКБ и ограничения учтены в плане.`;
    } else if (readyAtSec !== null && t >= readyAtSec) {
      status = 'ready';
      detail =
        'Назначенные вылеты закончены, модельное обслуживание завершено. Новая миссия требует отдельного расчёта.';
    } else {
      status = 'unavailable';
      detail =
        'Готовность не наступила в сохранённом модельном времени; ожидается ресурс/зарядка.';
    }
    const usedBattery = batteries.find(
      (b) => b.batteryId === (active?.batteryId ?? previous?.batteryId),
    );
    return {
      vehicleId: vehicle.id,
      name: vehicle.name,
      modelOnly: true,
      status,
      phase: segment?.phase ?? null,
      batteryId: usedBattery?.batteryId ?? null,
      batteryPct: usedBattery?.pct ?? null,
      nextSortieSec: next?.startSec ?? null,
      readyAtSec,
      batteries,
      detail,
    };
  });
}

function friendly(error: unknown): Error {
  if (
    error instanceof Error &&
    ['SecurityError', 'InvalidStateError'].includes(error.name)
  )
    return new Error('Хранилище выполнений недоступно. Снимки не изменены.');
  if (error instanceof Error && error.name === 'QuotaExceededError')
    return new Error(
      'Место в браузере закончилось. Старые выполнения не удалены.',
    );
  return error instanceof Error
    ? error
    : new Error('Ошибка локального журнала выполнений.');
}
const request = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(friendly(req.error));
  });
const complete = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () =>
      reject(friendly(tx.error ?? new Error('Изменение журнала отменено.')));
    tx.onerror = () => {};
  });

/** Separate browser DB. No migrations of mission-library, timers, network, eviction,
 * background starts or hidden recovery. All cross-tab writes use atomic CAS.
 */
export function createMissionOperations(
  options: MissionOperationsOptions = {},
) {
  let opening: Promise<IDBDatabase> | undefined,
    active: IDBDatabase | undefined,
    generation = 0;
  const now = options.now ?? (() => new Date());
  function open(): Promise<IDBDatabase> {
    if (opening) return opening;
    const factory = options.indexedDB ?? globalThis.indexedDB,
      version = generation;
    if (!factory)
      return Promise.reject(
        new Error('IndexedDB для журнала выполнений недоступен.'),
      );
    opening = new Promise<IDBDatabase>((resolve, reject) => {
      const req = factory.open(options.dbName ?? OPERATIONS_DB, 2);
      let failed = false;
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(OPERATIONS_STORE))
          req.result.createObjectStore(OPERATIONS_STORE, { keyPath: 'id' });
        if (!req.result.objectStoreNames.contains(FLEET_STATE_STORE))
          req.result.createObjectStore(FLEET_STATE_STORE, { keyPath: 'id' });
      };
      req.onerror = () => {
        failed = true;
        reject(friendly(req.error));
      };
      req.onblocked = () => {
        failed = true;
        reject(
          new Error(
            'Журнал заблокирован другой вкладкой. Закройте старую вкладку.',
          ),
        );
      };
      req.onsuccess = () => {
        const db = req.result;
        if (failed || version !== generation) {
          db.close();
          reject(new Error('Открытие журнала отменено.'));
          return;
        }
        active = db;
        db.onversionchange = () => {
          db.close();
          active = undefined;
          opening = undefined;
        };
        resolve(db);
      };
    }).catch((error) => {
      opening = undefined;
      throw friendly(error);
    });
    return opening;
  }
  async function readRaw() {
    const db = await open(),
      tx = db.transaction(OPERATIONS_STORE, 'readonly'),
      done = complete(tx);
    try {
      const store = tx.objectStore(OPERATIONS_STORE);
      if ((await request(store.count())) > MAX_MISSION_OPERATIONS)
        throw new Error(
          'Превышен предел журнала: 20 выполнений. Автоматического удаления нет.',
        );
      const raw: unknown[] = await request(store.getAll());
      await done;
      return raw;
    } catch (error) {
      await done.catch(() => undefined);
      throw friendly(error);
    }
  }
  async function readVerified() {
    const raw = await readRaw();
    const fleet = await listFleet();
    // Async hashing/geometry intentionally happen AFTER readonly transaction ends.
    const rows: MissionOperation[] = [];
    const rejected: RejectedMissionOperation[] = [];
    for (const value of raw) {
      try {
        const unwrapped = await unwrapArchive(value);
        if (unwrapped.archived) {
          rejected.push(await rejectedRecord(value, null));
        } else {
          rows.push(await verifyMissionOperation(value));
        }
      } catch (error) {
        rejected.push(await rejectedRecord(value, error));
      }
    }
    return {
      raw,
      rows,
      rejected,
      fleet,
    };
  }
  function requireNoUnverifiedExecution(rejected: RejectedMissionOperation[]) {
    const blocked = rejected.filter((row) => row.blocksExecution);
    if (blocked.length)
      throw new Error(
        `Старое выполнение ${blocked.map((row) => row.id ?? 'без корректного ID').join(', ')} не прошло проверку. Перед новым запуском явно остановите старую симуляцию в истории; исходный снимок сохранится. При нарушенной целостности нужна проверка сохранённого файла.`,
      );
  }
  function requireRow(
    rows: MissionOperation[],
    rejected: RejectedMissionOperation[],
    operationId: string,
  ) {
    const row = rows.find((row) => row.id === operationId);
    if (row) return row;
    const unavailable = rejected.find((row) => row.id === operationId);
    throw new Error(unavailable?.reason ?? 'Выполнение не найдено.');
  }
  async function listFleet(): Promise<FleetState[]> {
    const db = await open(),
      tx = db.transaction(FLEET_STATE_STORE, 'readonly'),
      done = complete(tx);
    const raw: unknown[] = await request(
      tx.objectStore(FLEET_STATE_STORE).getAll(),
    );
    await done;
    if (raw.length > 20) throw new Error('Парк превышает 20 БВС.');
    const states = raw.map(parseFleetState);
    if (new Set(states.map((s) => s.battery.id)).size !== states.length)
      throw new Error('Повторяющиеся ID текущих батарей в парке.');
    return states;
  }
  function executionFleet(
    next: MissionOperation,
    fleet: FleetState[],
  ): FleetState[] {
    if (!next.startedAt || !next.document.planning.batteryPolicy) return fleet;
    const updated = structuredClone(fleet);
    const states = deriveOperationVehicleStates(next);
    for (const id of new Set(next.candidate.sorties.map((s) => s.vehicleId))) {
      const index = updated.findIndex((s) => s.id === id);
      const previous =
        updated[index] ??
        fleetStateFromDocument(next.document, id, next.updatedAt);
      const view = states.find((s) => s.vehicleId === id)!;
      const flights = next.candidate.sorties
        .filter((s) => s.vehicleId === id && s.endSec <= next.progressSec)
        .sort((a, b) => a.endSec - b.endSec);
      const last = flights.at(-1);
      const initial = next.document.batteries.find((b) => b.vehicleId === id)!;
      const battery = {
        ...initial,
        initialPct: view.batteryPct ?? initial.initialPct,
      };
      let grounded = !next.candidate.sorties.some(
        (s) =>
          s.vehicleId === id &&
          s.startSec <= next.progressSec &&
          next.progressSec < s.endSec,
      );
      let ready = next.status === 'completed' && grounded;
      let location = last?.segments.at(-1)?.to ?? previous.vehicle.start;
      if (next.safety) {
        ready = false;
        if (next.safety.stage === 'landed') {
          const option = recoveryOptions(
            next.document,
            next.candidate,
            next.safety,
          ).find((o) => o.policy === next.safety?.policy);
          const returned = option?.sorties.find((s) => s.vehicleId === id);
          if (returned) {
            grounded = true;
            battery.initialPct = returned.remainingPct;
            location = returned.segments.at(-1)!.to;
          }
        }
      }
      if (next.status === 'cancelled') ready = grounded && !next.safety;
      const state = parseFleetState({
        ...previous,
        revision: previous.revision + 1,
        observedAt: next.updatedAt,
        source: 'simulation',
        ready,
        grounded,
        preparationRemainingSec: Math.max(
          0,
          (last?.readySec ?? 0) - next.progressSec,
        ),
        vehicle: {
          ...next.document.scenario.vehicles.find((v) => v.id === id)!,
          start: location,
          batteryPct: battery.initialPct,
        },
        battery,
        operationId: ['completed', 'cancelled'].includes(next.status)
          ? null
          : next.id,
        lastEvent: `${next.id}: ${next.status}; модельный остаток ${battery.initialPct.toFixed(2)}%.`,
      });
      if (index < 0) updated.push(state);
      else updated[index] = state;
    }
    if (updated.length > 20)
      throw new Error('В общем парке допускается не более 20 БВС.');
    if (new Set(updated.map((s) => s.battery.id)).size !== updated.length)
      throw new Error('ID текущей батареи уже занят другим БВС.');
    return updated;
  }
  async function commit(
    raw: unknown[],
    next: MissionOperation,
    inserting: boolean,
    fleet: FleetState[],
  ) {
    checkSize(next);
    const db = await open(),
      tx = db.transaction([OPERATIONS_STORE, FLEET_STATE_STORE], 'readwrite'),
      done = complete(tx);
    try {
      const store = tx.objectStore(OPERATIONS_STORE),
        current: unknown[] = await request(store.getAll());
      const fleetStore = tx.objectStore(FLEET_STATE_STORE);
      const currentFleet = await request(fleetStore.getAll());
      if (canonicalStringify(currentFleet) !== canonicalStringify(fleet))
        throw new Error(
          'Состояние парка изменилось. Обновите данные и повторите действие.',
        );
      // Whole-set comparison also prevents two different concurrent starts or
      // a conflicting enqueue slipping between validation and this transaction.
      if (canonicalStringify(current) !== canonicalStringify(raw))
        throw new Error(
          'Журнал изменён другой вкладкой. Обновите список; действие не применено.',
        );
      if (inserting && current.length >= MAX_MISSION_OPERATIONS)
        throw new Error(
          'Лимит журнала — 20 выполнений. Старые записи не удаляются автоматически.',
        );
      await request(inserting ? store.add(next) : store.put(next));
      for (const state of executionFleet(next, fleet))
        await request(fleetStore.put(state));
      await done;
      return structuredClone(next);
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* The transaction may already have aborted. */
      }
      await done.catch(() => undefined);
      throw friendly(error);
    }
  }
  async function list() {
    const checked = await readVerified();
    // Legacy callers explicitly asking for a fully verified journal stay strict.
    // The UI uses inspect(), which exposes each rejection alongside healthy rows.
    if (checked.rejected.length) throw new Error(checked.rejected[0].reason);
    return checked.rows.sort(
      (a, b) =>
        b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
    );
  }
  async function inspect(): Promise<MissionOperationsInspection> {
    const { rows, rejected } = await readVerified();
    return {
      rows: rows.sort(
        (a, b) =>
          b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
      ),
      rejected,
    };
  }
  async function get(operationId: string) {
    const { rows, rejected } = await readVerified();
    if (rejected.some((row) => row.id === operationId))
      return requireRow(rows, rejected, operationId);
    return rows.find((row) => row.id === operationId) ?? null;
  }
  async function exportRaw(operationId: string): Promise<unknown> {
    const raw = (await readRaw()).find(
      (value) =>
        value &&
        typeof value === 'object' &&
        'id' in value &&
        value.id === operationId,
    );
    if (!raw) throw new Error('Сохранённая запись не найдена.');
    return structuredClone(raw);
  }
  async function recoverDocument(
    operationId: string,
  ): Promise<MissionDocument> {
    const saved = await exportRaw(operationId);
    const { original } = await unwrapArchive(saved);
    const raw = await checkedMetadata(original);
    const document = parseMissionDocument(raw.document);
    serializeMissionJson(document);
    return structuredClone(document);
  }
  async function archiveRejected(
    operationId: string,
    expectedOriginalHash: string,
  ): Promise<void> {
    const { raw, rejected, fleet } = await readVerified();
    const entry = rejected.find((row) => row.id === operationId);
    if (
      !entry ||
      !entry.originalHash ||
      entry.originalHash !== expectedOriginalHash
    )
      throw new Error(
        'Снимок изменился или его целостность не подтверждена. Обновите историю; остановка не записана.',
      );
    if (entry.archived) return;
    const original = raw.find(
      (value) =>
        value &&
        typeof value === 'object' &&
        'id' in value &&
        value.id === operationId,
    );
    const checked = await checkedMetadata(original);
    if (!['scheduled', 'running', 'paused'].includes(checked.status))
      throw new Error('Завершённая архивная запись уже не занимает симулятор.');
    const payload = {
      recordType: 'quarantined-mission-archive' as const,
      schemaVersion: '1.0' as const,
      id: operationId,
      archivedAt: now().toISOString(),
      action: 'operator-confirmed-simulation-stop' as const,
      original,
      originalHash: expectedOriginalHash,
    };
    const archive = { ...payload, integrityHash: await sha256(payload) };
    await unwrapArchive(archive);
    const db = await open(),
      tx = db.transaction([OPERATIONS_STORE, FLEET_STATE_STORE], 'readwrite'),
      done = complete(tx);
    try {
      const store = tx.objectStore(OPERATIONS_STORE),
        current = await request(store.getAll()),
        currentFleet = await request(
          tx.objectStore(FLEET_STATE_STORE).getAll(),
        );
      if (
        canonicalStringify(current) !== canonicalStringify(raw) ||
        canonicalStringify(currentFleet) !== canonicalStringify(fleet)
      )
        throw new Error(
          'Журнал или парк изменён другой вкладкой. Остановка не записана; обновите историю.',
        );
      await request(store.put(archive));
      // No battery, position or readiness is fabricated by archiving a simulator.
      await done;
    } catch (error) {
      try {
        tx.abort();
      } catch {}
      await done.catch(() => undefined);
      throw friendly(error);
    }
  }
  async function enqueue(input: EnqueueMissionOperation) {
    const snapshot = structuredClone(input),
      timestamp = now().toISOString();
    checkSize(snapshot);
    const next = await seal({
      ...snapshot,
      schemaVersion: '1.0',
      modelOnly: true,
      engineVersion: MISSION_ENGINE_VERSION,
      revision: 1,
      status: 'scheduled',
      progressSec: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      startedAt: null,
      finishedAt: null,
      inputHash: await sha256(snapshot.document),
      planHash: await sha256(snapshot.candidate),
    });
    await verifyMissionOperation(next);
    const { raw, rows, rejected, fleet } = await readVerified();
    if (
      rows.some((r) => r.id === next.id) ||
      rejected.some((r) => r.id === next.id)
    )
      throw new Error('ID выполнения уже занят. Исходная запись не изменена.');
    return commit(raw, next, true, fleet);
  }
  async function change(
    operationId: string,
    revision: number,
    action: 'start' | 'pause' | 'advance' | 'cancel',
    progress?: number,
  ) {
    const { raw, rows, rejected, fleet } = await readVerified(),
      row = requireRow(rows, rejected, operationId);
    if (revision !== row.revision)
      throw new Error('Ревизия выполнения изменилась. Обновите список.');
    if (revision >= Number.MAX_SAFE_INTEGER)
      throw new Error('Предел ревизий выполнения; запись не изменена.');
    if (row.status === 'completed' || row.status === 'cancelled')
      throw new Error(
        'Завершённая запись неизменна. Создайте новое подтверждённое выполнение.',
      );
    if (
      row.safety &&
      !(
        action === 'cancel' &&
        ['landed', 'blocked', 'crashed'].includes(row.safety.stage)
      )
    )
      throw new Error(
        'Нештатное выполнение изменяется только через защитный сценарий.',
      );
    const timestamp = new Date(
      Math.max(now().getTime(), Date.parse(row.updatedAt)),
    ).toISOString();
    const { integrityHash: _hash, ...payload } = row;
    const next = { ...payload, revision: revision + 1, updatedAt: timestamp };
    if (action === 'start') {
      requireNoUnverifiedExecution(rejected);
      const blockers = getOperationStartBlockers(row, rows, fleet);
      if (blockers.length)
        throw new Error(blockers.map((b) => b.detail).join(' '));
      next.status = 'running';
      next.startedAt ??= timestamp;
    } else if (action === 'cancel') {
      next.status = 'cancelled';
      next.finishedAt = timestamp;
    } else {
      if (action === 'advance') requireNoUnverifiedExecution(rejected);
      if (row.status !== 'running')
        throw new Error(
          'Изменить время или поставить паузу можно только у running-записи.',
        );
      const t = progress ?? row.progressSec;
      if (
        !Number.isFinite(t) ||
        t < row.progressSec ||
        t > row.candidate.metrics.makespanSec
      )
        throw new Error(
          'Модельное время должно монотонно расти в пределах выбранного плана.',
        );
      next.progressSec = t;
      next.status =
        t === row.candidate.metrics.makespanSec
          ? 'completed'
          : action === 'pause'
            ? 'paused'
            : 'running';
      if (next.status === 'completed') next.finishedAt = timestamp;
    }
    return commit(raw, await seal(next), false, fleet);
  }
  async function safetyChange(
    operationId: string,
    revision: number,
    action:
      | {
          type: 'detect';
          id: string;
          kind: IncidentKind;
          vehicleId: string;
          windMps: number;
          batteryPct: number;
        }
      | {
          type: 'decide';
          policy: 'home' | 'nearest';
          reason: 'operator' | 'timeout';
        }
      | { type: 'advance'; progressSec: number },
  ) {
    const { raw, rows, rejected, fleet } = await readVerified(),
      row = requireRow(rows, rejected, operationId);
    if (!row || row.revision !== revision)
      throw new Error('Ревизия события изменилась. Обновите журнал.');
    if (row.status !== 'paused')
      throw new Error('Сначала зафиксируйте паузу текущего выполнения.');
    requireNoUnverifiedExecution(rejected);
    if (
      rows.some(
        (other) =>
          other.id !== row.id &&
          !independentOperations(row, other) &&
          (other.status === 'running' ||
            (other.status === 'paused' &&
              (other.startedAt !== null ||
                (other.safety &&
                  ['pending', 'returning'].includes(other.safety.stage))))),
      )
    )
      throw new Error('Другой симулятор уже использует исполнительный контур.');
    const date = new Date(Math.max(now().getTime(), Date.parse(row.updatedAt)));
    let safety: SafetySession;
    if (action.type === 'detect') {
      if (row.safety)
        throw new Error('У выполнения уже есть защитный сценарий.');
      safety = createSafetySession(row, action, date);
    } else {
      if (!row.safety) throw new Error('Событие не найдено.');
      safety = structuredClone(row.safety);
      if (action.type === 'decide')
        safety = decideSafety(row, safety, action.policy, action.reason, date);
      else {
        const route = recoveryOptions(row.document, row.candidate, safety).find(
          (o) => o.policy === safety.policy,
        );
        if (
          safety.stage !== 'returning' ||
          !route?.valid ||
          !Number.isFinite(action.progressSec) ||
          action.progressSec < safety.progressSec ||
          action.progressSec > route.endSec
        )
          throw new Error('Недопустимое время защитного сценария.');
        safety.progressSec = action.progressSec;
        if (action.progressSec === route.endSec) {
          safety.stage = 'landed';
          safety.events.push({
            at: date.toISOString(),
            text: 'Модельный возврат завершён. Исходная миссия не считается выполненной; нужен пересмотр оставшихся работ.',
          });
        }
      }
    }
    if (safety.stage === 'returning') {
      const route = recoveryOptions(row.document, row.candidate, safety).find(
        (o) => o.policy === safety.policy,
      );
      if (!route?.valid) throw new Error('Возврат не прошёл проверку.');
      const recoveryRow = {
        document: row.document,
        candidate: { ...row.candidate, sorties: route.sorties },
      };
      if (
        rows.some(
          (other) =>
            other.id !== row.id &&
            ['running', 'paused'].includes(other.status) &&
            other.startedAt &&
            !independentOperations(recoveryRow, other),
        )
      )
        throw new Error(
          'Возврат пересекает защитную область другой миссии. Переход не применён.',
        );
    }
    const { integrityHash: _hash, ...payload } = row;
    const next = await seal({
      ...payload,
      safety,
      revision: revision + 1,
      updatedAt: date.toISOString(),
    });
    await verifyMissionOperation(next);
    return commit(raw, next, false, fleet);
  }
  async function reportFleet(input: FleetReport) {
    const { raw, rows, rejected, fleet } = await readVerified();
    requireNoUnverifiedExecution(rejected);
    const s = parseFleetState(input.state),
      old = fleet.find((x) => x.id === s.id);
    if (fleet.some((x) => x.id !== s.id && x.battery.id === s.battery.id))
      throw new Error('ID текущей батареи уже занят другим БВС.');
    if ((old?.revision ?? 0) !== input.expectedRevision)
      throw new Error('Устаревшее сообщение: обновите состояние парка.');
    if (s.source !== 'operator' || s.operationId !== null)
      throw new Error(
        'Внешний ввод стенда должен быть помечен как данные оператора.',
      );
    if (old && Date.parse(s.observedAt) <= Date.parse(old.observedAt))
      throw new Error('Повторное или устаревшее время наблюдения.');
    if (Math.abs(Date.parse(s.observedAt) - now().getTime()) > 300000)
      throw new Error(
        'Сообщение должно быть не старше 5 минут, без будущего времени.',
      );
    if (Date.parse(s.observedAt) > now().getTime() + 1000)
      throw new Error('Время сообщения находится в будущем.');
    if (
      rows.some(
        (r) =>
          r.startedAt &&
          !['completed', 'cancelled'].includes(r.status) &&
          r.candidate.sorties.some((f) => f.vehicleId === s.id),
      )
    )
      throw new Error(
        'БВС занят выполнением. Сначала безопасная посадка и завершение/отмена снимка.',
      );
    if (
      rows.some(
        (r) =>
          r.startedAt !== null &&
          !['completed', 'cancelled'].includes(r.status),
      ) &&
      (!old ||
        !old.grounded ||
        !s.grounded ||
        canonicalStringify(old.vehicle.start) !==
          canonicalStringify(s.vehicle.start) ||
        canonicalStringify(old.vehicle.landing) !==
          canonicalStringify(s.vehicle.landing))
    )
      throw new Error(
        'Во время незавершённой миссии нельзя добавлять БВС, менять точки старта/посадки или воздушное состояние парка. Перепланирование выполняющейся миссии по обновлениям парка пока не поддерживается; сначала безопасно завершите или отмените её.',
      );
    if (old && !old.grounded && (input.replacement || s.ready))
      throw new Error(
        'Сначала подтвердите отдельным сообщением посадку без готовности и без замены.',
      );
    if (
      old &&
      (s.battery.id !== old.battery.id ||
        s.battery.initialPct > old.battery.initialPct + 0.001) &&
      !input.replacement
    )
      throw new Error(
        'Новая батарея или рост заряда требуют явного события замены.',
      );
    if (input.replacement && !s.grounded)
      throw new Error('Замена возможна только на земле.');
    const replacements = [...(old?.replacements ?? [])];
    if (input.replacement)
      replacements.push({
        at: s.observedAt,
        fromId: old?.battery.id ?? s.battery.id,
        toId: s.battery.id,
        pct: s.battery.initialPct,
      });
    const next = parseFleetState({
      ...s,
      revision: (old?.revision ?? 0) + 1,
      replacements,
    });
    if (!old && fleet.length >= 20) throw new Error('Парк ограничен 20 БВС.');
    const db = await open(),
      tx = db.transaction([OPERATIONS_STORE, FLEET_STATE_STORE], 'readwrite'),
      done = complete(tx);
    try {
      const ops = await request(tx.objectStore(OPERATIONS_STORE).getAll()),
        fs = tx.objectStore(FLEET_STATE_STORE),
        current = await request(fs.getAll());
      if (
        canonicalStringify(ops) !== canonicalStringify(raw) ||
        canonicalStringify(current) !== canonicalStringify(fleet)
      )
        throw new Error('Парк или выполнение изменены другой вкладкой.');
      await request(fs.put(next));
      await done;
      return next;
    } catch (e) {
      try {
        tx.abort();
      } catch {}
      await done.catch(() => undefined);
      throw friendly(e);
    }
  }
  function close() {
    generation++;
    active?.close();
    active = undefined;
    opening = undefined;
  }
  return {
    enqueue,
    safetyChange,
    list,
    inspect,
    exportRaw,
    recoverDocument,
    archiveRejected,
    listFleet,
    reportFleet,
    get,
    start: (operationId: string, revision: number) =>
      change(operationId, revision, 'start'),
    pause: (operationId: string, revision: number, progressSec?: number) =>
      change(operationId, revision, 'pause', progressSec),
    advance: (operationId: string, revision: number, progressSec: number) =>
      change(operationId, revision, 'advance', progressSec),
    cancel: (operationId: string, revision: number) =>
      change(operationId, revision, 'cancel'),
    close,
  };
}
export type MissionOperations = ReturnType<typeof createMissionOperations>;
