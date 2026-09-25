import type { Check } from '@/lib/planner/schema';
import { groupMissionChecks } from '@/lib/planner/mission-presentation';
import {
  checkStatusText,
  plainMissionCheck,
} from '@/lib/planner/mission-check-copy';

/** The short wording is a projection; the original result remains available. */
export function MissionCheckDetails({
  check,
  expanded = false,
}: {
  check: Check;
  expanded?: boolean;
}) {
  const text = plainMissionCheck(check);
  return (
    <div className={`mw-check ${check.status}`}>
      <span aria-hidden="true">
        {check.status === 'pass' ? '✓' : check.status === 'fail' ? '×' : 'i'}
      </span>
      <div>
        <strong>
          {text.title} · {checkStatusText[check.status]}
        </strong>
        <p>{text.explanation}</p>
        <details className="mi-check-original" open={expanded || undefined}>
          <summary>Технические подробности</summary>
          <p>{check.title}</p>
          <p>{check.detail}</p>
          <code>{check.id}</code>
        </details>
      </div>
    </div>
  );
}

export function MissionCheckGroups({ checks }: { checks: Check[] }) {
  const groups = groupMissionChecks(checks).groups.filter(
    (group) => group.checks.length > 0,
  );
  return groups.map((group) => (
    <details className="mi-check-group" key={group.id}>
      <summary>
        {group.id === 'separation' ? 'Расстояния между БВС' : group.title}
        <span>
          {group.counts.fail
            ? `Не пройдено: ${group.counts.fail}`
            : `Проверок: ${group.checks.length}`}
        </span>
      </summary>
      {group.checks.map((check, i) => (
        <MissionCheckDetails key={`${check.id}:${i}`} check={check} />
      ))}
    </details>
  ));
}
