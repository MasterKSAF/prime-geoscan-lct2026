import { parseMissionDocument, canonicalStringify } from './mission-schema.ts';
import type { MissionDocument } from './mission-schema.ts';
import type { MissionOperation } from './mission-operations.ts';
import { installedBatteryDocument } from './mission-fleet-state.ts';
import type { Coordinate } from './schema.ts';
import { demoMission } from './mission-demo.ts';

/** Fleet editing must not inherit invalid work geometry, dates or assignments. */
export function fleetRegistryTemplate(
  input: Pick<MissionDocument, 'scenario' | 'batteries' | 'bases'>,
): MissionDocument {
  const template = installedBatteryDocument(demoMission(1));
  return installedBatteryDocument({
    ...template,
    id: 'fleet-registry-template',
    name: 'Общий парк БВС',
    planning: { ...template.planning, batteryPolicy: undefined },
    scenario: {
      ...template.scenario,
      vehicles: structuredClone(input.scenario.vehicles),
    },
    batteries: structuredClone(input.batteries),
    bases: fleetBases(input),
    jobs: template.jobs.map((j) => ({ ...j, assignedVehicleIds: [] })),
  });
}

export type FleetRegistry = {
  id: 'global';
  revision: number;
  updatedAt: string;
  document: MissionDocument;
};
export function fleetBases(
  document: Pick<MissionDocument, 'scenario' | 'bases'>,
) {
  const points = new Map<
    string,
    { id: string; name: string; coordinate: Coordinate }
  >();
  for (const base of document.bases ?? [])
    points.set(base.coordinate.join(','), structuredClone(base));
  for (const v of document.scenario.vehicles)
    for (const point of [v.start, v.landing]) {
      const id = point.join(',');
      if (!points.has(id))
        points.set(id, {
          id: `base-${point[0]}-${point[1]}`
            .replaceAll('.', '_')
            .replaceAll(',', '_'),
          name: `База ${points.size + 1}`,
          coordinate: point,
        });
    }
  return [...points.values()];
}
export function applyRegistryFleet(
  input: MissionDocument,
  registry: FleetRegistry,
): MissionDocument {
  const fleet = registry.document;
  const ids = new Set(fleet.scenario.vehicles.map((v) => v.id));
  const unknown = input.jobs.flatMap((j) =>
    j.assignedVehicleIds.filter((id) => !ids.has(id)),
  );
  if (unknown.length)
    throw new Error(
      `В общем парке нет назначенных БВС: ${[...new Set(unknown)].join(', ')}. Сначала измените назначения.`,
    );
  const result: MissionDocument = {
    ...structuredClone(input),
    scenario: {
      ...input.scenario,
      vehicles: structuredClone(fleet.scenario.vehicles),
    },
    batteries: structuredClone(fleet.batteries).map((b) => ({
      ...b,
      readyAt: input.window.start,
    })),
    planning: { ...input.planning, batteryPolicy: 'installed-current-v1' },
    bases: fleetBases(fleet),
  };
  delete result.fleetSnapshot;
  return parseMissionDocument(result);
}
export function assertRegistryChangesSafe(
  before: MissionDocument | null,
  after: MissionDocument,
  operations: readonly MissionOperation[],
) {
  for (const op of operations.filter(
    (o) => !['completed', 'cancelled'].includes(o.status),
  ))
    for (const id of new Set(op.candidate.sorties.map((s) => s.vehicleId))) {
      const old =
        before?.scenario.vehicles.find((v) => v.id === id) ??
        op.document.scenario.vehicles.find((v) => v.id === id);
      const next = after.scenario.vehicles.find((v) => v.id === id);
      const oldBattery =
        before?.batteries.find((b) => b.vehicleId === id) ??
        op.document.batteries.find((b) => b.vehicleId === id);
      if (
        !next ||
        canonicalStringify(old) !== canonicalStringify(next) ||
        canonicalStringify(oldBattery) !==
          canonicalStringify(after.batteries.find((b) => b.vehicleId === id))
      )
        throw new Error(
          `БВС ${id} закреплён за миссией «${op.document.name}». Завершите или отмените её перед изменением профиля.`,
        );
    }
}
/** Dedicated transactional registry; importing/opening a mission never writes it. */
export function createFleetRegistry(
  factory: IDBFactory = indexedDB,
  dbName = 'prime-fleet-registry',
) {
  const opened = new Promise<IDBDatabase>((resolve, reject) => {
    const req = factory.open(dbName, 1);
    req.onupgradeneeded = () =>
      req.result.createObjectStore('registry', { keyPath: 'id' });
    req.onsuccess = () => {
      req.result.onversionchange = () => req.result.close();
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () =>
      reject(new Error('Общий парк открыт в устаревшей вкладке. Закройте её.'));
  });
  const parse = (value: FleetRegistry | undefined) => {
    if (!value) return null;
    if (
      value.id !== 'global' ||
      !Number.isSafeInteger(value.revision) ||
      value.revision < 1 ||
      !Number.isFinite(Date.parse(value.updatedAt))
    )
      throw new Error(
        'Повреждена запись общего парка. Исходные данные не изменены.',
      );
    return { ...value, document: parseMissionDocument(value.document) };
  };
  return {
    async read() {
      const db = await opened;
      return new Promise<FleetRegistry | null>((resolve, reject) => {
        const req = db
          .transaction('registry')
          .objectStore('registry')
          .get('global');
        req.onsuccess = () => {
          try {
            resolve(parse(req.result));
          } catch (e) {
            reject(e);
          }
        };
        req.onerror = () => reject(req.error);
      });
    },
    async save(document: MissionDocument, expectedRevision: number | null) {
      const parsed = fleetRegistryTemplate(document);
      const db = await opened;
      return new Promise<FleetRegistry>((resolve, reject) => {
        const tx = db.transaction('registry', 'readwrite'),
          store = tx.objectStore('registry');
        let result: FleetRegistry;
        let failure: unknown;
        const req = store.get('global');
        req.onsuccess = () => {
          try {
            const old = parse(req.result);
            if ((old?.revision ?? null) !== expectedRevision)
              throw new Error(
                'Общий парк изменён в другой вкладке. Обновите список перед сохранением.',
              );
            result = {
              id: 'global',
              revision: (old?.revision ?? 0) + 1,
              updatedAt: new Date().toISOString(),
              document: parsed,
            };
            store.put(result);
          } catch (e) {
            failure = e;
            tx.abort();
          }
        };
        tx.oncomplete = () => resolve(result);
        tx.onabort = () =>
          reject(failure ?? tx.error ?? new Error('Парк не сохранён.'));
        tx.onerror = () => {};
      });
    },
    async close() {
      (await opened).close();
    },
  };
}
