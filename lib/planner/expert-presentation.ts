import type {
  MissionCandidate,
  MissionDocument,
  MissionEvent,
} from './mission-schema.ts';
import { canonicalStringify } from './mission-schema.ts';
import {
  groupMissionCandidates,
  type MissionCandidateGroup,
} from './mission-presentation.ts';
import { sortieJobIds } from './mission-sortie-jobs.ts';

/** Display-only grouping. Originals, evidence and exact timings are never changed.
 * Only a sub-0.1-second scheduling jitter may be grouped, with an explicit label.
 * Geometry, resources, checks and assumptions must still match exactly. */
export function expertCandidateGroups(
  candidates: readonly MissionCandidate[],
  selectedId?: string,
  recommendationExplanation?: string,
) {
  const groups: (MissionCandidateGroup & { near: boolean })[] = [];
  const signature = (c: MissionCandidate) =>
    canonicalStringify({
      input: c.plan.inputHash,
      status: c.status,
      checks: c.checks,
      // The engine appends its ranking explanation to the balanced copy.
      // Remove only that exact known annotation, never a model assumption.
      assumptions:
        c.id === 'balanced' &&
        recommendationExplanation &&
        c.assumptions.at(-1) === recommendationExplanation
          ? c.assumptions.slice(0, -1)
          : c.assumptions,
      jobCoverage: c.jobCoverage,
      planChecks: c.plan.checks,
      sorties: c.sorties.map(
        ({ startSec: _s, endSec: _e, readySec: _r, segments, ...rest }) => ({
          ...rest,
          segments: segments.map(
            ({ startSec: _a, endSec: _b, ...segment }) => segment,
          ),
        }),
      ),
    });
  const near = (a: MissionCandidate, b: MissionCandidate) => {
    if (
      a.status !== 'feasible_model' ||
      b.status !== a.status ||
      signature(a) !== signature(b)
    )
      return false;
    const close = (x: number, y: number) =>
      Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) < 0.1;
    if (
      !Object.entries(a.metrics).every(([key, value]) =>
        key === 'makespanSec' || key === 'flightTimeSec'
          ? close(value, b.metrics[key])
          : value === b.metrics[key as keyof typeof b.metrics],
      )
    )
      return false;
    return a.sorties.every((s, i) => {
      const t = b.sorties[i];
      return (
        close(s.startSec, t.startSec) &&
        close(s.endSec, t.endSec) &&
        close(s.readySec, t.readySec) &&
        s.segments.every(
          (seg, j) =>
            close(seg.startSec, t.segments[j].startSec) &&
            close(seg.endSec, t.segments[j].endSec),
        )
      );
    });
  };
  for (const group of groupMissionCandidates(candidates, selectedId)) {
    const existing = groups.find((g) =>
      near(g.representative, group.representative),
    );
    if (!existing) groups.push({ ...group, near: false });
    else {
      existing.near = true;
      existing.candidateIds.push(...group.candidateIds);
      existing.objectives = [
        ...new Set([...existing.objectives, ...group.objectives]),
      ];
      if (group.candidateIds.includes(selectedId ?? ''))
        existing.representative = group.representative;
    }
  }
  return groups;
}

/** Human-readable projection of immutable model events; raw detail stays in exports. */
export function expertEventText(
  event: MissionEvent,
  document: MissionDocument,
  candidate: MissionCandidate,
): string {
  if (event.type === 'survey')
    return `Начат съёмочный проход${event.detail.match(/полоса\s+([^;]+)/i)?.[1] ? ` № ${event.detail.match(/полоса\s+([^;]+)/i)![1]}` : ''}.`;
  if (event.type === 'complete')
    return 'Все назначенные этому аппарату проходы завершены в модели.';
  if (event.type === 'takeoff') {
    const sortie = candidate.sorties.find((s) => s.id === event.sortieId);
    const job = document.jobs.find((j) => j.id === sortie?.jobId);
    return sortie && sortieJobIds(sortie).length > 1
      ? `Взлёт · ${sortieJobIds(sortie).length} участка за один вылет.`
      : job ? `Взлёт · ${job.name}.` : 'Аппарат начал вылет.';
  }
  if (event.type === 'service') {
    const sortie = candidate.sorties.find((s) => s.id === event.sortieId);
    if (sortie) {
      const seconds = Math.max(0, Math.ceil(sortie.readySec - sortie.endSec));
      return `Проверка перед повторным вылетом: ${Math.floor(seconds / 60)} мин ${seconds % 60} с. Следующий вылет — после проверки готовности и заряда.`;
    }
  }
  return event.detail;
}
