import type { MissionDocument } from './mission-schema.ts';
import type { MissionOperation } from './mission-operations.ts';

export function isVehicleReserved(
  document: MissionDocument,
  vehicleId: string,
): boolean {
  return (document.resourceReservations ?? []).some(
    (r) =>
      r.vehicleId === vehicleId &&
      (r.endAt === null ||
        (Date.parse(document.window.start) < Date.parse(r.endAt) &&
          Date.parse(r.startAt) < Date.parse(document.window.end))),
  );
}

/** Occupied aircraft are not a promise of future availability or fresh charge.
 * Running/paused flights remain reserved until an actual new state is reported.
 * A queued reservation is conservative over the requested mission window.
 * No existing mission or operator aircraft selection is edited. */
export function withMissionReservations(
  input: MissionDocument,
  rows: readonly Pick<
    MissionOperation,
    'id' | 'status' | 'startedAt' | 'document' | 'candidate'
  >[],
): MissionDocument {
  const document = structuredClone(input);
  const ids = new Set(document.scenario.vehicles.map((v) => v.id));
  const reservations: NonNullable<MissionDocument['resourceReservations']> = [];
  for (const row of rows) {
    if (
      row.document.id === document.id ||
      !['scheduled', 'running', 'paused'].includes(row.status)
    )
      continue;
    for (const vehicleId of new Set(
      row.candidate.sorties.map((s) => s.vehicleId),
    )) {
      if (!ids.has(vehicleId)) continue;
      const startAt = row.document.window.start;
      const endAt =
        row.status === 'running' || row.startedAt !== null
          ? null
          : new Date(
              Date.parse(startAt) +
                1000 *
                  Math.max(
                    ...row.candidate.sorties
                      .filter((s) => s.vehicleId === vehicleId)
                      .map((s) => s.readySec),
                  ),
            ).toISOString();
      const reservation = {
        vehicleId,
        operationId: row.id,
        missionName: row.document.name,
        status: row.status as 'scheduled' | 'running' | 'paused',
        startAt,
        endAt,
      };
      if (
        isVehicleReserved(
          { ...document, resourceReservations: [reservation] },
          vehicleId,
        )
      )
        reservations.push(reservation);
    }
  }
  if (reservations.length) document.resourceReservations = reservations;
  else delete document.resourceReservations;
  return document;
}
