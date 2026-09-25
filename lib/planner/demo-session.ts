import { installedBatteryDocument } from './mission-fleet-state.ts';
import { createCatalogueVehicleProfile } from './mission-vehicle-catalog.ts';
import type { MissionDocument, MissionCandidate } from './mission-schema.ts';
import type { MissionOperation } from './mission-operations.ts';
import { segmentJobId } from './mission-sortie-jobs.ts';
import { migrateMissionCameraBindings } from './camera-profile.ts';

export const DEMO_IDS = [
  'demo-01-survey',
  'demo-02-expert-obstacles',
  'demo-03-repair',
] as const;
export const DEMO_MARKER = '[DEMO-SIMULATION-V1]';
export const isDemoDocument = (d: MissionDocument) =>
  d.notes.includes(DEMO_MARKER);
/** Explicit fixtures; never rewrite an already calculated or running snapshot. */
export function prepareDemoDocument(input: MissionDocument): MissionDocument {
  const d = installedBatteryDocument(input);
  d.planning.areaTransferPolicy = 'compatible-work-v1';
  // The old first showcase used generic all-purpose aircraft. The expert demo
  // uses an explicit Gemini RGB payload; no unsupported IR/MS capability added.
  if (d.id === 'demo-01-survey')
    d.scenario.vehicles = d.scenario.vehicles.map((v, i) =>
      v.model === 'Custom'
        ? {
            ...v,
            ...createCatalogueVehicleProfile('Gemini', 'rgb'),
            id: v.id,
            name: `Геоскан Gemini · ${i + 1}`,
            start: v.start,
            landing: v.landing,
            enabled: v.enabled,
            batteryPct: v.batteryPct,
            airspeedMps: Math.min(v.airspeedMps, 15),
          }
        : v,
    );
  delete d.weather;
  d.scenario.wind = { speedMps: 1, fromDeg: 270 };
  d.environment = {
    cloudBaseM: 2000,
    cloudClearanceM: 50,
    visibilityM: 20000,
    minVisibilityM: 1000,
    source: 'Модельная погода: ясное небо, видимость 20 км, ветер 1 м/с.',
  };
  d.notes =
    `${DEMO_MARKER}\nОпрос, погода и материалы съёмки — тестовые данные симулятора, не физические измерения.\n${d.notes}`.slice(
      0,
      2000,
    );
  return migrateMissionCameraBindings(d).document;
}
export function demoCompletion(row?: MissionOperation | null): number {
  if (!row) return 0;
  // Sensor coverage, not wall-clock progress or preview slider position.
  const segments = row.candidate.sorties
    .flatMap((s) => s.segments)
    .filter((s) => s.phase === 'survey');
  const total = segments.reduce((n, s) => n + s.distanceM, 0);
  if (!total) return 0;
  const done = segments.reduce(
    (n, s) =>
      n +
      s.distanceM *
        Math.max(
          0,
          Math.min(
            1,
            (row.progressSec - s.startSec) / (s.endSec - s.startSec || 1),
          ),
        ),
    0,
  );
  return Math.round((100 * done) / total);
}
export function simulationArtifacts(
  d: MissionDocument,
  c: MissionCandidate,
  row?: MissionOperation,
): Record<string, string> {
  if (!isDemoDocument(d)) return {};
  const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n';
  const cutoff = row?.progressSec ?? 0;
  const frames = c.sorties.flatMap((s) =>
    s.segments
      .filter((p) => p.phase === 'survey' && p.endSec <= cutoff)
      .map((p) => ({
        vehicleId: s.vehicleId,
        jobId: segmentJobId(s, p),
        atSec: p.endSec,
        coordinate: p.to,
        simulated: true,
      })),
  );
  const files: Record<string, string> = {
    'data/simulation/README.md':
      '# Тестовые устройства\n\nВсе данные в этой папке синтетические. SVG — маркированные заглушки, не аэрофотоснимки. Манифест строится только по завершённым проходам сохранённого запуска. Реальные ограничения не переводятся в pass: исходные проверки находятся в checks/validation.json.\n',
    'data/simulation/poll.json': json({
      provider: 'deterministic-demo-v1',
      simulated: true,
      observedAt: d.window.start,
      vehicles: d.scenario.vehicles.map((v) => ({
        id: v.id,
        model: v.model,
        connected: true,
        ready: v.enabled,
        batteryPct: v.batteryPct,
        sensors: v.jobs,
        position: v.start,
      })),
    }),
    'data/simulation/weather.json': json({
      simulated: true,
      wind: d.scenario.wind,
      environment: d.environment,
      window: d.window,
    }),
    'data/simulation/captures.json': json({
      simulated: true,
      realPhotos: 0,
      completedPasses: frames,
      previewCount: Math.min(3, frames.length),
    }),
    'data/simulation/assumptions.json': json({
      simulated: true,
      checks: c.checks.filter((x) => x.status === 'unknown'),
      meaning:
        'Физические испытания и внешние разрешения не заменены успешными проверками.',
    }),
  };
  for (const [i, f] of frames.slice(0, 3).entries())
    files[`data/simulation/previews/frame-${i + 1}.svg`] =
      `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400"><rect width="640" height="400" fill="#e6f0df"/><path d="M0 80H640M0 160H640M0 240H640M0 320H640M80 0V400M160 0V400M240 0V400M320 0V400M400 0V400M480 0V400M560 0V400" stroke="#b3c9a6"/><path d="M0 310L640 90" stroke="#91bce0" stroke-width="35"/><rect x="20" y="20" width="600" height="85" fill="white" opacity=".92"/><text x="35" y="50" font-family="Arial" font-size="23">SIMULATION · NOT A REAL AERIAL PHOTO</text><text x="35" y="82" font-family="Arial" font-size="16">Frame ${i + 1} · T=${f.atSec.toFixed(1)} s · ${f.coordinate.map((v) => v.toFixed(6)).join(', ')}</text></svg>`;
  return files;
}
