'use client';

import type { MissionCandidate } from '@/lib/planner/mission-schema';
import { shortMissionVerdict } from '@/lib/planner/mission-check-copy';

export function MissionSafetySummary({
  candidate,
  onOpenChecks,
  compact = false,
}: {
  candidate: MissionCandidate;
  onOpenChecks: () => void;
  compact?: boolean;
}) {
  const verdict = shortMissionVerdict(candidate);
  return (
    <section
      className={`ms-safety-summary ms-safety-brief${compact ? ' compact' : ''}`}
      aria-label="Сводка проверок плана"
      data-status={verdict.ready ? 'pass' : 'fail'}
    >
      <div className="ms-safety-heading">
        <strong>{verdict.title}</strong>
        <button type="button" onClick={onOpenChecks}>
          Все проверки
        </button>
      </div>
      {verdict.reason && <p>{verdict.reason}</p>}
    </section>
  );
}

export default MissionSafetySummary;
