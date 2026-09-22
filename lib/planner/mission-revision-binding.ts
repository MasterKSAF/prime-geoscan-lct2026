import type { MissionDocument } from './mission-schema.ts';
import type { MissionOperation } from './mission-operations.ts';
import { missionCoverageViews } from './mission-coverage-view.ts';

export function assertRevisionBinding(
  document: MissionDocument,
  parent?: MissionOperation,
) {
  const source = document.revisionSource;
  if (!source) return;
  if (
    !parent ||
    parent.id !== source.operationId ||
    parent.integrityHash !== source.integrityHash ||
    parent.status !== 'cancelled'
  )
    throw new Error('Исходная версия пересмотра отсутствует или изменилась.');
  const cutoff = parent.safety?.modelTimeSec ?? parent.progressSec;
  if (
    cutoff !== source.progressSec ||
    source.rootMissionId !==
      (parent.document.revisionSource?.rootMissionId ?? parent.document.id)
  )
    throw new Error(
      'Связь пересмотра с исходной миссией или временем повреждена.',
    );
  const partial = structuredClone(parent.candidate);
  partial.sorties = partial.sorties
    .map((s) => ({
      ...s,
      segments: s.segments.filter(
        (p) => p.phase === 'survey' && p.endSec <= cutoff,
      ),
    }))
    .filter((s) => s.segments.length);
  const views = missionCoverageViews(parent.document, partial);
  if (
    source.coverage.length !== views.length ||
    new Set(source.coverage.map((c) => c.jobId)).size !== views.length ||
    views.some((v) => {
      const c = source.coverage.find((c) => c.jobId === v.jobId);
      return (
        v.status !== 'calculated' ||
        !c ||
        Math.abs(c.completedM2 - v.coveredM2) > 0.1 ||
        Math.abs(c.remainingM2 - v.missingM2) > 0.1
      );
    })
  )
    throw new Error('Зачтённая площадь не соответствует исходному журналу.');
}
