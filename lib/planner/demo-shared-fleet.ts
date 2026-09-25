import type { MissionDocument } from './mission-schema.ts';
import { parseMissionDocument } from './mission-schema.ts';
import type { Vehicle } from './schema.ts';
import { createCatalogueVehicleProfile } from './mission-vehicle-catalog.ts';
import { distance, inside, projection } from './geometry.ts';

/** A common registry, with fixed world positions. No teleporting between demos. */
export function vehicleInMissionArea(d: MissionDocument, v: Vehicle): boolean {
  return (
    inside(v.start, [d.scenario.airspace.coordinates]) &&
    inside(v.landing, [d.scenario.airspace.coordinates])
  );
}

/** Session initialization only. Existing runs and imported evidence never migrate. */
export function prepareSharedDemoFleet(
  input: MissionDocument[],
): MissionDocument[] {
  const documents = structuredClone(input);
  const vehicles = new Map<string, Vehicle>();
  const batteries = new Map<string, MissionDocument['batteries'][number]>();
  for (const d of documents) {
    for (const v of d.scenario.vehicles)
      vehicles.set(v.id, { ...v, enabled: true });
    for (const b of d.batteries) batteries.set(b.vehicleId, b);
  }
  // Both demonstration regions have all three models. Two dedicated Pollux
  // aircraft allow the added MS work to retain its quality and battery reserve.
  for (const d of documents.filter((d) => d.id !== 'demo-03-repair')) {
    const prefix = d.id === 'demo-01-survey' ? 'north' : 'moscow';
    const extra: [Vehicle['model'], string][] = [
      ...(prefix === 'north'
        ? ([
            ['Gemini', 'ms'],
            ['Gemini', 'ms'],
          ] as [Vehicle['model'], string][])
        : []),
      ['801', 'rgb-ir'],
      ['201', 'rgb'],
    ];
    const p = projection(d.scenario.vehicles[0].start);
    for (const [index, [model, configuration]] of extra.entries()) {
      let point: Vehicle['start'] | undefined;
      // Separate model pads; do not stack grounded aircraft at the same point.
      for (const dy of [-90, -180, 90, 180, -270]) {
        for (const dx of [-90, -180, 90, 180, -270, 270]) {
          const candidate = p.inverse([dx, dy]);
          if (
            inside(candidate, [d.scenario.airspace.coordinates]) &&
            [...vehicles.values()].every(
              (v) => distance(p.forward(v.start), p.forward(candidate)) >= 65,
            )
          ) {
            point = candidate;
            break;
          }
        }
        if (point) break;
      }
      if (!point) throw new Error('Нет места для модельной базы общего парка.');
      const id = `${prefix}-${model.toLowerCase()}-${configuration}-${index + 1}`;
      const v: Vehicle = {
        ...createCatalogueVehicleProfile(model, configuration),
        id,
        name: `Геоскан ${model} · ${configuration === 'ms' ? 'Pollux' : configuration === 'rgb-ir' ? 'RGB + ИК' : 'RGB'} · ${prefix === 'north' ? 'Север' : 'Коломна'} ${index + 1}`,
        start: point,
        landing: [...point],
      };
      vehicles.set(id, v);
      batteries.set(id, {
        id: `${id}-current`,
        vehicleId: id,
        name: `Текущая · ${v.name}`,
        initialPct: v.batteryPct,
        readyAt: d.window.start,
        rechargeSec: null,
        cycles: null,
        commissionedAt: null,
        source: 'Начальный заряд общего модельного парка; симуляция.',
      });
    }
  }
  return documents.map((d) => {
    // The metric planner has a 15 km domain. The registry spans both regions,
    // but its input snapshot includes only physically local aircraft. Shared
    // aircraft retain the SAME IDs, bases and charge in overlapping missions.
    const p = projection(d.scenario.area.coordinates[0][0]);
    const local = [...vehicles.values()].filter(
      (v) => distance(p.forward(v.start), [0, 0]) < 15000,
    );
    const ids = new Set(local.map((v) => v.id));
    return parseMissionDocument({
      ...d,
      jobs:
        d.id === 'demo-02-expert-obstacles'
          ? d.jobs.map((j) => ({ ...j, assignedVehicleIds: [] }))
          : d.jobs,
      scenario: {
        ...d.scenario,
        vehicles: local.map((v) => ({
          ...v,
          maintenance: v.maintenance ?? {
            flightsSinceService: 0,
            flightSecondsSinceService: 0,
            source: 'simulation' as const,
          },
        })),
      },
      batteries: [...batteries.values()]
        .filter((b) => ids.has(b.vehicleId))
        .map((b) => ({ ...b, readyAt: d.window.start })),
      // Preserve Demo 3's explicit low-charge assignment. It demonstrates why
      // choosing the full fleet is a useful repair, not a hidden battery reset.
      planning: {
        ...d.planning,
        maxComputeMs: Math.max(d.planning.maxComputeMs, 5000),
      },
    });
  });
}
