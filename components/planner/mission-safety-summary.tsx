'use client';

import type { MissionCandidate } from '@/lib/planner/mission-schema';
import { groupMissionChecks } from '@/lib/planner/mission-presentation';
import { InfoHint } from './mission-help';

const statusLabel = {
  pass: 'Пройдено',
  fail: 'Не пройдено',
  unknown: 'Не подтверждено',
} as const;
const planLabel: Record<MissionCandidate['status'], string> = {
  feasible_model: 'Проверки расчётного плана',
  partial: 'Миссия рассчитана не полностью',
  invalid: 'План не прошёл проверки',
  not_found: 'Допустимый план не найден',
  unsupported: 'Конфигурация не поддержана',
};

export function MissionSafetySummary({
  candidate,
  onOpenChecks,
  compact = false,
}: {
  candidate: MissionCandidate;
  onOpenChecks: () => void;
  compact?: boolean;
}) {
  const summary = groupMissionChecks(candidate.checks);
  return (
    <section
      className={`ms-safety-summary${compact ? ' compact' : ''}`}
      aria-label="Сводка проверок плана"
      data-status={
        candidate.status === 'feasible_model'
          ? summary.status
          : summary.counts.fail
            ? 'fail'
            : 'unknown'
      }
    >
      <div className="ms-safety-heading">
        <strong>
          {planLabel[candidate.status]}
          <InfoHint label="Что подтверждают проверки плана">
            Проверки относятся к расчётной модели, а не к допуску к реальному
            полёту. «Не подтверждено» означает, что данных недостаточно для
            такого вывода; это не пройденная проверка. Причины доступны в списке
            ограничений и в разделе «Все проверки».
          </InfoHint>
        </strong>
        <button type="button" onClick={onOpenChecks}>
          Все проверки
        </button>
      </div>
      <div className="ms-safety-counts">
        <span>Пройдено: {summary.counts.pass}</span>
        <span data-status={summary.counts.fail ? 'fail' : 'pass'}>
          Не пройдено: {summary.counts.fail}
        </span>
        <span data-status={summary.counts.unknown ? 'unknown' : 'pass'}>
          Не подтверждено: {summary.counts.unknown}
        </span>
      </div>
      <div className="ms-safety-chips">
        {summary.groups.map((group) => (
          <button
            type="button"
            key={group.id}
            className="ms-safety-chip"
            data-status={group.status}
            onClick={onOpenChecks}
            title={
              group.checks.length
                ? group.checks
                    .map(
                      (check) => `${statusLabel[check.status]}: ${check.title}`,
                    )
                    .join('\n')
                : 'В результате нет проверок этой категории.'
            }
            aria-label={`${group.title}: ${group.checks.length ? statusLabel[group.status] : 'нет проверок'}. Открыть все проверки`}
          >
            <span>{group.title}</span>
            <small>
              {group.checks.length ? statusLabel[group.status] : 'Нет проверок'}
            </small>
          </button>
        ))}
      </div>
      {!!summary.nonpasses.length && (
        <details
          className="ms-safety-nonpasses"
          key={`${candidate.id}:${summary.counts.fail}:${summary.counts.unknown}`}
          open={summary.counts.fail > 0}
        >
          <summary>
            Ограничения и непройденные проверки ({summary.nonpasses.length})
          </summary>
          <ul>
            {summary.nonpasses.map((check, index) => (
              <li key={`${check.id}:${index}`} data-status={check.status}>
                <details>
                  <summary>
                    {check.title} — {statusLabel[check.status].toLowerCase()}
                  </summary>
                  <p>{check.detail}</p>
                </details>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

export default MissionSafetySummary;
