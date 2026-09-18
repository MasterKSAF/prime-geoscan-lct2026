import type {
  MissionDocument,
  MissionCandidate,
  MissionResult,
  MissionApproval,
} from './mission-schema.ts';
import { sha256, sha256Text } from './mission-schema.ts';
import { qualityForJob } from './quality.ts';

const iso = (doc: MissionDocument, sec: number) =>
  new Date(Date.parse(doc.window.start) + sec * 1000).toISOString();
const datum = (doc: MissionDocument) =>
  doc.terrainModel.kind === 'flat'
    ? 'above_declared_local_flat_surface'
    : 'unverified_relative_height';
const selected = (candidate: MissionCandidate, vehicleId?: string) => {
  const sorties = candidate.sorties.filter(
    (s) => !vehicleId || s.vehicleId === vehicleId,
  );
  if (!sorties.length && (vehicleId || candidate.status === 'feasible_model'))
    throw new Error('Нет рассчитанных вылетов для экспорта.');
  return sorties;
};
const workDefinitions = (
  doc: MissionDocument,
  sorties: MissionCandidate['sorties'],
  candidate: MissionCandidate,
) =>
  doc.jobs
    .filter((job) => !sorties.length || sorties.some((s) => s.jobId === job.id))
    .map((job) => ({
      ...job,
      effectiveJob: {
        ...qualityForJob(job).job,
        bearingDeg:
          candidate.jobCoverage.find((row) => row.jobId === job.id)
            ?.bearingDeg ?? job.job.bearingDeg,
      },
      note: 'Параметры качества и источники заданы в миссии; совместимость с конкретной полезной нагрузкой требует подтверждения.',
    }));
export function missionGeoJSON(
  doc: MissionDocument,
  candidate: MissionCandidate,
  vehicleId?: string,
) {
  const sorties = selected(candidate, vehicleId);
  return {
    type: 'FeatureCollection',
    properties: {
      schemaVersion: '2.0',
      missionId: doc.id,
      inputHash: candidate.plan.inputHash,
      candidateId: candidate.id,
      engineVersion: candidate.plan.engineVersion,
      status: candidate.status,
      flightReady: false,
      window: doc.window,
      jobs: workDefinitions(doc, sorties, candidate),
      units: {
        coordinates: 'longitude_latitude_degrees',
        altitude: 'm',
        speed: 'm/s',
        relativeTime: 's',
      },
      altitudeDatum: datum(doc),
      terrainModel: doc.terrainModel,
      ...(doc.environment ? { environment: doc.environment } : {}),
      checksScope: 'complete_candidate_before_vehicle_filter',
      checks: candidate.checks,
      warning:
        'Модельное задание для анализа; не проверенная команда реальному БВС.',
    },
    features: sorties.flatMap((sortie) => [
      {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: sortie.segments.length
            ? [sortie.segments[0].from, ...sortie.segments.map((s) => s.to)]
            : [],
        },
        properties: {
          kind: 'sortie',
          sortieId: sortie.id,
          jobId: sortie.jobId,
          vehicleId: sortie.vehicleId,
          batteryId: sortie.batteryId,
          startTime: iso(doc, sortie.startSec),
          endTime: iso(doc, sortie.endSec),
          startSec: sortie.startSec,
          endSec: sortie.endSec,
          flightTimeSec: sortie.durationSec,
          remainingPct: sortie.remainingPct,
        },
      },
      ...sortie.segments.flatMap((segment, index) => [
        {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [segment.from, segment.to],
          },
          properties: {
            kind: 'segment',
            sortieId: sortie.id,
            jobId: sortie.jobId,
            vehicleId: sortie.vehicleId,
            batteryId: sortie.batteryId,
            sequence: index + 1,
            ...segment,
            startTime: iso(doc, segment.startSec),
            endTime: iso(doc, segment.endSec),
            altitudeDatum: datum(doc),
          },
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: segment.to },
          properties: {
            kind: 'waypoint',
            sortieId: sortie.id,
            jobId: sortie.jobId,
            vehicleId: sortie.vehicleId,
            sequence: index + 1,
            phase: segment.phase,
            altitudeM: segment.altitudeToM,
            airspeedMps: segment.airspeedMps,
            groundSpeedMps: segment.groundSpeedMps,
            time: iso(doc, segment.endSec),
            timeSec: segment.endSec,
            altitudeDatum: datum(doc),
          },
        },
      ]),
    ]),
  };
}
const xml = (v: unknown) => {
  const text = String(v),
    invalid = text.match(
      /[^\t\n\r\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/u,
    );
  if (invalid)
    throw new Error(
      `Экспорт KML: символ U+${invalid[0].codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')} запрещён в XML 1.0. Исправьте исходное текстовое поле.`,
    );
  return text.replace(
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
};
const data = (values: Record<string, unknown>) =>
  `<ExtendedData>${Object.entries(values)
    .map(
      ([k, v]) =>
        `<Data name="${xml(k)}"><value>${xml(typeof v === 'object' ? JSON.stringify(v) : v)}</value></Data>`,
    )
    .join('')}</ExtendedData>`;
export function missionKML(
  doc: MissionDocument,
  candidate: MissionCandidate,
  vehicleId?: string,
): string {
  const sorties = selected(candidate, vehicleId);
  const folders = sorties
    .map(
      (s) =>
        `<Folder><name>${xml(s.name)} / ${xml(s.id)}</name>${data({ sortieId: s.id, jobId: s.jobId, vehicleId: s.vehicleId, batteryId: s.batteryId, startTime: iso(doc, s.startSec), endTime: iso(doc, s.endSec), flightTimeSec: s.durationSec, remainingPct: s.remainingPct })}${s.segments.map((p, i) => `<Placemark><name>${i + 1}. ${xml(p.phase)}</name><TimeSpan><begin>${iso(doc, p.startSec)}</begin><end>${iso(doc, p.endSec)}</end></TimeSpan>${data({ sequence: i + 1, sortieId: s.id, jobId: s.jobId, vehicleId: s.vehicleId, batteryId: s.batteryId, ...p, altitudeDatum: datum(doc) })}<LineString><altitudeMode>clampToGround</altitudeMode><coordinates>${p.from.join(',')},0 ${p.to.join(',')},0</coordinates></LineString></Placemark>`).join('')}</Folder>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xml(doc.name)}</name><description>Высоты и скорости в ExtendedData, координаты линии — проекция на карту. Модельное задание, не команды автопилота.</description>${data({ schemaVersion: '2.0', missionId: doc.id, candidateId: candidate.id, inputHash: candidate.plan.inputHash, status: candidate.status, flightReady: false, altitudeDatum: datum(doc), window: doc.window, jobs: workDefinitions(doc, sorties, candidate), checks: candidate.checks })}${folders}</Document></kml>`;
}
export async function missionEvidence(
  result: MissionResult,
  candidate: MissionCandidate,
  approval?: MissionApproval | null,
) {
  const inputHash = await sha256(result.document),
    planHash = await sha256(candidate);
  if (inputHash !== result.inputHash || candidate.plan.inputHash !== inputHash)
    throw new Error(
      'Вход или результат изменён: хеш доказательств не совпадает.',
    );
  if (
    approval &&
    (approval.inputHash !== inputHash ||
      approval.planHash !== planHash ||
      approval.candidateId !== candidate.id)
  )
    throw new Error('Подтверждение относится к другой версии плана.');
  const geojson = missionGeoJSON(result.document, candidate),
    kml = missionKML(result.document, candidate);
  return {
    schemaVersion: '2.0',
    evidenceKind: 'model-calculation',
    flightReady: false,
    createdAt: new Date().toISOString(),
    inputHash,
    planHash,
    approval: approval ?? null,
    document: result.document,
    candidate,
    artifacts: { geojson, kml },
    artifactHashes: {
      geojsonCanonicalJson: await sha256(geojson),
      kmlUtf8: await sha256Text(kml),
    },
    reproduce: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      path: '/api/planner/missions/solve',
      body: result.document,
    },
    limitations: [
      'Расчётный журнал не является полётной телеметрией.',
      'SHA-256 связывает версии, но не доказывает правильность алгоритма.',
      'Повтор ограниченного по времени поиска может отличаться набором рассмотренных кандидатов на другом CPU.',
    ],
  };
}
