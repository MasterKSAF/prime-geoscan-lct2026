'use client';
import type {
  MissionCandidate,
  MissionDocument,
} from '@/lib/planner/mission-schema';
import { missionFleetAdvice } from '@/lib/planner/mission-fleet-advice';
import { plainMissionCheck } from '@/lib/planner/mission-check-copy';

export default function MissionFailedChecks({
  document,
  candidate,
  onFleet,
  onAssignment,
}: {
  document: MissionDocument;
  candidate: MissionCandidate;
  onFleet: () => void;
  onAssignment: (jobId: string) => void;
}) {
  const failed = candidate.checks.filter((c) => c.status === 'fail');
  const advice = missionFleetAdvice(
    document,
    candidate.status !== 'feasible_model',
  );
  return (
    <section
      className={`mission-failures ${failed.length ? 'has-failures' : 'passed'}`}
      aria-label="Непройденные проверки"
    >
      <h3>
        {failed.length
          ? `Непройденные проверки · ${failed.length}`
          : candidate.status === 'feasible_model'
            ? 'Все обязательные проверки пройдены'
            : 'Полный план пока не найден'}
      </h3>
      {candidate.status !== 'feasible_model' &&
        document.planning.maxVehicles && (
          <article className="mission-failure-advice">
            <h4>Группа ограничена: до {document.planning.maxVehicles} БВС</h4>
            <p>
              Попробуйте увеличить лимит БВС или срок в редакторе и пересчитать.
              Новый вариант тоже должен пройти все проверки.
            </p>
            <button
              className="mw-button"
              onClick={() => onAssignment(document.jobs[0].id)}
            >
              Открыть редактор
            </button>
          </article>
        )}
      {candidate.status !== 'feasible_model' &&
        candidate.trace.some((t) => t.event === 'MAINTENANCE_REJECT') && (
          <article className="mission-failure-advice">
            <h4>Недостаточно ресурса до ТО</h4>
            <p>
              {candidate.trace
                .filter((t) => t.event === 'MAINTENANCE_REJECT')
                .map((t) => t.detail)
                .join(' ')}
            </p>
            <button className="mw-button" onClick={onFleet}>
              Открыть парк БВС
            </button>
          </article>
        )}
      {advice.map((item) => (
        <article className="mission-failure-advice" key={item.jobId}>
          <h4>{item.title}</h4>
          <p>{item.detail}</p>
          <p>
            <strong>Что сделать:</strong> {item.action}
          </p>
          <button
            className="mw-button"
            onClick={() =>
              item.destination === 'fleet'
                ? onFleet()
                : onAssignment(item.jobId)
            }
          >
            {item.destination === 'fleet'
              ? 'Открыть парк БВС'
              : 'Изменить назначение'}
          </button>
        </article>
      ))}
      {failed.map((check, i) => {
        const text = plainMissionCheck(check);
        const title =
          check.id === 'STRIPS'
            ? 'Не все проходы по участкам назначены'
            : check.id.startsWith('PHOTO_') && check.id.endsWith('_COVERAGE')
              ? 'Снимки не покрывают весь участок'
              : check.id.startsWith('COVERAGE_')
                ? 'Рабочая площадь покрыта не полностью'
                : text.title;
        return (
          <article className="mission-failure-detail" key={`${check.id}:${i}`}>
            <h4>{title}</h4>
            <p>{check.detail}</p>
            {text.explanation !== check.detail && (
              <p className="mission-failure-action">
                <strong>Что сделать:</strong> {text.explanation}
              </p>
            )}
            <small>{check.id}</small>
          </article>
        );
      })}
    </section>
  );
}
