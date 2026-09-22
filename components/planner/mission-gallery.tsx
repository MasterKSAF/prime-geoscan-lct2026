import {
  DEMONSTRATION_SCENARIOS,
  SHOWCASE_SCENARIOS,
} from '@/lib/planner/mission-showcase';
import type { ShowcaseScenario } from '@/lib/planner/mission-showcase';
import type { MissionDocument } from '@/lib/planner/mission-schema';
import { workLabels } from '@/lib/planner/mission-editing';
import { InfoHint } from './mission-help';
export default function MissionGallery({
  onOpen,
}: {
  onOpen: (document: MissionDocument, label: string) => void;
}) {
  const renderScenario = (s: ShowcaseScenario, i: number, demo = false) => {
    const d = s.create();
    const automatic = d.jobs.every((j) => j.assignedVehicleIds.length === 0);
    return (
      <article className="ms-scenario" key={s.id} data-scenario-id={s.id}>
        <div className="ms-scenario-top">
          <span>{String(i + 1).padStart(2, '0')}</span>
          <small
            className={
              s.expected === 'feasible_model' ? 'ms-ok' : 'ms-negative'
            }
          >
            {s.expected === 'feasible_model'
              ? 'Положительный сценарий'
              : 'Проверка отказа'}
          </small>
        </div>
        <h3>{s.title}</h3>
        <dl className="mw-scenario-facts">
          <div>
            <dt>Миссия</dt>
            <dd>{s.summary}</dd>
          </div>
          <div>
            <dt>Вид работы</dt>
            <dd>
              {[...new Set(d.jobs.map((j) => j.job.type))]
                .map((t) => `${t} (${workLabels[t]})`)
                .join(' + ')}
            </dd>
          </div>
          <div>
            <dt>Количество БВС</dt>
            <dd>
              {automatic
                ? `Назначается автоматически · в парке ${d.scenario.vehicles.length}`
                : new Set(d.jobs.flatMap((j) => j.assignedVehicleIds)).size}
            </dd>
          </div>
          <div>
            <dt>Варианты плана</dt>
            <dd>Раньше завершить · снизить общий налёт · баланс</dd>
          </div>
        </dl>
        {s.walkthrough && (
          <details>
            <summary>Показать по шагам</summary>
            <ol>
              {s.walkthrough.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </details>
        )}
        <details>
          <summary>Что проверяем</summary>
          <ul>
            {s.checks.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </details>
        <div className="ms-scenario-actions">
          <button
            className="mw-button primary"
            onClick={() => onOpen(s.create(), `Сценарий: ${s.title}`)}
          >
            {demo ? `Открыть демо ${i + 1}` : `Открыть сценарий ${i + 1}`}
          </button>
          <a
            className="mw-button"
            href={`/planner/scenarios/${s.id}.mission.json`}
            download
          >
            JSON
          </a>
        </div>
        <details>
          <summary>
            Примеры для импорта по частям{' '}
            <InfoHint label="Импорт частей сценария">
              Флот и объёмы добавляются к текущей миссии. Повторяющиеся ID
              отклоняются: измените ID в копии файла или используйте другую
              миссию.
            </InfoHint>
          </summary>
          <div className="ms-scenario-actions">
            <a
              className="mw-button small"
              href={`/planner/scenarios/${s.id}.area.geojson`}
              download
            >
              Участки
            </a>
            <a
              className="mw-button small"
              href={`/planner/scenarios/${s.id}.restrictions.json`}
              download
            >
              Объёмы
            </a>
            <a
              className="mw-button small"
              href={`/planner/scenarios/${s.id}.fleet.json`}
              download
            >
              Флот
            </a>
          </div>
        </details>
      </article>
    );
  };
  return (
    <>
      <div className="mw-gallery-intro">
        Три сценария для первого показа{' '}
        <InfoHint label="Демонстрационные миссии">
          Синтетические миссии, не входы жюри и не разрешение полёта. Первые
          два должны завершиться в модели. Третий сначала отклоняется, затем
          отдельно проверяется гипотеза исправления. Фото не создаются.
        </InfoHint>
      </div>
      <div className="ms-gallery">
        {DEMONSTRATION_SCENARIOS.map((s, i) => renderScenario(s, i, true))}
      </div>
      <details>
        <summary>
          Другие проверочные примеры · {SHOWCASE_SCENARIOS.length}
        </summary>
        <div className="ms-gallery">
          {SHOWCASE_SCENARIOS.map((s, i) => renderScenario(s, i))}
        </div>
      </details>
    </>
  );
}
