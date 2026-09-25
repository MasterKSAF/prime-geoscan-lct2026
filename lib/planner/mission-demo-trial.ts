import type { MissionDocument } from './mission-schema.ts';
import {
  fleetStateFromDocument,
  parseFleetState,
  type FleetReport,
  type FleetState,
} from './mission-fleet-state.ts';

/** Only after the operator accepts an explicitly checked hypothetical change.
 * No actual aircraft is commanded; unchanged resources keep their live state. */
export function simulatedTrialFleetChanges(
  before: MissionDocument,
  after: MissionDocument,
  states: readonly FleetState[],
  at: string,
): FleetReport[] {
  const changes: FleetReport[] = [];
  for (const vehicle of after.scenario.vehicles) {
    const old = before.scenario.vehicles.find((v) => v.id === vehicle.id);
    if (!old || JSON.stringify(old) === JSON.stringify(vehicle)) continue;
    const previous = states.find((s) => s.id === vehicle.id);
    const state = structuredClone(
      previous ?? fleetStateFromDocument(before, vehicle.id, at),
    );
    if (state.operationId || !state.grounded)
      throw new Error(
        `${vehicle.name}: аппарат занят. Пересчитайте исправление после завершения миссии.`,
      );
    if (
      previous &&
      (previous.vehicle.batteryPct !== old.batteryPct ||
        previous.vehicle.jobs.join(',') !== old.jobs.join(',') ||
        previous.vehicle.start.join(',') !== old.start.join(','))
    )
      throw new Error(
        `${vehicle.name}: состояние изменилось. Сначала заново рассчитайте миссию.`,
      );
    const replacement = vehicle.batteryPct > old.batteryPct;
    state.vehicle = structuredClone(vehicle);
    if (vehicle.batteryPct !== old.batteryPct) {
      const battery = after.batteries.find((b) => b.vehicleId === vehicle.id);
      if (!battery || battery.initialPct !== vehicle.batteryPct)
        throw new Error('Изменение батареи противоречит заряду БВС.');
      state.battery = structuredClone(battery);
    }
    state.ready =
      vehicle.enabled && (state.ready || !old.enabled || replacement);
    state.source = 'simulation';
    state.observedAt = new Date(
      Math.max(Date.parse(at), Date.parse(state.observedAt) + 1),
    ).toISOString();
    state.lastEvent = replacement
      ? 'Симулятор: оператор подтвердил замену батареи'
      : 'Симулятор: оператор применил проверенное изменение парка';
    changes.push({
      state: parseFleetState(state),
      replacement,
      expectedRevision: previous?.revision ?? 0,
    });
  }
  return changes;
}
