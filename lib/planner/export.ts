import type { Plan } from './schema.ts';

export function toGeoJSON(plan: Plan) {
  return {
    type: 'FeatureCollection',
    properties: {
      schemaVersion: '1.0',
      engineVersion: plan.engineVersion,
      inputHash: plan.inputHash,
      status: plan.status,
      includedVehicleIds: plan.missions.map((m) => m.vehicleId),
      checksScope: 'complete-original-plan',
      altitudeDatum: 'relativeToLaunch_assumedFlatTerrain',
      units: { altitude: 'm', speed: 'm/s', time: 's' },
      warning: 'Расчётное задание. Не подтверждённый формат команд автопилота.',
      checks: plan.checks,
    },
    features: plan.missions.flatMap((m) => [
      {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [m.segments[0].from, ...m.segments.map((s) => s.to)],
        },
        properties: {
          kind: 'mission',
          vehicleId: m.vehicleId,
          name: m.name,
          durationSec: m.durationSec,
          remainingPct: m.remainingPct,
        },
      },
      ...m.segments.map((s, i) => ({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [s.from, s.to] },
        properties: {
          kind: 'segment',
          vehicleId: m.vehicleId,
          sequence: i + 1,
          ...s,
          altitudeDatum: 'relativeToLaunch_assumedFlatTerrain',
        },
      })),
      ...m.segments.map((s, i) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: s.to },
        properties: {
          kind: 'waypoint',
          vehicleId: m.vehicleId,
          sequence: i + 1,
          phase: s.phase,
          relativeAltitudeM: s.altitudeToM,
          airspeedMps: s.airspeedMps,
          groundSpeedMps: s.groundSpeedMps,
          timeSec: s.endSec,
        },
      })),
    ]),
  };
}
const xml = (s: unknown) =>
  String(s).replace(
    /[<>&"']/g,
    (c) =>
      ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        '"': '&quot;',
        "'": '&apos;',
      })[c]!,
  );
export function toKML(plan: Plan) {
  const data = (values: Record<string, unknown>) =>
    '<ExtendedData>' +
    Object.entries(values)
      .map(([k, v]) => `<Data name="${xml(k)}"><value>${xml(v)}</value></Data>`)
      .join('') +
    '</ExtendedData>';
  // No fabricated geodetic Z: relative launch heights live in ExtendedData.
  const folders = plan.missions
    .map(
      (m) =>
        `<Folder><name>${xml(m.name)}</name>${data({ vehicleId: m.vehicleId, durationSec: m.durationSec, remainingPct: m.remainingPct })}${m.segments.map((s, i) => `<Placemark><name>${i + 1}. ${xml(s.phase)}</name>${data({ sequence: i + 1, vehicleId: m.vehicleId, phase: s.phase, relativeAltitudeFromM: s.altitudeFromM, relativeAltitudeToM: s.altitudeToM, altitudeDatum: 'relativeToLaunch_assumedFlatTerrain', airspeedMps: s.airspeedMps, groundSpeedMps: s.groundSpeedMps, startSec: s.startSec, endSec: s.endSec, batteryToPct: s.batteryToPct })}<LineString><altitudeMode>clampToGround</altitudeMode><coordinates>${s.from.join(',')},0 ${s.to.join(',')},0</coordinates></LineString></Placemark>`).join('')}</Folder>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xml(plan.scenario.name)}</name><description>План для анализа. Высоты относительно старта — в ExtendedData. Не подтверждён для загрузки в БВС.</description>${data({ engineVersion: plan.engineVersion, inputHash: plan.inputHash, status: plan.status })}${folders}</Document></kml>`;
}
export function evidenceBundle(plan: Plan) {
  return {
    schemaVersion: '1.0',
    evidenceKind: 'model-calculation',
    plan,
    geojson: toGeoJSON(plan),
    kml: toKML(plan),
    reproduce: {
      method: 'POST',
      path: '/api/planner/solve',
      body: plan.scenario,
    },
    limitations: [
      'Не бортовые логи и не результаты реального полёта.',
      'Хеш SHA-256 связывает вход с результатом; он не доказывает корректность модели.',
    ],
  };
}
