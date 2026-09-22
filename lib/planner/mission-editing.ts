import type { MissionDocument, MissionJob } from './mission-schema.ts';
import { createDemoQuality } from './quality.ts';

export const workLabels: Record<MissionJob['job']['type'], string> = {
  RGB: 'Фотосъёмка',
  MS: 'Мультиспектр',
  IR: 'Тепловая съёмка',
  LiDAR: 'Лазерное сканирование',
  Geophysics: 'Геофизика',
};

/** Adds one independent work item; never rebuilds existing jobs from selected types. */
export function appendMissionWork(
  d: MissionDocument,
  selectedId: string,
  type: MissionJob['job']['type'],
  id: string,
): MissionDocument {
  if (d.jobs.length >= 8)
    throw new Error('В миссии может быть не больше 8 работ.');
  if (!id || d.jobs.some((j) => j.id === id))
    throw new Error('Нужен новый идентификатор работы.');
  const source = d.jobs.find((j) => j.id === selectedId) ?? d.jobs[0];
  const quality = createDemoQuality(type);
  const next: MissionJob = {
    ...structuredClone(source),
    id,
    name: workLabels[type],
    job: { ...source.job, type, qualitySource: quality.source },
    quality,
    daylight: type === 'RGB' ? 'topographicClearSky' : 'none',
    assignedVehicleIds: [],
  };
  delete next.inheritsFrom;
  return { ...d, jobs: [...d.jobs, next] };
}

export function removeMissionWorks(
  d: MissionDocument,
  ids: readonly string[],
): MissionDocument {
  const jobs = d.jobs
    .filter((j) => !ids.includes(j.id))
    .map((j) => {
      if (j.inheritsFrom && ids.includes(j.inheritsFrom)) {
        const copy = { ...j };
        delete copy.inheritsFrom;
        return copy;
      }
      return j;
    });
  if (!jobs.length) throw new Error('Оставьте хотя бы одну работу в миссии.');
  return { ...d, jobs };
}

/** Materialize inheritance before validation; geometry and identity never propagate. */
export function synchronizeWorkSettings(d: MissionDocument): MissionDocument {
  return {
    ...d,
    jobs: d.jobs.map((j) => {
      if (!j.inheritsFrom) return j;
      const parent = d.jobs.find(
        (p) =>
          p.id === j.inheritsFrom &&
          !p.inheritsFrom &&
          p.job.type === j.job.type,
      );
      if (!parent) {
        const independent = { ...j };
        delete independent.inheritsFrom;
        return independent;
      }
      const copy = {
        ...j,
        job: structuredClone(parent.job),
        quality: structuredClone(parent.quality),
        daylight: parent.daylight,
        assignedVehicleIds: [...parent.assignedVehicleIds],
      };
      if (parent.window) copy.window = { ...parent.window };
      else delete copy.window;
      return copy;
    }),
  };
}

/** Presentation alias only; persisted vehicle names and identifiers remain intact. */
export function vehicleCallsign(index: number): string {
  return `БВС ${String(index + 1).padStart(2, '0')}`;
}
